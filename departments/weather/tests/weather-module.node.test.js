const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

class FakeGradient { addColorStop() {} }
class FakeContext {
  constructor() { this.clearCalls = 0; }
  setTransform() {}
  clearRect() { this.clearCalls += 1; }
  fillRect() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  stroke() {}
  save() {}
  restore() {}
  roundRect() {}
  fill() {}
  createLinearGradient() { return new FakeGradient(); }
  createRadialGradient() { return new FakeGradient(); }
}
class FakeCanvas {
  constructor() {
    this.style = {};
    this.className = '';
    this.width = 0;
    this.height = 0;
    this.hidden = false;
    this.parentElement = null;
    this.parentNode = null;
    this.context = new FakeContext();
  }
  setAttribute() {}
  getContext() { return this.context; }
  remove() {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentElement = null;
    this.parentNode = null;
  }
}
class FakeLayer {
  constructor() { this.children = []; this.measurements = 0; }
  append(node) {
    node.parentNode = this;
    node.parentElement = this;
    this.children.push(node);
  }
  getBoundingClientRect() {
    this.measurements += 1;
    return { left: 0, top: 0, width: 800, height: 600 };
  }
}

const runtime = {
  quality: 'reduced',
  task: null,
  handle: null,
  register(name, callback, options) {
    assert.equal(options.group, 'environment');
    const task = { name, callback, options, enabled: options.enabled !== false, suspended: false, fps: options.maxFps };
    this.task = task;
    const handle = {
      enable() { task.enabled = true; task.suspended = false; },
      disable() { task.enabled = false; },
      suspend() { task.suspended = true; },
      resume() { task.suspended = false; task.enabled = true; },
      wake() { task.enabled = true; },
      setMaxFps(value) { task.fps = value; },
      unregister: () => { runtime.task = null; },
      snapshot() { return { ...task }; }
    };
    this.handle = handle;
    return handle;
  },
  getQuality() { return this.quality; },
  step(delta, count = 1) {
    for (let index = 0; index < count; index += 1) {
      if (this.task?.enabled && !this.task.suspended) {
        const active = this.task.callback({
          delta,
          quality: this.quality,
          reducedMotion: this.quality === 'reduced'
        });
        this.task.enabled = active !== false;
      }
    }
  }
};

const layers = Object.fromEntries(['far', 'rear', 'middle', 'near'].map(key => [key, new FakeLayer()]));
let reading = true;
let cameraReads = 0;
const effectCalls = [];
const acceptedEffects = new Set(['electrical-disturbance', 'light-flash']);
const effects = {
  play(name, target, options) {
    if (!acceptedEffects.has(name)) throw new Error(`Unknown effect: ${name}`);
    effectCalls.push({ name, target, options });
    return { cancel() {}, finished: Promise.resolve({ status: 'completed' }) };
  }
};
const settings = { quality: 'reduced', reducedMotion: true };
const context = {
  owner: 'weather-node-test',
  runtime,
  layers: { weather: layers },
  settings,
  integration: { requireService(name) { assert.equal(name, 'effects'); return effects; } },
  director: {
    envelope(channel, options) {
      return { channel, mode: reading ? 'reading' : 'ambient', allowed: true, intensity: options.intensity, reducedMotion: false };
    }
  },
  views: {
    isReading() { return reading; },
    getReadingZone() { return reading ? { rect: { left: 200, top: 120, width: 360, height: 260 } } : null; },
    getControlZones() { return [{ rect: { left: 0, top: 0, width: 800, height: 70 } }]; }
  },
  chamber: {
    getCameraSnapshot() {
      cameraReads += 1;
      return {
        finalHalfWidth: 4.5,
        halfHeight: 3.2,
        near: 2.5,
        far: 10.5,
        project(x, y, z) { return { x: 400 + x * 60 / z, y: 300 - y * 60 / z }; }
      };
    }
  }
};

global.window = global;
global.document = { createElement(name) { assert.equal(name, 'canvas'); return new FakeCanvas(); } };
global.navigator = { hardwareConcurrency: 4 };
global.innerWidth = 800;
global.innerHeight = 600;

