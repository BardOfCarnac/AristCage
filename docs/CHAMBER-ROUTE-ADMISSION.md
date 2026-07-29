# Chamber route geometry evaluator — integration review

## Status

This contribution is intentionally **not installed by the site**. It does not alter the accepted `block-rearrangement.js` publication, current movement choreography, Filter/Submit activity, Weather interaction or Dev controls.

The first review accepted the staged direction but rejected the original combined planner because it mixed Chamber Movement geometry with Integration scheduling policy. This revision implements the requested ownership split and collision-safety corrections.

## Ownership boundary

### Chamber Movement publishes

`route-admission-planner.js` now provides only pure geometry and conflict functions:

- validated cubic candidate-route geometry;
- orthonormal rigid bases;
- full orientation interpolation using quaternion slerp;
- immutable pose samples;
- conservative swept-volume candidates;
- timed surface-lock geometry supplied by the caller;
- pure conflict evaluation against supplied reservations.

It does not retain reservations or mutate host state.

### Integration owns

A future host traffic coordinator must own:

- the monotonic clock and absolute candidate start time;
- priority/FIFO queueing;
- preferred-wait versus alternative-route policy;
- aesthetic central-concurrency limits;
- chamber-owned central-volume snapshots;
- delayed `trigger()` resolution;
- application and profile cancellation;
- reservation-token custody and stale-token behaviour;
- geometry/profile refresh during viewport or quality changes.

No queue, token store, central-volume constant or admission clock remains in the departmental publication.

## Complete rigid orientation

Supplied `u`, `v` and `n` axes are finite-validated and orthonormalised with stable right-handedness. Source and target bases are converted to quaternions and interpolated with shortest-path spherical linear interpolation.

This means routes correctly include twist or roll when the source and target normals are equal but their `u/v` axes differ. There is no endpoint orientation snap.

## Finite-input contract

The evaluator rejects rather than coerces malformed geometry. The following must all be finite:

- every route control-point component;
- all basis components;
- cluster width, height and depth;
- start time, duration and calculated end time;
- source/target progress values;
- tolerances and safety margin;
- surface-lock coordinates, padding and time windows;
- every supplied reservation sweep bound and time.

Degenerate bases, non-positive dimensions, inverted bounds and invalid lock ranges also fail explicitly.

## Conservative swept-volume guarantee

Each candidate route is a cubic Bézier centre path. Adaptive de Casteljau subdivision is driven by:

- maximum control-hull deviation from the interval chord; and
- maximum quaternion angular span.

For every resulting interval, the evaluator uses the cubic subcurve's four-point control hull. A cubic Bézier curve lies entirely inside that hull. The hull is expanded on every world axis by:

```text
0.5 × hypot(cluster width, cluster height, cluster depth) + safety margin
```

The half-diagonal is a bounding sphere for the complete rigid cluster at **every** possible orientation. Therefore the expanded control hull encloses the complete moving cluster throughout the interval, including between diagnostic samples.

`maxSubdivisionDepth` affects tightness and diagnostic density only. Reaching it cannot invalidate the guarantee because the unsplit subcurve still lies within its own control hull and the full cluster still lies inside the added sphere.

This is intentionally more conservative than a union of sampled oriented AABBs. It may reject a visually close route, but it does not depend on a fixed sampling cap to claim safety.

## Pure API

```js
const route = NCNChamberRouteGeometry.createBezierRoute({
  id: "left-to-rear-upper",
  corridor: "upper-centre",
  points: [source, departureControl, arrivalControl, target],
  sourceBasis,
  targetBasis,
  cluster: { width, height, depth }
});

// Integration supplies the absolute host time and timing policy.
const candidate = NCNChamberRouteGeometry.createRouteCandidate({
  id: "movement-request-42",
  route,
  startAt: hostClockNow,
  duration: 7200,
  sourceRegion: "left-wall",
  targetRegion: "rear-wall",
  sourceLock: { region: "left-wall", minU, maxU, minV, maxV, paddingCells: 1 },
  targetLock: { region: "rear-wall", minU, maxU, minV, maxV, paddingCells: 1 }
});

const result = NCNChamberRouteGeometry.evaluateCandidate(
  candidate,
  integrationOwnedImmutableReservations
);
```

The evaluator returns only a decision and conflict description. It does not reserve, queue, delay, release or pre-empt anything.

## Validation added for this review

The deterministic suite covers:

- equal-normal 90° `u/v` twist;
- equal-normal 180° `u/v` twist;
- continuous unit, orthogonal axes at every sample;
- stable positive determinant/handedness;
- no endpoint orientation snap;
- orthonormalisation of skewed supplied axes;
- NaN and Infinity rejection across routes, bases, dimensions, timing, locks and supplied reservations;
- a highly curved route using a tiny cluster and rapid 180° rotation;
- dense between-sample checks proving every real cluster corner remains within the published sweep;
- simultaneous crossing rejection and later time-separated acceptance;
- pure timed surface-lock conflicts;
- absence of queue, reservation-store and central-capacity APIs.

## Recommended integration sequence

1. Add an Integration-owned Dev visualiser using the immutable poses and sweeps.
2. Generate shadow candidates for the accepted side-to-rear route.
3. Record every disagreement between the accepted static admission decision and this evaluator.
4. Define the host traffic coordinator and reservation-token lifecycle separately.
5. Allow planner authority only after shadow agreement and desktop/mobile rendered review.
6. Add curved, sort, inspect or cross-chamber route families only after the existing route is stable.