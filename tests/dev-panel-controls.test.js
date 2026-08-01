const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sourcePath = process.env.NCN_DEV_PANEL_SOURCE
  || path.join(__dirname, "../js/dev-panel-controls.js");
const source = fs.readFileSync(sourcePath, "utf8");
const documentListeners = new Map();
const windowListeners = new Map();
let diagnosticsOn = false;
let createdElements = 0;
let observerRecord = null;

const documentElement = {
  dataset: {},
  classList: {
    contains: value => value === "diagnostics-on" && diagnosticsOn,
    add(value) { if (value === "diagnostics-on") diagnosticsOn = true; },
    remove(value) { if (value === "diagnostics-on") diagnosticsOn = false; }
  }
};

const document = {
  body: {},
  hidden: false,
  documentElement,
  querySelector: () => null,
  createElement() {
    createdElements += 1;
    throw new Error("The headless action harness should not create panel markup while diagnostics are off.");
  },
  addEventListener(type, listener) {
    documentListeners.set(type, listener);
  }
};

class FakeMutationObserver {
  constructor(callback) {
    this.callback = callback;
    observerRecord = this;
  }
  observe(target, options) {
    this.target = target;
    this.options = options;
  }
  disconnect() {}
}

const weatherCalls = [];
const motionCalls = [];
const seedCalls = [];
let activeApplication = "dripfeed";
let profileRestoreCount = 0;
let weatherState = {
  initialised: true,
  enabled: false,
  suspended: false,
  destroyed: false,
  preset: "clear",
  targetPreset: "clear",
  intensity: 0,
  targetIntensity: 0,
  wind: { x: 0, y: 0, z: 0 },
  quality: "high",
  qualityOverride: "auto",
  seed: 2045,
  transition: null,
  particles: {
    mist: 0,
    dust: 0,
    rain: 0,
    capacities: { mist: 128, dust: 64, rain: 144 },
    spawned: 0,
    fingerprint: 0
  },
  zones: { reading: false, controls: 0 },
  resources: { canvases: 4, visibleCanvases: 0, runtimeTask: true, effectHandles: 0 },
  geometry: { frames: 0, cameraReads: 0, layerMeasurements: 0, zoneReads: 0 },
  director: null,
  diagnostics: {
    effectiveDepthFlow: { configured: 0, wind: 0, mist: 0, particles: 0, heavyMistPrimeCount: 0 },
    depthFrame: { available: false, puffCount: 0, afterRenderSubscribers: 0 }
  },
  frameCount: 0,
  lastDelta: 0
};
let motionState = {
  enabled: false,
  activeSequenceCount: 0,
  activeSequences: []
};

const weather = {
  applyProfile(profile, meta) {
    weatherCalls.push({ profile, meta });
    const enabled = profile.enabled !== false;
    weatherState = {
      ...weatherState,
      enabled,
      preset: profile.preset,
      targetPreset: profile.preset,
      intensity: profile.intensity || 0,
      targetIntensity: profile.intensity || 0,
      wind: typeof profile.wind === "object" ? { ...profile.wind } : { x: Number(profile.wind) || 0, y: 0, z: 0 },
      qualityOverride: profile.quality || "auto",
      resources: { ...weatherState.resources, visibleCanvases: enabled ? 4 : 0 },
      diagnostics: {
        ...weatherState.diagnostics,
        depthFrame: { ...weatherState.diagnostics.depthFrame, available: enabled }
      }
    };
    return this.snapshot();
  },
  setSeed(value) {
    seedCalls.push(value);
    weatherState = { ...weatherState, seed: String(value) };
    return weatherState.seed;
  },
  snapshot: () => Object.freeze({ ...weatherState })
};

const motion = {
  applyProfile(profile, meta) {
    motionCalls.push({ type: "profile", profile, meta });
    motionState = { ...motionState, enabled: profile.enabled !== false };
    return this.snapshot();
  },
  trigger(options) {
    motionCalls.push({ type: "trigger", options });
    motionState = { ...motionState, activeSequenceCount: 1 };
    return Promise.resolve(Object.freeze({ status: "complete", sequenceId: "test-sequence" }));
  },
  settle(options) {
    motionCalls.push({ type: "settle", options });
    motionState = { ...motionState, activeSequenceCount: 0 };
    return Promise.resolve([]);
  },
  cancel(options) {
    motionCalls.push({ type: "cancel", options });
    motionState = { ...motionState, activeSequenceCount: 0 };
    return 1;
  },
  snapshot: () => Object.freeze({ ...motionState }),
  addEventListener() {}
};

const services = new Map([
  ["weather", weather],
  ["chamber-motion", motion]
]);

