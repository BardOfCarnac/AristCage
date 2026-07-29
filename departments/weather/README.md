# NCN Weather Department — PR-86 publication

This directory publishes the replaceable `weather` department. It does not install itself, modify application roots, replace the incumbent slot, or touch protected RedWire, Dripfeed, Optical or chamber structures.

## Approved everyday mist

The default RedWire mist is the agreed **Floor Mist / Chamber Test 01 — Low mist** bank renderer, adapted to the four host-supplied depth layers and shared runtime.

Its baseline visual constants are density `0.62`, height `0.34`, opacity `0.58`, lateral drift `+0.18`, depth flow `-0.12`, turbulence `0.42`, softness `0.66` and deterministic seed `2045`.

The following experimental extras remain excluded:

- continuous floor veil;
- generic or vertical red haze;
- front floor-energy line;
- sprite reconstructions.

Weather uses only the RedWire energy palette. Ordinary mist has a red body with brighter local red illumination; smoke darkens the same banks; electrical or heated Weather may lift those reds toward orange.

## Load order and capability boundary

1. `weather-manifest.js`
2. `weather-presets.js`
3. `weather-module.js`
4. `weather-module.css` during staged visual testing

The factory uses only the supplied Weather layers, one shared-runtime `environment` task, the Visual Director, the declared Effects dependency, read-only chamber geometry and view attenuation zones. It creates no private animation loop, interval or per-bank timer.

## Immutable depth-frame surface

Weather publishes a frozen read-only view of the exact mist puffs used by its most recent completed render:

```js
const frame = weather.getDepthFrame(optionalFrameToken);

frame.renderForeground(context2d, {
  nearerThan: chamberZ,
  viewport: { left, top, width, height }
});
```

The chamber convention is explicit: **smaller positive `z` is nearer**. Scalar foreground selection uses `puffZ < chamberZ`.

Integration may also submit multiple projected regions in one call:

```js
frame.renderForeground(context2d, {
  regions: [
    {
      nearerThan: cellNearestDepth,
      polygons: [[{ x, y }, { x, y }, { x, y }]]
    }
  ],
  viewport: { left, top, width, height }
});
```

Weather still iterates each puff only once. It combines every qualifying polygon into one clip before drawing that puff, so overlapping Integration regions cannot multiply opacity. Regions do not alter Weather simulation state.

The frame exposes no private bank or puff collection. Rendering uses the same elapsed time, camera projection, colour, softness, clipping and draw order as the ordinary frame. A handle becomes inert as soon as Weather state invalidates it or Weather is disabled, suspended, reset or destroyed.

## Synchronous completed-frame publication

Weather owns the public synchronization point:

```js
const unsubscribe = weather.subscribeAfterRender(payload => {
  // payload.type === "render" after all Weather canvases are complete
  // payload.type === "invalidate" immediately after the current frame becomes inert
});
```

A render payload contains the completed immutable `depthFrame`, its Weather token, runtime token and frame number. Listener order follows subscription order. Listener failures are isolated and do not interrupt Weather.

Disable, suspension, reset and destruction invalidate the current frame and clear subscribers. The returned release function exposes `active()` so an Integration consumer can detect lifecycle clearing and resubscribe after Weather resumes.

This contract adds no caller-specific atmospheric state and does not expose the private Weather render task name.

## Effects, profiles and cleanup

Weather may request only `electrical-disturbance` on `fault` and `light-flash` on `environment`, both with ambient purpose.

RedWire requests ordinary mist at its baseline profile. Dripfeed disables Weather completely. Suspension stops the shared-runtime task, invalidates the published frame, clears and hides all Weather canvases, and releases frame subscribers. Reset and destruction deactivate particles, cancel Weather-owned Effects handles and remove owned resources without altering the integration slot.

## Validation

Department tests protect deterministic replay, approved bank construction, exact immutable puff-depth frames, one-pass overlapping-region composition, synchronous completed-frame publication, stale-handle rejection, Effects policy, quality changes, suspension and cleanup.

Rendered desktop and mobile inspection remains the Integration gate before merge.
