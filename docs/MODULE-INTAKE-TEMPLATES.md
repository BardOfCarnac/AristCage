# NCN Department Intake Templates

These manifests describe technical ownership only. Presets, visual design and
choreography remain inside each department's module. Factories should construct
state without starting visible work; recurring tasks, listeners and generated
resources should become active in `init()`.

## Effects

```js
const effectsManifest = {
  apiVersion: 1,
  department: "effects",
  version: "1.0.0",
  dependencies: ["visual-director"],
  layers: ["environment:effects"],
  visualChannels: ["boot", "interface", "article", "environment", "chamber", "fault"],
  runtimeGroups: ["effects"],
  capabilities: ["init", "suspend", "resume", "reset", "destroy", "applyProfile"],
  owns: ["effect registry", "temporary effect nodes", "effect cancellation"],
  protectedRoots: [],
  animationLoop: "shared-runtime",
  replaces: "effects",
  reducedMotion: true,
  deterministicTesting: true
};
```

The effects module creates reusable primitives. It does not schedule narrative
faults, boot phases, weather conditions or chamber events. `applyProfile(profile)`
accepts the active application's ambient and interaction policy.

## Weather

```js
const weatherManifest = {
  apiVersion: 1,
  department: "weather",
  version: "1.0.0",
  dependencies: ["visual-director", "effects"],
  layers: ["weather:far", "weather:rear", "weather:middle", "weather:near"],
  visualChannels: ["environment", "fault"],
  runtimeGroups: ["environment"],
  capabilities: ["init", "suspend", "resume", "reset", "destroy", "applyProfile"],
  owns: ["weather canvases", "particle pools", "weather presets"],
  protectedRoots: [],
  animationLoop: "shared-runtime",
  replaces: "weather",
  reducedMotion: true,
  deterministicTesting: true
};
```

Weather consumes reading and control-zone descriptors through `context.views`.
It never queries into Optical or Dripfeed internals. `applyProfile(profile)` accepts
the current application's weather request and translates legacy mist profiles when
needed.

## Chamber movement

```js
const chamberMotionManifest = {
  apiVersion: 1,
  department: "chamber-motion",
  version: "1.0.0",
  dependencies: ["visual-director", "effects"],
  layers: ["environment:chamber-motion"],
  visualChannels: ["chamber"],
  runtimeGroups: ["chamber"],
  capabilities: ["init", "suspend", "resume", "reset", "destroy", "applyProfile"],
  owns: ["movement choreography", "temporary block transforms", "settling state"],
  protectedRoots: [],
  animationLoop: "shared-runtime",
  replaces: "chamber-motion",
  reducedMotion: true,
  deterministicTesting: true
};
```

The chamber supplies geometry. The module may animate approved block elements or
its terminal-owned movement surface, but it does not transform application roots.
`applyProfile(profile)` accepts the active application's enablement and intensity
policy.

## Boot

```js
const bootManifest = {
  apiVersion: 1,
  department: "boot",
  version: "1.0.0",
  dependencies: ["visual-director", "effects", "weather", "chamber-motion"],
  layers: [],
  visualChannels: ["boot", "interface", "environment", "chamber", "fault"],
  runtimeGroups: ["boot"],
  capabilities: ["init", "suspend", "resume", "reset", "destroy", "run"],
  owns: ["startup sequence", "phase timing", "boot cancellation"],
  protectedRoots: [],
  animationLoop: "shared-runtime",
  replaces: "boot",
  reducedMotion: true,
  deterministicTesting: true
};
```

A boot factory receives the integration context and returns a module with
`run(options)` in addition to the managed lifecycle methods. It orchestrates the
public APIs of other modules and does not duplicate their renderers.

## Preflight

```js
const report = NCNIntegrationHarness.inspectCandidate(
  "weather",
  createWeather,
  weatherManifest
);

console.table(report.checks);
console.table(report.warnings);
```

Only accepted candidates should proceed to installation and browser testing.
