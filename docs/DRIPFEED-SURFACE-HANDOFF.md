# Dripfeed surface handoff

This branch prepares Dripfeed's side of the chamber integration. It deliberately does **not** choose chamber coordinates, replace the production title rail, or implement occlusion. Those remain host/integration responsibilities.

## Publications

After Dripfeed mounts, the app instance publishes:

```js
app.getSpatialSurfaces()
// {
//   live: HTMLElement,
//   latent: HTMLElement,
//   reading: HTMLElement | null,
//   controls: HTMLElement[]
// }

app.getSurfaceSnapshot()
// {
//   seed,
//   cycle,
//   columns,
//   liveCount,
//   latentCount,
//   excludedCount,
//   surfaces
// }
```

The live and latent elements carry:

```html
<section data-spatial-surface="live"></section>
<section data-spatial-surface="latent"></section>
```

An opened reader carries:

```html
<article data-spatial-surface="reading"></article>
```

Both wall publications are derived from the **same active category and search filter**. The latent surface is not an unfiltered archive. A post that does not match the current filter is absent from both published surfaces until that filter changes.

Publication membership is explicit:

- eligible and current-cycle posts are live;
- eligible posts opened in an earlier cycle are latent;
- dismissed posts are excluded from both walls until restored.

## Semantic events

All events bubble from `#dripfeed-root`.

| Event | Meaning |
|---|---|
| `dripfeed:walls-change` | Packing or membership changed; refresh host surface measurements. Counts describe the currently filtered live, latent and excluded sets. |
| `dripfeed:open-transmission-start` | A reading transition is being requested. Includes a request token, source element and source rectangle for pre-transition geometry. This does not mean the open was accepted. |
| `dripfeed:open-transmission-ready` | The reader transition was accepted and the real reading surface now exists. Includes the same token and `readingSurface`. |
| `dripfeed:open-transmission` | Backward-compatible success event, emitted at the same truthful point as `open-transmission-ready`. |
| `dripfeed:open-transmission-cancelled` | The request was rejected, interrupted or failed. Partial reader state has been cleared and no opened-memory mutation has occurred. |
| `dripfeed:close-transmission` | A previously ready reading publication has closed. A close is never emitted for a request that did not reach ready. |
| `dripfeed:filter-change` | Category selection changed. |
| `dripfeed:repack` | The user deliberately advanced the stable board seed. |
| `dripfeed:seen` | A tile was at least 60% visible for 900 ms. |
| `dripfeed:dismiss` | A post was explicitly excluded from both live and latent publications. |
| `dripfeed:restore` | A dismissed post was restored to eligibility under the current cycle. |

The host should translate these semantic events into its own spatial runtime operations. It should not alter post membership or tile geometry directly.

The host may use `open-transmission-start` to prepare movement from the tile's source rectangle, but it must wait for `open-transmission-ready` before treating the reading plane as occupied. Every emitted close has one preceding unmatched ready event. Rejected, interrupted and failed requests publish cancellation only.

## Mechanics now owned by Dripfeed

- strict square-cell formats: `1x1`, `2x1`, `1x2`, `2x2`, `3x1`, `2x3`;
- per-post shape envelopes rather than one permanent tile shape;
- deterministic dense packing from a stored board seed;
- deliberate `REPACK`, which advances the cycle and seed;
- exposure memory: loaded, seen, opened and dismissed are distinct states;
- an opened post remains live during the current cycle and becomes latent on the next deliberate repack;
- live publication may contain fewer than six posts when no more eligible posts remain;
- dismissal is the only hard user exclusion and removes a post from both published walls;
- stable post-level voices: Wire, Neuro, Tag, Blackletter and Stencil;
- stable image treatments: full, ghost, band, split and inset;
- user-selected headline voice in the transmission composer;
- live and latent walls with no page-sized backing surface.

## Host-owned integration work

The integration agent should:

1. Replace the NCN title presentation with the approved Dripfeed title while the application is active.
2. Keep `.dripfeed-filter-rail` on the foreground UI plane in one non-wrapping row.
3. Register the `live` surface immediately behind the first suitable chamber occluder.
4. Register the `latent` surface one shallow interval behind `live`.
5. Register the reader on the existing forward reading plane after `dripfeed:open-transmission-ready`.
6. Route the live wall through the production article scroll mapping.
7. Use real chamber geometry for top and bottom occlusion.
8. Preserve Dripfeed's grid positions, dimensions, image treatments and font classes.
9. Avoid adding a background to `.dripfeed-app`, `.demo-stage` or either wall.
10. Refresh measurements after `dripfeed:walls-change` rather than rebuilding the Dripfeed application.

## Do not manipulate

The host must not:

- assign tile shapes;
- move individual posts between live and latent arrays;
- rewrite font voices or image treatments;
- mark posts seen merely because they were rendered;
- replace the stored board seed on ordinary refresh;
- add per-tile random Z scatter;
- restore an opaque page rectangle behind the wall.

## Lifecycle cleanup

Exposure observation is installed on a retained animation-frame handle. Re-rendering, deactivation and destruction cancel the pending frame, disconnect any observer and clear all exposure timers.

Reader publication is tokenised. Ready state is retained only after the real reading surface exists, and is cleared exactly once on close or destruction. Interruption during opening cannot emit a close. A thrown open performs an immediate guarded transition cleanup plus a final local reset before cancellation is published, leaving no active post, reader card, flight stage, source class, overlay state or reading-depth state.

Integration should use the existing application lifecycle rather than removing Dripfeed DOM behind the publication's back.

## Validation

Run:

```bash
node --check js/dripfeed-mechanics.js
node --check js/dripfeed-reader-transition.js
node --check js/dripfeed-surface-controller.js
node --check tests/dripfeed-mechanics.test.js
node --check tests/dripfeed-mounted-contract.test.js
node tests/dripfeed-mechanics.test.js
node tests/dripfeed-mounted-contract.test.js
```

The deterministic harness verifies exact square-cell geometry, deterministic packing, envelope compliance, non-overlap, exposure semantics and persistent profile selection. The mounted harness loads the real reader transition followed by the single production surface controller and verifies filtered wall membership, opened-to-latent repacking, dismissal exclusion and restore, ready-gated close events, interruption during opening, injected failure after reader markup exists, and zero observer/timer/frame residue after cleanup.
