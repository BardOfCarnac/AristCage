/*==================================================
  NCN CHAMBER ROUTE ADMISSION PLANNER

  Standalone planning publication for review. It does not install itself and
  does not alter the accepted chamber movement choreography.

  Responsibilities:
  - sample complete candidate routes before movement begins;
  - reserve conservative swept volumes in both space and time;
  - atomically reserve source cells, route corridor and destination cells;
  - prefer a short wait on the requested corridor before trying alternatives;
  - queue requests by priority without pre-empting active reservations.
==================================================*/
(function attachRouteAdmissionPlanner(globalScope, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) {
    globalScope.NCNChamberRouteAdmission = Object.freeze(api);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function routeAdmissionFactory() {
  "use strict";

  const VERSION = "0.1.0-review";
  const EPSILON = 0.000001;
  const DEFAULT_CONFIG = Object.freeze({
    sampleIntervalMs: 120,
    delayStepMs: 240,
    preferredWaitMs: 720,
    maxDelayMs: 3600,
    safetyMargin: 0.12,
    maxCentralConcurrent: 2,
    centralBounds: Object.freeze({
      min: Object.freeze([-1.15, -1.25, 3.25]),
      max: Object.freeze([1.15, 1.25, 9.75])
    })
  });

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, Number(value) || 0));
  const mix = (a, b, amount) => a + (b - a) * amount;
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scale = (vector, amount) => [vector[0] * amount, vector[1] * amount, vector[2] * amount];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const length3 = vector => Math.sqrt(Math.max(0, dot(vector, vector)));
  const normalize = vector => {
    const magnitude = length3(vector);
    return magnitude > EPSILON ? scale(vector, 1 / magnitude) : [0, 0, 0];
  };
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];

  function freezeVector(value, fallback = [0, 0, 0]) {
    const source = Array.isArray(value) && value.length === 3 ? value : fallback;
    const vector = source.map(item => Number(item) || 0);
    return Object.freeze(vector);
  }

  function freezeBasis(value) {
    const source = value || {};
    const u = normalize(freezeVector(source.u, [1, 0, 0]));
    const vCandidate = normalize(freezeVector(source.v, [0, 1, 0]));
    const nCandidate = normalize(freezeVector(source.n, cross(u, vCandidate)));
    const n = length3(nCandidate) > EPSILON ? nCandidate : [0, 0, 1];
    const v = normalize(cross(n, u));
    return Object.freeze({ u: Object.freeze(u), v: Object.freeze(v), n: Object.freeze(n) });
  }

  function rotateAroundAxis(vector, axis, angle) {
    const unitAxis = normalize(axis);
    if (length3(unitAxis) < EPSILON || Math.abs(angle) < EPSILON) return [...vector];
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return add(
      add(scale(vector, cosine), scale(cross(unitAxis, vector), sine)),
      scale(unitAxis, dot(unitAxis, vector) * (1 - cosine))
    );
  }

  function interpolateBasis(sourceInput, targetInput, progress) {
    const source = freezeBasis(sourceInput);
    const target = freezeBasis(targetInput);
    const amount = clamp(progress, 0, 1);
    const sourceNormal = normalize(source.n);
    const targetNormal = normalize(target.n);
    const cosine = clamp(dot(sourceNormal, targetNormal), -1, 1);
    const angle = Math.acos(cosine);
    let axis = cross(sourceNormal, targetNormal);
    if (length3(axis) < EPSILON) {
      axis = normalize(add(source.v, target.v));
      if (length3(axis) < EPSILON) axis = [0, 1, 0];
    }
    if (amount >= 1 - EPSILON) return target;
    const u = normalize(rotateAroundAxis(source.u, axis, angle * amount));
    const n = normalize(rotateAroundAxis(source.n, axis, angle * amount));
    const v = normalize(cross(n, u));
    return Object.freeze({ u: Object.freeze(u), v: Object.freeze(v), n: Object.freeze(n) });
  }

  function cubicPoint(points, progress) {
    const t = clamp(progress, 0, 1);
    const inverse = 1 - t;
    const weights = [inverse ** 3, 3 * inverse ** 2 * t, 3 * inverse * t ** 2, t ** 3];
    return [0, 1, 2].map(axis => (
      points[0][axis] * weights[0]
      + points[1][axis] * weights[1]
      + points[2][axis] * weights[2]
      + points[3][axis] * weights[3]
    ));
  }

  function createBezierRoute(options = {}) {
    const points = Array.from(options.points || []).map(point => freezeVector(point));
    if (points.length !== 4) throw new TypeError("A cubic route requires exactly four control points.");
    const sourceBasis = freezeBasis(options.sourceBasis);
    const targetBasis = freezeBasis(options.targetBasis || sourceBasis);
    const cluster = Object.freeze({
      width: Math.max(EPSILON, Number(options.cluster?.width) || 0.5),
      height: Math.max(EPSILON, Number(options.cluster?.height) || 0.5),
      depth: Math.max(EPSILON, Number(options.cluster?.depth) || 0.5)
    });
    return Object.freeze({
      id: String(options.id || options.corridor || "route"),
      corridor: String(options.corridor || options.id || "unclassified"),
      points: Object.freeze(points),
      sourceBasis,
      targetBasis,
      cluster,
      sample(progress) {
        const amount = clamp(progress, 0, 1);
        return Object.freeze({
          centre: Object.freeze(cubicPoint(points, amount)),
          basis: interpolateBasis(sourceBasis, targetBasis, amount)
        });
      }
    });
  }

  function normalizeConfig(value = {}) {
    const central = value.centralBounds || DEFAULT_CONFIG.centralBounds;
    return Object.freeze({
      sampleIntervalMs: Math.max(30, Number(value.sampleIntervalMs ?? DEFAULT_CONFIG.sampleIntervalMs)),
      delayStepMs: Math.max(20, Number(value.delayStepMs ?? DEFAULT_CONFIG.delayStepMs)),
      preferredWaitMs: Math.max(0, Number(value.preferredWaitMs ?? DEFAULT_CONFIG.preferredWaitMs)),
      maxDelayMs: Math.max(0, Number(value.maxDelayMs ?? DEFAULT_CONFIG.maxDelayMs)),
      safetyMargin: Math.max(0, Number(value.safetyMargin ?? DEFAULT_CONFIG.safetyMargin)),
      maxCentralConcurrent: Math.max(1, Math.round(value.maxCentralConcurrent ?? DEFAULT_CONFIG.maxCentralConcurrent)),
      centralBounds: Object.freeze({
        min: freezeVector(central.min, DEFAULT_CONFIG.centralBounds.min),
        max: freezeVector(central.max, DEFAULT_CONFIG.centralBounds.max)
      })
    });
  }

  function axisAlignedBounds(centre, basis, cluster, safetyMargin) {
    const half = [cluster.width * 0.5, cluster.height * 0.5, cluster.depth * 0.5];
    const axes = [basis.u, basis.v, basis.n];
    const extent = [0, 1, 2].map(worldAxis => (
      Math.abs(axes[0][worldAxis]) * half[0]
      + Math.abs(axes[1][worldAxis]) * half[1]
      + Math.abs(axes[2][worldAxis]) * half[2]
      + safetyMargin
    ));
    return Object.freeze({
      min: Object.freeze([centre[0] - extent[0], centre[1] - extent[1], centre[2] - extent[2]]),
      max: Object.freeze([centre[0] + extent[0], centre[1] + extent[1], centre[2] + extent[2]])
    });
  }

  function unionBounds(first, second) {
    return Object.freeze({
      min: Object.freeze([0, 1, 2].map(axis => Math.min(first.min[axis], second.min[axis]))),
      max: Object.freeze([0, 1, 2].map(axis => Math.max(first.max[axis], second.max[axis])))
    });
  }

  function boundsOverlap(first, second) {
    return [0, 1, 2].every(axis => first.min[axis] <= second.max[axis] && second.min[axis] <= first.max[axis]);
  }

  function timeOverlap(first, second) {
    return first.start < second.end - EPSILON && second.start < first.end - EPSILON;
  }

  function normalizeCellLock(value, fallbackRegion, start, end) {
    if (!value) return null;
    const minU = Math.min(Number(value.minU ?? value.u ?? 0), Number(value.maxU ?? value.u ?? 0));
    const maxU = Math.max(Number(value.minU ?? value.u ?? 0), Number(value.maxU ?? value.u ?? 0));
    const minV = Math.min(Number(value.minV ?? value.v ?? 0), Number(value.maxV ?? value.v ?? 0));
    const maxV = Math.max(Number(value.minV ?? value.v ?? 0), Number(value.maxV ?? value.v ?? 0));
    const padding = Math.max(0, Number(value.paddingCells) || 0);
    return Object.freeze({
      region: String(value.region || fallbackRegion || "unknown"),
      minU: minU - padding,
      maxU: maxU + padding,
      minV: minV - padding,
      maxV: maxV + padding,
      start,
      end
    });
  }

  function cellLocksOverlap(first, second) {
    if (!first || !second || first.region !== second.region || !timeOverlap(first, second)) return false;
    return first.minU <= second.maxU && second.minU <= first.maxU
      && first.minV <= second.maxV && second.minV <= first.maxV;
  }

  function estimateRouteLength(route, samples = 24) {
    let total = 0;
    let previous = route.sample(0).centre;
    for (let index = 1; index <= samples; index += 1) {
      const current = route.sample(index / samples).centre;
      total += length3(sub(current, previous));
      previous = current;
    }
    return total;
  }

  function sampleRoute(route, startAt, duration, config) {
    const timeSteps = Math.ceil(duration / config.sampleIntervalMs);
    const smallestDimension = Math.min(route.cluster.width, route.cluster.height, route.cluster.depth);
    const spatialStride = Math.max(0.04, smallestDimension * 0.45 + config.safetyMargin * 0.5);
    const spatialSteps = Math.ceil(estimateRouteLength(route) / spatialStride);
    const steps = Math.min(256, Math.max(2, timeSteps, spatialSteps));
    const poses = [];
    for (let index = 0; index <= steps; index += 1) {
      const progress = index / steps;
      const pose = route.sample(progress);
      poses.push(Object.freeze({
        progress,
        time: startAt + duration * progress,
        centre: pose.centre,
        basis: pose.basis,
        bounds: axisAlignedBounds(pose.centre, pose.basis, route.cluster, config.safetyMargin)
      }));
    }
    const sweeps = [];
    for (let index = 0; index < poses.length - 1; index += 1) {
      const midpointProgress = (poses[index].progress + poses[index + 1].progress) * 0.5;
      const midpointPose = route.sample(midpointProgress);
      const midpointBounds = axisAlignedBounds(midpointPose.centre, midpointPose.basis, route.cluster, config.safetyMargin);
      sweeps.push(Object.freeze({
        index,
        start: poses[index].time,
        end: poses[index + 1].time,
        bounds: unionBounds(unionBounds(poses[index].bounds, midpointBounds), poses[index + 1].bounds),
        centre: Object.freeze(midpointPose.centre)
      }));
    }
    return Object.freeze({ poses: Object.freeze(poses), sweeps: Object.freeze(sweeps) });
  }

  function centralSweep(sweep, config) {
    return boundsOverlap(sweep.bounds, config.centralBounds);
  }

  function normalizeRequest(request = {}, serial = 0) {
    const routes = Array.from(request.routes || request.candidates || []).map(route => {
      if (route?.sample && route?.cluster) return route;
      return createBezierRoute(route);
    });
    if (!routes.length) throw new TypeError("A route request requires at least one candidate route.");
    const duration = Math.max(250, Number(request.duration) || 7000);
    return Object.freeze({
      id: String(request.id || `route-request-${serial}`),
      priority: Number(request.priority) || 0,
      serial,
      earliestStart: Number.isFinite(Number(request.earliestStart)) ? Number(request.earliestStart) : 0,
      duration,
      routes: Object.freeze(routes),
      sourceRegion: String(request.sourceRegion || request.sourceLock?.region || "unknown"),
      targetRegion: String(request.targetRegion || request.targetLock?.region || "unknown"),
      sourceLock: request.sourceLock || null,
      targetLock: request.targetLock || null,
      sourceReleaseProgress: clamp(request.sourceReleaseProgress ?? 0.22, 0, 1),
      targetAcquireProgress: clamp(request.targetAcquireProgress ?? 0.74, 0, 1),
      maxDelayMs: request.maxDelayMs == null ? null : Math.max(0, Number(request.maxDelayMs) || 0),
      preferredWaitMs: request.preferredWaitMs == null ? null : Math.max(0, Number(request.preferredWaitMs) || 0),
      metadata: Object.freeze({ ...(request.metadata || {}) })
    });
  }

  function createRouteAdmissionPlanner(options = {}) {
    const config = normalizeConfig(options);
    const reservations = new Map();
    const queue = new Map();
    let requestSerial = 0;
    let reservationSerial = 0;

    function normalizeTiming(request, startAt) {
      const endAt = startAt + request.duration;
      const sourceEnd = startAt + request.duration * request.sourceReleaseProgress;
      const targetStart = startAt + request.duration * request.targetAcquireProgress;
      return Object.freeze({ startAt, endAt, sourceEnd, targetStart });
    }

    function buildCandidate(request, route, startAt) {
      const timing = normalizeTiming(request, startAt);
      const sampled = sampleRoute(route, timing.startAt, request.duration, config);
      const sourceLock = normalizeCellLock(request.sourceLock, request.sourceRegion, timing.startAt, timing.sourceEnd);
      const targetLock = normalizeCellLock(request.targetLock, request.targetRegion, timing.targetStart, timing.endAt);
      return Object.freeze({
        requestId: request.id,
        routeId: route.id,
        corridor: route.corridor,
        priority: request.priority,
        serial: request.serial,
        startAt: timing.startAt,
        endAt: timing.endAt,
        duration: request.duration,
        sourceLock,
        targetLock,
        poses: sampled.poses,
        sweeps: sampled.sweeps,
        metadata: request.metadata
      });
    }

    function conflictReason(candidate) {
      for (const active of reservations.values()) {
        if (cellLocksOverlap(candidate.sourceLock, active.sourceLock)
          || cellLocksOverlap(candidate.sourceLock, active.targetLock)
          || cellLocksOverlap(candidate.targetLock, active.sourceLock)
          || cellLocksOverlap(candidate.targetLock, active.targetLock)) {
          return Object.freeze({ reason: "surface-lock", reservationId: active.id });
        }

        for (const first of candidate.sweeps) {
          if (first.end <= active.startAt || first.start >= active.endAt) continue;
          for (const second of active.sweeps) {
            if (!timeOverlap(first, second)) continue;
            if (boundsOverlap(first.bounds, second.bounds)) {
              return Object.freeze({ reason: "swept-volume", reservationId: active.id, candidateSweep: first.index, activeSweep: second.index });
            }
          }
        }
      }

      if (config.maxCentralConcurrent > 0) {
        for (const sweep of candidate.sweeps) {
          if (!centralSweep(sweep, config)) continue;
          const simultaneous = new Set();
          for (const active of reservations.values()) {
            if (active.sweeps.some(other => timeOverlap(sweep, other) && centralSweep(other, config))) {
              simultaneous.add(active.id);
            }
          }
          if (simultaneous.size >= config.maxCentralConcurrent) {
            return Object.freeze({ reason: "central-capacity", reservationIds: Object.freeze([...simultaneous]) });
          }
        }
      }
      return null;
    }

    function attemptOrder(request, now) {
      const earliest = Math.max(now, request.earliestStart);
      const step = config.delayStepMs;
      const preferredWait = request.preferredWaitMs ?? config.preferredWaitMs;
      const maxDelay = request.maxDelayMs ?? config.maxDelayMs;
      const preferred = request.routes[0];
      const alternatives = request.routes.slice(1);
      const attempts = [];

      for (let delay = 0; delay <= Math.min(preferredWait, maxDelay) + EPSILON; delay += step) {
        attempts.push({ route: preferred, startAt: earliest + delay });
      }
      for (let delay = 0; delay <= maxDelay + EPSILON; delay += step) {
        for (const route of alternatives) attempts.push({ route, startAt: earliest + delay });
      }
      for (let delay = Math.max(step, preferredWait + step); delay <= maxDelay + EPSILON; delay += step) {
        attempts.push({ route: preferred, startAt: earliest + delay });
      }
      return attempts;
    }

    function plan(input, now = 0) {
      const request = input?.routes ? normalizeRequest(input, ++requestSerial) : input;
      let lastConflict = null;
      for (const attempt of attemptOrder(request, Number(now) || 0)) {
        const candidate = buildCandidate(request, attempt.route, attempt.startAt);
        const conflict = conflictReason(candidate);
        if (!conflict) {
          return Object.freeze({ accepted: true, request, candidate, delayedBy: candidate.startAt - Math.max(Number(now) || 0, request.earliestStart) });
        }
        lastConflict = conflict;
      }
      return Object.freeze({ accepted: false, request, reason: lastConflict?.reason || "no-safe-route", conflict: lastConflict });
    }

    function reserve(input, now = 0) {
      const result = plan(input, now);
      if (!result.accepted) return result;
      const id = `route-reservation-${++reservationSerial}`;
      const reservation = Object.freeze({ id, ...result.candidate });
      // Atomic commit: no mutable partial reservations are exposed before every
      // surface and swept-volume check has passed.
      reservations.set(id, reservation);
      return Object.freeze({ ...result, reservation });
    }

    function release(id) {
      return reservations.delete(String(id));
    }

    function enqueue(input) {
      const request = normalizeRequest(input, ++requestSerial);
      queue.set(request.id, request);
      return request.id;
    }

    function cancelQueued(id) {
      return queue.delete(String(id));
    }

    function drain(now = 0) {
      const ordered = [...queue.values()].sort((first, second) => (
        second.priority - first.priority || first.serial - second.serial
      ));
      const admitted = [];
      const waiting = [];
      for (const request of ordered) {
        const result = reserve(request, now);
        if (result.accepted) {
          queue.delete(request.id);
          admitted.push(result.reservation);
        } else {
          waiting.push(Object.freeze({ requestId: request.id, reason: result.reason, conflict: result.conflict || null }));
        }
      }
      return Object.freeze({ admitted: Object.freeze(admitted), waiting: Object.freeze(waiting) });
    }

    function inspect(id) {
      return reservations.get(String(id)) || null;
    }

    function snapshot() {
      return Object.freeze({
        version: VERSION,
        reservationCount: reservations.size,
        queuedCount: queue.size,
        reservations: Object.freeze([...reservations.values()]),
        queue: Object.freeze([...queue.values()].sort((a, b) => b.priority - a.priority || a.serial - b.serial)),
        config,
        immutableActiveReservations: true,
        atomicAdmission: true,
        noPrivateAnimationLoop: true
      });
    }

    function clear() {
      const result = Object.freeze({ reservations: reservations.size, queued: queue.size });
      reservations.clear();
      queue.clear();
      return result;
    }

    return Object.freeze({
      version: VERSION,
      plan,
      reserve,
      release,
      enqueue,
      cancelQueued,
      drain,
      inspect,
      snapshot,
      clear
    });
  }

  return Object.freeze({
    VERSION,
    DEFAULT_CONFIG,
    createBezierRoute,
    createRouteAdmissionPlanner
  });
});