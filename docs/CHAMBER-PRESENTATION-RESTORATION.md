# Chamber presentation restoration

This change restores two approved presentation behaviours that existed in the earlier chamber prototypes but were lost when Chamber Movement and Weather were separated into departments.

## Restored behaviours

### Wall-matched moving cells

The accepted movement geometry and choreography are unchanged. A host-owned presentation canvas reads `chamber-motion.getActiveGeometry()` and renders those temporary solids with the settled `LayeredChamber` optical treatment:

- opaque chamber-black faces;
- the same red energy palette;
- the same depth opacity and line-width equations;
- the same low additive optical pass;
- no privileged bright edge, coloured face or block glow.

The earlier production canvas is visually suppressed while this bridge is installed, but remains intact underneath as a reversible fallback.

### Weather occlusion

Weather particles are not moved, repelled or disturbed. After Weather draws and before the frame is presented, the bridge removes the projected moving-solid silhouettes from the Weather layers behind Chamber Movement (`far`, `rear`, and `middle`). The `near` Weather layer remains above the moving solids, preserving smoke and mist that should appear in front.

This restores the old occlusion-only reading: atmosphere may appear before and after the cells, but does not visibly pass through their opaque volume.

## Runtime ownership

The bridge registers two tasks on the existing shared runtime:

| Task | Group | Priority | Purpose |
|---|---|---:|---|
| `chamber-motion:wall-matched-presentation` | `chamber` | 29 | Runs immediately after Chamber Movement updates its poses |
| `chamber-motion:weather-occlusion` | `environment` | 10 | Runs after Weather has rendered its frame |

There is no private `requestAnimationFrame`, interval, or permanent loop. Both tasks sleep when `getActiveGeometry()` is empty and are awakened by Chamber Movement lifecycle events.

## Scope deliberately excluded

- no choreography, route or timing changes;
- no new movement families;
- no Weather displacement or wake simulation;
- no changes to protected Optical or Dripfeed renderers;
- no changes to panel scheduling or the Dev controls;
- no replacement of the accepted Chamber Movement or Weather departments.

## Historical references

The recovered prototypes remain the visual source of truth:

- Grid Brick Demo v8: wall-matched moving cells;
- Grid Brick Demo v10: wall restoration without persistent cavities;
- Weather/Block Interaction v5: occlusion-only atmosphere interaction.

## Validation

`tests/chamber-motion-presentation.test.js` verifies:

- the old bright-edged canvas is suppressed;
- the new renderer uses opaque black faces and chamber optical strokes;
- no old privileged bright edge is used;
- the additive wall glow pass is retained;
- far/rear/middle Weather canvases receive `destination-out` occlusion;
- near Weather remains available in front;
- both tasks are shared-runtime tasks and clean up completely.

`tests/chamber-motion-presentation-render.mjs` runs the real page in Chromium at desktop and mobile sizes. It opens Filter, samples the rendered wall-matched canvas, requires movement beyond extraction, confirms repeated Weather occlusion passes, verifies the old renderer remains hidden, closes Filter, and checks clean settlement.

A human rendered pass is still required before merge, particularly to judge line parity at different depths and the near-layer transition when a cluster travels very close to the viewer.
