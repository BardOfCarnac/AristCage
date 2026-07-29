"use strict";

const assert = require("node:assert/strict");
const {
  DEFAULT_TOLERANCES,
  orthonormalizeBasis,
  basisDeterminant,
  createBezierRoute,
  createRouteCandidate,
  evaluateCandidate
} = require("../route-admission-planner.js");

const BASIS_Z = Object.freeze({ u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] });
const BASIS_Z_90 = Object.freeze({ u: [0, 1, 0], v: [-1, 0, 0], n: [0, 0, 1] });
const BASIS_Z_180 = Object.freeze({ u: [-1, 0, 0], v: [0, -1, 0], n: [0, 0, 1] });
const SMALL = Object.freeze({ width: 0.32, height: 0.24, depth: 0.18 });

function approx(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
}

function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function length(v) { return Math.sqrt(dot(v, v)); }

function assertRigidBasis(basis) {
  approx(length(basis.u), 1);
  approx(length(basis.v), 1);
  approx(length(basis.n), 1);
  approx(dot(basis.u, basis.v), 0);
  approx(dot(basis.u, basis.n), 0);
  approx(dot(basis.v, basis.n), 0);
  approx(basisDeterminant(basis), 1);
}

function straightRoute(id, from, to, options = {}) {
  const delta = to.map((value, axis) => value - from[axis]);
  return createBezierRoute({
    id,
    corridor: options.corridor || id,
    points: [
      from,
      from.map((value, axis) => value + delta[axis] / 3),
      from.map((value, axis) => value + delta[axis] * 2 / 3),
      to
    ],
    sourceBasis: options.sourceBasis || BASIS_Z,
    targetBasis: options.targetBasis || BASIS_Z,
    cluster: options.cluster || SMALL
  });
}

function candidate(id, route, options = {}) {
  return createRouteCandidate({
    id,
    route,
    startAt: options.startAt ?? 0,
    duration: options.duration ?? 1000,
    sourceRegion: options.sourceRegion || "left-wall",
    targetRegion: options.targetRegion || "rear-wall",
    sourceLock: options.sourceLock || { region: options.sourceRegion || "left-wall", minU: 0, maxU: 1, minV: 0, maxV: 1 },
    targetLock: options.targetLock || { region: options.targetRegion || "rear-wall", minU: 6, maxU: 7, minV: 2, maxV: 3 },
    positionTolerance: options.positionTolerance,
    angularToleranceRad: options.angularToleranceRad,
    safetyMargin: options.safetyMargin
  });
}

(function completeRigidOrientationInterpolatesTwist() {
  const ninety = straightRoute("twist-90", [0, 0, 4], [0, 0, 5], { sourceBasis: BASIS_Z, targetBasis: BASIS_Z_90 });
  const midpoint = ninety.sample(0.5).basis;
  assertRigidBasis(midpoint);
  approx(midpoint.u[0], Math.SQRT1_2, 1e-5);
  approx(midpoint.u[1], Math.SQRT1_2, 1e-5);
  assert.notDeepEqual(midpoint, BASIS_Z, "equal normals must not suppress u/v twist");

  const oneEighty = straightRoute("twist-180", [0, 0, 4], [0, 0, 5], { sourceBasis: BASIS_Z, targetBasis: BASIS_Z_180 });
  for (let step = 0; step <= 20; step += 1) assertRigidBasis(oneEighty.sample(step / 20).basis);
  const beforeEnd = oneEighty.sample(0.999).basis;
  assert.ok(beforeEnd.u[0] < -0.999, "180-degree twist must approach the target continuously without endpoint snap");
  const half = oneEighty.sample(0.5).basis;
  assert.ok(Math.abs(half.u[0]) < 1e-5 && Math.abs(Math.abs(half.u[1]) - 1) < 1e-5, "halfway through 180-degree twist should be a quarter turn");
})();

(function suppliedAxesAreOrthonormalised() {
  const basis = orthonormalizeBasis({ u: [2, 0, 0], v: [1, 4, 0], n: [0.2, 0.1, 5] }, "skewed");
  assertRigidBasis(basis);
  assert.ok(dot(basis.n, [0.2, 0.1, 5]) > 0, "handed normal should follow the supplied normal hemisphere");
})();

(function rejectsEveryNonFiniteInput() {
  const valid = {
    id: "valid",
    points: [[0, 0, 4], [0, 0, 5], [1, 0, 6], [1, 0, 7]],
    sourceBasis: BASIS_Z,
    targetBasis: BASIS_Z_90,
    cluster: SMALL
  };
  assert.throws(() => createBezierRoute({ ...valid, points: [[0, 0, 4], [Infinity, 0, 5], [1, 0, 6], [1, 0, 7]] }), /finite/);
  assert.throws(() => createBezierRoute({ ...valid, sourceBasis: { ...BASIS_Z, u: [NaN, 0, 0] } }), /finite/);
  assert.throws(() => createBezierRoute({ ...valid, cluster: { ...SMALL, width: Infinity } }), /finite/);
  const route = createBezierRoute(valid);
  assert.throws(() => createRouteCandidate({ id: "bad-time", route, startAt: Infinity, duration: 1000 }), /finite/);
  assert.throws(() => createRouteCandidate({ id: "bad-duration", route, startAt: 0, duration: NaN }), /finite/);
  assert.throws(() => createRouteCandidate({ id: "bad-lock", route, startAt: 0, duration: 1000, sourceLock: { region: "left", u: NaN, v: 0 } }), /finite/);
  assert.throws(() => createRouteCandidate({ id: "bad-padding", route, startAt: 0, duration: 1000, sourceLock: { region: "left", u: 0, v: 0, paddingCells: Infinity } }), /finite/);
})();

