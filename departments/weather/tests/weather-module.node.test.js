const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

class FakeGradient { addColorStop() {} }
class FakeContext {
  constructor() {
    this.clearCalls = 0;
    this.radialGradientCalls = 0;
    this.linearGradientCalls = 0;
    this.globalCompositeOperation = 'source-over';
  }
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
  rect() {}
  clip() {}
  fill() {}
  translate() {}
  scale() {}
  arc() {}
  createRadialGradient() { this.radialGradientCalls += 1; return new FakeGradient(); }
  createLinearGradient() { this.linearGradientCalls += 1; return new FakeGradient(); }
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
    quality: 'full',
    task: null,
    handle: null,
    fpsSetCalls: 0,
    frameSerial: 0,
    register(name, callback, options) {
      assert.equal(options.group, 'environment');
      const task = { name, callback, enabled: options.enabled !== false, suspended: false, fps: options.maxFps };
      this.task = task;
      this.handle = {
        enable() { task.enabled = true; task.suspended = false; },
        disable() { task.enabled = false; },
        suspend() { task.suspended = true; },
        resume() { task.suspended = false; task.enabled = true; },
        wake() { task.enabled = true; },
        setMaxFps: value => { this.fpsSetCalls += 1; task.fps = value; },
        unregister: () => { this.task = null; }
      };
      return this.handle;
    },
    getQuality() { return this.quality; },
    step(delta, count = 1) {
      for (let index = 0; index < count; index += 1) {
        if (this.task?.enabled && !this.task.suspended) {
          this.task.enabled = this.task.callback({
            delta,
            quality: this.quality,
            reducedMotion: this.quality === 'reduced',
            frameToken: ++this.frameSerial
          }) !== false;
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
const settings = { quality: 'full', reducedMotion: false };
let reading = false;
let cameraReads = 0;
const effectCalls = [];
const effectHandles = [];
const effects = {
  play(name, target, options) {
    const completion = deferred();
    const handle = {
      cancelled: false,
      finished: completion.promise,
      cancel(reason) { this.cancelled = true; this.reason = reason; completion.resolve(); }
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
  integration: { requireService(name) { assert.equal(name, 'effects'); return effects; } },
  director: {
    envelope(channel, options) {
      return { channel, mode: reading ? 'reading' : 'ambient', allowed: true, intensity: options.intensity };
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
        finalHalfWidth: 4.2,
        halfHeight: 2.55,
        near: 2.5,
        far: 10.5,
        project(x, y, z) { return { x: 400 + x * 100 / z, y: 300 - y * 100 / z }; }
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

function renderCounts() {
  return Object.values(layers).reduce((totals, layer) => {
    for (const canvas of layer.children) {
      totals.radial += canvas.context.radialGradientCalls;
      totals.linear += canvas.context.linearGradientCalls;
    }
    return totals;
  }, { radial: 0, linear: 0 });
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
  assert.equal(snapshot.resources.visibleCanvases, 0);
  assert.equal(snapshot.quality, 'medium');
  assert.deepEqual(snapshot.particles.capacities, { mist: 36, dust: 40, rain: 96 });

  weather.applyProfile({ enabled: true, preset: 'mist', intensity: 0.42, seed: 2045 });
  runtime.step(16, 40);
  const approved = weather.snapshot();
  assert.equal(approved.particles.mist, 36, 'approved Low mist must use 36 banks at normal quality');
  assert.equal(approved.diagnostics.mistRenderer, 'floor-mist-test-01-banks');
  assert.equal(approved.diagnostics.floorVeil, false);
  assert.equal(approved.diagnostics.generalHaze, false);
  assert.equal(approved.diagnostics.frontEnergy, false);
  assert.deepEqual(approved.diagnostics.approvedMist, {
    density: 0.62,
    height: 0.34,
    opacity: 0.58,
    drift: 0.18,
    depthFlow: -0.12,
    turbulence: 0.42,
    softness: 0.66,
    baselineIntensity: 0.42,
    bankCount: 36,
    seed: 2045
  });
  const renders = renderCounts();
  assert.ok(renders.radial > 0, 'approved mist banks must draw radial puffs');
  assert.equal(renders.linear, 0, 'Weather must not draw a floor veil or general haze gradient');

  const depthFrame = weather.getDepthFrame();
  assert.ok(depthFrame, 'active Weather must publish its current immutable depth frame');
  assert.equal(Object.isFrozen(depthFrame), true);
  assert.equal(depthFrame.depthConvention, 'smaller-positive-z-is-nearer');
  assert.ok(depthFrame.puffCount >= approved.particles.mist * 3,
    'depth frame must represent individual puffs rather than only bank centres');
  assert.equal(Object.hasOwn(depthFrame, 'puffs'), false, 'private puff state must not be exposed');
  assert.strictEqual(weather.getDepthFrame(depthFrame.token), depthFrame);
  assert.strictEqual(weather.getDepthFrame(depthFrame.runtimeToken), depthFrame);
  assert.equal(weather.getDepthFrame('not-the-current-frame'), null);
  assert.throws(() => depthFrame.renderForeground(new FakeContext(), { nearerThan: Infinity }), /finite nearerThan/);

  const beforeDepthRender = weather.snapshot();
  const foregroundContext = new FakeContext();
  const allForeground = depthFrame.renderForeground(foregroundContext, {
    nearerThan: depthFrame.depthRange.farthest + 0.01
  });
  const noForeground = depthFrame.renderForeground(new FakeContext(), {
    nearerThan: depthFrame.depthRange.nearest
  });
  const middleDepth = (depthFrame.depthRange.nearest + depthFrame.depthRange.farthest) / 2;
  const middleForeground = depthFrame.renderForeground(new FakeContext(), { nearerThan: middleDepth });
  assert.equal(allForeground, depthFrame.puffCount, 'a far threshold must reproduce every current puff');
  assert.equal(noForeground, 0, 'nothing can be nearer than the current nearest puff');
  assert.ok(middleForeground > 0 && middleForeground < allForeground,
    'per-puff depth testing must produce a continuous foreground subset');
  assert.ok(foregroundContext.radialGradientCalls >= allForeground,
    'the read-only surface must reproduce current radial puff rendering');
  const afterDepthRender = weather.snapshot();
  assert.equal(afterDepthRender.particles.fingerprint, beforeDepthRender.particles.fingerprint,
    'depth-frame rendering must not mutate Weather simulation state');
  assert.equal(afterDepthRender.frameCount, beforeDepthRender.frameCount,
    'depth-frame rendering must not advance the shared-runtime frame');

  weather.setIntensity(0.42);
  assert.equal(weather.getDepthFrame(), null, 'a changed Weather state invalidates the previous frame view');
  assert.equal(depthFrame.renderForeground(new FakeContext(), { nearerThan: depthFrame.depthRange.farthest + 1 }), 0,
    'stale frame handles must safely become inert');
  runtime.handle.enable();
  runtime.step(16, 1);
  assert.ok(weather.getDepthFrame(), 'the next ordinary Weather render republishes a fresh frame');

  const deterministicA = approved.particles.fingerprint;
  weather.applyProfile({ enabled: false, preset: 'clear', intensity: 0 });
  weather.applyProfile({ enabled: true, preset: 'mist', intensity: 0.42, seed: 2045 });
  runtime.handle.enable();
  runtime.step(16, 40);
  assert.equal(weather.snapshot().particles.fingerprint, deterministicA);

  reading = true;
  runtime.handle.enable();
  const cameraBefore = cameraReads;
  const measurementsBefore = Object.values(layers).reduce((sum, layer) => sum + layer.measurements, 0);
  runtime.step(16, 1);
  snapshot = weather.snapshot();
  assert.equal(snapshot.zones.reading, true);
  assert.equal(snapshot.zones.controls, 1);
  assert.equal(cameraReads - cameraBefore, 1);
  assert.equal(Object.values(layers).reduce((sum, layer) => sum + layer.measurements, 0) - measurementsBefore, 4);

  runtime.quality = 'reduced';
  settings.quality = 'reduced';
  settings.reducedMotion = true;
  runtime.handle.enable();
  runtime.step(16, 1);
  assert.equal(weather.snapshot().quality, 'reduced');
  assert.deepEqual(weather.snapshot().particles.capacities, { mist: 10, dust: 8, rain: 0 });

  runtime.quality = 'full';
  settings.quality = 'full';
  settings.reducedMotion = false;
  runtime.handle.enable();
  runtime.step(16, 1);
  assert.equal(weather.snapshot().quality, 'medium');

  weather.requestAtmosphericEffect('electrical-disturbance', null, {
    intensity: 0.3,
    channel: 'boot',
    purpose: 'required'
  });
  const hostile = effectCalls.at(-1);
  assert.equal(hostile.options.channel, 'fault');
  assert.equal(hostile.options.purpose, 'ambient');
  assert.throws(() => weather.requestAtmosphericEffect('mist-illumination'), /undeclared effect/);

  const beforeSuspendFrame = weather.getDepthFrame();
  weather.suspend();
  const spawnAtSuspend = weather.snapshot().particles.spawned;
  assert.equal(weather.getDepthFrame(), null);
  assert.equal(beforeSuspendFrame.renderForeground(new FakeContext(), {
    nearerThan: beforeSuspendFrame.depthRange.farthest + 1
  }), 0, 'suspended Weather makes existing depth frames inert');
  assert.equal(weather.snapshot().resources.visibleCanvases, 0);
  runtime.step(250, 5);
  assert.equal(weather.snapshot().particles.spawned, spawnAtSuspend);
  weather.resume();
  runtime.step(1000, 1);
  assert.ok(weather.snapshot().lastDelta <= 64);
  assert.ok(weather.getDepthFrame(), 'resume republishes a frame only after normal Weather renders again');

  weather.applyProfile({ enabled: false, preset: 'clear', intensity: 0 });
  const disabled = weather.snapshot();
  assert.equal(activeTotal(disabled), 0);
  assert.equal(disabled.resources.visibleCanvases, 0);
  assert.equal(disabled.resources.effectHandles, 0);
  assert.equal(effectHandles[0].cancelled, true);
  assert.equal(weather.getDepthFrame(), null);

  weather.destroy();
  const destroyed = weather.snapshot();
  assert.equal(destroyed.resources.canvases, 0);
  assert.equal(runtime.task, null);
  assert.equal(Object.values(layers).reduce((sum, layer) => sum + layer.children.length, 0), beforeChildren);
  assert.equal(destroyed.privateAnimationLoop, false);
  console.log('PR-86 Weather acceptance and approved mist-bank contract passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
