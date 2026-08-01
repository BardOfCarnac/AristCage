const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "..", "weather-particles.js"), "utf8");
for (const forbidden of ["requestAnimationFrame", "setInterval", "Math.random", "querySelector", "NCNOptical"]) {
  assert.equal(source.includes(forbidden), false, `Particle field must not contain ${forbidden}`);
}
for (const required of [
  "priority: 22",
  "ncn-department-weather-canvas",
  "createRadialGradient",
  "ellipse",
  "apertureAt",
  "existing-weather-compositor",
  "depth-light-particle-field-1"
]) assert.ok(source.includes(required), `Particle field must include ${required}`);

function createHarness(seed = 2045) {
  const drawLog = [];
  const tasks = [];
  const canvases = [];

  function drawingContext() {
    return {
      globalCompositeOperation: "source-over",
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      setTransform() {},
      clearRect() {},
      save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
      arc(...args) { drawLog.push({ type: "arc", args }); },
      ellipse(...args) { drawLog.push({ type: "ellipse", args }); },
      moveTo() {}, lineTo() {}, stroke() { drawLog.push({ type: "stroke" }); },
      fill() { drawLog.push({ type: "fill", fillStyle: this.fillStyle }); },
      fillRect(...args) { drawLog.push({ type: "fillRect", fillStyle: this.fillStyle, args }); },
      createRadialGradient() {
        drawLog.push({ type: "gradient" });
        return { addColorStop() {} };
      }
    };
  }

  function layer() {
    return {
      append(canvas) { canvas.parentElement = this; canvases.push(canvas); },
      getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; }
    };
  }

  const layers = { far: layer(), rear: layer(), middle: layer(), near: layer() };
  const document = {
    createElement(name) {
      assert.equal(name, "canvas");
      const context = drawingContext();
      return {
        hidden: false,
        style: {},
        className: "",
        width: 0,
        height: 0,
        setAttribute() {},
        getContext() { return context; },
        remove() { this.removed = true; }
      };
    }
  };

  const baseState = {
    initialised: false,
    enabled: false,
    suspended: false,
    destroyed: false,
    preset: "clear",
    targetPreset: "clear",
    intensity: 0,
    targetIntensity: 0,
    quality: "high",
    qualityOverride: "high",
    seed,
    particles: {},
    resources: {},
    diagnostics: {}
  };

  function baseService() {
    const snapshot = () => Object.freeze({ ...baseState });
    return {
      async init() { baseState.initialised = true; return snapshot(); },
      applyProfile(profile = {}) {
        baseState.enabled = profile.enabled !== false;
        baseState.preset = baseState.targetPreset = String(profile.preset || baseState.preset);
        baseState.intensity = baseState.targetIntensity = Number(profile.intensity) || 0;
        baseState.quality = baseState.qualityOverride = String(profile.quality || baseState.quality);
        return snapshot();
      },
      setPreset(name) { baseState.preset = baseState.targetPreset = String(name); return snapshot(); },
      setIntensity(value) { baseState.intensity = baseState.targetIntensity = Number(value) || 0; return baseState.targetIntensity; },
      transitionTo(name) { baseState.targetPreset = String(name); baseState.preset = String(name); return snapshot(); },
      setWind() { return {}; },
      setQuality(value) { baseState.quality = baseState.qualityOverride = String(value); return value; },
      setSeed(value) { baseState.seed = Number(value); return baseState.seed; },
      setEnabled(value) { baseState.enabled = Boolean(value); return baseState.enabled; },
      suspend() { baseState.suspended = true; return true; },
      resume() { baseState.suspended = false; return true; },
      reset() { baseState.enabled = false; baseState.intensity = baseState.targetIntensity = 0; return true; },
      destroy() { baseState.destroyed = true; return true; },
      snapshot
    };
  }

  const factory = () => baseService();
  Object.defineProperty(factory, "__ncnPresetDepthFlowPolicy", { value: true });

  const camera = {
    near: 2.5, far: 10.5, halfWidth: 3.2, finalHalfWidth: 4.2, halfHeight: 2.55, cell: 0.5,
    project(x, y, z) { return { x: 400 + x * 90 / z, y: 300 - y * 90 / z }; },
    apertureAt() { return { left: 20, top: 20, width: 760, height: 560 }; }
  };

  const runtime = {
    register(name, callback, options) {
      const record = { name, callback, options, enabled: options.enabled !== false, fps: options.maxFps };
      tasks.push(record);
      return {
        enable() { record.enabled = true; }, disable() { record.enabled = false; },
        suspend() { record.suspended = true; }, resume() { record.suspended = false; record.enabled = true; },
        setMaxFps(value) { record.fps = value; }, wake() {}, unregister() { record.unregistered = true; }
      };
    }
  };

  const window = {
    NCNWeatherPresets: {
      clear: {},
      mist: { mist: 0.54, turbulence: 0.17, drift: 0.2, depthFlow: -0.018 },
      smoke: { mist: 0.58, smoke: 1, turbulence: 0.34, drift: 0.12, depthFlow: -0.06 },
      dust: { dust: 0.48, turbulence: 0.32, drift: 0.34, depthFlow: -0.025 },
      "electrical-weather": { mist: 0.54, electrical: 0.82, turbulence: 0.46, drift: 0.3, depthFlow: -0.035 }
    },
    createNCNWeatherDepartment: factory,
    createWeather: factory,
    NCNWeatherDepartment: { createWeather: factory }
  };
  const context = vm.createContext({
    window, document, console,
    innerWidth: 800, innerHeight: 600,
    navigator: { hardwareConcurrency: 8 }
  });
  context.globalThis = context;
  vm.runInContext(source, context, { filename: "weather-particles.js" });

  const departmentContext = {
    layers: { weather: layers },
    runtime,
    settings: { quality: "high", reducedMotion: false },
    chamber: { getCameraSnapshot: () => camera },
    director: { envelope: (_channel, request) => ({ allowed: true, intensity: request.intensity }) },
    views: { isReading: () => false, getReadingZone: () => null, getControlZones: () => [] }
  };

  return {
    window,
    tasks,
    canvases,
    drawLog,
    service: window.createNCNWeatherDepartment(departmentContext)
  };
}

