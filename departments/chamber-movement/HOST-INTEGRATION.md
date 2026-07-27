# PR 86 Host Integration

## Formal target

```text
Base branch:        agent/prepare-module-host
Integration API:    1
Module/slot name:   chamber-motion
Movement surface:  environment:chamber-motion
Runtime group:      chamber
Visual channel:     chamber
Dependencies:       visual-director, effects
```

This publication deliberately does not call `NCNModuleIntake.install()` and does not replace the incumbent slot.

## Manifest and factory

`publication.js` exposes:

```js
NCNChamberMotionPublication.manifest
NCNChamberMotionPublication.create(context, adapters)
NCNChamberMotionPublication.createFactory(adapters)
```

Preflight shape:

```js
const factory = NCNChamberMotionPublication.createFactory({
  chamber: context => createProductionBlockGeometryAdapter({
    chamber: LayeredChamber,
    movementSurface: context.layers.chamberMotion
  }),
  seed: "integration-review"
});

const report = NCNModuleIntake.inspect(
  "chamber-motion",
  factory,
  NCNChamberMotionPublication.manifest
);
```

The publication factory obtains the protected director from `context.director`, the terminal-owned surface from `context.layers.chamberMotion`, and the Effects Department through:

```js
context.integration.requireService("effects")
```

It never reads `window.NCNEffects` or registers itself globally as the active service.

## Staged installation

The integration agent may later install the inspected factory through the formal intake mechanism:

```js
await NCNModuleIntake.install(
  "chamber-motion",
  factory,
  NCNChamberMotionPublication.manifest,
  { replace: true }
);
```

That operation is intentionally outside this departmental publication because it destroys the incumbent only after candidate construction and validation.

## Profile control

`applyProfile(profile, meta)` receives the active application policy. The module does not watch Filter, Submit, RedWire or Dripfeed DOM state.

```js
await blocks.applyProfile({
  enabled: true,
  intensity: 0.55,
  maxActive: 4,
  clusterSize: [1, 7]
}, {
  application: "redwire",
  reason: "filter-or-submit"
});
```

Host quality and reduced-motion state are read live from `context.settings`; they are not captured when the factory is created. Disabling the profile gracefully settles active movement unless the caller requests immediate cancellation through `meta.cancel`.

## Visual director

Each request checks:

```js
context.director.envelope("chamber", { intensity })
```

After a route has passed atomic admission, the sequence acquires:

```js
context.director.claim("chamber", {
  priority,
  intensity,
  exclusive: false
})
```

The claim is released on completion, settlement, cancellation, error, reset and destruction. A refused envelope or claim returns a clean `rejected` result before any block transform is applied.

## Effects dependency

Effects are optional at profile level but the declared service must exist. Named effects are requested through `effects.play()`, and all returned handles are cancelled during sequence cleanup. The default profile names no effects, preserving the approved no-glow appearance.

## Prohibited changes

The integration must not transform the chamber root, RedWire root, Dripfeed root or protected Optical hierarchy; create another camera; run the incumbent and candidate choreography simultaneously; adopt PR 77 autonomous transfer scheduling; or make weather push away from moving blocks.