global.window = global;
global.document = document;
global.MutationObserver = FakeMutationObserver;
global.NCN_STATE = { activeApp: activeApplication };
global.performance = { now: () => 1234 };
global.addEventListener = (type, listener) => windowListeners.set(type, listener);
global.NCNIntegration = {
  getService: name => services.get(name) || null,
  syncApplicationProfile() {
    profileRestoreCount += 1;
    weatherState = {
      ...weatherState,
      enabled: false,
      preset: "clear",
      targetPreset: "clear",
      intensity: 0,
      targetIntensity: 0,
      resources: { ...weatherState.resources, visibleCanvases: 0 }
    };
    motionState = { enabled: false, activeSequenceCount: 0, activeSequences: [] };
    return Object.freeze({ application: activeApplication, applied: Object.freeze(["weather", "chamber-motion"]) });
  }
};
global.NCNIntegratedDepartments = {
  ready: async () => { throw new Error("A stale batch promise must not block a live service."); }
};
global.NCNApplications = {
  current: () => activeApplication,
  async switchTo(name) {
    activeApplication = name;
    global.NCN_STATE.activeApp = name;
    return true;
  }
};
global.NCNEnvironment = { current: () => activeApplication };
global.NCNViewerLifecycle = { current: () => "ready" };
global.NCNEvents = { on() {} };

vm.runInThisContext(source, { filename: "dev-panel-controls.js" });

(async () => {
  assert.ok(global.NCNDevPanel, "developer panel API must be published");
  assert.equal(typeof global.NCNDevPanel.dispatchControl, "function");
  assert.equal(typeof global.NCNDevPanel.weatherReport, "function");
  assert.equal(typeof global.NCNDevPanel.toggleWeatherLayer, "function");

  const initial = global.NCNDevPanel.snapshot();
  assert.equal(initial.diagnosticsActive, false, "diagnostics must remain dormant during an ordinary visit");
  assert.equal(initial.telemetryActive, false, "Weather telemetry must not poll while diagnostics are off");
  assert.equal(createdElements, 0, "the lazy diagnostics interface must not be constructed during normal load");
  assert.equal(observerRecord?.target, documentElement, "the developer surface must observe only the diagnostics class gate");
  assert.deepEqual(observerRecord?.options?.attributeFilter, ["class"]);

  await global.NCNDevPanel.dispatchControl("weather", "heavy");
  assert.equal(weatherCalls.length, 1, "Weather action must reach an already-live service");
  assert.equal(weatherCalls[0].profile.preset, "heavy-mist");
  assert.equal(weatherCalls[0].profile.intensity, 0.8, "a headless Heavy preset must use its deterministic laboratory default");
  assert.deepEqual(weatherCalls[0].profile.wind, { x: 0, y: 0, z: 0 });
  assert.equal(documentElement.dataset.devEnvironmentPreview, "true", "Dripfeed override must lift the environment preview");

  await global.NCNDevPanel.dispatchControl("weather", "dust");
  assert.equal(weatherCalls.at(-1).profile.preset, "dust", "the complete canonical preset bank must be reachable");

  await global.NCNDevPanel.dispatchControl("weather-action", "reseed");
  assert.deepEqual(seedCalls, ["2045"], "the deterministic seed control must call the public Weather seed API");

  global.NCNDevPanel.toggleWeatherLayer("near");
  assert.equal(documentElement.dataset.debugWeatherHiddenLayers, "near", "layer isolation must be a reversible presentation-only data flag");
  assert.deepEqual(global.NCNDevPanel.snapshot().hiddenWeatherLayers, ["near"]);
  global.NCNDevPanel.showAllWeatherLayers();
  assert.equal(documentElement.dataset.debugWeatherHiddenLayers, undefined, "show-all must remove every debug layer mask");

  const report = global.NCNDevPanel.weatherReport();
  assert.equal(report.application, "dripfeed");
  assert.equal(report.weather.targetPreset, "dust");
  assert.equal(report.controls.seed, "2045");

  await global.NCNDevPanel.dispatchControl("motion", "left");
  assert.equal(motionCalls.some(call => call.type === "profile"), true, "movement profile must be applied");
  assert.equal(motionCalls.some(call => call.type === "trigger" && call.options.region === "left-wall"), true, "movement trigger must reach the live service");

  const clickListener = documentListeners.get("click");
  assert.equal(typeof clickListener, "function", "document-level click dispatcher must be installed");
  let prevented = false;
  let stopped = false;
  clickListener({
    target: {
      closest: () => ({
        dataset: { debugApp: "redwire" },
        hasAttribute: () => false
      })
    },
    preventDefault: () => { prevented = true; },
    stopImmediatePropagation: () => { stopped = true; }
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(prevented, true, "developer clicks must be claimed by the dispatcher");
  assert.equal(stopped, true, "legacy duplicate listeners must be suppressed");
  assert.equal(activeApplication, "redwire", "application click must reach the switcher");

  await global.NCNDevPanel.dispatchControl("profile", "redwire");
  assert.equal(profileRestoreCount, 1, "profile restore must reach the integration service");
  assert.equal(documentElement.dataset.devEnvironmentPreview, undefined, "profile restore must remove the preview lift");

  const finalSnapshot = global.NCNDevPanel.snapshot();
  assert.equal(finalSnapshot.application, "redwire");
  assert.equal(finalSnapshot.lastAction.status, "complete");
  assert.equal(createdElements, 0, "headless service actions must not defeat lazy diagnostics construction");

  console.log("Developer panel execution harness passed.");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
