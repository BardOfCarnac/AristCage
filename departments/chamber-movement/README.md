# NCN Chamber Movement Department

## PR 86-compatible departmental publication

This directory publishes the approved multi-block rearrangement choreography against the current Viewer Integration Host branch:

```text
agent/prepare-module-host
```

It is **not installed** into the incumbent `chamber-motion` slot. The integration agent will inspect the intake manifest, supply the chamber-owned block geometry adapter, perform staged installation and conduct the combined browser pass.

## Intake identity

```text
Module name:       chamber-motion
Replaceable slot:  chamber-motion
API version:       1
Dependencies:      visual-director, effects
Scene layer:       environment:chamber-motion
Visual channel:    chamber
Runtime group:     chamber
Auto-install:      no
```

`publication.js` exposes `NCNChamberMotionPublication`, containing the manifest and a factory suitable for `NCNModuleIntake.inspect()`.

## Ownership boundary

The module owns connected cluster selection, the extract–outward–turn–inward–settle choreography, complete swept-route reservations, cancellation, graceful settlement, suspension, exact restoration, deterministic testing and reduced-motion alternatives.

The chamber retains construction, projection, block geometry and visual styling. The module does not transform the chamber root, either application root, the Optical hierarchy or weather layers. It performs no autonomous panel scheduling.

## Public surface

```js
await blocks.init();
await blocks.applyProfile(profile, meta);
blocks.suspend(reason);
blocks.resume(reason);
blocks.reset({ reason });
await blocks.destroy(reason);

await blocks.trigger(options);
blocks.cancel(sequenceId, { reason });
await blocks.settle(sequenceId, { reason, duration });
blocks.snapshot();
```

An additional read-only `getActiveGeometry()` hook exposes module-owned poses for later weather occlusion. It does not move or disturb atmosphere.

## Files

- `block-rearrangement.js` — renderer-independent production module.
- `publication.js` — PR 86 intake manifest and non-installing factory.
- `HOST-INTEGRATION.md` — intake and staged-installation instructions.
- `CHAMBER-CONTRACT.md` — required chamber block adapter.
- `API.md` — public controls, outcomes and events.
- `PERFORMANCE.md` — runtime, quality and route-planning notes.
- `LIMITATIONS.md` — deliberate publication boundaries.
- `tests/acceptance.js` — deterministic motion, race and cleanup suite.
- `tests/publication-contract.js` — manifest and factory smoke test.
- `source-parts/` and `build-publication.js` — reproducible source transport for the committed browser artifact.

## Validation

```bash
node tests/source-integrity.js
node build-publication.js
git diff --exit-code -- block-rearrangement.js
node --check block-rearrangement.js
node --check publication.js
node tests/acceptance.js
node tests/publication-contract.js
```

The acceptance suite verifies one sleeping shared-runtime task in the `chamber` group, director envelopes and claims, complete choreography, reset, suspension, graceful settlement, exact restoration, the four-sequence admission limit under simultaneous asynchronous approval, swept-route non-overlap, deterministic selection, live full → reduced → full preference changes, live host-quality throttling, effect-handle cleanup and destruction during a pending request.

```text
Publication only:                  YES
Incumbent chamber-motion replaced: NO
Main modified:                     NO
Private permanent animation loop:  NO
Department CI gate:                ADDED
Production browser integration:    NOT YET TESTED
```
