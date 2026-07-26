const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/dev-panel-controls.js"), "utf8");
const documentListeners = new Map();
const windowListeners = new Map();

const documentElement = {
  dataset: {},
  classList: {
    contains: () => false,
    add() {},
    remove() {}
  }
};

const document = {
  body: {},
  documentElement,
  querySelector: () => null,
  createElement() {
    throw new Error("The headless action harness should not create panel markup.");
  },
  addEventListener(type, listener) {
    documentListeners.set(type, listener);
  }
};

class FakeMutationObserver {
  constructor(callback) { this.callback = callback; }
  observe() {}
  disconnect() {}
}

const weatherCalls = [];
const motionCalls = [];
let activeApplication = "dripfeed";
let profileRestoreCount = 0;
let weatherState = {
  enabled: false,
  preset: "clear",
  targetPreset: "clear",
  intensity: 0,
  targetIntensity: 0
};
let motionState = {
  enabled: false,
  activeSequenceCount: 0,
  activeSequences: []
};

const weather = {
  applyProfile(profile, meta) {
    weatherCalls.push({ profile, meta });
    weatherState = {
      ...weatherState,
      enabled: profile.enabled !== false,
      preset: profile.preset,
      targetPreset: profile.preset,
      intensity: profile.intensity || 0,
      targetIntensity: profile.intensity || 0
    };
    return this.snapshot();
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
    weatherState = { enabled: false, preset: "clear", targetPreset: "clear", intensity: 0, targetIntensity: 0 };
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

  await global.NCNDevPanel.dispatchControl("weather", "heavy");
  assert.equal(weatherCalls.length, 1, "Weather action must reach an already-live service");
  assert.equal(weatherCalls[0].profile.preset, "heavy-mist");
  assert.equal(documentElement.dataset.devEnvironmentPreview, "true", "Dripfeed override must lift the environment preview");

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

  const snapshot = global.NCNDevPanel.snapshot();
  assert.equal(snapshot.application, "redwire");
  assert.equal(snapshot.lastAction.status, "complete");

  console.log("Developer panel execution harness passed.");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});