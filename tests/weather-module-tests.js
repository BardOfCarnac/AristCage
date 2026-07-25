(async () => {
  'use strict';

  const results = document.querySelector('#results');
  const layers = Object.fromEntries(
    [...document.querySelectorAll('[data-test-layer]')].map(layer => [layer.dataset.testLayer, layer])
  );
  const reading = document.querySelector('#reading-zone');

  function fakeRuntime() {
    let callback = null;
    let enabled = false;
    let now = performance.now();
    return {
      register(name, next, options = {}) {
        callback = next;
        enabled = options.enabled !== false;
        return {
          wake() { enabled = true; },
          enable() { enabled = true; },
          disable() { enabled = false; },
          setMaxFps() {},
          unregister() { callback = null; enabled = false; }
        };
      },
      subscribe() { return () => {}; },
      step(milliseconds = 50, count = 1) {
        for (let index = 0; index < count; index += 1) {
          now += milliseconds;
          if (enabled && callback) callback({ now, delta: milliseconds, quality: 'full', reducedMotion: false });
        }
      }
    };
  }

  const tests = [];
  const test = (name, run) => tests.push({ name, run });
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };

  const runtime = fakeRuntime();
  let weather = null;

  test('initialises inside supplied layers', async () => {
    weather = createWeather({
      id: 'acceptance-tests',
      runtime,
      layers,
      camera() {
        return {
          near: 2.5,
          halfWidth: 2.5,
          finalHalfWidth: 3.5,
          halfHeight: 2,
          focalLength: 420,
          project(x, y, z) { return { x: 400 + x * 420 / z, y: 250 - y * 420 / z, scale: 2.5 / z }; }
        };
      },
      seed: 2045,
      intensity: 0.6,
      quality: 'low'
    });
    await weather.init();
    assert(document.querySelectorAll('.ncn-weather-canvas').length === 4, 'Expected one canvas in each supplied layer.');
  });

  test('runs mist and transitions to rain', () => {
    weather.setPreset('mist');
    runtime.step(50, 80);
    const mist = weather.snapshot();
    assert(mist.particleCounts.mist > 0, 'Mist particles did not spawn.');
    weather.transitionTo('rain', { duration: 300 });
    runtime.step(50, 30);
    const rain = weather.snapshot();
    assert(rain.preset === 'rain', 'Transition did not settle on rain.');
    assert(rain.particleCounts.rain > 0, 'Rain particles did not spawn.');
  });

  test('attenuates around a reading zone', () => {
    weather.setReadingZone({ element: reading, attenuation: 0.9 });
    runtime.step(50, 2);
    assert(weather.snapshot().readingZoneActive, 'Reading zone was not recognised.');
  });

  test('suspends without spawning and resumes without a jump', () => {
    weather.setPreset('rain');
    runtime.step(50, 12);
    weather.suspend();
    const before = weather.snapshot().particleCounts.rain;
    runtime.step(1000, 12);
    const during = weather.snapshot().particleCounts.rain;
    assert(during === before, 'Particles changed while suspended.');
    weather.resume();
    runtime.step(50, 1);
    const after = weather.snapshot();
    assert(after.particleCounts.rain <= after.particleCaps.rain, 'Resume exceeded the configured cap.');
  });

  test('reset returns a clean chamber', () => {
    weather.reset();
    const snapshot = weather.snapshot();
    assert(snapshot.preset === 'clear', 'Reset did not restore clear preset.');
    assert(Object.values(snapshot.particleCounts).every(value => value === 0), 'Reset left active particles.');
  });

  test('destroy disposes canvases and runtime task', () => {
    weather.destroy();
    assert(document.querySelectorAll('.ncn-weather-canvas').length === 0, 'Destroy left weather canvases mounted.');
    assert(weather.snapshot().destroyed, 'Destroy state was not recorded.');
  });

  let passed = 0;
  for (const item of tests) {
    const row = document.createElement('li');
    try {
      await item.run();
      row.textContent = `PASS — ${item.name}`;
      row.className = 'pass';
      passed += 1;
    } catch (error) {
      row.textContent = `FAIL — ${item.name}: ${error.message}`;
      row.className = 'fail';
      console.error(error);
    }
    results.append(row);
  }
  document.querySelector('#summary').textContent = `${passed}/${tests.length} acceptance tests passed`;
})();
