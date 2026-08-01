const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sourcePath = process.env.NCN_DEV_PANEL_SOURCE
  || path.join(__dirname, "../js/dev-panel-controls.js");
const source = fs.readFileSync(sourcePath, "utf8");
const documentListeners = new Map();
const windowListeners = new Map();
const busSubscriptions = new Set();
const runtimeTasks = new Map();
let diagnosticsOn = false;
let createdElements = 0;

function listenerKey(type, capture = false) {
  return `${type}:${capture === true}`;
}

const classList = {
  contains(value) { return value === "diagnostics-on" && diagnosticsOn; },
  add(value) { if (value === "diagnostics-on") diagnosticsOn = true; },
  remove(value) { if (value === "diagnostics-on") diagnosticsOn = false; },
  toggle() {}
};

const documentElement = { dataset: {}, classList };

function node(value = "") {
  return {
    value,
    textContent: value,
    dataset: {},
    classList: { toggle() {} },
    setAttribute() {},
    hasAttribute() { return false; },
    isConnected: true,
    title: "",
    type: "text"
  };
}

const inputs = new Map([
  ["intensity", Object.assign(node("0.46"), { type: "range", dataset: { debugWeatherInput: "intensity" } })],
  ["duration", Object.assign(node("900"), { type: "range", dataset: { debugWeatherInput: "duration" } })],
  ["wind-x", Object.assign(node("0"), { type: "range", dataset: { debugWeatherInput: "wind-x" } })],
  ["wind-y", Object.assign(node("0"), { type: "range", dataset: { debugWeatherInput: "wind-y" } })],
  ["wind-z", Object.assign(node("0"), { type: "range", dataset: { debugWeatherInput: "wind-z" } })],
  ["reading", Object.assign(node("0.48"), { type: "range", dataset: { debugWeatherInput: "reading" } })],
  ["controls", Object.assign(node("0.68"), { type: "range", dataset: { debugWeatherInput: "controls" } })],
  ["quality", Object.assign(node("auto"), { dataset: { debugWeatherInput: "quality" } })],
  ["seed", Object.assign(node("2045"), { dataset: { debugWeatherInput: "seed" } })]
]);
const outputs = new Map([...inputs.keys()].map(key => [key, node()]));
const metrics = new Map();
const weatherButtons = ["clear", "dust", "mist", "heavy", "smoke", "light-rain", "rain", "electrical"]
  .map(value => Object.assign(node(), { dataset: { debugWeather: value } }));
const layerButtons = ["far", "rear", "middle", "near"]
  .map(value => Object.assign(node(), { dataset: { debugWeatherLayer: value } }));
const fixedNodes = new Map([
  ["[data-debug-weather-status]", node()],
  ["[data-debug-weather-status-detail]", node()],
  ["[data-debug-motion-status]", node()],
  ["[data-debug-service-message]", node()],
  ["[data-debug-environment-profile]", node()],
  ["[data-debug-viewer-state]", node()],
  ["[data-debug-lab-profile]", node()]
]);

const controls = {
  isConnected: true,
  querySelector(selector) {
    const input = selector.match(/^\[data-debug-weather-input="(.+)"\]$/)?.[1];
    if (input) return inputs.get(input) || null;
    const output = selector.match(/^\[data-debug-weather-output="(.+)"\]$/)?.[1];
    if (output) return outputs.get(output) || null;
    const metric = selector.match(/^\[data-debug-weather-metric="(.+)"\]$/)?.[1];
    if (metric) {
      if (!metrics.has(metric)) metrics.set(metric, node());
      return metrics.get(metric);
    }
    return fixedNodes.get(selector) || null;
  },
  querySelectorAll(selector) {
    if (selector === "[data-debug-weather]") return weatherButtons;
    if (selector === "[data-debug-weather-layer]") return layerButtons;
    if (selector === "[data-debug-weather-input]") return [...inputs.values()];
    return [];
  }
};

