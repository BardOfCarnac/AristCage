/* NCN Effects Department publication manifest for integration contract v1. */
window.NCNEffectsDepartmentManifest = Object.freeze({
  apiVersion: 1,
  department: "effects",
  version: "1.1.1-host",
  dependencies: ["visual-director"],
  layers: ["environment:effects"],
  visualChannels: ["boot", "interface", "article", "environment", "chamber", "fault"],
  runtimeGroups: ["effects"],
  capabilities: [
    "init", "applyProfile", "suspend", "resume", "reset", "destroy",
    "play", "cancel", "clear", "snapshot"
  ],
  owns: [
    "locked canonical effect registry",
    "temporary effect nodes inside environment:effects",
    "temporary shared-runtime tasks",
    "effect cancellation and cleanup"
  ],
  protectedRoots: [],
  animationLoop: "shared-runtime",
  replaces: "effects",
  reducedMotion: true,
  deterministicTesting: true,
  notes: "Departmental publication only; the integration agent performs staged installation."
});
