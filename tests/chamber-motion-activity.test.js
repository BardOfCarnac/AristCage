"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("js/chamber-motion-activity.js", "utf8");

class WindowTarget extends EventTarget {}
const windowTarget = new WindowTarget();
const documentElement = { dataset: {} };
let runtimeCallback = null;
let taskEnabled = false;
let taskActive = false;
let appliedProfile = null;
let pending = 0;
const requests = [];

const runtimeHandle = {
  enable() { taskEnabled = true; taskActive = true; },
  wake() { taskActive = true; },
  disable() { taskEnabled = false; taskActive = false; },
  snapshot() { return { enabled: taskEnabled, active: taskActive }; }
};

const runtime = {
  register(name, callback, options) {
    assert.equal(name, "chamber-motion:panel-activity");
    assert.equal(options.group, "chamber");
    assert.equal(options.enabled, false);
    runtimeCallback = callback;
    return runtimeHandle;
  }
};

const serviceEvents = new EventTarget();
const service = {
  async applyProfile(profile) {
    appliedProfile = { ...(appliedProfile || {}), ...profile };
    return this.snapshot();
  },
  snapshot() {
    return {
      enabled: true,
      suspended: false,
      reducedMotion: false,
      activeSequenceCount: 0,
      pendingApprovalCount: pending,
      profile: { maxActive: appliedProfile?.maxActive || 2 }
    };
  },
  addEventListener: (...args) => serviceEvents.addEventListener(...args),
  removeEventListener: (...args) => serviceEvents.removeEventListener(...args)
};

const state = { activeApp: "redwire", activePanel: null };
const deterministicMath = Object.create(Math);
deterministicMath.random = () => 0;
const context = {
  console,
  Math: deterministicMath,
  performance: { now: () => 1000 },
  URLSearchParams,
  Event,
  EventTarget,
  CustomEvent: globalThis.CustomEvent || class CustomEvent extends Event {
    constructor(type, options = {}) { super(type); this.detail = options.detail; }
  },
  document: { documentElement },
  NCN_STATE: state,
  window: windowTarget,
  setTimeout,
  clearTimeout,
  Promise
};

Object.assign(windowTarget, {
  location: { search: "" },
  NCNViewerRuntime: runtime,
  NCNApplications: { current: () => state.activeApp },
  NCNIntegratedDepartments: { ready: async () => ({ ready: true }) },
  NCNIntegration: { getService: name => name === "chamber-motion" ? service : null },
  NCNModules: { get: () => service },
  NCNChamberMotionController: {
    requestMovement(options, reason) {
      pending += 1;
      requests.push({ options, reason });
      return Promise.resolve({ accepted: true });
    }
  }
});

vm.runInNewContext(source, context, { filename: "js/chamber-motion-activity.js" });

(async () => {
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(runtimeCallback, "host activity task should register");
  assert.equal(appliedProfile.maxActive, 4);
  assert.equal(appliedProfile.reducedMotionPolicy, "deny");

  state.activePanel = "filter";
  windowTarget.dispatchEvent(new context.CustomEvent("ncn:panel-change", {
    detail: { open: true, app: "redwire", name: "filter" }
  }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(taskEnabled, true, "panel opening should enable the host activity task");

  assert.equal(runtimeCallback({ now: 1000 }), true,
    "the first runtime tick should admit one movement and remain awake");
  assert.equal(requests.length, 1,
    "panel activity should stagger its initial fill rather than launching three together");

  assert.equal(runtimeCallback({ now: 1600 }), true,
    "the task should remain awake during the minimum fill delay");
  assert.equal(requests.length, 1,
    "no second movement should be admitted before the 650ms cadence floor");

  assert.equal(runtimeCallback({ now: 1650 }), true,
    "the second cadence boundary should admit one more movement");
  assert.equal(requests.length, 2);

  assert.equal(runtimeCallback({ now: 2300 }), true,
    "the third cadence boundary should complete the target fill");
  assert.equal(requests.length, 3,
    "filter panel should eventually fill to three in-flight movements");
  assert.ok(requests.every(request => request.options.allowConcurrent === true));
  assert.ok(requests.every(request => request.options.clusterSize[0] === 2));

  assert.equal(runtimeCallback({ now: 3000 }), false,
    "task should sleep once the staggered target is filled");
  assert.equal(windowTarget.NCNChamberMotionActivity.snapshot().targetActive, 3);

  state.activePanel = null;
  windowTarget.dispatchEvent(new context.CustomEvent("ncn:panel-change", {
    detail: { open: false, app: "redwire", name: null }
  }));
  assert.equal(taskEnabled, false, "panel closing should disable host activity scheduling");

  console.log("Chamber motion staggered host activity checks passed.");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