const panel = {
  isConnected: true,
  querySelector(selector) {
    if (selector === "[data-debug-service-controls]") return controls;
    if (selector === ".diagnostics-application-section") return null;
    if (selector === ".diagnostics-title") return null;
    return null;
  }
};
const toggle = node("Dev on");

const document = {
  body: {},
  hidden: false,
  documentElement,
  querySelector(selector) {
    if (selector === ".diagnostics-panel") return panel;
    if (selector === ".diagnostics-toggle") return toggle;
    return null;
  },
  createElement() {
    createdElements += 1;
    throw new Error("Pre-mounted headless controls should not create markup.");
  },
  addEventListener(type, listener, options) {
    documentListeners.set(listenerKey(type, options), listener);
  },
  removeEventListener(type, listener, options) {
    const key = listenerKey(type, options);
    if (documentListeners.get(key) === listener) documentListeners.delete(key);
  }
};

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
  particles: { mist: 0, dust: 0, rain: 0, capacities: { mist: 128, dust: 64, rain: 144 }, fingerprint: 0 },
  zones: { reading: false, controls: 0 },
  resources: { canvases: 4, visibleCanvases: 0, runtimeTask: true, effectHandles: 0 },
  geometry: { frames: 0, cameraReads: 0, layerMeasurements: 0, zoneReads: 0 },
  director: null,
  diagnostics: {
    effectiveDepthFlow: { configured: 0, wind: 0, mist: 0, particles: 0 },
    depthFrame: { available: false, puffCount: 0, afterRenderSubscribers: 0 }
  },
  frameCount: 0,
  lastDelta: 0
};
let motionState = { enabled: false, activeSequenceCount: 0, activeSequences: [] };
const motionListeners = new Map();

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
      diagnostics: { ...weatherState.diagnostics, depthFrame: { ...weatherState.diagnostics.depthFrame, available: enabled } }
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
    motionState.activeSequenceCount = 0;
    return Promise.resolve([]);
  },
  cancel(options) {
    motionCalls.push({ type: "cancel", options });
    motionState.activeSequenceCount = 0;
    return 1;
  },
  snapshot: () => Object.freeze({ ...motionState }),
  addEventListener(type, listener) { motionListeners.set(type, listener); },
  removeEventListener(type, listener) { if (motionListeners.get(type) === listener) motionListeners.delete(type); }
};

const services = new Map([["weather", weather], ["chamber-motion", motion]]);

global.window = global;
global.document = document;
global.NCN_STATE = { activeApp: activeApplication };
global.performance = { now: () => 1234 };
global.addEventListener = (type, listener) => windowListeners.set(type, listener);
global.removeEventListener = (type, listener) => { if (windowListeners.get(type) === listener) windowListeners.delete(type); };
global.ensureDiagnosticsInterface = () => {};
global.NCNViewerRuntime = {
  register(name, callback, options) {
    const record = { name, callback, options, enabled: true, active: true, unregistered: false };
    runtimeTasks.set(name, record);
    return Object.freeze({
      wake() { record.active = true; callback({}); },
      enable() { record.enabled = true; record.active = true; },
      disable() { record.enabled = false; record.active = false; },
      unregister() { record.unregistered = true; runtimeTasks.delete(name); },
      snapshot: () => Object.freeze({ name, group: options.group, enabled: record.enabled, active: record.active, maxFps: options.maxFps })
    });
  }
};
global.NCNIntegration = {
  getService: name => services.get(name) || null,
  syncApplicationProfile() {
    profileRestoreCount += 1;
    weatherState = {
      ...weatherState,
      enabled: activeApplication === "redwire",
      preset: activeApplication === "redwire" ? "mist" : "clear",
      targetPreset: activeApplication === "redwire" ? "mist" : "clear",
      intensity: activeApplication === "redwire" ? 0.46 : 0,
      targetIntensity: activeApplication === "redwire" ? 0.46 : 0
    };
    motionState = { enabled: activeApplication === "redwire", activeSequenceCount: 0, activeSequences: [] };
    return Object.freeze({ application: activeApplication, applied: Object.freeze(["weather", "chamber-motion"]) });
  }
};
global.NCNIntegratedDepartments = { ready: async () => { throw new Error("Live services should avoid stale readiness waits."); } };
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
global.NCNEvents = {
  on(type, listener) {
    const record = { type, listener };
    busSubscriptions.add(record);
    return () => busSubscriptions.delete(record);
  }
};

