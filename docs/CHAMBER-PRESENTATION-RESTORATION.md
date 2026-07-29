# Chamber presentation — synchronized exact-depth Weather

This change refines the merged wall-matched Chamber Movement presentation without changing movement choreography or Weather simulation.

## Layer model

The production environment already places the layers in this order:

```text
weather:far
weather:rear
weather:middle
chamber-motion
weather:near
```

Opaque chamber-black moving faces therefore hide far, rear and middle Weather naturally. Those canvases no longer need repeated destructive masking.

The difficult case is `weather:near`: some near-layer puffs are actually behind a moving cell while others are genuinely in front. This revision handles that case using Weather's immutable exact-depth frame.

## Synchronous Weather frame contract

`js/weather-frame-bridge.js` decorates the accepted Weather factory at the public runtime-registration boundary. It adds one service method:

```js
const unsubscribe = weather.subscribeAfterRender(({ frame, depthFrame }) => {
  // Called synchronously after Weather has completed every canvas redraw.
});
```

The bridge does not alter Weather's renderer, particles, presets, timing or canvas ownership. It wraps the callback supplied through the department's public runtime context and notifies subscribers only after that callback has completed.

## Exact front/behind composition

After every Weather redraw the chamber presentation:

1. copies the pristine `weather:near` canvas into an unmounted backup canvas;
2. restores that backup before each moving-block pose update;
3. removes the current projected moving-solid silhouette from `weather:near`;
4. draws the opaque wall-matched block in the chamber-motion layer;
5. clips to each moving solid and asks the same Weather depth frame to render only puffs nearer than that solid.

The backup/restore step prevents destructive-mask trails as blocks move between Weather frames. The exact-depth foreground pass uses Weather's established `smaller-positive-z-is-nearer` convention and the same puffs that generated the persistent field.

Mist is not displaced or resimulated. It simply appears behind or in front of a moving cell according to its published chamber depth.

## Wall visual treatment

Moving faces retain the settled chamber treatment:

- opaque chamber-black fill;
- the same five-stop red energy palette;
- operating energy `0.61`;
- the same depth brightness, opacity and line-width equations;
- the same low additive optical pass;
- no privileged bright edge, coloured face or block glow.

## Lifecycle correction

The presentation rechecks `destroyed` immediately after awaiting departmental readiness. Destroying the bridge during installation can no longer allow the asynchronous continuation to mount canvases, hide the incumbent renderer or register tasks afterwards.

## Runtime ownership

Only one shared-runtime task remains:

| Task | Group | Priority | Purpose |
|---|---|---:|---|
| `chamber-motion:wall-matched-presentation` | `chamber` | 29 | Follow live block poses and refresh the near-layer composition from the most recent Weather frame |

Weather redraw synchronization is callback-driven rather than a second independently timed task. There is no private animation loop, interval or timer.

## Deliberately unchanged

- Chamber Movement paths, phases, duration and admission;
- Filter/Submit scheduling;
- Weather particle motion, density and presets;
- article-mist descent;
- protected Optical and Dripfeed renderers;
- application switching and reduced-motion policy.

## Validation

The deterministic tests verify:

- Weather subscribers run synchronously after the Weather render callback;
- the wall renderer remains chamber-matched;
- only the near Weather canvas is masked;
- exact-depth foreground mist is rendered over moving cells;
- the near canvas is restored from a pristine frame before each new silhouette;
- there is only one shared-runtime presentation task;
- destroy during departmental readiness cannot remount resources.

The Chromium proof runs full-quality heavy mist on desktop and mobile, opens Filter, observes movement beyond extraction, requires repeated synchronized near-layer composition and verifies visible exact-depth foreground mist before clean settlement.
