# NCN Viewer Integration Host

The production viewer exposes a stable receiving shell for boot, weather,
effects and chamber-rearrangement modules while preserving the established
RedWire Optical renderer and Dripfeed application.

## Architecture

- `NCNViewerLifecycle` decides which machine state is active.
- `NCNViewerRuntime` owns the shared visual scheduler.
- `NCNEvents` carries module-to-module messages.
- `NCNScene` provides named terminal-owned surfaces.
- `NCNOptical` protects the established Optical renderer.
- `NCNDripfeed` protects the established tile wall and reader.
- `NCNModules` owns dependency-aware lifecycle ordering.
- `NCNViewerHost` owns terminal reset, suspend, resume and destruction.
- `NCNIntegrationContract` freezes the names departments publish against.
- `NCNVisualDirector` arbitrates visual intensity without rendering anything.
- `NCNModuleIntake` checks departmental ownership before installation.
- `NCNIntegration` supplies incoming departments with the extended context.
- `NCNIntegrationHarness` performs repeatable browser verification.

Neither application renderer is a general-purpose environmental surface. Incoming
modules must use terminal-owned layers and the protected view adapters.

## Department context

A factory installed through `NCNModuleIntake.install()` receives:

```js
{
  runtime,
  lifecycle,
  events,
  scene,
  layers,
  views,
  optical,
  dripfeed,
  applications,
  environment,
  settings,
  contract,
  director,
  intake,
  integration
}
```

Useful dynamic values include:

```js
context.settings.reducedMotion;
context.settings.quality;
context.layers.weather;       // { far, rear, middle, near }
context.layers.chamberMotion;
context.layers.effects;
context.views.getReadingZone();
context.views.getControlZones();
context.views.getDepthPlaneDefinitions();
context.director.envelope("environment");
```

Reading and control zones use the same descriptor shape:

```js
{
  element,
  rect: { left, top, right, bottom, width, height }
}
```

## Versioned names

Departments should use constants from `NCNIntegrationContract` rather than adding
new strings for equivalent concepts.

```js
const {
  MODULES,
  RUNTIME_GROUPS,
  VISUAL_CHANNELS,
  SCENE,
  EVENTS
} = context.contract;
```

The initial API version is `1`.

## Module manifest

Every departmental publication should arrive with a manifest. This is separate
from its visual settings; it describes technical ownership.

```js
const weatherManifest = {
  apiVersion: 1,
  department: "weather",
  version: "1.0.0",
  dependencies: ["effects", "visual-director"],
  layers: ["weather:far", "weather:rear", "weather:middle", "weather:near"],
  visualChannels: ["environment", "fault"],
  runtimeGroups: ["environment"],
  capabilities: ["suspend", "resume", "reset", "destroy"],
  owns: ["weather canvases", "particle pools"],
  protectedRoots: [],
  animationLoop: "shared-runtime",
  replaces: "weather",
  reducedMotion: true,
  deterministicTesting: true
};
```

`NCNModuleIntake.inspect(name, implementation, manifest)` returns a report without
changing the viewer. It rejects:

- protected application or chamber-root ownership;
- permanent private animation loops;
- unknown visual channels;
- missing managed lifecycle controls;
- self-dependencies;
- incompatible contract versions.

Warnings identify undeclared reduced-motion or deterministic test behaviour and
unrecognised layers or runtime groups.

## Installing an accepted module

```js
const report = NCNModuleIntake.inspect("weather", createWeather, weatherManifest);

if (report.accepted) {
  await NCNModuleIntake.install("weather", createWeather, weatherManifest, {
    replace: true
  });
}
```

The integration façade supplies the extended context to both factories and object
modules. Active dependants prevent unsafe service replacement. Dependency order
still governs the full lifecycle: dependencies initialise and resume first;
dependants suspend, reset and destroy first.

The current compatibility adapters remain named `weather`, `effects` and
`chamber-motion`. A departmental publication replaces the matching slot rather
than adding a competing renderer beside it.

## Visual director

The director does not schedule weather or play effects. It supplies a current
intensity envelope and optional short-lived claims.

Modes:

- `calm`
- `booting`
- `ambient`
- `reading`
- `disturbed`
- `fault`
- `critical`

Channels:

- `boot`
- `interface`
- `article`
- `environment`
- `chamber`
- `fault`

Example:

```js
const envelope = context.director.envelope("environment", { intensity: 0.8 });
if (!envelope.allowed) return;

const grant = context.director.claim("fault", {
  owner: "weather",
  priority: context.lifecycle.PRIORITY.fault,
  intensity: 0.35,
  exclusive: true,
  duration: 450
});

if (grant.granted) {
  context.effects?.play?.("electrical-flash", target, {
    intensity: grant.intensity
  });
}
```

Reading automatically lowers environmental, chamber and fault authority. Boot,
realignment, suspension and degraded states receive separate envelopes. Reduced
motion also lowers non-interface visual authority.

## Boot slot

The host reserves the module name `boot`. Until a boot department publication is
installed, the slot is a no-op adapter.

A boot module should expose the managed lifecycle methods plus:

```js
run(context, options)
```

The integration coordinator provides:

```js
await NCNIntegration.runBoot({ reason: "cold-start" });
```

This acquires the boot visual mode, transitions the machine lifecycle, runs the
installed sequence, releases its authority and reports completion or degradation.
It does not invent the boot choreography.

## Named scene surfaces

Protected surfaces:

- `viewer`
- `interface`
- `application`
- `application:redwire`
- `application:dripfeed`
- `chamber`
- `optical`

Writable departmental surfaces:

- `weather:far`
- `weather:rear`
- `weather:middle`
- `weather:near`
- `environment:chamber-motion`
- `environment:effects`

The underlying environment names also remain registered. `weather-mid` and `mid`
are compatibility aliases for `weather-middle`, but new modules should use
`far`, `rear`, `middle` and `near`.

## Passive verification

```js
NCNViewerHost.verify({ throwOnFailure: true });
NCNIntegrationHarness.passive();
NCNIntegration.snapshot();
```

These checks do not change viewer state.

## Lifecycle smoke test

```js
await NCNIntegrationHarness.lifecycleCycle();
```

This verifies suspension, resumption, reset, active-application restoration and
runtime task-count stability.

## Application switching test

```js
await NCNIntegrationHarness.applicationCycle({ animate: true });
```

This switches to the other protected application and back, checking host coherence
at each point. Visual comparison against the protected references remains a human
acceptance test.

## Complete manual run

```js
await NCNIntegrationHarness.run({
  lifecycle: true,
  applications: true,
  animate: true
});
```

A successful run leaves one shared runtime, one active application root, connected
terminal layers, ready managed modules and no change to the protected RedWire or
Dripfeed composition.
