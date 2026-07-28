# Chamber Route Admission Planner — integration review

## Scope

This publication proposes the admission logic needed before Chamber Movement gains curved transfers, same-wall sorting, inspection cycles or cross-chamber routes.

It is intentionally **not installed by the site** and does not alter the accepted `block-rearrangement.js` publication. Current production movement remains unchanged until the integration agent approves a migration.

The accepted movement module already performs useful spatial checks:

- source and target cell neighbourhoods cannot overlap active reservations;
- four straight route segments are compared by segment distance;
- admission is serialized before a sequence captures wall cells.

Those checks are sufficient for the current side-wall-to-rear choreography. They do not describe a curved route over time, cannot queue a blocked movement, and treat two paths crossing five seconds apart as though they collided.

## Proposed responsibilities

`route-admission-planner.js` adds a renderer-independent planning layer which:

1. receives one or more complete candidate routes;
2. samples each rigid cluster orientation and position before movement begins;
3. converts the samples into conservative swept AABBs;
4. attaches absolute time windows to every swept volume;
5. reserves source cells, route volume and destination cells atomically;
6. briefly waits for the preferred corridor before considering alternatives;
7. queues pending requests by priority and FIFO order;
8. never pre-empts or mutates an admitted route.

The planner creates no animation loop and does not know how a block is rendered.

## Why swept AABBs

Each route sample converts the cluster's oriented dimensions into an axis-aligned world-space box:

```text
extent.x = |u.x| halfWidth + |v.x| halfHeight + |n.x| halfDepth + margin
extent.y = |u.y| halfWidth + |v.y| halfHeight + |n.y| halfDepth + margin
extent.z = |u.z| halfWidth + |v.z| halfHeight + |n.z| halfDepth + margin
```

This includes the larger footprint produced while a rectangular cluster rotates. Adjacent sample boxes and a midpoint box are unioned into one swept interval. Sampling density is selected from both:

- maximum time between samples; and
- maximum spatial travel relative to the cluster's smallest dimension.

The method is deliberately conservative. A false rejection produces a short wait; a false acceptance could produce visible clipping.

## Space and time

Two swept volumes conflict only when both are true:

- their world-space boxes overlap; and
- their absolute time intervals overlap.

The same centre corridor can therefore be reused later without being treated as permanently blocked.

Surface locks are also timed:

- the source cells remain locked through extraction;
- destination cells are acquired before arrival and retained through settlement.

All locks are checked before any reservation is committed.

## Readable central concurrency

The default central chamber volume permits at most two concurrent route reservations. This is an aesthetic capacity limit rather than a geometric claim that only two clusters fit.

Three sequences may still be active overall when one is extracting at a wall, one is crossing the chamber and one is settling. The planner simply prevents the central space becoming visually unreadable.

## Candidate preference

A request supplies candidate routes in preference order. Admission attempts are ordered as follows:

1. preferred corridor immediately;
2. preferred corridor after short delay steps;
3. alternative corridors from the earliest available time;
4. preferred corridor through the remaining allowed delay window;
5. no-safe-route.

This avoids bizarre emergency detours when a familiar route will become available a fraction of a second later.

## API sketch

```js
const planner = NCNChamberRouteAdmission.createRouteAdmissionPlanner({
  sampleIntervalMs: 120,
  delayStepMs: 240,
  preferredWaitMs: 720,
  maxDelayMs: 3600,
  safetyMargin: 0.12,
  maxCentralConcurrent: 2
});

const upper = NCNChamberRouteAdmission.createBezierRoute({
  id: "left-to-rear-upper",
  corridor: "upper-centre",
  points: [source, departureControl, arrivalControl, target],
  sourceBasis,
  targetBasis,
  cluster: { width, height, depth }
});

const result = planner.reserve({
  id: "movement-request-42",
  priority: 20,
  earliestStart: performance.now(),
  duration: 7200,
  routes: [upper, rearAlternative],
  sourceRegion: "left-wall",
  targetRegion: "rear-wall",
  sourceLock: { region: "left-wall", minU, maxU, minV, maxV, paddingCells: 1 },
  targetLock: { region: "rear-wall", minU, maxU, minV, maxV, paddingCells: 1 }
});
```

An accepted result includes immutable route poses and swept volumes suitable for a developer visualiser.

## Queue policy

`enqueue()` records a request without changing active reservations. `drain(now)` examines queued requests in:

1. descending priority;
2. original FIFO order for equal priority.

A high-priority request never interrupts an admitted route. It only receives the first newly available safe slot.

## Recommended integration sequence

### Stage 1 — Dev-only visualisation

Load the planner only in diagnostics and draw:

- route control curves;
- sampled oriented boxes;
- swept AABBs;
- source and destination locks;
- absolute time bands;
- conflict reasons.

Do not yet drive production blocks from it.

### Stage 2 — Shadow admission

For every existing side-to-rear request, generate an equivalent planner candidate while continuing to use the accepted movement module's own reservation decision. Compare decisions and log disagreement.

### Stage 3 — Existing route authority

Let the planner reserve the existing choreography, then pass the admitted start time and route token into Chamber Movement. Release the token on complete, settle, cancel or error.

### Stage 4 — New route families

Only after the existing route is stable under planner authority should curved transfer, sort, inspect and cross-chamber candidates be enabled.

## Deliberately unresolved for integration review

- Exact corridor control points for each viewport and chamber geometry.
- Whether waiting reservations belong inside Chamber Movement or in the host activity coordinator.
- How a delayed admission is surfaced through the current `trigger()` promise contract.
- Whether route tokens should be owned by the departmental publication or a host-owned traffic service.
- How the Dev panel should display future reservations without obscuring the chamber.

These are integration decisions. The PR provides the collision, timing and queue mechanics without silently choosing an owner.
