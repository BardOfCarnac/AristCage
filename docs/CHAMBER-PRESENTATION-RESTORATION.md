# Chamber presentation and Weather composition

This integration restores the approved wall-matched moving cells and composes the live Weather field around them without changing Chamber Movement choreography or Weather simulation.

## Wall-matched moving cells

The host reads `chamber-motion.getActiveGeometry()` and draws temporary solids with the settled `LayeredChamber` treatment:

- opaque chamber-black faces;
- the same five-stop red energy palette;
- operating energy `0.61`;
- the same depth brightness, opacity and line-width equations;
- the same low additive optical pass;
- no privileged bright edge, coloured face or block glow.

The incumbent movement canvas remains present as a reversible fallback but is hidden only after the replacement canvases, contexts and runtime task have installed successfully.

## Weather-owned frame contract

Weather now publishes its own narrow synchronous contract:

```js
const unsubscribe = weather.subscribeAfterRender(({ type, depthFrame, token }) => {
  // type is "render" after all four Weather canvases are complete,
  // or "invalidate" before the current frame becomes stale.
});
```

The completed immutable depth frame is the same field used by the ordinary Weather render. Weather retains ownership of particles, presets, timing and canvases. Integration no longer replaces the Weather factory or identifies a private runtime task name.

Subscriptions are cleared when Weather is disabled, suspended, reset or destroyed. Existing frame handles become inert at the same point. Consumers may resubscribe after Weather resumes.

## Frame-bound near-layer composition

The established scene order already places `weather:far`, `weather:rear` and `weather:middle` behind `chamber-motion`; opaque block faces hide those layers naturally.

For `weather:near`, Integration:

1. captures the pristine completed near canvas together with its exact Weather frame token and service identity;
2. restores that backup only while `weather.getDepthFrame(token)` returns the same live handle and Weather remains enabled, unsuspended and active in RedWire;
3. removes the current projected cell silhouettes from the near canvas;
4. draws the wall-matched cells;
5. asks the same Weather frame to draw foreground puffs once through all qualifying cell regions.

Backups are discarded on frame invalidation, disable, suspension, reset, service replacement and application switching. Leaving RedWire clears only Integration-owned output and never restores an old Weather frame. Returning to RedWire waits for a new Weather render.

## Truthful depth semantics

The current comparison is **piecewise conservative cell-depth**, not exact continuous solid-surface depth.

Each moving cell supplies:

- its projected padded hull;
- the depth of its nearest corner plus a small contact allowance.

Weather processes every puff once and combines all qualifying cell polygons into one clip before drawing that puff. This preserves per-cell depth variation while preventing overlapping or padded cell hulls from multiplying opacity or creating bright internal seams.

A future continuous per-pixel surface-depth implementation may replace this approximation, but this PR does not claim that result.

## Transactional installation

Installation acquires resources in a rollback transaction. Failure during canvas/context creation, incumbent suppression, runtime registration, Weather subscription or event attachment leaves:

- no replacement canvases;
- the incumbent renderer visible;
- no runtime task;
- no Weather subscriber;
- no service or window listeners;
- `initialised === false`, `installationState === "failed"`, and an explicit failure reason.

Destroy during asynchronous departmental readiness remains inert and cannot remount resources afterwards.

## Runtime

- Weather owns one shared-runtime environment task and invokes subscribers synchronously after its completed draw.
- Chamber presentation owns one shared-runtime chamber task for pose refreshes.
- There is no independent Weather-occlusion task, private animation loop, interval or timer.

## Validation

Deterministic checks cover:

- the Weather-owned after-render and invalidation contract;
- stale-handle rejection;
- one-pass rendering through overlapping foreground regions;
- chamber-black faces and chamber-matched optical strokes;
- RedWire → Dripfeed → RedWire interruption without stale pixels;
- immediate backup invalidation;
- transactional rollback at every acquisition stage;
- destruction during asynchronous readiness.

The rendered Chromium proof uses full-quality heavy mist on desktop and mobile. It requires non-transparent foreground mist over real wall pixels inside projected moving-cell bounds, checks for abnormal overlap opacity, captures human-inspectable images during extraction, turning and inward travel, exercises an active RedWire → Dripfeed interruption, and retains clean-settlement and browser-error checks.

Human visual judgement remains the final gate for the conservative depth handoff at the most oblique poses.
