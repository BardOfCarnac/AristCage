# Chamber Geometry Contract

The production chamber owns wall geometry, projection, face styling and the actual renderer records. The movement module receives handles; it does not query or reconstruct the chamber.

## Required adapter

```js
{
  getBlocks(region),
  subscribeGeometryChange(listener), // optional
  getEffectTarget(descriptor)        // optional
}
```

`getBlocks()` must provide catalogs for:

```text
left-wall
right-wall
rear-wall
```

## Block identity and geometry

Every entry requires:

```js
{
  id: string,
  region: string,
  u: integer,
  v: integer,

  getGeometry() {
    return {
      center: [x, y, z],
      basis: {
        u: [x, y, z],
        v: [x, y, z],
        n: [x, y, z]
      },
      size: number
    };
  }
}
```

`center` is the centre of the resting wall face. `basis.n` points inward into the chamber. `basis.u` and `basis.v` correspond to increasing catalog coordinates.

Left and right wall entries additionally require:

```js
{
  capture(),
  applyPose(pose),
  restore(snapshot),
  clearPose() // optional extra cleanup
}
```

Rear entries may be geometry-only destinations.

## Pose supplied to the renderer

```js
{
  sequenceId,
  pattern,
  phase,
  progress,
  centre: [x, y, z],
  basis: { u, v, n },
  thickness,
  size,
  localCell: [u, v],
  clusterCells,
  sourceRegion,
  targetRegion,
  reduced
}
```

The chamber adapter turns this pose into its existing renderer representation on the supplied `environment:chamber-motion` surface. The core module never applies a transform to the chamber or application roots.

## Restoration invariants

`capture()` and `restore()` are a strict pair. After any of the following:

```text
cancel
reset
destroy
error
completed sequence
gracious early settle
```

all chamber-owned handles must be indistinguishable from the captured state, including removal of temporary transforms, classes, inline properties, renderer records and effect targets.

The permanent source-wall grid remains visible beneath extraction. The module does not create a lasting cavity or persistent rear-wall topology.

## Styling invariants

The chamber renderer supplies the face style. The approved model requires:

- opaque black faces;
- the same red and opacity rules as nearby chamber grid lines;
- no privileged bright face;
- no block glow;
- zero-thickness endpoints visually matching the resting wall cells.

## Geometry changes

When `subscribeGeometryChange()` fires, the module immediately resets active movement before rebuilding catalogs. Responsive changes therefore cannot strand blocks under stale coordinates.
