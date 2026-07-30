# Dripfeed chamber integration

This integration mounts the accepted Dripfeed spatial publication into the production chamber without changing Dripfeed packing, tile geometry, typography, image treatment or membership.

## Plane order

The host derives the nearest usable chamber grid line from `NCNChamberCamera`. It selects the first grid-depth aperture that clears the fixed title and Dripfeed controls while retaining a usable reading area.

The resulting order uses the chamber convention `smaller-positive-z-is-nearer`:

1. Dripfeed reader plane;
2. host-owned chamber grid occluder;
3. Dripfeed live wall;
4. Dripfeed latent wall.

The live wall is only a small clearance behind the selected line. The latent wall is one shallow interval behind live. The stage fills the selected camera aperture rather than shrinking the Dripfeed layout into a distant board.

## Scrolling and occlusion

`[data-depth-host]` becomes a fixed transparent aperture with native vertical scrolling. The live wall remains one coherent Dripfeed grid and establishes the scroll height. The latent wall shares that scroll space behind it.

The host-owned `#dripfeed-chamber-occluder` exactly matches the camera-derived aperture rectangle and sits above both walls. Stage clipping removes tiles once they cross the aperture boundary; the foreground grid line provides the visible structural edge. No page-level opacity fade substitutes for the occlusion.

## Foreground controls

The approved animated Dripfeed title remains in the terminal rail. The filter rail and utility rail are fixed beneath it and do not inherit wall scrolling or perspective. Category chips remain one non-wrapping horizontal row, with horizontal scrolling on narrow displays.

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

The deterministic test protects camera-derived plane order, shallow separation, fixed-aperture scrolling, tokenised reader state and complete scene cleanup. The Playwright proof runs desktop and mobile, checks actual rendered geometry, scrolls the wall through the aperture, opens and closes a reader, performs a RedWire round trip and records screenshots and metrics.
