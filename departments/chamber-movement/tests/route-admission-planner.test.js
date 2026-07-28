"use strict";

const assert = require("node:assert/strict");
const {
  createBezierRoute,
  createRouteAdmissionPlanner
} = require("../route-admission-planner.js");

const BASIS_X = Object.freeze({ u: [0, 0, 1], v: [0, 1, 0], n: [1, 0, 0] });
const BASIS_Z = Object.freeze({ u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, -1] });
const SMALL = Object.freeze({ width: 0.32, height: 0.32, depth: 0.32 });

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
    sourceBasis: options.sourceBasis || BASIS_X,
    targetBasis: options.targetBasis || BASIS_Z,
    cluster: options.cluster || SMALL
  });
}

function request(id, routes, options = {}) {
  return {
    id,
    routes,
    duration: options.duration || 1200,
    earliestStart: options.earliestStart || 0,
    priority: options.priority || 0,
    maxDelayMs: options.maxDelayMs,
    preferredWaitMs: options.preferredWaitMs,
    sourceRegion: options.sourceRegion || "left-wall",
    targetRegion: options.targetRegion || "rear-wall",
    sourceLock: options.sourceLock || { region: options.sourceRegion || "left-wall", minU: 0, maxU: 1, minV: 0, maxV: 1 },
    targetLock: options.targetLock || { region: options.targetRegion || "rear-wall", minU: 6, maxU: 7, minV: 2, maxV: 3 }
  };
}

(function crossingRoutesRequireDifferentTimeWindows() {
  const planner = createRouteAdmissionPlanner({
    sampleIntervalMs: 80,
    delayStepMs: 200,
    preferredWaitMs: 0,
    maxDelayMs: 0,
    safetyMargin: 0.08
  });
  const horizontal = straightRoute("horizontal", [-2, 0, 5], [2, 0, 5]);
  const vertical = straightRoute("vertical", [0, -2, 5], [0, 2, 5]);
  const first = planner.reserve(request("first", [horizontal], { duration: 1000 }), 0);
  assert.equal(first.accepted, true);

  const sameTime = planner.reserve(request("same-time", [vertical], {
    duration: 1000,
    sourceLock: { region: "right-wall", minU: 8, maxU: 9, minV: 0, maxV: 1 },
    targetLock: { region: "rear-wall", minU: 10, maxU: 11, minV: 4, maxV: 5 },
    maxDelayMs: 0
  }), 0);
  assert.equal(sameTime.accepted, false);
  assert.equal(sameTime.reason, "swept-volume");
  assert.equal(planner.snapshot().reservationCount, 1, "failed admission must not leave partial locks");

  const later = planner.reserve(request("later", [vertical], {
    duration: 1000,
    earliestStart: 1100,
    sourceLock: { region: "right-wall", minU: 8, maxU: 9, minV: 0, maxV: 1 },
    targetLock: { region: "rear-wall", minU: 10, maxU: 11, minV: 4, maxV: 5 }
  }), 0);
  assert.equal(later.accepted, true, "the same physical crossing is safe after the first reservation ends");
})();

(function sourceAndDestinationLocksAreAtomic() {
  const planner = createRouteAdmissionPlanner({ maxDelayMs: 0, preferredWaitMs: 0 });
  const upper = straightRoute("upper", [-2, 1.8, 5], [2, 1.8, 5]);
  const lower = straightRoute("lower", [-2, -1.8, 5], [2, -1.8, 5]);
  assert.equal(planner.reserve(request("locked", [upper]), 0).accepted, true);

  const surfaceConflict = planner.reserve(request("surface-conflict", [lower], {
    sourceLock: { region: "left-wall", minU: 1, maxU: 2, minV: 1, maxV: 2 },
    targetLock: { region: "rear-wall", minU: 12, maxU: 13, minV: 6, maxV: 7 },
    maxDelayMs: 0
  }), 0);
  assert.equal(surfaceConflict.accepted, false);
  assert.equal(surfaceConflict.reason, "surface-lock");
  assert.equal(planner.snapshot().reservationCount, 1);
})();

