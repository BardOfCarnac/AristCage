# Block Rearrangement API

## `createBlockRearrangement(context)`

Creates one module instance. Construction does not register runtime work until `init()`.

Required publication context:

```js
{
  runtime,
  chamber,
  visualDirector, // PR 86 context.director façade
  effects,
  movementSurface,
  events,
  getReducedMotion, // live getter
  getQuality,       // live host-quality getter
  taskName,
  taskGroup,
  seed,
  strictDependencies
}
```

## Lifecycle

### `await init()`

Validates dependencies and chamber catalogs, registers one disabled task with the supplied shared runtime, and subscribes to chamber geometry and runtime-quality changes. It does not trigger movement.

### `await applyProfile(profile, meta)`

Applies future movement policy without scheduling a movement.

Supported profile fields:

```js
{
  enabled: true,
  intensity: 0.5,
  quality: "full",              // "full" or "low"
  maxActive: 4,                 // clamped to 1–4
  clusterSize: [1, 7],
  durationRange: [6500, 10500],
  maxFps: 30,
  routePaddingCells: 0.2,
  settleDuration: 520,
  reducedMotionPolicy: "static", // "static" or "deny"
  reducedMotionDuration: 420,
  reducedMotionDepth: 0.16,
  reducedMotion: null,
  seed: "optional-deterministic-seed",
  effects: {
    start: null,
    extract: null,
    settle: null,
    complete: null
  }
}
```

Disabling an active profile gracefully settles active sequences by default. Pass `{ cancel: true }` in `meta` for immediate restoration.

### `suspend(reason)`

Cancels pending approvals, freezes active sequence time, and suspends the runtime task. Current poses remain exactly where they are.

### `resume(reason)`

Offsets sequence clocks by the suspended duration and resumes through the shared runtime without a jump.

### `reset({ reason })`

Cancels pending approvals, immediately restores every captured block, clears all reservations and disables the sleeping runtime task. The module remains initialised and reusable.

### `await destroy(reason)`

Runs reset, removes geometry, runtime-quality and reduced-motion listeners, cancels effect handles, unregisters the runtime task, clears all state and prevents reuse.

## Movement controls

### `await trigger(options)`

Requests and performs one sequence.

```js
{
  region: "side-walls",          // left-wall, right-wall or either
  targetRegion: "rear-wall",
  pattern: "extract-rotate-settle",
  intensity: 0.5,
  clusterSize: [1, 7],
  duration: 7600,
  approved: false,
  effects: {}
}
```

The PR 86 path always checks the shared director envelope and then obtains a chamber-channel claim after route admission. `approved: true` is retained only for compatibility with simpler external approval adapters; it does not bypass a modern PR 86 director.

The promise resolves to one of:

```text
complete
settled
cancel
busy
disabled
suspended
rejected
no-clear-route
error
```

The admission check and reservation commit are serialized after asynchronous director approval, preventing approval races from exceeding the active limit.

### `cancel(sequenceId?, options?)`

Immediately restores the selected active sequence, or all active sequences when no ID is supplied. Pending approvals are aborted. Returns the number of cancelled active and pending requests.

### `await settle(sequenceId?, options?)`

Moves the selected sequence from its current pose into a clean zero-thickness settled state and then restores the chamber-owned handles. Calling while suspended performs an immediate clean settlement because animation is intentionally frozen.

### `snapshot()`

Returns immutable module, profile, runtime and active-sequence diagnostics, including the live `reducedMotion`, `hostQuality` and resolved `performanceMode`. It explicitly reports `noPrivateAnimationLoop: true`.

### `getActiveGeometry()`

Extra read-only integration hook. Returns the module’s own last-applied block poses rather than relying on optional chamber `getPose()` methods. Weather may use these solids for occlusion only.

## Events

Required events:

```text
blockmove:start
blockmove:extract
blockmove:settle
blockmove:complete
blockmove:cancel
blockmove:error
```

Additional publication events:

```text
blockmove:proposed
blockmove:ready
blockmove:profile
blockmove:suspended
blockmove:resumed
blockmove:reset
blockmove:destroy
```

Events are emitted locally and through `context.events.emit()` when the PR 86 event bus is supplied.
