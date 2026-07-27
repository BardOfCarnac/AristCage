/* NCN Weather Department manifest for the PR-86 integration host. */
window.NCNWeatherDepartmentManifest = Object.freeze({
  apiVersion: 1,
  department: "weather",
  version: "1.0.1-pr86",
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
    "snapshot"
  ]),
  owns: Object.freeze([
    "weather canvases within supplied weather layers",
    "bounded reusable weather particle pools",
    "data-driven weather presets and transitions",
    "reading and control-zone attenuation"
  ]),
  protectedRoots: Object.freeze([]),
  animationLoop: "shared-runtime",
  replaces: "weather",
  reducedMotion: true,
  deterministicTesting: true,
  notes: "Departmental publication only. It does not install itself or replace the incumbent weather slot."
});
