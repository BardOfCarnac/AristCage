# Dripfeed chamber integration

This integration mounts the accepted Dripfeed spatial publication into the production chamber without changing Dripfeed packing, tile geometry, typography, image treatment or membership.

## Plane order

The host derives the nearest usable chamber grid line from `NCNChamberCamera`. It selects the first complete grid-depth aperture that fits inside the viewport and retains a usable reading area. The title and Dripfeed control rows are foreground overlays, so they do not force the wall deeper merely to reserve flat page space.

The resulting order uses the chamber convention `smaller-positive-z-is-nearer`:

1. Dripfeed reader plane;
2. foreground title and Dripfeed controls;
3. host-owned chamber grid occluder;
4. Dripfeed live wall;
5. Dripfeed latent wall.

The live wall is only a small clearance behind the selected line. The latent wall is one shallow interval behind live. The stage fills the selected camera aperture rather than shrinking the Dripfeed layout into a distant board.

## Scrolling and occlusion

`[data-depth-host]` becomes a fixed transparent aperture with native vertical scrolling. The live wall remains one coherent Dripfeed grid and establishes the scroll height. The latent wall shares that scroll space behind it.

The host-owned `#dripfeed-chamber-occluder` exactly matches the camera-derived aperture rectangle and sits above both walls. Stage clipping removes tiles once they cross the aperture boundary; the foreground grid line provides the visible structural edge. No page-level opacity fade substitutes for the occlusion.

## Foreground controls

The approved animated Dripfeed title remains in the terminal rail. The filter rail and compact utility rail are fixed directly beneath it and float over the upper part of the chamber aperture where the chosen aperture reaches that high. They remain in front of the structural grid lip and do not inherit wall scrolling or perspective. Category chips stay in one non-wrapping horizontal row, with horizontal scrolling on narrow displays.

This overlap is intentional. Reserving the complete title-and-controls stack as empty chamber clearance pushed the desktop tile wall to the fourteenth grid step. Selecting the closest viewport-fitting aperture brings it forward to the nearest complete structural opening while preserving the foreground-machine treatment.

## Reader lifecycle

Integration listens to the accepted tokenised events from the Dripfeed publication:

- `dripfeed:open-transmission-start` prepares pending spatial state;
- `dripfeed:open-transmission-ready` occupies the forward reading plane;
- `dripfeed:open-transmission-cancelled` clears only the matching pending state;
- `dripfeed:close-transmission` releases only the matching ready publication.

The existing Dripfeed reader transition remains responsible for the visual tile-to-reader movement. Integration does not clone, rewrite or reposition individual tiles.

## Scene registrations

While Dripfeed is active, Integration publishes read-only scene entries owned by `integration:dripfeed-chamber`:

- `dripfeed:controls`;
- `dripfeed:live`;
- `dripfeed:latent`;
- `dripfeed:reading`;
- `dripfeed:occluder`.

All registrations are released when leaving Dripfeed and renewed on return.

## Runtime and cleanup

Geometry updates use one sleeping `NCNViewerRuntime` task. Camera, application and Dripfeed publication events wake it for one frame; it returns to sleep immediately. There is no private animation loop, interval or transformed scroll simulation.

RedWire switching hides the occluder, clears pending and ready reader ownership, suspends the task and unregisters every Dripfeed scene entry. The CSS is scoped to `html[data-ncn-app="dripfeed"]`, so RedWire layout and Optical behaviour are unchanged.

## Validation

Run:

```bash
node --check js/dripfeed-chamber-integration.js
node tests/dripfeed-chamber-integration.test.js
node tests/dripfeed-chamber-integration.mjs
```

The deterministic test protects camera-derived plane order, shallow separation, foreground control overlap, fixed-aperture scrolling, tokenised reader state and complete scene cleanup. The Playwright proof runs real desktop and mobile viewport sizes, checks rendered geometry, scrolls the wall through the aperture, opens and closes a reader, performs a RedWire round trip and records screenshots and metrics.