(function preferredCorridorMayWaitBeforeAnImmediateAlternative() {
  const planner = createRouteAdmissionPlanner({
    sampleIntervalMs: 60,
    delayStepMs: 240,
    preferredWaitMs: 720,
    maxDelayMs: 1600,
    safetyMargin: 0.04
  });
  const preferred = straightRoute("preferred", [-2, 0, 5], [2, 0, 5], { corridor: "upper-centre" });
  const alternative = straightRoute("alternative", [-2, 2, 7], [2, 2, 7], { corridor: "rear-centre" });
  const blocker = straightRoute("blocker", [0, -2, 5], [0, 2, 5]);
  assert.equal(planner.reserve(request("blocker", [blocker], {
    duration: 600,
    sourceRegion: "right-wall",
    sourceLock: { region: "right-wall", minU: 8, maxU: 9, minV: 0, maxV: 1 },
    targetLock: { region: "rear-wall", minU: 10, maxU: 11, minV: 5, maxV: 6 }
  }), 0).accepted, true);

  const planned = planner.plan(request("choice", [preferred, alternative], {
    duration: 500,
    sourceLock: { region: "left-wall", minU: 4, maxU: 5, minV: 5, maxV: 6 },
    targetLock: { region: "rear-wall", minU: 13, maxU: 14, minV: 2, maxV: 3 }
  }), 0);
  assert.equal(planned.accepted, true);
  assert.equal(planned.candidate.corridor, "upper-centre");
  assert.ok(planned.candidate.startAt > 0 && planned.candidate.startAt <= 720, "planner should briefly wait for the preferred lane before taking an alternative");
})();

(function centralCapacityLimitsReadableConcurrency() {
  const planner = createRouteAdmissionPlanner({
    sampleIntervalMs: 80,
    maxDelayMs: 0,
    preferredWaitMs: 0,
    maxCentralConcurrent: 2,
    safetyMargin: 0.02,
    centralBounds: { min: [-1.2, -1.2, 4], max: [1.2, 1.2, 8] }
  });
  const routes = [
    straightRoute("centre-a", [-0.9, -2, 5], [-0.9, 2, 5], { cluster: { width: 0.14, height: 0.14, depth: 0.14 } }),
    straightRoute("centre-b", [0, -2, 6.2], [0, 2, 6.2], { cluster: { width: 0.14, height: 0.14, depth: 0.14 } }),
    straightRoute("centre-c", [0.9, -2, 7.4], [0.9, 2, 7.4], { cluster: { width: 0.14, height: 0.14, depth: 0.14 } })
  ];
  const locks = index => ({
    sourceLock: { region: `source-${index}`, minU: 0, maxU: 0, minV: 0, maxV: 0 },
    targetLock: { region: `target-${index}`, minU: 0, maxU: 0, minV: 0, maxV: 0 }
  });
  assert.equal(planner.reserve(request("central-a", [routes[0]], locks(0)), 0).accepted, true);
  assert.equal(planner.reserve(request("central-b", [routes[1]], locks(1)), 0).accepted, true);
  const third = planner.reserve(request("central-c", [routes[2]], { ...locks(2), maxDelayMs: 0 }), 0);
  assert.equal(third.accepted, false);
  assert.equal(third.reason, "central-capacity");
})();

(function queuedRequestsUsePriorityAndNeverPreempt() {
  const planner = createRouteAdmissionPlanner({ maxDelayMs: 0, preferredWaitMs: 0, safetyMargin: 0.02 });
  const low = straightRoute("low", [-3, -2, 8], [-3, 2, 8]);
  const high = straightRoute("high", [3, -2, 8], [3, 2, 8]);
  planner.enqueue(request("low-priority", [low], {
    priority: 5,
    sourceLock: { region: "low-source", minU: 0, maxU: 0, minV: 0, maxV: 0 },
    targetLock: { region: "low-target", minU: 0, maxU: 0, minV: 0, maxV: 0 }
  }));
  planner.enqueue(request("high-priority", [high], {
    priority: 50,
    sourceLock: { region: "high-source", minU: 0, maxU: 0, minV: 0, maxV: 0 },
    targetLock: { region: "high-target", minU: 0, maxU: 0, minV: 0, maxV: 0 }
  }));
  const drained = planner.drain(0);
  assert.deepEqual(drained.admitted.map(item => item.requestId), ["high-priority", "low-priority"]);
  assert.equal(planner.snapshot().reservationCount, 2);

  const firstReservation = drained.admitted[0];
  assert.equal(planner.inspect(firstReservation.id)?.requestId, "high-priority");
  assert.equal(planner.release(firstReservation.id), true);
  assert.equal(planner.snapshot().reservationCount, 1, "releasing one route must not disturb another active reservation");
})();

(function snapshotsExposeDevVisualisationSamplesAndCleanup() {
  const planner = createRouteAdmissionPlanner();
  const route = straightRoute("inspection", [-2, 0, 4], [0, 0, 8]);
  const result = planner.reserve(request("inspection", [route]), 100);
  assert.equal(result.accepted, true);
  const reservation = planner.inspect(result.reservation.id);
  assert.ok(reservation.poses.length > 10);
  assert.ok(reservation.sweeps.length > 9);
  assert.equal(Object.isFrozen(reservation), true);
  assert.equal(planner.snapshot().atomicAdmission, true);
  assert.equal(planner.snapshot().noPrivateAnimationLoop, true);
  assert.deepEqual(planner.clear(), { reservations: 1, queued: 0 });
  assert.equal(planner.snapshot().reservationCount, 0);
})();

console.log("PASS: time-aware chamber route admission remains collision-free, atomic and queueable");