const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/integration-service-gate.js"), "utf8");

const placeholderWeather = Object.freeze({
  suspend() {},
  resume() {},
  reset() {},
  destroy() {},
  snapshot: () => Object.freeze({ legacy: true })
});
const placeholderMotion = Object.freeze({
  suspend() {},
  resume() {},
  reset() {},
  destroy() {},
  snapshot: () => Object.freeze({ legacy: true })
});
const acceptedWeather = Object.freeze({
  applyProfile() {},
  snapshot: () => Object.freeze({ preset: "mist" })
});
const acceptedMotion = Object.freeze({
  applyProfile() {},
  trigger() {},
  snapshot: () => Object.freeze({ activeSequenceCount: 0 })
});
const effects = Object.freeze({ play() {} });

const services = new Map([
  ["weather", placeholderWeather],
  ["chamber-motion", placeholderMotion],
  ["effects", effects]
]);

const originalIntegration = Object.freeze({
  marker: "original",
  getService(name, options = {}) {
    const service = services.get(name) || null;
    if (!service && options.required === true) throw new Error(`Missing ${name}`);
    return service;
  },
  applyProfile() { return true; },
  syncApplicationProfile() { return true; }
});

global.window = global;
global.NCNIntegration = originalIntegration;
global.NCNIntegratedDepartments = {
  snapshot: () => Object.freeze({ state: "installing", failure: null })
};

vm.runInThisContext(source, { filename: "integration-service-gate.js" });

assert.notEqual(global.NCNIntegration, originalIntegration, "the public integration facade must be gated");
assert.equal(global.NCNIntegration.marker, "original", "the rest of the integration facade must be preserved");
assert.equal(global.NCNIntegration.getService("weather"), null, "lifecycle-only Weather placeholder must be hidden");
assert.equal(global.NCNIntegration.getService("chamber-motion"), null, "movement placeholder without trigger must be hidden");
assert.equal(global.NCNIntegration.getService("effects"), effects, "unrestricted services must pass through");
assert.equal(global.NCNIntegration.hasPublicService("weather"), false);

services.set("weather", acceptedWeather);
services.set("chamber-motion", acceptedMotion);

assert.equal(global.NCNIntegration.getService("weather"), acceptedWeather, "accepted Weather must become visible once installed");
assert.equal(global.NCNIntegration.getService("chamber-motion"), acceptedMotion, "accepted Chamber Movement must become visible once installed");
assert.equal(global.NCNIntegration.requireService("weather"), acceptedWeather);
assert.equal(global.NCNIntegration.hasPublicService("weather"), true);

services.set("weather", placeholderWeather);
global.NCNIntegratedDepartments.snapshot = () => Object.freeze({
  state: "error",
  failure: "Weather publication failed intake"
});
assert.throws(
  () => global.NCNIntegration.requireService("weather"),
  /Accepted weather service is not ready\. Weather publication failed intake/
);

console.log("Integration service capability gate passed.");
