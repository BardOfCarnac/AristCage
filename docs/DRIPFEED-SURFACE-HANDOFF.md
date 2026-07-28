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

## Semantic events

All events bubble from `#dripfeed-root`.

| Event | Meaning |
|---|---|
| `dripfeed:walls-change` | Packing or membership changed; refresh host surface measurements. |
| `dripfeed:open-transmission` | A tile has been selected for the reading plane. Includes `sourceElement` and `sourceRect`. |
| `dripfeed:close-transmission` | The current reader has closed. |
| `dripfeed:filter-change` | Category selection changed. |
| `dripfeed:repack` | The user deliberately advanced the stable board seed. |
| `dripfeed:seen` | A tile was at least 60% visible for 900 ms. |
| `dripfeed:dismiss` | A post was explicitly filed to the latent set. |

The host should translate these semantic events into its own spatial runtime operations. It should not alter post membership or tile geometry directly.

## Mechanics now owned by Dripfeed

- strict square-cell formats: `1x1`, `2x1`, `1x2`, `2x2`, `3x1`, `2x3`;
- per-post shape envelopes rather than one permanent tile shape;
- deterministic dense packing from a stored board seed;
- deliberate `REPACK`, which advances the cycle and seed;
- exposure memory: loaded, seen, opened and dismissed are distinct states;
- an opened post remains live during the current cycle and becomes latent on the next deliberate repack;
- dismissal is the only hard user exclusion;
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
5. Register the reader on the existing forward reading plane.
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

## Validation

Run:

```bash
node --check js/dripfeed-mechanics.js
node --check js/dripfeed-surface-controller.js
node tests/dripfeed-mechanics.test.js
```

The unit harness verifies exact square-cell geometry, deterministic packing, envelope compliance, non-overlap, exposure semantics and persistent profile selection.
