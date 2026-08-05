const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const contextSource = fs.readFileSync(path.join(root, "js", "department-context.js"), "utf8");
const environmentSource = fs.readFileSync(path.join(root, "js", "environment-manager.js"), "utf8");
const manifestSource = fs.readFileSync(path.join(root, "departments", "weather", "weather-manifest.js"), "utf8");

const readingZone = Object.freeze({
  rect: Object.freeze({ left: 10, top: 20, right: 210, bottom: 120, width: 200, height: 100 })
});

const noop = () => {};
const base = {
  runtime: {
    register: () => ({ unregister: noop }),
    wake: noop,
    getQuality: () => "full",
    snapshot: () => ({}),
    subscribe: () => noop
  },
  lifecycle: {
    STATES: {},
    PRIORITY: { ambient: 0 },
    current: () => "ready",
    snapshot: () => ({}),
    allows: () => true,
    isLocked: () => false,
    subscribe: () => noop,
    acquire: () => ({}),
    releaseOwner: noop
  },
  events: {
    on: () => noop,
    once: () => noop,
    emit: noop,
    snapshot: () => ({})
  },
  scene: {
    get: () => null,
    require: () => null,
    has: () => false,
    snapshot: () => []
  },
  layers: {
    weather: {},
    chamberMotion: null,
    effects: null
  },
  views: {
    getReadingZone: () => readingZone,
    getControlZones: () => [],
    getDepthPlaneDefinitions: () => [],
    current: () => ({ isReading: () => true })
  },
  applications: {
    current: () => "redwire",
    profiles: () => []
  },
  environment: {
    current: () => "redwire",
    profile: () => null
  },
  settings: {
    reducedMotion: false,
    quality: "full"
  }
};

const sandbox = {
  window: {
    NCNIntegrationContract: {
      MODULES: { WEATHER: "weather", BOOT: "boot", VISUAL_DIRECTOR: "visual-director" },
      SCENE: {}
    },
    NCNViewerHost: { context: () => base },
    NCNApplications: { current: () => "redwire" },
    NCNEnvironment: { profile: () => null },
    NCNIntegration: { getService: () => null },
    NCNVisualDirector: {
      MODES: {},
      CHANNELS: {},
      currentMode: () => "ambient",
      snapshot: () => ({}),
      envelope: () => ({ allowed: true, intensity: 1 }),
      claim: () => null,
      releaseOwner: noop
    },
    NCNChamberCamera: null,
    LayeredChamber: null
  },
  console
};

vm.runInContext(contextSource, vm.createContext(sandbox), { filename: "department-context.js" });

const weatherContext = sandbox.window.NCNDepartmentContext.create("weather", {});
const ordinaryContext = sandbox.window.NCNDepartmentContext.create("example-department", {});

assert.equal(weatherContext.views.getReadingZone(), null,
  "Weather must not receive an article reading rectangle.");
assert.equal(weatherContext.views.isReading(), false,
  "Weather must not receive article reading state.");
assert.equal(ordinaryContext.views.getReadingZone(), readingZone,
  "Reading state must remain available to departments that explicitly use it.");
assert.equal(ordinaryContext.views.isReading(), true,
  "Removing Weather suppression must not erase the application's real reading state.");

assert.equal(environmentSource.includes("readingAttenuation"), false,
  "Application profiles and diagnostics must not configure Weather reading attenuation.");
assert.equal(manifestSource.includes('"reading and control-zone attenuation"'), false,
  "Weather must no longer claim article-reading attenuation as an owned responsibility.");
assert.ok(manifestSource.includes('"control-zone attenuation"'),
  "Permanent control protection remains an explicit Weather responsibility.");
assert.ok(manifestSource.includes("receives no article-reading state"),
  "The Weather contract must document article-reading independence.");

console.log("Opening an article cannot dim Weather or carve a reading-zone hole through its canvases.");