const directory = path.resolve(__dirname, '..');
for (const filename of ['weather-manifest.js', 'weather-presets.js', 'weather-module.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(directory, filename), 'utf8'), { filename });
}

async function runDeterministicSequence(weather) {
  weather.reset();
  weather.setQuality('reduced');
  weather.setSeed(2045);
  weather.applyProfile({ enabled: true, preset: 'mist', intensity: 0.65 }, { seed: 2045 });
  runtime.handle.enable();
  runtime.step(16, 40);
  return weather.snapshot().particles.fingerprint;
}

(async () => {
  const source = fs.readFileSync(path.join(directory, 'weather-module.js'), 'utf8');
  const css = fs.readFileSync(path.join(directory, 'weather-module.css'), 'utf8');
  assert.equal(global.NCNWeatherDepartmentManifest.replaces, 'weather');
  assert.deepEqual(global.NCNWeatherDepartmentManifest.layers,
    ['weather:far', 'weather:rear', 'weather:middle', 'weather:near']);
  for (const forbidden of ['requestAnimationFrame', 'setInterval', 'Math.random', 'querySelector', 'window.NCNEffects', 'dispatchEvent']) {
    assert.equal(source.includes(forbidden), false, `Weather source contains forbidden token: ${forbidden}`);
  }
  assert.equal(css.includes('.ncn-environment-layer'), false);

  const weather = global.NCNWeatherDepartment.createWeather(context);
  await weather.init();
  assert.equal(weather.snapshot().moduleId, 'weather-node-test');
  assert.equal(weather.snapshot().quality, 'reduced');
  assert.deepEqual(weather.snapshot().particles.capacities, { mist: 10, dust: 8, rain: 0 });

  weather.setSeed(2045);
  weather.applyProfile({ enabled: true, preset: 'mist', intensity: 0.65 }, { seed: 2045 });
  runtime.step(16, 40);
  const mist = weather.snapshot();
  assert.equal(mist.resources.canvases, 4);
  assert.ok(mist.particles.mist > 0);
  assert.equal(mist.zones.reading, true);
  assert.equal(mist.zones.controls, 1);

  const geometryBefore = weather.snapshot().geometry;
  const cameraBefore = cameraReads;
  const measurementsBefore = Object.values(layers).reduce((sum, layer) => sum + layer.measurements, 0);
  runtime.handle.enable();
  runtime.step(16, 10);
  const geometryAfter = weather.snapshot().geometry;
  const cameraDelta = cameraReads - cameraBefore;
  const measurementDelta = Object.values(layers).reduce((sum, layer) => sum + layer.measurements, 0) - measurementsBefore;
  assert.ok(cameraDelta <= 10, `Camera was resolved more than once per frame: ${cameraDelta}`);
  assert.ok(measurementDelta <= 40, `Layer geometry was measured more than once per layer/frame: ${measurementDelta}`);
  assert.equal(geometryAfter.frames - geometryBefore.frames, 10);

  settings.quality = 'full';
  settings.reducedMotion = false;
  runtime.quality = 'full';
  weather.setQuality('auto');
  runtime.handle.enable();
  runtime.step(16, 1);
  assert.equal(weather.snapshot().quality, 'low');
  assert.deepEqual(weather.snapshot().particles.capacities, { mist: 18, dust: 24, rain: 48 });

  settings.quality = 'reduced';
  settings.reducedMotion = true;
  runtime.quality = 'reduced';
  runtime.handle.enable();
  runtime.step(16, 1);
  assert.equal(weather.snapshot().quality, 'reduced');
  assert.deepEqual(weather.snapshot().particles.capacities, { mist: 10, dust: 8, rain: 0 });

  settings.quality = 'full';
  settings.reducedMotion = false;
  runtime.quality = 'full';
  runtime.handle.enable();
  runtime.step(16, 1);
  assert.equal(weather.snapshot().quality, 'low');

  reading = false;
  weather.transitionTo('electrical-weather', { duration: 240, effect: true, effectIntensity: 0.2 });
  assert.equal(effectCalls.at(-1).name, 'electrical-disturbance');
  assert.equal(effectCalls.at(-1).options.channel, 'fault');
  assert.equal(effectCalls.at(-1).options.purpose, 'ambient');
  weather.requestAtmosphericEffect('light-flash', 'rear', { intensity: 0.1 });
  assert.equal(effectCalls.at(-1).name, 'light-flash');
  assert.equal(effectCalls.at(-1).options.channel, 'environment');
  assert.throws(() => weather.requestAtmosphericEffect('electrical-flash'), /undeclared effect/);

  runtime.handle.enable();
  runtime.step(16, 50);
  assert.ok(weather.snapshot().particles.rain > 0);

  weather.suspend();
  const suspended = weather.snapshot();
  assert.equal(suspended.resources.visibleCanvases, 0);
  const spawnCount = suspended.particles.spawned;
  runtime.step(250, 10);
  assert.equal(weather.snapshot().particles.spawned, spawnCount);

  weather.resume();
  assert.equal(weather.snapshot().resources.visibleCanvases, 4);
  runtime.step(1000, 1);
  assert.ok(weather.snapshot().lastDelta <= 64);

  const firstFingerprint = await runDeterministicSequence(weather);
  const secondFingerprint = await runDeterministicSequence(weather);
  assert.equal(firstFingerprint, secondFingerprint, 'Seeded particle evolution must be repeatable.');

  weather.reset();
  const reset = weather.snapshot();
  assert.equal(reset.particles.mist + reset.particles.dust + reset.particles.rain, 0);

  weather.destroy();
  const destroyed = weather.snapshot();
  assert.equal(destroyed.resources.canvases, 0);
  assert.equal(runtime.task, null);
  assert.equal(Object.values(layers).reduce((sum, layer) => sum + layer.children.length, 0), 0);
  assert.equal(destroyed.privateAnimationLoop, false);
  console.log('PR-86 weather departmental acceptance passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
