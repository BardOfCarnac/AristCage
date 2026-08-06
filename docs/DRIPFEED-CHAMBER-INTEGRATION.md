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

## Semantic chamber bands

Dripfeed depth is no longer selected by searching for whichever camera aperture happens to fit the current viewport. Viewport height must not push the service deeper into the chamber.

The chamber convention is `smaller-positive-z-is-nearer`. With `near` and `cell` supplied by `NCNChamberCamera`, Integration assigns:

1. the reader at `near + 0.08 cell`;
2. the host occluding line at `near + 1 cell`;
3. the live wall immediately behind that line at `near + 1.005 cells`;
4. the latent wall immediately behind the second line at `near + 2.005 cells`.

The publication records `placement: shared-fixed-bands`, `liveBand: 1` and `latentBand: 2`. The deterministic contract runs desktop, intermediate and mobile viewport sizes and rejects any camera-aperture read used to choose a deeper band.

## Foreground controls and viewport stage

The shared terminal rail owns the DripFeed wordmark at the same foreground level as RedWire. Dripfeed filter, Search and Transmit controls remain screen-space UI directly beneath that rail.

`[data-depth-host]` is a fixed, transparent, viewport-clipped stage beginning beneath the two control rows. It owns native vertical scrolling. The live and latent walls are scaled from the shared first-band reference and centred horizontally inside that stage:

- live remains almost flush behind the first structural line;
- latent is visibly smaller and behind live;
- neither plane changes chamber band when the viewport changes.

The first readable tile receives a small fixed leading clearance below the control shell. Native scrolling carries the board through the stage without horizontal overflow.

The host-owned `#dripfeed-chamber-occluder` matches the viewport stage and represents the first-band structural lip. No page-sized backing panel or opacity fade substitutes for structural occlusion.

## Reader placement

The reader overlay already centres its target. Integration therefore does not feed it the live/latent aperture translations:

- `--drip-reader-x` and `--drip-reader-y` remain zero;
- the target scales from `50% 0` and aligns to the top of the overlay grid, keeping its upper controls below the shared rail;
- before applying the camera-derived foreground scale, Integration inversely fits the reader's layout width and maximum height to the overlay content box;
- resize and camera changes recalculate that fit, while close, application exit and destruction release the inline placement.

This preserves the foreground plane and larger content treatment without allowing the transformed card, close control or action row to leave the rail-safe viewport. The desktop and mobile browser proof opens a real transmission, checks the published camera scale, and rejects any reader or close-control edge outside the overlay.

## Live and latent publication

Both Dripfeed walls remain coherent square-cell grids. The latent wall is visibly mounted rather than suppressed by the earlier header stylesheet. Opening a post and repacking gives the opened post a genuine latent membership; the proof asserts a non-zero latent tile count, rectangle and rendered transform behind live.

Crossing the `430px` breakpoint while the application is already mounted publishes `dripfeed:responsive-columns-change`, replans the board from three columns to two and removes stale third-column assignments. The proof resizes one live browser context from `520px` to `390px` and rejects implicit horizontal overflow. This responsive replan changes board packing, not chamber depth.

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
node tests/dripfeed-fixed-band-contract.test.js
node tests/dripfeed-chamber-integration.mjs
```

The deterministic contracts protect responsive effective-column replanning, ownership handoff, exact first/second-band placement, reader centring, stale-token behavior, inactive-event isolation and complete cleanup.

The Playwright proof uses explicit `1440 × 900` and `390 × 844` browser contexts plus a live `520 × 844 → 390 × 844` resize transition. It retains desktop and mobile initial, reader-open and latent screenshots, a transition screenshot and JSON metrics. It checks non-zero rendered live/latent planes, camera-relative scales, native stage scrolling, text-region separation, live two-column replanning, real latent membership, reader resolution, RedWire cleanup and Dripfeed return.
