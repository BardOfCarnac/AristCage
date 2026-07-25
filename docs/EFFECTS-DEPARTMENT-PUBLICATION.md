# NCN Effects Department — Host Publication

## Status

This is a compatible departmental publication for the replaceable `effects` slot on `agent/prepare-module-host` / PR 86. It is not installed into the production page and does not replace the incumbent adapter by itself.

The integration agent should inspect and stage it through `NCNModuleIntake`.

## Publication files

```text
js/departments/effects/effects-manifest.js
js/departments/effects/effects-public-names.js
js/departments/effects/effects-catalogue-signal.js
js/departments/effects/effects-catalogue-fault.js
js/departments/effects/effects-catalogue-environment.js
js/departments/effects/effects-module.js
tests/effects-department-host.html
tests/effects-department-host.js
```

Load the manifest and catalogue files before constructing the factory. The files only publish metadata, definitions and the factory; they do not install the module or start visible work.

## Factory and manifest

```js
const report = NCNModuleIntake.inspect(
  "effects",
  createNCNEffectsDepartment,
  NCNEffectsDepartmentManifest
);

console.table(report.checks);
console.table(report.errors);
```

The manifest declares:

- integration API version `1`;
- replacement slot `effects`;
- dependency `visual-director`;
- writable layer `environment:effects` only;
- runtime group `effects`;
- channels `boot`, `interface`, `article`, `environment`, `chamber`, `fault`;
- shared-runtime animation ownership;
- reduced-motion and deterministic-test support;
- no protected roots.

## Required interface

The factory returns:

```js
{
  init(),
  applyProfile(profile, meta),
  suspend(),
  resume(),
  reset(),
  destroy(),

  play(name, target, options),
  cancel(handleOrId, reason),
  clear(filter),
  snapshot()
}
```

Additional inspection helpers are `list()`, `names()`, `register()` and `subscribe()`.

## Public effect names

1. `glow-pulse`
2. `flicker`
3. `relay-scan`
4. `heat-resolve`
5. `signal-collapse`
6. `displacement`
7. `channel-separation`
8. `static-burst`
9. `light-flash`
10. `blur-interference`
11. `particle-emission`
12. `electrical-disturbance`
13. `signal-fault`

Effects are registered by name, finite, cancellable and deterministic when supplied the same seed.

## Target contract

`play()` accepts a DOM element or an adapter:

```js
{
  kind: "article",
  id: "story-42",
  getElement() {},
  getBounds() {},
  isValid() {}
}
```

The module may read target geometry and clone the target for a temporary projection. It does not add classes, styles or wrappers to the source target. Every visible node is appended to `context.layers.effects`.

## Visual director

Playback first requests an envelope for the selected channel, then requests a director claim. Denied or zero-authority effects resolve as `ignored` without creating nodes or runtime tasks.

The external caller still chooses narrative timing, priority, concurrency and requested intensity. The Effects Department only enforces the technical request.

## Concurrency

Concurrency is scoped to target and channel:

- `stack`
- `replace`
- `ignore`
- `queue`
- `merge`

Each call returns a handle with `finished`, `cancel()` and `setIntensity()`.

## Reduced motion

Reduced motion is derived from the shared runtime quality setting and never starts a private media-query listener.

Substitutions include:

- static or short glow instead of repeated displacement;
- a fixed scan band instead of a travelling scan;
- crossfade instead of spatial collapse;
- restrained channel tint instead of animated channel separation;
- fewer fixed particles instead of moving emissions;
- one electrical flash instead of a repeatedly regenerated arc;
- a restrained signal frame instead of a composite fault sequence.

The caller uses the same public effect name in both modes.

## Deterministic testing

All visual randomness uses a local seeded generator. Effect implementations do not use `Math.random()`.

Supplying the same effect, target identity, options and seed produces the same random sequence. The host test publishes a temporary `deterministic-probe` effect to compare seeded results.

## Cleanup guarantees

Normal completion, cancellation, replacement, queue clearing, reset and destruction all:

- release visual-director claims;
- disable and unregister shared-runtime tasks;
- remove temporary clones, overlays, particles, SVG paths and the owned stylesheet;
- remove the module class and dataset marker from `environment:effects`;
- clear module listeners;
- release lifecycle locks owned by the department;
- leave protected RedWire, Dripfeed and chamber structures unchanged.

The host-scoped department context also performs defensive cleanup of registered tasks, event subscriptions, locks and director claims if installation fails or the context is released.

`snapshot()` reports active handles, queued effects, temporary node count, runtime task count, listener count and layer ownership for inspection.

## Profile behaviour

`applyProfile(profile, meta)` accepts the application profile routed by PR 86.

Supported values:

```js
{
  enabled: true,
  ambient: true,
  interaction: true,
  intensity: 0.75
}
```

The profile does not schedule effects. It only enables the department and scales later requests. Setting `enabled: false` clears active and queued work.

## Staged installation

The integration agent may install it with:

```js
await NCNModuleIntake.install(
  "effects",
  createNCNEffectsDepartment,
  NCNEffectsDepartmentManifest,
  { replace: true }
);
```

This publication deliberately stops before that staged installation.
