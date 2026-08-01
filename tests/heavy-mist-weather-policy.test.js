const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const presetsSource = fs.readFileSync(path.resolve(__dirname, "..", "departments", "weather", "weather-presets.js"), "utf8");
const compositorSource = fs.readFileSync(path.resolve(__dirname, "..", "js", "redwire-weather-card-occlusion.js"), "utf8");

const context = vm.createContext({ window: {}, console });
vm.runInContext(presetsSource, context, { filename: "weather-presets.js" });
const presets = context.window.NCNWeatherPresets;
const policy = context.window.NCNWeatherPresetDepthFlowPolicy;

assert.ok(presets, "Weather presets must publish.");
assert.ok(policy, "Weather must publish its preset-owned depth-flow policy.");
assert.equal(presets.mist.depthFlow, -0.018, "Ordinary mist must retain its accepted preset baseline.");
assert.equal(presets["heavy-mist"].depthFlow, -0.72, "Heavy mist must declare a deliberate forward chamber flow.");
assert.ok(policy.snapshot().heavyOffset < -0.7, "Heavy mist must add a substantial preset-owned foreground push.");
assert.equal(compositorSource.includes("setWind"), false, "The Integration compositor must not mutate Weather simulation policy.");

const calls = [];
function createFakeWeather() {
  const state = {
    enabled: false,
    preset: "clear",
    targetPreset: "clear",
    wind: { x: 0, y: 0, z: 0 },
    diagnostics: { source: "fake-weather" }
  };

  const snapshot = () => Object.freeze({
    ...state,
    wind: Object.freeze({ ...state.wind }),
    diagnostics: Object.freeze({ ...state.diagnostics })
  });

  return {
    async init() { calls.push({ type: "init" }); return snapshot(); },
    applyProfile(profile = {}) {
      state.enabled = profile.enabled !== false;
      state.preset = String(profile.preset || (state.enabled ? state.preset : "clear"));
      state.targetPreset = state.preset;
      if (profile.wind && typeof profile.wind === "object") state.wind = { ...profile.wind };
      calls.push({ type: "applyProfile", profile: JSON.parse(JSON.stringify(profile)) });
      return snapshot();
    },
    setPreset(name) {
      state.preset = state.targetPreset = String(name || "clear");
      calls.push({ type: "setPreset", name: state.preset });
      return snapshot();
    },
    transitionTo(name) {
      state.targetPreset = String(name || "clear");
      calls.push({ type: "transitionTo", name: state.targetPreset });
      return snapshot();
    },
    setWind(value) {
      state.wind = { x: Number(value.x) || 0, y: Number(value.y) || 0, z: Number(value.z) || 0 };
      calls.push({ type: "setWind", wind: { ...state.wind } });
      return Object.freeze({ ...state.wind });
    },
    setEnabled(value) { state.enabled = Boolean(value); return state.enabled; },
    reset() {
      state.enabled = false;
      state.preset = state.targetPreset = "clear";
      state.wind = { x: 0, y: 0, z: 0 };
      return true;
    },
    destroy() { return true; },
    snapshot
  };
}

context.window.createNCNWeatherDepartment = () => createFakeWeather();
const factory = context.window.createNCNWeatherDepartment;
assert.equal(factory.__ncnPresetDepthFlowPolicy, true, "The accepted Weather factory must be wrapped before installation.");

(async () => {
  const weather = factory({ owner: "weather-policy-test" });
  await weather.init();

  weather.applyProfile({
    enabled: true,
    preset: "heavy-mist",
    intensity: 1,
    wind: 0.22
  });

  const heavyPublic = weather.snapshot();
  const heavyInternal = calls.filter(call => call.type === "applyProfile").at(-1).profile.wind;
  assert.deepEqual(heavyPublic.wind, { x: 0.22, y: 0, z: 0 }, "Preset motion must not leak into the public wind contract.");
  assert.ok(heavyInternal.z < -0.7, "The heavy-mist profile must deliver its configured depth flow inside Weather.");
  assert.equal(heavyPublic.diagnostics.presetDepthFlow.preset, "heavy-mist");
  assert.ok(heavyPublic.diagnostics.presetDepthFlow.internalWindZ < -0.7);

  weather.applyProfile({
    enabled: true,
    preset: "mist",
    intensity: 0.54,
    wind: { x: 0.22, y: 0, z: 0 }
  });
  const ordinaryInternal = calls.filter(call => call.type === "applyProfile").at(-1).profile.wind;
  assert.deepEqual(ordinaryInternal, { x: 0.22, y: 0, z: 0 }, "Ordinary mist must retain the accepted depth baseline without an added push.");
  assert.deepEqual(weather.snapshot().wind, { x: 0.22, y: 0, z: 0 });

  weather.setPreset("heavy-mist");
  assert.ok(calls.filter(call => call.type === "setWind").at(-1).wind.z < -0.7, "Direct heavy-mist selection must apply the Weather-owned depth flow.");
  weather.setPreset("mist");
  assert.equal(calls.filter(call => call.type === "setWind").at(-1).wind.z, 0, "Leaving heavy mist must restore the public depth wind exactly.");

  weather.applyProfile({ enabled: false, preset: "clear", wind: { x: 0, y: 0, z: 0 } });
  const disabled = weather.snapshot();
  assert.equal(disabled.diagnostics.presetDepthFlow.offset, 0, "Disabled Weather must retain no heavy-mist policy residue.");
  assert.deepEqual(disabled.wind, { x: 0, y: 0, z: 0 });

  console.log("Heavy mist owns its forward chamber flow inside Weather while ordinary mist and public wind remain unchanged.");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
