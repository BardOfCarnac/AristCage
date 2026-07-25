# Performance Notes

## Shared scheduler

Through the PR 86 department context, the module registers exactly one sleeping task:

```js
context.runtime.register("update", update, {
  group: "chamber",
  priority: 30,
  maxFps: 30,
  enabled: false
});
```

The department context namespaces the final task name. The module contains no `requestAnimationFrame`, interval or permanent timer. The task wakes only while sequences are active and disables itself after the final restoration.

## Concurrency and route planning

Full quality supports up to four concurrent clusters. Low quality caps movement at one active sequence and three cells.

Before capture or transform work begins, the module reserves padded source and destination footprints plus the complete extraction, outward, inward and insertion path. A conservative swept radius covers the connected cluster while it turns. Candidate routes are rejected before movement when their swept capsules intersect an active reservation.

Admission and reservation commit are serialized after asynchronous permission, closing the race where several approvals could otherwise bypass `maxActive`.

## Quality controls

```text
maxActive
clusterSize
maxFps
durationRange
routePaddingCells
quality
```

Low or reduced host quality is read live through the PR 86 context and limits the task to 20 FPS without a profile override. A profile may also request `quality: "low"`. Shape definitions are immutable, and chamber catalogs are rebuilt only at initialisation or a geometry-change notification.

## Reduced motion

Reduced motion is read live for every request. `reducedMotionPolicy: "static"` replaces travel and rotation with a restrained local depth acknowledgement before exact restoration. `"deny"` rejects new movement. Active full-motion sequences may be settled cleanly when preferences change.
