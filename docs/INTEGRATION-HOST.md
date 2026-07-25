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
- `NCNModuleIntake` checks declared ownership before installation.
- `NCNDepartmentContext` supplies capability-scoped module services.
- `NCNIntegration` stages replacement, profile routing and boot coordination.
- `NCNIntegrationHarness` performs repeatable browser verification.

Neither application renderer is a general-purpose environmental surface. Incoming
modules use terminal-owned layers and protected view descriptors.

## Department context

A factory installed through `NCNModuleIntake.install()` receives a context derived
from its manifest:

```js
{
  owner,
  runtime,
  lifecycle,
  events,
  scene,
  layers,
  views,
  chamber,
  applications,
  environment,
  settings,
  contract,
  director,
  integration
}
```

It does **not** receive direct Optical or Dripfeed adapters, host reset/destruction,
global runtime suspension, the raw module manager or unrestricted scene access.
This is an API and ownership boundary rather than a JavaScript security sandbox;
departmental code still requires review.

The scoped context enforces:

- module-prefixed runtime task names;
- declared runtime groups;
- declared writable scene layers;
- declared visual-director channels;
- declared dependency access;
- read-only dependency service proxies with lifecycle methods hidden;
- automatic cleanup of owned runtime tasks, subscriptions, lifecycle locks and
  director claims when a candidate fails or is destroyed.

Useful values include:

```js
context.settings.reducedMotion;
context.settings.quality;
context.layers.weather;       // declared subset of { far, rear, middle, near }
context.layers.chamberMotion;
context.layers.effects;
context.views.getReadingZone();
context.views.getControlZones();
context.views.getDepthPlaneDefinitions();
context.views.isReading();
context.chamber.getCameraSnapshot();
context.director.envelope("environment");
context.integration.requireService("effects");
```

Declared dependencies initialise before the dependant factory runs. A module
obtains them through `context.integration.getService(name)` or
`context.integration.requireService(name)`, never by reaching into globals.

Reading and control zones use the same descriptor shape:

```js
{
  element,
  rect: { left, top, right, bottom, width, height }
}
```

A reading zone protects local text from weather. Explicit `isReading()` state is
separate and controls the machine-wide reading envelope.

## Versioned names and slots

Departments use constants from `NCNIntegrationContract` rather than inventing new
strings for equivalent concepts.

```js
const {
  MODULES,
  REPLACEABLE_MODULES,
  PROTECTED_MODULES,
  RUNTIME_GROUPS,
  VISUAL_CHANNELS,
  SCENE,
  EVENTS
} = context.contract;
```

The initial API version is `1`.

Replaceable departmental slots:

- `boot`
- `effects`
- `weather`
- `chamber-motion`

Protected service slots:

- `visual-director`
- `optical`
- `dripfeed`

Departmental intake cannot replace protected services or depend directly on the
application adapters. It uses `context.views` instead.

## Module manifest

Every departmental publication arrives with a manifest describing technical
ownership rather than visual settings.

```js
const weatherManifest = {
  apiVersion: 1,
  department: "weather",
  version: "1.0.0",
  dependencies: ["effects", "visual-director"],
  layers: ["weather:far", "weather:rear", "weather:middle", "weather:near"],
  visualChannels: ["environment", "fault"],
  runtimeGroups: ["environment"],
  capabilities: [
    "init", "suspend", "resume", "reset", "destroy", "applyProfile"
  ],
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

- protected application, chamber or service ownership;
- permanent private animation loops;
- unknown visual channels;
- undeclared or protected dependencies;
- missing managed lifecycle controls;
- missing application-profile entry points for environmental departments;
- a boot publication without `run(options)`;
- self-dependencies;
- incompatible contract versions;
- installation under a name other than the slot being replaced.

Warnings identify undeclared reduced-motion or deterministic test behaviour and
unrecognised layers or runtime groups.

## Staged installation

```js
const report = NCNModuleIntake.inspect("weather", createWeather, weatherManifest);

if (report.accepted) {
  await NCNModuleIntake.install("weather", createWeather, weatherManifest, {
    replace: true
  });
}
```

Takeover is staged:

1. The existing slot and active dependants are checked.
2. Declared dependencies are made ready.
3. The factory receives its scoped context.
4. The returned instance is checked against the real required methods.
5. Only then is the incumbent compatibility adapter destroyed.
6. The candidate is registered and initialised.
7. The active RedWire or Dripfeed profile is applied immediately.

Factories should construct state without starting visible work. Recurring tasks,
listeners and generated resources should normally become active in `init()`. The
scoped context still tracks early tasks and subscriptions so failed or rejected
candidates can be cleaned up.

Active dependants prevent unsafe service replacement. Dependencies initialise and
resume first; dependants suspend, reset and destroy first.

## Application profiles

RedWire and Dripfeed continue to define their own environment profiles. The
application environment manager routes each profile through the installed
`weather`, `effects` and `chamber-motion` slots first, using the legacy global
implementations only as fallback.

Supported profile entry points are:

```text
applyProfile(profile, meta)
configure(profile, meta)
setProfile(profile, meta)
setWeather(profile, meta)       // weather compatibility
setEnabled(enabled)             // limited compatibility
```

This prevents a replacement module and its legacy predecessor from being
reactivated together on application switch.

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
  priority: context.lifecycle.PRIORITY.fault,
  intensity: 0.35,
  exclusive: true,
  duration: 450
});

if (grant.granted) {
  const effects = context.integration.requireService("effects");
  effects.play?.("electrical-flash", target, {
    intensity: grant.intensity
  });
}
```

The scoped context assigns the module owner automatically. Reading lowers
environmental, chamber and fault authority. Boot, realignment, suspension and
degraded states receive separate envelopes. Reduced motion lowers non-interface
visual authority.

## Boot slot

The host reserves the module name `boot`. Until a boot department publication is
installed, the slot is a no-op adapter.

A boot factory returns the managed lifecycle methods plus:

```js
run(options)
```

The integration coordinator provides:

```js
await NCNIntegration.runBoot({ reason: "cold-start" });
```

Boot alone receives application-switch authority. It coordinates public module
APIs and does not duplicate their renderers.

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

The underlying environment names remain registered. `weather-mid` and `mid` are
compatibility aliases for `weather-middle`, but new modules use `far`, `rear`,
`middle` and `near`.

## Verification

Passive checks:

```js
NCNViewerHost.verify({ throwOnFailure: true });
NCNIntegrationHarness.passive();
NCNIntegration.snapshot();
```

Lifecycle cycle:

```js
await NCNIntegrationHarness.lifecycleCycle();
```

Application round trip:

```js
await NCNIntegrationHarness.applicationCycle({ animate: true });
```

Complete manual run:

```js
await NCNIntegrationHarness.run({
  lifecycle: true,
  applications: true,
  animate: true
});
```

A successful run leaves one shared runtime, one active application root, connected
terminal layers, ready managed modules and no change to the protected RedWire or
Dripfeed composition. Visual comparison against the protected references remains
a human acceptance test.