async function exercise(seed, preset, frames = 8, reducedMotion = false) {
  const harness = createHarness(seed);
  assert.equal(harness.window.createNCNWeatherDepartment.__ncnDepthParticleField, true);
  assert.equal(harness.window.createNCNWeatherDepartment.__ncnPresetDepthFlowPolicy, true);
  await harness.service.init();
  harness.service.applyProfile({ enabled: true, preset, intensity: 1, quality: reducedMotion ? "reduced" : "high" });
  const task = harness.tasks[0];
  assert.equal(task.name, "particles");
  assert.equal(task.options.priority, 22);
  for (let index = 0; index < frames; index += 1) {
    task.callback({ delta: 33, quality: reducedMotion ? "reduced" : "full", reducedMotion });
  }
  return harness;
}

(async () => {
  const smokeA = await exercise(2045, "smoke");
  const smokeB = await exercise(2045, "smoke");
  const smoke = smokeA.service.snapshot();
  assert.equal(smoke.resources.particleCanvases, 4);
  assert.equal(smoke.resources.visibleParticleCanvases, 4);
  assert.equal(smoke.diagnostics.particleRenderer.sharedRuntime, true);
  assert.equal(smoke.diagnostics.particleRenderer.runtimePriority, 22);
  assert.equal(smoke.diagnostics.particleRenderer.privateAnimationLoop, false);
  assert.ok(smoke.particles.depthField.active > 0);
  assert.ok(smoke.particles.depthField.kinds.ash > 0);
  assert.ok(smoke.particles.depthField.kinds.ember > 0);
  assert.ok(smoke.particles.depthField.lightCaught > 0);
  assert.ok(smoke.particles.depthField.smokeSuppressed > 0);
  assert.equal(smoke.particles.depthField.fingerprint, smokeB.service.snapshot().particles.depthField.fingerprint);
  assert.ok(smokeA.drawLog.some(call => call.type === "ellipse"), "Smoke must draw dark ash silhouettes.");
  assert.ok(smokeA.drawLog.some(call => call.type === "gradient"), "Smoke must draw glowing particles.");

  const electricalHarness = await exercise(4096, "electrical-weather");
  const electrical = electricalHarness.service.snapshot();
  assert.ok(electrical.particles.depthField.kinds.electrical > 0);

  const reducedHarness = await exercise(2045, "smoke", 5, true);
  assert.ok(reducedHarness.service.snapshot().particles.depthField.capacity <= 18);

  smokeA.service.reset();
  assert.equal(smokeA.service.snapshot().particles.depthField.active, 0);
  smokeA.service.destroy();
  assert.ok(smokeA.canvases.every(canvas => canvas.removed === true));

  console.log("Depth-aware Weather particles are deterministic, chamber-projected, shared-runtime and lifecycle-safe.");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