vm.runInThisContext(source, { filename: "dev-panel-controls.js" });

(async () => {
  assert.ok(global.NCNDevPanel, "developer panel API must be published");
  assert.equal(documentListeners.size, 0, "ordinary visits must install no developer document delegates");
  assert.equal(windowListeners.size, 0, "ordinary visits must install no developer window listeners");
  assert.equal(runtimeTasks.size, 0, "ordinary visits must register no diagnostics runtime task");
  assert.equal(busSubscriptions.size, 0, "ordinary visits must install no event-bus subscriptions");
  assert.equal(createdElements, 0, "ordinary visits must not construct developer markup");

  diagnosticsOn = true;
  await global.NCNDevPanel.setDiagnosticsActive(true);
  const active = global.NCNDevPanel.snapshot();
  assert.equal(active.diagnosticsActive, true);
  assert.equal(active.telemetryActive, true);
  assert.equal(active.bindingsActive, true);
  assert.equal(active.motionBindingsActive, true);
  assert.equal(runtimeTasks.has("diagnostics:weather-laboratory"), true, "telemetry must use the shared runtime");
  assert.equal(documentListeners.has("click:true"), true, "capture click delegate should exist only while active");
  assert.equal(documentListeners.has("input:true"), true, "capture input delegate should exist only while active");
  assert.equal(busSubscriptions.size, 2, "diagnostic bus subscriptions should be bounded and visible");

  await global.NCNDevPanel.dispatchControl("weather", "heavy");
  assert.equal(weatherCalls.at(-1).profile.preset, "heavy-mist");
  assert.equal(documentElement.dataset.devEnvironmentPreview, "true");
  await global.NCNDevPanel.dispatchControl("weather-action", "reseed");
  assert.deepEqual(seedCalls, ["2045"]);
  global.NCNDevPanel.toggleWeatherLayer("near");
  assert.equal(documentElement.dataset.debugWeatherHiddenLayers, "near");

  const clickListener = documentListeners.get("click:true");
  let prevented = false;
  let stopped = false;
  clickListener({
    target: { closest: () => ({ dataset: { debugApp: "redwire" }, hasAttribute: () => false }) },
    preventDefault: () => { prevented = true; },
    stopImmediatePropagation: () => { stopped = true; }
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(activeApplication, "redwire");

  diagnosticsOn = false;
  await global.NCNDevPanel.setDiagnosticsActive(false);
  const cleaned = global.NCNDevPanel.snapshot();
  assert.equal(profileRestoreCount, 1, "diagnostics-off must restore the canonical application profile");
  assert.equal(cleaned.diagnosticsActive, false);
  assert.equal(cleaned.telemetryActive, false);
  assert.equal(cleaned.bindingsActive, false);
  assert.equal(cleaned.motionBindingsActive, false);
  assert.equal(cleaned.eventSubscriptionCount, 0);
  assert.equal(cleaned.overrideActive, false);
  assert.equal(documentElement.dataset.devEnvironmentPreview, undefined);
  assert.equal(documentElement.dataset.debugWeatherHiddenLayers, undefined);
  assert.equal(documentListeners.size, 0, "diagnostic document delegates must be removed");
  assert.equal(windowListeners.size, 0, "diagnostic window listeners must be removed");
  assert.equal(runtimeTasks.size, 0, "diagnostics shared-runtime task must be unregistered");
  assert.equal(busSubscriptions.size, 0, "diagnostic event subscriptions must be released");
  assert.equal(motionListeners.size, 0, "diagnostic movement listeners must be released");

  console.log("Developer panel lifecycle harness passed.");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
