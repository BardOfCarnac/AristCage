# NCN Block Rearrangement Department

Self-contained publication package for chamber block choreography.

This package separates the approved movement behaviour from the standalone chamber used to develop it. The production module does **not** construct a chamber, own a global animation loop, render articles, move weather, or transform the chamber root. It receives block handles and geometry from a chamber adapter, then coordinates their selection and movement through a supplied shared runtime.

## Package contents

The complete tested publication contains:

- `block-rearrangement.js` — production module.
- `block-rearrangement.css` — optional DOM-adapter cleanup hooks; the core module is renderer-agnostic.
- `demo/` — standalone chamber adapter and shared-runtime acceptance demo.
- `reference/approved-motion-model.html` — accepted visual reference. Its embedded chamber and weather exist only to make the isolated reference run.
- `tests/acceptance.js` — automated lifecycle and restoration test.
- `API.md` — public methods and events.
- `CHAMBER-CONTRACT.md` — required chamber and runtime interfaces.
- `PERFORMANCE.md` — frame scheduling and low-performance behaviour.
- `LIMITATIONS.md` — current publication limitations.
- `DEPARTMENT-BRIEF.md` — authoritative departmental publication guide.

## Approved movement model

A selected connected cluster of one to seven blocks:

1. disengages from a left or right chamber wall;
2. thickens continuously into full cubes;
3. continues outward along the source-wall normal;
4. slows as it approaches the turn point;
5. rotates while holding that point;
6. accelerates toward a rear-wall destination;
7. settles continuously into exact rear-grid alignment;
8. restores every supplied movement handle to its captured stable state.

The module supports overlapping sequences only when source footprints, rear destinations and route lanes can be reserved without conflict.

## Integration boundary

**Chamber owns:** block inventory, cell geometry, projection, visual style and rendering implementation.

**Block module owns:** selection, connected patterns, reservations, timing, choreography, cancellation and restoration.

**Shared runtime owns:** when recurring frame work runs.

**Director/lifecycle owns:** whether a requested movement is allowed.

**Weather owns:** atmosphere. The block module does not push, alter or render weather.

## Public shape

```js
const blocks = createBlockRearrangement(context);

await blocks.init();

await blocks.trigger({
  region: "left-wall",
  targetRegion: "rear-wall",
  pattern: "extract-rotate-settle",
  intensity: 0.5
});

blocks.setEnabled(true);
blocks.setIntensity(0.5);
blocks.suspend();
blocks.resume();
blocks.reset();
blocks.destroy();
```

`trigger()` is an explicit request from the external director. The module never independently decides that movement must occur.

## Acceptance status

The local publication build currently passes an automated test covering:

- initialisation against an existing chamber adapter;
- one block sequence;
- interruption halfway through;
- immediate exact restoration;
- another sequence after reset;
- suspend and resume;
- destruction without remaining runtime tasks or posed handles.

The branch is a handoff/staging branch. It must not be merged into production until the complete department package has been reviewed by the consolidation agent.