/*==================================================
  NCN CHAMBER ROUTE GEOMETRY EVALUATOR

  Pure Chamber Movement publication for integration review. It does not install
  itself, own a queue, read a clock, reserve host state, or alter choreography.

  Responsibilities:
  - validate complete rigid route geometry;
  - orthonormalise supplied bases and interpolate full orientation by quaternion slerp;
  - build mathematically conservative swept-volume candidates;
  - evaluate one immutable candidate against supplied immutable reservations.
==================================================*/
(function attachRouteGeometryEvaluator(globalScope, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.NCNChamberRouteGeometry = Object.freeze(api);
})(typeof globalThis !== "undefined" ? globalThis : this, function routeGeometryFactory() {
  "use strict";

  const VERSION = "0.2.0-review";
  const EPSILON = 1e-9;
  const ROUTE_DATA = new WeakMap();
  const DEFAULT_TOLERANCES = Object.freeze({
    positionTolerance: 0.03,
    angularToleranceRad: Math.PI / 24,
    safetyMargin: 0.12,
    maxSubdivisionDepth: 18
  });

  function finiteNumber(value, label) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite.`);
    return number;
  }

  function positiveFinite(value, label) {
    const number = finiteNumber(value, label);
    if (number <= 0) throw new RangeError(`${label} must be greater than zero.`);
    return number;
  }

  function unitInterval(value, label) {
    const number = finiteNumber(value, label);
    if (number < 0 || number > 1) throw new RangeError(`${label} must be between 0 and 1.`);
    return number;
  }

  function vector3(value, label) {
    if (!Array.isArray(value) || value.length !== 3) throw new TypeError(`${label} must be a three-component vector.`);
    return value.map((item, axis) => finiteNumber(item, `${label}[${axis}]`));
  }

  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scale = (v, amount) => [v[0] * amount, v[1] * amount, v[2] * amount];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
  const length3 = v => Math.sqrt(dot(v, v));
  const distance3 = (a, b) => length3(sub(a, b));

  function normalizeStrict(value, label) {
    const magnitude = length3(value);
    if (!Number.isFinite(magnitude) || magnitude <= EPSILON) throw new RangeError(`${label} must be non-degenerate.`);
    return scale(value, 1 / magnitude);
  }

  function freezeVector(value) {
    return Object.freeze([...value]);
  }

  function orthonormalizeBasis(value, label = "basis") {
    if (!value || typeof value !== "object") throw new TypeError(`${label} is required.`);
    const rawU = vector3(value.u, `${label}.u`);
    const rawV = vector3(value.v, `${label}.v`);
    const rawN = vector3(value.n, `${label}.n`);
    const u = normalizeStrict(rawU, `${label}.u`);
    let vResidual = sub(rawV, scale(u, dot(rawV, u)));
    if (length3(vResidual) <= EPSILON) vResidual = cross(rawN, u);
    let v = normalizeStrict(vResidual, `${label}.v orthogonal component`);
    let n = normalizeStrict(cross(u, v), `${label} handed normal`);
    if (dot(n, rawN) < 0) {
      v = scale(v, -1);
      n = scale(n, -1);
    }
    return Object.freeze({ u: freezeVector(u), v: freezeVector(v), n: freezeVector(n) });
  }

  function basisDeterminant(basis) {
    return dot(basis.u, cross(basis.v, basis.n));
  }

  function normalizeQuaternion(value, label = "quaternion") {
    const q = vector3(value.slice?.(0, 3), `${label}[xyz]`);
    const w = finiteNumber(value?.[3], `${label}[3]`);
    const all = [q[0], q[1], q[2], w];
    const magnitude = Math.hypot(...all);
    if (magnitude <= EPSILON) throw new RangeError(`${label} must be non-degenerate.`);
    return all.map(component => component / magnitude);
  }

  function basisToQuaternion(input) {
    const basis = orthonormalizeBasis(input);
    const m00 = basis.u[0], m01 = basis.v[0], m02 = basis.n[0];
    const m10 = basis.u[1], m11 = basis.v[1], m12 = basis.n[1];
    const m20 = basis.u[2], m21 = basis.v[2], m22 = basis.n[2];
    const trace = m00 + m11 + m22;
    let x, y, z, w;
    if (trace > 0) {
      const s = Math.sqrt(trace + 1) * 2;
      w = 0.25 * s;
      x = (m21 - m12) / s;
      y = (m02 - m20) / s;
      z = (m10 - m01) / s;
    } else if (m00 > m11 && m00 > m22) {
      const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
      w = (m21 - m12) / s;
      x = 0.25 * s;
      y = (m01 + m10) / s;
      z = (m02 + m20) / s;
    } else if (m11 > m22) {
      const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
      w = (m02 - m20) / s;
      x = (m01 + m10) / s;
      y = 0.25 * s;
      z = (m12 + m21) / s;
    } else {
      const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
      w = (m10 - m01) / s;
      x = (m02 + m20) / s;
      y = (m12 + m21) / s;
      z = 0.25 * s;
    }
    const q = normalizeQuaternion([x, y, z, w]);
    if (q[3] < 0) return q.map(component => -component);
    return q;
  }

  function quaternionToBasis(input) {
    const [x, y, z, w] = normalizeQuaternion(input);
    const xx = x * x, yy = y * y, zz = z * z;
    const xy = x * y, xz = x * z, yz = y * z;
    const wx = w * x, wy = w * y, wz = w * z;
    const basis = {
      u: [1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy)],
      v: [2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx)],
      n: [2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy)]
    };
    return orthonormalizeBasis(basis, "interpolated basis");
  }

  function quaternionDot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  }

  function quaternionSlerp(sourceInput, targetInput, progress) {
    const amount = unitInterval(progress, "orientation progress");
    const source = normalizeQuaternion(sourceInput, "source quaternion");
    let target = normalizeQuaternion(targetInput, "target quaternion");
    let cosine = quaternionDot(source, target);
    if (cosine < 0) {
      target = target.map(component => -component);
      cosine = -cosine;
    }
    if (cosine > 0.9995) {
      return normalizeQuaternion(source.map((component, index) => component + (target[index] - component) * amount));
    }
    const angle = Math.acos(Math.max(-1, Math.min(1, cosine)));
    const sine = Math.sin(angle);
    const sourceWeight = Math.sin((1 - amount) * angle) / sine;
    const targetWeight = Math.sin(amount * angle) / sine;
    return normalizeQuaternion(source.map((component, index) => component * sourceWeight + target[index] * targetWeight));
  }

  function quaternionAngle(a, b) {
    const cosine = Math.min(1, Math.abs(quaternionDot(normalizeQuaternion(a), normalizeQuaternion(b))));
    return 2 * Math.acos(cosine);
  }

  function cubicPoint(points, progress) {
    const t = unitInterval(progress, "route progress");
    const inverse = 1 - t;
    const weights = [inverse ** 3, 3 * inverse ** 2 * t, 3 * inverse * t ** 2, t ** 3];
    return [0, 1, 2].map(axis => points.reduce((sum, point, index) => sum + point[axis] * weights[index], 0));
  }

  function midpoint(a, b) {
    return scale(add(a, b), 0.5);
  }

  function splitCubic(points) {
    const p01 = midpoint(points[0], points[1]);
    const p12 = midpoint(points[1], points[2]);
    const p23 = midpoint(points[2], points[3]);
    const p012 = midpoint(p01, p12);
    const p123 = midpoint(p12, p23);
    const p0123 = midpoint(p012, p123);
    return [
      [points[0], p01, p012, p0123],
      [p0123, p123, p23, points[3]]
    ];
  }

  function pointLineDistance(point, start, end) {
    const line = sub(end, start);
    const lengthSquared = dot(line, line);
    if (lengthSquared <= EPSILON) return distance3(point, start);
    const t = Math.max(0, Math.min(1, dot(sub(point, start), line) / lengthSquared));
    return distance3(point, add(start, scale(line, t)));
  }

  function routeFlatness(points) {
    return Math.max(pointLineDistance(points[1], points[0], points[3]), pointLineDistance(points[2], points[0], points[3]));
  }

  function createBezierRoute(options = {}) {
    const rawPoints = Array.from(options.points || []);
    if (rawPoints.length !== 4) throw new TypeError("A cubic route requires exactly four finite control points.");
    const points = rawPoints.map((point, index) => vector3(point, `points[${index}]`));
    const sourceBasis = orthonormalizeBasis(options.sourceBasis, "sourceBasis");
    const targetBasis = orthonormalizeBasis(options.targetBasis || sourceBasis, "targetBasis");
    const sourceQuaternion = basisToQuaternion(sourceBasis);
    const targetQuaternion = basisToQuaternion(targetBasis);
    const cluster = Object.freeze({
      width: positiveFinite(options.cluster?.width, "cluster.width"),
      height: positiveFinite(options.cluster?.height, "cluster.height"),
      depth: positiveFinite(options.cluster?.depth, "cluster.depth")
    });
    const id = String(options.id || options.corridor || "route").trim();
    const corridor = String(options.corridor || options.id || "unclassified").trim();
    if (!id || !corridor) throw new TypeError("Route id and corridor must be non-empty strings.");
    const route = Object.freeze({
      id,
      corridor,
      points: Object.freeze(points.map(freezeVector)),
      sourceBasis,
      targetBasis,
      cluster,
      sample(progress) {
        const amount = unitInterval(progress, "route progress");
        return Object.freeze({
          centre: freezeVector(cubicPoint(points, amount)),
          basis: quaternionToBasis(quaternionSlerp(sourceQuaternion, targetQuaternion, amount))
        });
      }
    });
    ROUTE_DATA.set(route, Object.freeze({ points, sourceQuaternion, targetQuaternion }));
    return route;
  }

  function normalizeTolerances(options = {}) {
    const positionTolerance = positiveFinite(options.positionTolerance ?? DEFAULT_TOLERANCES.positionTolerance, "positionTolerance");
    const angularToleranceRad = positiveFinite(options.angularToleranceRad ?? DEFAULT_TOLERANCES.angularToleranceRad, "angularToleranceRad");
    const safetyMargin = finiteNumber(options.safetyMargin ?? DEFAULT_TOLERANCES.safetyMargin, "safetyMargin");
    if (safetyMargin < 0) throw new RangeError("safetyMargin must not be negative.");
    const maxSubdivisionDepth = finiteNumber(options.maxSubdivisionDepth ?? DEFAULT_TOLERANCES.maxSubdivisionDepth, "maxSubdivisionDepth");
    if (!Number.isInteger(maxSubdivisionDepth) || maxSubdivisionDepth < 1 || maxSubdivisionDepth > 30) {
      throw new RangeError("maxSubdivisionDepth must be an integer between 1 and 30.");
    }
    return Object.freeze({ positionTolerance, angularToleranceRad, safetyMargin, maxSubdivisionDepth });
  }

  function actualBounds(centreInput, basisInput, cluster, safetyMargin = 0) {
    const centre = vector3(centreInput, "centre");
    const basis = orthonormalizeBasis(basisInput, "basis");
    const margin = finiteNumber(safetyMargin, "safetyMargin");
    if (margin < 0) throw new RangeError("safetyMargin must not be negative.");
    const half = [cluster.width * 0.5, cluster.height * 0.5, cluster.depth * 0.5];
    const axes = [basis.u, basis.v, basis.n];
    const extent = [0, 1, 2].map(worldAxis => axes.reduce((sum, axis, localAxis) => sum + Math.abs(axis[worldAxis]) * half[localAxis], margin));
    return Object.freeze({
      min: freezeVector(centre.map((value, axis) => value - extent[axis])),
      max: freezeVector(centre.map((value, axis) => value + extent[axis]))
    });
  }

  function hullBounds(points, expansion) {
    const amount = finiteNumber(expansion, "sweep expansion");
    const minima = [0, 1, 2].map(axis => Math.min(...points.map(point => point[axis])) - amount);
    const maxima = [0, 1, 2].map(axis => Math.max(...points.map(point => point[axis])) + amount);
    return Object.freeze({ min: freezeVector(minima), max: freezeVector(maxima) });
  }

  function normalizeCellLock(value, fallbackRegion, start, end, label) {
    if (value == null) return null;
    if (!value || typeof value !== "object") throw new TypeError(`${label} must be an object.`);
    const region = String(value.region || fallbackRegion || "").trim();
    if (!region) throw new TypeError(`${label}.region must be non-empty.`);
    const u0 = finiteNumber(value.minU ?? value.u, `${label}.minU`);
    const u1 = finiteNumber(value.maxU ?? value.u, `${label}.maxU`);
    const v0 = finiteNumber(value.minV ?? value.v, `${label}.minV`);
    const v1 = finiteNumber(value.maxV ?? value.v, `${label}.maxV`);
    const padding = finiteNumber(value.paddingCells ?? 0, `${label}.paddingCells`);
    if (padding < 0) throw new RangeError(`${label}.paddingCells must not be negative.`);
    return Object.freeze({
      region,
      minU: Math.min(u0, u1) - padding,
      maxU: Math.max(u0, u1) + padding,
      minV: Math.min(v0, v1) - padding,
      maxV: Math.max(v0, v1) + padding,
      start: finiteNumber(start, `${label}.start`),
      end: finiteNumber(end, `${label}.end`)
    });
  }

  function createAdaptiveSweeps(route, startAt, duration, tolerances) {
    const data = ROUTE_DATA.get(route);
    if (!data) throw new TypeError("Route must be created by createBezierRoute().");
    const rotationRadius = 0.5 * Math.hypot(route.cluster.width, route.cluster.height, route.cluster.depth);
    const expansion = rotationRadius + tolerances.safetyMargin;
    const sweeps = [];

    function subdivide(points, t0, t1, q0, q1, depth) {
      const positionalDeviation = routeFlatness(points);
      const angularSpan = quaternionAngle(q0, q1);
      const terminal = (positionalDeviation <= tolerances.positionTolerance && angularSpan <= tolerances.angularToleranceRad)
        || depth >= tolerances.maxSubdivisionDepth;
      if (terminal) {
        const midpointProgress = (t0 + t1) * 0.5;
        sweeps.push(Object.freeze({
          index: sweeps.length,
          progressStart: t0,
          progressEnd: t1,
          start: startAt + duration * t0,
          end: startAt + duration * t1,
          centre: route.sample(midpointProgress).centre,
          bounds: hullBounds(points, expansion),
          positionalDeviation,
          angularSpan,
          guarantee: "cubic-convex-hull-plus-cluster-sphere"
        }));
        return;
      }
      const [left, right] = splitCubic(points);
      const tm = (t0 + t1) * 0.5;
      const qm = quaternionSlerp(q0, q1, 0.5);
      subdivide(left, t0, tm, q0, qm, depth + 1);
      subdivide(right, tm, t1, qm, q1, depth + 1);
    }

    subdivide(data.points, 0, 1, data.sourceQuaternion, data.targetQuaternion, 0);
    const progressValues = [...new Set(sweeps.flatMap(sweep => [sweep.progressStart, sweep.progressEnd]))].sort((a, b) => a - b);
    const poses = progressValues.map(progress => {
      const pose = route.sample(progress);
      return Object.freeze({
        progress,
        time: startAt + duration * progress,
        centre: pose.centre,
        basis: pose.basis,
        bounds: actualBounds(pose.centre, pose.basis, route.cluster, tolerances.safetyMargin)
      });
    });
    return Object.freeze({ poses: Object.freeze(poses), sweeps: Object.freeze(sweeps) });
  }

  function validateBounds(bounds, label) {
    if (!bounds || typeof bounds !== "object") throw new TypeError(`${label} bounds are required.`);
    const min = vector3(bounds.min, `${label}.min`);
    const max = vector3(bounds.max, `${label}.max`);
    for (let axis = 0; axis < 3; axis += 1) {
      if (min[axis] > max[axis]) throw new RangeError(`${label} min must not exceed max.`);
    }
    return { min, max };
  }

  function createRouteCandidate(options = {}) {
    const route = options.route;
    if (!ROUTE_DATA.has(route)) throw new TypeError("Candidate route must be created by createBezierRoute().");
    const startAt = finiteNumber(options.startAt, "startAt");
    const duration = positiveFinite(options.duration, "duration");
    const endAt = startAt + duration;
    if (!Number.isFinite(endAt)) throw new RangeError("Route end time must be finite.");
    const sourceReleaseProgress = unitInterval(options.sourceReleaseProgress ?? 0.22, "sourceReleaseProgress");
    const targetAcquireProgress = unitInterval(options.targetAcquireProgress ?? 0.74, "targetAcquireProgress");
    const tolerances = normalizeTolerances(options);
    const sampled = createAdaptiveSweeps(route, startAt, duration, tolerances);
    const sourceLock = normalizeCellLock(
      options.sourceLock,
      options.sourceRegion,
      startAt,
      startAt + duration * sourceReleaseProgress,
      "sourceLock"
    );
    const targetLock = normalizeCellLock(
      options.targetLock,
      options.targetRegion,
      startAt + duration * targetAcquireProgress,
      endAt,
      "targetLock"
    );
    const id = String(options.id || `${route.id}@${startAt}`).trim();
    if (!id) throw new TypeError("Candidate id must be non-empty.");
    return Object.freeze({
      id,
      routeId: route.id,
      corridor: route.corridor,
      startAt,
      endAt,
      duration,
      sourceLock,
      targetLock,
      cluster: route.cluster,
      poses: sampled.poses,
      sweeps: sampled.sweeps,
      tolerances,
      metadata: Object.freeze({ ...(options.metadata || {}) }),
      conservativeSweepGuarantee: "Every cubic centre path lies inside each subcurve control hull; every rigid orientation lies inside the cluster bounding sphere added to that hull."
    });
  }

  function timeOverlap(first, second) {
    return first.start < second.end - EPSILON && second.start < first.end - EPSILON;
  }

  function boundsOverlap(first, second) {
    return [0, 1, 2].every(axis => first.min[axis] <= second.max[axis] && second.min[axis] <= first.max[axis]);
  }

  function cellLocksOverlap(first, second) {
    if (!first || !second || first.region !== second.region || !timeOverlap(first, second)) return false;
    return first.minU <= second.maxU && second.minU <= first.maxU
      && first.minV <= second.maxV && second.minV <= first.maxV;
  }

  function validateLock(lock, label) {
    if (lock == null) return;
    if (!lock || typeof lock !== "object") throw new TypeError(`${label} must be an object.`);
    if (!String(lock.region || "").trim()) throw new TypeError(`${label}.region must be non-empty.`);
    for (const key of ["minU", "maxU", "minV", "maxV", "start", "end"]) finiteNumber(lock[key], `${label}.${key}`);
    if (lock.minU > lock.maxU || lock.minV > lock.maxV || lock.start > lock.end) throw new RangeError(`${label} has inverted bounds or timing.`);
  }

  function validateCandidate(candidate, label = "candidate") {
    if (!candidate || typeof candidate !== "object") throw new TypeError(`${label} must be an object.`);
    finiteNumber(candidate.startAt, `${label}.startAt`);
    finiteNumber(candidate.endAt, `${label}.endAt`);
    positiveFinite(candidate.duration, `${label}.duration`);
    if (candidate.endAt < candidate.startAt) throw new RangeError(`${label} timing is inverted.`);
    validateLock(candidate.sourceLock, `${label}.sourceLock`);
    validateLock(candidate.targetLock, `${label}.targetLock`);
    if (!Array.isArray(candidate.sweeps) || candidate.sweeps.length === 0) throw new TypeError(`${label}.sweeps must be non-empty.`);
    candidate.sweeps.forEach((sweep, index) => {
      finiteNumber(sweep.start, `${label}.sweeps[${index}].start`);
      finiteNumber(sweep.end, `${label}.sweeps[${index}].end`);
      if (sweep.end < sweep.start) throw new RangeError(`${label}.sweeps[${index}] timing is inverted.`);
      validateBounds(sweep.bounds, `${label}.sweeps[${index}].bounds`);
    });
    return candidate;
  }

  function evaluateConflict(candidateInput, reservationInputs = []) {
    const candidate = validateCandidate(candidateInput, "candidate");
    const reservations = Array.from(reservationInputs || []);
    for (let reservationIndex = 0; reservationIndex < reservations.length; reservationIndex += 1) {
      const active = validateCandidate(reservations[reservationIndex], `reservations[${reservationIndex}]`);
      if (cellLocksOverlap(candidate.sourceLock, active.sourceLock)
        || cellLocksOverlap(candidate.sourceLock, active.targetLock)
        || cellLocksOverlap(candidate.targetLock, active.sourceLock)
        || cellLocksOverlap(candidate.targetLock, active.targetLock)) {
        return Object.freeze({ reason: "surface-lock", reservationId: active.id || null });
      }
      for (const first of candidate.sweeps) {
        if (first.end <= active.startAt || first.start >= active.endAt) continue;
        for (const second of active.sweeps) {
          if (timeOverlap(first, second) && boundsOverlap(first.bounds, second.bounds)) {
            return Object.freeze({
              reason: "swept-volume",
              reservationId: active.id || null,
              candidateSweep: first.index,
              activeSweep: second.index
            });
          }
        }
      }
    }
    return null;
  }

  function evaluateCandidate(candidate, reservations = []) {
    const conflict = evaluateConflict(candidate, reservations);
    return Object.freeze({ accepted: conflict == null, conflict, reason: conflict?.reason || null });
  }

  return Object.freeze({
    VERSION,
    DEFAULT_TOLERANCES,
    orthonormalizeBasis,
    basisDeterminant,
    basisToQuaternion,
    quaternionToBasis,
    quaternionSlerp,
    createBezierRoute,
    createRouteCandidate,
    evaluateConflict,
    evaluateCandidate
  });
});