(() => {
  'use strict';

  function createDemoRuntime() {
    const tasks = new Map();
    let raf = 0;
    let last = performance.now();
    let quality = 'full';

    function wake() {
      if (!raf) raf = requestAnimationFrame(tick);
    }

    function tick(now) {
      raf = 0;
      const delta = Math.min(80, now - last);
      last = now;
      let active = false;
      tasks.forEach(task => {
        if (!task.enabled || now < task.nextAt) return;
        const keep = task.callback({ now, delta, quality, reducedMotion: quality === 'reduced' }) === true;
        task.active = keep;
        task.nextAt = now + task.interval;
        active ||= keep;
      });
      if (active) wake();
    }

    return {
      register(name, callback, options = {}) {
        const task = {
          name,
          callback,
          enabled: options.enabled !== false,
          active: options.enabled !== false,
          interval: 1000 / Math.max(1, Number(options.maxFps) || 30),
          nextAt: 0
        };
        tasks.set(name, task);
        return {
          wake() { task.active = true; task.nextAt = 0; wake(); },
          enable() { task.enabled = true; task.active = true; task.nextAt = 0; wake(); },
          disable() { task.enabled = false; task.active = false; },
          setMaxFps(value) { task.interval = 1000 / Math.max(1, Number(value) || 30); wake(); },
          unregister() { tasks.delete(name); }
        };
      },
      wake,
      setQuality(next) { quality = next; wake(); },
      subscribe() { return () => {}; }
    };
  }

  const runtime = createDemoRuntime();
  const chamber = document.querySelector('.demo-chamber');
  const article = document.querySelector('.demo-card');
  const layers = Object.fromEntries(
    [...document.querySelectorAll('.demo-layer')].map(layer => [layer.dataset.layer, layer])
  );

  function cameraSnapshot() {
    const rect = chamber.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const near = 2.5;
    const focalLength = Math.min(width, height) * 0.84;
    return {
      width,
      height,
      near,
      halfWidth: width * 0.5 * near / focalLength,
      finalHalfWidth: width * 0.5 * near / focalLength + 1,
      halfHeight: height * 0.5 * near / focalLength,
      focalLength,
      project(x, y, z) {
        const depth = Math.max(0.001, z);
        return {
          x: width * 0.5 + x * focalLength / depth,
          y: height * 0.5 - y * focalLength / depth,
          scale: near / depth
        };
      }
    };
  }

  let weather;

  async function create() {
    weather = createWeather({
      id: 'standalone-demo',
      runtime,
      layers,
      camera: cameraSnapshot,
      presets: window.NCNWeatherPresets,
      resizeTarget: window,
      blockEvents: window,
      intensity: Number(document.querySelector('#intensity').value),
      seed: 2045,
      requestEffect(name, target, options) {
        target.animate?.([
          { filter: 'brightness(1)' },
          { filter: `brightness(${1 + (options.intensity || 0.2) * 1.8})` },
          { filter: 'brightness(1)' }
        ], { duration: options.duration || 420, easing: 'ease-out' });
        return true;
      }
    });
    await weather.init();
    weather.setPreset(document.querySelector('#preset').value);
    weather.setReadingZone({ element: article, attenuation: 0.82, padding: 24 });
  }

  function metrics() {
    document.querySelector('.demo-metrics').textContent = JSON.stringify(weather?.snapshot?.() || {}, null, 2);
    requestAnimationFrame(metrics);
  }

  document.querySelector('#preset').addEventListener('change', event => {
    weather.transitionTo(event.target.value, { duration: 1800 });
  });
  document.querySelector('#intensity').addEventListener('input', event => weather.setIntensity(event.target.value));
  document.querySelector('#wind-x').addEventListener('input', event => {
    weather.setWind({ x: Number(event.target.value), y: -0.03, z: Number(document.querySelector('#wind-z').value) });
  });
  document.querySelector('#wind-z').addEventListener('input', event => {
    weather.setWind({ x: Number(document.querySelector('#wind-x').value), y: -0.03, z: Number(event.target.value) });
  });
  document.querySelector('#quality').addEventListener('change', event => {
    runtime.setQuality(event.target.value === 'reduced' ? 'reduced' : 'full');
    weather.setQuality(event.target.value);
  });
  document.querySelector('#reading').addEventListener('click', () => {
    const active = article.classList.toggle('is-reading');
    weather.setReadingZone(active ? { element: article, attenuation: 0.9, padding: 30 } : null);
  });
  document.querySelector('#suspend').addEventListener('click', () => weather.suspend());
  document.querySelector('#resume').addEventListener('click', () => weather.resume());
  document.querySelector('#reset').addEventListener('click', () => weather.reset());
  document.querySelector('#pulse').addEventListener('click', () => weather.requestElectricalPulse(0.72));
  document.querySelector('#block').addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('ncn:block-motion-settle', {
      detail: { x: 0.7, y: -0.4, z: 4.4, radius: 2.1, strength: 0.8 }
    }));
  });
  document.querySelector('#destroy').addEventListener('click', () => weather.destroy());
  document.querySelector('#reinit').addEventListener('click', async () => {
    weather?.destroy?.();
    await create();
  });

  void create();
  metrics();
})();
