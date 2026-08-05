const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const contextSource = read("js/department-context.js");
const environmentSource = read("js/environment-manager.js");
const manifestSource = read("departments/weather/weather-manifest.js");
const weatherSource = read("departments/weather/weather-module.js");
const devPanelSource = read("js/dev-panel-controls.js");

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

assert.equal(weatherContext.views.getReadingZone(), readingZone,
  "The shared department façade must remain generic rather than special-casing Weather.");
assert.equal(weatherContext.views.isReading(), true,
  "Weather independence must come from Weather ownership, not falsified host state.");
assert.equal(ordinaryContext.views.getReadingZone(), readingZone,
  "Reading geometry must remain available to departments that legitimately consume it.");
assert.equal(ordinaryContext.views.isReading(), true,
  "Removing Weather suppression must not erase the application's real reading state.");
assert.doesNotMatch(contextSource, /WEATHER_MODULE_NAME|receivesReadingState/,
  "The shared context must not contain a Weather-specific article-state exception.");

for (const forbidden of [
  "readingAttenuation",
  "getReadingZone",
  "isReading",
  "scene.reading",
  "readingScale"
]) {
  assert.equal(weatherSource.includes(forbidden), false,
    `Canonical Weather must not contain article-reading policy: ${forbidden}`);
}
assert.match(weatherSource, /lastZones:\s*\{\s*controls:\s*0\s*\}/,
  "Weather diagnostics should report only permanent control-zone protection.");
assert.match(weatherSource, /scene\.controls\.forEach\(zone => cutout/,
  "Permanent control-zone attenuation remains a canonical Weather responsibility.");

assert.equal(environmentSource.includes("readingAttenuation"), false,
  "Application profiles and diagnostics must not configure Weather reading attenuation.");
assert.equal(devPanelSource.includes('data-debug-weather-input="reading"'), false,
  "The Weather laboratory must not expose an article-reading cut control.");
assert.equal(manifestSource.includes('"reading and control-zone attenuation"'), false,
  "Weather must no longer claim article-reading attenuation as an owned responsibility.");
assert.ok(manifestSource.includes('"control-zone attenuation"'),
  "Permanent control protection remains an explicit Weather responsibility.");
assert.ok(manifestSource.includes("does not inspect or consume Optical/article state"),
  "The Weather contract must document article-reading independence at the owner boundary.");

console.log("Canonical Weather ignores article reading state while the shared host view contract remains truthful and generic.");
