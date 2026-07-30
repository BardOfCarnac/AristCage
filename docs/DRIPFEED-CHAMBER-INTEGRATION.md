# Dripfeed chamber integration

This integration mounts the accepted Dripfeed spatial publication into the production chamber without changing post membership, image treatment, font voices or tile-shape rules.

## Public ownership boundary

Integration does not access the private Dripfeed application instance. `NCNDripfeed` publishes the narrow host contract:

- `getSpatialSurfaces()` for the depth host, live wall, latent wall, ready reading surface and controls;
- `claimGeometryOwnership(owner)`;
- `releaseGeometryOwnership(owner)`;
- lifecycle and diagnostic snapshots.

The earlier `SharedDepthAdapter` has an explicit external-owner handoff. While `integration:dripfeed-chamber` owns geometry, its camera listeners and `ResizeObserver` are disconnected and its snapshot reports `dormant: true`. Ownership is preclaimed during the empty application-switch phase, before Dripfeed activation can wake the interim adapter.

Dripfeed separately owns effective-column changes. `NCNDripfeed` watches the computed `--cols` value and asks the Dripfeed renderer to replan only when that value changes. That publication response does not calculate chamber geometry and does not move individual tiles itself.

## Rendered plane order

The host derives the closest complete chamber aperture that fits inside the viewport from `NCNChamberCamera`. The chamber convention is `smaller-positive-z-is-nearer`:

1. ready Dripfeed reading plane;
2. foreground title and Dripfeed controls;
3. host-owned chamber grid occluder;
4. Dripfeed live wall;
5. Dripfeed latent wall.

The live, latent and reading surfaces consume real camera-derived transforms. Their computed browser transforms are checked against the scales returned by `camera.apertureAt(z)`; the depth values are not diagnostic metadata alone.

## Aperture, initial clearance and scrolling

`[data-depth-host]` is a fixed transparent aperture with native vertical scrolling. The wall remains close to the nearest complete structural opening.

The foreground controls may overlap the upper aperture, but Integration publishes scrollable leading clearance inside the live and latent walls. Consequently, the first readable live tile begins beneath the control shell at the initial scroll position. Native scrolling then carries the wall through the fixed top and bottom chamber boundaries.

The host-owned `#dripfeed-chamber-occluder` matches the camera-derived aperture and sits above both walls. No page-sized backing panel or opacity fade substitutes for structural occlusion.

## Live and latent publication

Both Dripfeed walls remain coherent square-cell grids. The latent wall is visibly mounted rather than suppressed by the earlier header stylesheet. Opening a post and repacking gives the opened post a genuine latent membership; the proof asserts a non-zero latent tile count, rectangle and rendered transform behind live.

At the accepted proof sizes:

- desktop `1440 × 900`: six columns, approximately `210.71px` cells, `1323 × 567px` chamber aperture;
- mobile `390 × 844`: two columns, approximately `174px` cells, `364 × 436.8px` chamber aperture.

Crossing the `430px` breakpoint while the application is already mounted publishes `dripfeed:responsive-columns-change`, replans the board from three columns to two and removes stale third-column assignments. The proof resizes one live browser context from `520px` to `390px` and rejects implicit horizontal overflow.

## Text fitting

The responsive calibration stylesheet remains Dripfeed-owned. Compact one-row cells use a stricter local text budget at every viewport: body copy and image credit are removed where the cell height cannot support them, while headline and footer remain separated. Taller tiles retain their existing body budgets.

This correction does not alter font voice, tile shape, post membership or image treatment. The browser proof requires headline/body/footer separation on desktop and mobile rather than applying that check only to narrow screens.

## Reader lifecycle and token safety

Integration consumes the accepted tokenised events:

- `dripfeed:open-transmission-start` records the current pending token;
- `dripfeed:open-transmission-ready` occupies the forward reading plane only for that token;
- `dripfeed:open-transmission-cancelled` clears state only when its token still matches the current pending opening;
- `dripfeed:close-transmission` releases only the matching ready publication.

A stale cancellation for opening A cannot set the state to idle after opening B has started. Dripfeed publication listeners are unbound while the application is inactive, and hidden-app events cannot mutate chamber state.

The existing Dripfeed reader transition remains responsible for the visual tile-to-reader movement. Integration does not clone or individually reposition tiles.

## Scene registrations and cleanup

While Dripfeed is active, Integration publishes read-only scene entries owned by `integration:dripfeed-chamber`:

- `dripfeed:controls`;
- `dripfeed:depth-host`;
- `dripfeed:live`;
- `dripfeed:latent`;
- `dripfeed:reading`;
- `dripfeed:occluder`.

Switching to RedWire hides the occluder, unbinds publication listeners, clears pending and ready tokens, releases geometry ownership, suspends the sleeping runtime task and unregisters every Dripfeed scene entry. Returning to Dripfeed renews the contract while Weather remains disabled under the Dripfeed environment profile.

## Validation

Run:

```bash
node --check js/dripfeed-depth.js
node --check js/dripfeed-adapter.js
node --check js/dripfeed-chamber-integration.js
node tests/dripfeed-responsive-columns.test.js
node tests/dripfeed-chamber-integration.test.js
node tests/dripfeed-chamber-integration.mjs
```

The deterministic contracts protect responsive effective-column replanning, ownership handoff, camera plane order, leading clearance, stale-token behavior, inactive-event isolation and complete cleanup.

The Playwright proof uses explicit `1440 × 900` and `390 × 844` browser contexts plus a live `520 × 844 → 390 × 844` resize transition. It retains desktop and mobile initial, reader-open and latent screenshots, a transition screenshot and JSON metrics. It checks non-zero rendered live/latent planes, computed camera-relative transforms, native aperture scrolling, text-region separation at every viewport, live two-column replanning, real latent membership, reader resolution, RedWire cleanup and Dripfeed return.
