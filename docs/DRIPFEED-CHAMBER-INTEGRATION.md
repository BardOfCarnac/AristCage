# Dripfeed chamber integration

This integration mounts the accepted Dripfeed spatial publication into the production chamber without changing post membership, image treatment, font voices or tile-shape rules.

## Public ownership boundary

Integration does not access the private Dripfeed application instance. `NCNDripfeed` publishes the narrow host contract:

- `getSpatialSurfaces()` for the depth host, live wall, latent wall, ready reading surface and controls;
- `claimGeometryOwnership(owner)`;
- `releaseGeometryOwnership(owner)`;
- lifecycle and diagnostic snapshots.

The earlier `SharedDepthAdapter` now has an explicit external-owner handoff. While `integration:dripfeed-chamber` owns geometry, its camera listeners and `ResizeObserver` are disconnected and its snapshot reports `dormant: true`. Ownership is preclaimed during the empty application-switch phase, before Dripfeed activation can wake the interim adapter.

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

- desktop `1440 × 900`: six columns, `210.71px` cells, `1323 × 567px` chamber aperture;
- mobile `390 × 844`: two columns, `174px` cells, `364 × 436.8px` chamber aperture.

The narrow-screen two-column rule and reduced text budgets live in the Dripfeed-owned responsive calibration stylesheet, not in the host integration stylesheet.

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
node tests/dripfeed-chamber-integration.test.js
node tests/dripfeed-chamber-integration.mjs
```

The deterministic contract protects ownership handoff, camera plane order, leading clearance, stale-token behavior, inactive-event isolation and complete cleanup.

The Playwright proof uses explicit `1440 × 900` and `390 × 844` browser contexts. It retains six screenshots—desktop and mobile initial, reader-open and latent states—plus JSON metrics. It checks non-zero rendered live/latent planes, computed camera-relative transforms, native aperture scrolling, mobile two-column readability, real latent membership, reader resolution, RedWire cleanup and Dripfeed return.
