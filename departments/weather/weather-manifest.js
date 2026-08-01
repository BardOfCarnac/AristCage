/* NCN Weather Department manifest for the PR-86 integration host. */
window.NCNWeatherDepartmentManifest = Object.freeze({
  apiVersion: 1,
  department: "weather",
  version: "1.3.0-pr86",
  dependencies: Object.freeze(["visual-director", "effects"]),
  layers: Object.freeze([
    "weather:far",
    "weather:rear",
    "weather:middle",
    "weather:near"
  ]),
  visualChannels: Object.freeze(["environment", "fault"]),
  runtimeGroups: Object.freeze(["environment"]),
  capabilities: Object.freeze([
    "init",
    "applyProfile",
    "suspend",
    "resume",
    "reset",
    "destroy",
    "setPreset",
    "setIntensity",
    "transitionTo",
    "getDepthFrame",
    "subscribeAfterRender",
    "snapshot"
  ]),
  owns: Object.freeze([
    "weather canvases within supplied weather layers",
    "bounded reusable weather particle pools",
    "depth-aware light-catching ash, mote, ember and electrical fields",
    "data-driven weather presets and transitions",
    "reading and control-zone attenuation",
    "immutable read-only depth-frame rendering views",
    "synchronous completed-frame publication and invalidation"
  ]),
  protectedRoots: Object.freeze([]),
  animationLoop: "shared-runtime",
  replaces: "weather",
  reducedMotion: true,
  deterministicTesting: true,
  notes: "Departmental publication only. It exposes exact puff-depth frame views and synchronous completed-frame publication, and renders deterministic depth-aware particles through supplied Weather layers without inspecting Optical/article state."
});