function corners(pose, cluster) {
  const half = [cluster.width / 2, cluster.height / 2, cluster.depth / 2];
  const result = [];
  for (const su of [-1, 1]) for (const sv of [-1, 1]) for (const sn of [-1, 1]) {
    result.push([0, 1, 2].map(axis => pose.centre[axis]
      + pose.basis.u[axis] * half[0] * su
      + pose.basis.v[axis] * half[1] * sv
      + pose.basis.n[axis] * half[2] * sn));
  }
  return result;
}

(function adaptiveSweepsAreMathematicallyConservative() {
  const tiny = { width: 0.018, height: 0.027, depth: 0.011 };
  const route = createBezierRoute({
    id: "high-curvature-rapid-twist",
    points: [[-2, 0, 5], [-2, 7, 5], [2, -7, 5], [2, 0, 5]],
    sourceBasis: BASIS_Z,
    targetBasis: BASIS_Z_180,
    cluster: tiny
  });
  const result = createRouteCandidate({
    id: "bounded",
    route,
    startAt: 100,
    duration: 900,
    positionTolerance: 0.005,
    angularToleranceRad: Math.PI / 90,
    safetyMargin: 0.001,
    maxSubdivisionDepth: 22
  });
  assert.ok(result.sweeps.length > 30, "high curvature and rapid rotation should trigger adaptive subdivision");
  assert.match(result.conservativeSweepGuarantee, /control hull/);
  for (let step = 0; step <= 2000; step += 1) {
    const progress = step / 2000;
    const pose = route.sample(progress);
    const sweep = result.sweeps.find(item => progress >= item.progressStart - 1e-12 && progress <= item.progressEnd + 1e-12);
    assert.ok(sweep, `sweep must cover progress ${progress}`);
    for (const corner of corners(pose, tiny)) {
      for (let axis = 0; axis < 3; axis += 1) {
        assert.ok(corner[axis] >= sweep.bounds.min[axis] - 1e-9 && corner[axis] <= sweep.bounds.max[axis] + 1e-9,
          `between-sample corner escaped conservative sweep on axis ${axis} at ${progress}`);
      }
    }
  }
})();

(function crossingRoutesUseSuppliedAbsoluteTimes() {
  const horizontal = straightRoute("horizontal", [-2, 0, 5], [2, 0, 5]);
  const vertical = straightRoute("vertical", [0, -2, 5], [0, 2, 5]);
  const first = candidate("first", horizontal);
  const sameTime = candidate("same", vertical, {
    sourceRegion: "right-wall",
    sourceLock: { region: "right-wall", minU: 8, maxU: 9, minV: 0, maxV: 1 },
    targetLock: { region: "rear-wall", minU: 10, maxU: 11, minV: 4, maxV: 5 }
  });
  assert.equal(evaluateCandidate(sameTime, [first]).accepted, false);
  assert.equal(evaluateCandidate(sameTime, [first]).reason, "swept-volume");

  const later = candidate("later", vertical, {
    startAt: 1100,
    sourceRegion: "right-wall",
    sourceLock: { region: "right-wall", minU: 8, maxU: 9, minV: 0, maxV: 1 },
    targetLock: { region: "rear-wall", minU: 10, maxU: 11, minV: 4, maxV: 5 }
  });
  assert.equal(evaluateCandidate(later, [first]).accepted, true);
})();

(function surfaceLocksRemainPureAndAtomic() {
  const upper = candidate("upper", straightRoute("upper-route", [-2, 1.8, 5], [2, 1.8, 5]));
  const lower = candidate("lower", straightRoute("lower-route", [-2, -1.8, 5], [2, -1.8, 5]), {
    sourceLock: { region: "left-wall", minU: 1, maxU: 2, minV: 1, maxV: 2 },
    targetLock: { region: "rear-wall", minU: 12, maxU: 13, minV: 6, maxV: 7 }
  });
  const result = evaluateCandidate(lower, [upper]);
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "surface-lock");
  assert.equal(Object.isFrozen(upper), true);
  assert.equal(Object.isFrozen(lower), true);
})();

(function suppliedReservationsAreFiniteValidated() {
  const route = straightRoute("validation-route", [-1, 0, 4], [1, 0, 6]);
  const proposed = candidate("proposed", route);
  const malformedSweep = {
    ...proposed,
    id: "malformed-sweep",
    sweeps: [{ ...proposed.sweeps[0], bounds: { min: [0, 0, 0], max: [Infinity, 1, 1] } }]
  };
  assert.throws(() => evaluateCandidate(proposed, [malformedSweep]), /finite/);
  const malformedLock = {
    ...proposed,
    id: "malformed-lock",
    sourceLock: { ...proposed.sourceLock, minU: NaN }
  };
  assert.throws(() => evaluateCandidate(proposed, [malformedLock]), /finite/);
})();

(function departmentalBoundaryContainsNoHostPolicy() {
  const api = require("../route-admission-planner.js");
  for (const forbidden of ["enqueue", "drain", "reserve", "release", "clear", "createRouteAdmissionPlanner"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(api, forbidden), false, `${forbidden} belongs to Integration, not Chamber Movement`);
  }
  assert.equal(Object.prototype.hasOwnProperty.call(DEFAULT_TOLERANCES, "centralBounds"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(DEFAULT_TOLERANCES, "maxCentralConcurrent"), false);
})();

console.log("PASS: pure chamber route geometry uses rigid slerp, finite validation and bounded conservative sweeps");