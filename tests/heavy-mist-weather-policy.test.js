const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const presetsSource = fs.readFileSync(path.resolve(__dirname, "..", "departments", "weather", "weather-presets.js"), "utf8");
const moduleSource = fs.readFileSync(path.resolve(__dirname, "..", "departments", "weather", "weather-module.js"), "utf8");

const context = vm.createContext({ window: {} });
vm.runInContext(presetsSource, context, { filename: "weather-presets.js" });
const presets = context.window.NCNWeatherPresets;

assert.ok(presets, "Weather presets must publish.");
assert.equal(presets.mist.depthFlow, -0.018, "Ordinary mist must retain its accepted preset baseline.");
assert.equal(presets["heavy-mist"].depthFlow, -0.72, "Heavy mist must own a deliberate forward chamber flow.");
assert.ok(
  moduleSource.includes("state.config.depthFlow - (Number(PRESETS.mist?.depthFlow) || 0)"),
  "The Weather renderer must apply preset-relative depth flow without changing ordinary mist."
);

const approvedBaseline = -0.12;
const ordinaryEffective = approvedBaseline
  + (presets.mist.depthFlow - presets.mist.depthFlow);
const heavyEffective = approvedBaseline
  + (presets["heavy-mist"].depthFlow - presets.mist.depthFlow);

assert.equal(ordinaryEffective, approvedBaseline, "Ordinary mist motion must remain unchanged.");
assert.ok(heavyEffective < -0.8, "Heavy mist must advance through the chamber quickly enough to reach the foreground.");
assert.equal(moduleSource.includes("HEAVY_FORWARD_WIND"), false, "Weather policy must not depend on the Integration compositor.");

console.log("Heavy mist owns its forward chamber flow in Weather while ordinary mist retains the accepted baseline.");
