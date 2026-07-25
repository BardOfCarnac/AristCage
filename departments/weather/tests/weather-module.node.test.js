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

function createRuntime() {
  return {
    quality: 'reduced',
    task: null,
    handle: null,
    fpsSetCalls: 0,
    register(name, callback, options) {
      assert.equal(options.group, 'environment');
      const task = {
        name,
        callback,
        options,
        enabled: options.enabled !== false,
        suspended: false,
        fps: options.maxFps
      };
      this.task = task;
      const handle = {
        enable() { task.enabled = true; task.suspended = false; },
        disable() { task.enabled = false; },
        suspend() { task.suspended = true; },
        resume() { task.suspended = false; task.enabled = true; },
        wake() { task.enabled = true; },
        setMaxFps: value => {
          this.fpsSetCalls += 1;
          task.fps = value;
        },
        unregister: () => { this.task = null; },
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
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

const runtime = createRuntime();
const layers = Object.fromEntries(['far', 'rear', 'middle', 'near'].map(key => [key, new FakeLayer()]));
const settings = { quality: 'reduced', reducedMotion: true };
let reading = true;
let cameraReads = 0;
const effectCalls = [];
const effectHandles = [];
const acceptedEffects = new Set(['electrical-disturbance', 'light-flash']);
const effects = {
  play(name, target, options) {
    if (!acceptedEffects.has(name)) throw new Error(`Unknown effect: ${name}`);
    const completion = deferred();
    const handle = {
      cancelled: false,
      finished: completion.promise,
      cancel(reason) {
        this.cancelled = true;
        this.reason = reason;
        completion.resolve({ status: 'cancelled', reason });
      }
    };
    effectCalls.push({ name, target, options, handle });
    effectHandles.push(handle);
    return handle;
  }
};
const context = {
  owner: 'weather-node-test',
  runtime,
  layers: { weather: layers },
  settings,
  integration: {
    requireService(name) {
      assert.equal(name, 'effects');
      return effects;
    }
  },
  director: {
    envelope(channel, options) {
      return {
        channel,
        mode: reading ? 'reading' : 'ambient',
        allowed: true,
        intensity: options.intensity,
        reducedMotion: false
      };
    }
  },
  views: {
    isReading() { return reading; },
    getReadingZone() {
      return reading ? { rect: { left: 200, top: 120, width: 360, height: 260 } } : null;
    },
    getControlZones() {
      return [{ rect: { left: 0, top: 0, width: 800, height: 70 } }];
    }
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
Object.defineProperty(global, 'navigator', { value: { hardwareConcurrency: 8 }, configurable: true });
global.innerWidth = 800;
global.innerHeight = 600;

const directory = path.resolve(__dirname, '..');
for (const filename of ['weather-manifest.js', 'weather-presets.js', 'weather-module.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(directory, filename), 'utf8'), { filename });
}

function activeTotal(snapshot) {
  return snapshot.particles.mist + snapshot.particles.dust + snapshot.particles.rain;
}

(async () => {
  const source = fs.readFileSync(path.join(directory, 'weather-module.js'), 'utf8');
  assert.equal(global.NCNWeatherDepartmentManifest.replaces, 'weather');
  assert.deepEqual(global.NCNWeatherDepartmentManifest.layers,
    ['weather:far', 'weather:rear', 'weather:middle', 'weather:near']);
  for (const forbidden of ['requestAnimationFrame', 'setInterval', 'Math.random', 'querySelector', 'window.NCNEffects', 'dispatchEvent']) {
    assert.equal(source.includes(forbidden), false, `forbidden token: ${forbidden}`);
  }

  const weather = global.NCNWeatherDepartment.createWeather(context);
  const beforeChildren = Object.values(layers).reduce((sum, layer) => sum + layer.children.length, 0);
  await weather.init();
  let snapshot = weather.snapshot();
  assert.equal(snapshot.resources.canvases, 4);
  assert.equal(snapshot.resources.visibleCanvases, 0, 'disabled initial state must not composite canvases');
  assert.equal(snapshot.quality, 'reduced');
  assert.deepEqual(snapshot.particles.capacities, { mist: 10, dust: 8, rain: 0 });
  assert.equal(runtime.fpsSetCalls, 0, 'runtime registration should carry initial FPS without a setter invalidation');

  weather.applyProfile({ enabled: true, preset: 'mist', intensity: 0.72, seed: 2045 });
  runtime.step(16, 40);
  const redwireA = weather.snapshot();
  assert.ok(redwireA.particles.mist > 0);
  assert.equal(redwireA.resources.visibleCanvases, 4);
  assert.equal(redwireA.zones.reading, true);
  assert.equal(redwireA.zones.controls, 1);

  const fpsBeforeSameQuality = runtime.fpsSetCalls;
  runtime.handle.enable();
  runtime.step(16, 20);
  assert.equal(runtime.fpsSetCalls, fpsBeforeSameQuality,
    'same-quality frames must not repeatedly set runtime FPS');

  settings.reducedMotion = false;
  settings.quality = 'full';
  runtime.quality = 'full';
  runtime.handle.enable();
  runtime.step(16, 1);
  snapshot = weather.snapshot();
  assert.equal(snapshot.quality, 'medium');
  assert.equal(runtime.fpsSetCalls, fpsBeforeSameQuality + 1);
  const fpsAfterFull = runtime.fpsSetCalls;
  runtime.handle.enable();
  runtime.step(16, 12);
  assert.equal(runtime.fpsSetCalls, fpsAfterFull);

  settings.reducedMotion = true;
  settings.quality = 'reduced';
  runtime.quality = 'reduced';
  runtime.handle.enable();
  runtime.step(16, 1);
  assert.equal(weather.snapshot().quality, 'reduced');
  assert.equal(runtime.fpsSetCalls, fpsAfterFull + 1);

  settings.reducedMotion = false;
  settings.quality = 'full';
  runtime.quality = 'full';
  runtime.handle.enable();
  runtime.step(16, 1);
  assert.equal(weather.snapshot().quality, 'medium');
  assert.equal(runtime.fpsSetCalls, fpsAfterFull + 2);

  const cameraBefore = cameraReads;
  const measurementsBefore = Object.values(layers).reduce((sum, layer) => sum + layer.measurements, 0);
  runtime.handle.enable();
  runtime.step(16, 1);
  assert.equal(cameraReads - cameraBefore, 1, 'camera must resolve once per frame');
  assert.equal(Object.values(layers).reduce((sum, layer) => sum + layer.measurements, 0) - measurementsBefore, 4,
    'each supplied layer may be measured once per frame');

  settings.reducedMotion = true;
  settings.quality = 'reduced';
  runtime.quality = 'reduced';
  weather.applyProfile({ enabled: false, preset: 'clear', intensity: 0 });
  weather.applyProfile({ enabled: true, preset: 'mist', intensity: 0.72, seed: 2045 });
  runtime.handle.enable();
  runtime.step(16, 40);
  const deterministicA = weather.snapshot();

  weather.requestAtmosphericEffect('electrical-disturbance', null, {
    intensity: 0.3,
    channel: 'boot',
    purpose: 'required'
  });
  const hostile = effectCalls.at(-1);
  assert.equal(hostile.name, 'electrical-disturbance');
  assert.equal(hostile.options.channel, 'fault', 'Weather must force the canonical effect channel');
  assert.equal(hostile.options.purpose, 'ambient', 'Weather must force ambient purpose');
  assert.throws(() => weather.requestAtmosphericEffect('mist-illumination'), /undeclared effect/);
  assert.equal(weather.snapshot().resources.effectHandles, 1);

  weather.applyProfile({ enabled: false, preset: 'clear', intensity: 0 });
  const disabled = weather.snapshot();
  assert.equal(disabled.enabled, false);
  assert.equal(activeTotal(disabled), 0, 'disabled profile must deactivate every particle');
  assert.equal(disabled.resources.visibleCanvases, 0, 'disabled profile must hide every canvas');
  assert.equal(disabled.resources.effectHandles, 0, 'disabled profile must cancel Weather effects');
  assert.equal(disabled.intensity, 0);
  assert.equal(disabled.targetIntensity, 0);
  assert.equal(disabled.transition, null);
  assert.equal(effectHandles[0].cancelled, true);

  weather.applyProfile({ enabled: true, preset: 'mist', intensity: 0.72, seed: 2045 });
  runtime.handle.enable();
  runtime.step(16, 40);
  const redwireB = weather.snapshot();
  assert.ok(redwireB.particles.mist > 0);
  assert.equal(redwireB.resources.visibleCanvases, 4);
  assert.equal(redwireB.particles.fingerprint, deterministicA.particles.fingerprint,
    're-enable from the same seed/profile/deltas must restart deterministically');

  weather.setQuality('high');
  weather.transitionTo('rain', { duration: 240 });
  runtime.handle.enable();
  runtime.step(16, 50);
  assert.ok(weather.snapshot().particles.rain > 0);

  weather.suspend();
  const suspended = weather.snapshot();
  const spawnCount = suspended.particles.spawned;
  assert.equal(suspended.resources.visibleCanvases, 0);
  runtime.step(250, 10);
  assert.equal(weather.snapshot().particles.spawned, spawnCount);

  weather.resume();
  runtime.step(1000, 1);
  assert.ok(weather.snapshot().lastDelta <= 64);

  weather.reset();
  const reset = weather.snapshot();
  assert.equal(activeTotal(reset), 0);
  assert.equal(reset.resources.visibleCanvases, 0);
  assert.equal(reset.resources.effectHandles, 0);

  weather.destroy();
  const destroyed = weather.snapshot();
  assert.equal(destroyed.resources.canvases, 0);
  assert.equal(runtime.task, null);
  assert.equal(Object.values(layers).reduce((sum, layer) => sum + layer.children.length, 0), beforeChildren);
  assert.equal(destroyed.privateAnimationLoop, false);
  console.log('PR-86 weather departmental acceptance passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
