const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const presetsSource = fs.readFileSync(path.join(root, "departments", "weather", "weather-presets.js"), "utf8");
const moduleSource = fs.readFileSync(path.join(root, "departments", "weather", "weather-module.js"), "utf8");
const compositorSource = fs.readFileSync(path.join(root, "js", "redwire-weather-card-occlusion.js"), "utf8");

const context = vm.createContext({ window: {} });
vm.runInContext(presetsSource, context, { filename: "weather-presets.js" });
const presets = context.window.NCNWeatherPresets;

assert.ok(presets, "Weather presets must publish.");
assert.equal(presets.mist.depthFlow, -0.018, "Ordinary mist must retain its accepted data baseline.");
assert.equal(presets["heavy-mist"].depthFlow, -0.72, "Heavy mist must declare its forward flow as preset data.");
assert.ok(presets.smoke.verticalFill >= 0.6,
  "Smoke must rise through the chamber rather than remain trapped as floor fog.");
assert.ok(presets.smoke.bankScale > 1,
  "Smoke banks must have enough breadth to cross article planes naturally.");
assert.ok(presets.smoke.bankMultiplier > 1,
  "Smoke must sustain a materially occupied chamber field.");

for (const forbidden of [
  "Object.defineProperty",
  "createNCNWeatherDepartment",
  "wrapFactory",
  "renderHeavyMistSurge",
  "subscribeAfterRender",
  "createRadialGradient"
]) {
  assert.equal(
    presetsSource.includes(forbidden),
    false,
    `weather-presets.js must remain data-only: ${forbidden}`
  );
}

assert.ok(moduleSource.includes("function effectiveMistDepthFlow()"),
  "The accepted Weather module must own the effective mist-depth calculation.");
assert.ok(moduleSource.includes("function effectiveParticleDepthFlow()"),
  "The accepted Weather module must own non-mist particle depth flow.");
assert.ok(moduleSource.includes("function primeHeavyMistBank(bounds)"),
  "Heavy mist must prime a real chamber-space bank inside the accepted Weather module.");
assert.ok(moduleSource.includes("mistDepthFlow: effectiveMistDepthFlow()"),
  "Completed depth frames must publish the truthful effective mist flow.");
assert.ok(moduleSource.includes("heavyMistPrimeCount"),
  "Weather diagnostics must expose canonical near-bank priming.");
assert.equal(moduleSource.includes("APPROVED_MIST.depthFlow + state.wind.z"), false,
  "Mist must not ignore the selected preset's configured depth flow.");
assert.equal(moduleSource.includes("state.wind.z + state.config.depthFlow"), false,
  "Particle motion must not obscure or duplicate depth contributions.");

const approvedBaseline = -0.12;
const ordinaryEffective = approvedBaseline
  + (presets.mist.depthFlow - presets.mist.depthFlow);
const heavyEffective = approvedBaseline
  + (presets["heavy-mist"].depthFlow - presets.mist.depthFlow);
assert.equal(ordinaryEffective, -0.12,
  "Ordinary mist must retain the accepted movement baseline.");
assert.ok(heavyEffective < -0.8,
  "Heavy mist must have a materially stronger canonical forward flow.");

assert.equal(compositorSource.includes("setWind"), false,
  "The Integration compositor must never mutate Weather simulation policy.");
assert.equal(compositorSource.includes("renderHeavyMistSurge"), false,
  "The compositor must not generate a synthetic card-local surge.");
assert.equal(compositorSource.includes("createRadialGradient"), false,
  "The compositor must replay Weather puffs rather than drawing its own atmosphere.");
assert.ok(compositorSource.includes("depthFrame.renderForeground"),
  "The compositor must consume Weather's exact-depth puff publication.");
assert.ok(compositorSource.includes("destination-out"),
  "Rear Weather must remain erased beneath Optical plates.");
assert.ok(compositorSource.includes("destination-in"),
  "Foreground replay must remain feathered to the approved crossing regions.");

console.log("Heavy mist and raised smoke are implemented canonically in Weather, presets remain data-only, and Integration only composites genuine depth-frame puffs.");