"use strict";

const assert = require("node:assert/strict");
const { createBlockRearrangement } = require("../block-rearrangement.js");

function createClock() {
  let current = 0;
  return {
    now: () => current,
    set(value) { current = value; },
    advance(value) { current += value; return current; }
  };
}

function createManualRuntime() {
  const tasks = new Map();
  const listeners = new Set();
  let quality = "full";
  return {
    register(name, callback, options = {}) {
      assert.equal(tasks.has(name), false, `duplicate runtime task ${name}`);
      const task = {
        name,
        group: options.group || "default",
        callback,
        enabled: options.enabled !== false,
        active: options.enabled !== false,
        suspended: false,
        maxFps: options.maxFps || 60
      };
      tasks.set(name, task);
      return {
        wake() { if (task.enabled && !task.suspended) task.active = true; },
        enable() { task.enabled = true; task.suspended = false; task.active = true; },
        disable() { task.enabled = false; task.active = false; },
        suspend() { task.suspended = true; },
        resume() { task.suspended = false; if (task.enabled) task.active = true; },
        setMaxFps(value) { task.maxFps = value; },
        unregister() { tasks.delete(name); },
        snapshot() {
          return Object.freeze({
            name: task.name,
            group: task.group,
            enabled: task.enabled,
            active: task.active,
            suspended: task.suspended,
            maxFps: task.maxFps
          });
        }
      };
    },
    step(now) {
      for (const task of tasks.values()) {
        if (!task.enabled || !task.active || task.suspended) continue;
        task.active = task.callback({
          now,
          delta: 33,
          quality,
          reducedMotion: quality === "reduced",
          group: task.group
        }) === true;
      }
    },
    getQuality() { return quality; },
    setQuality(next) {
      quality = next;
      const payload = Object.freeze({
        type: "quality-change",
        quality,
        runtime: Object.freeze({ quality })
      });
      listeners.forEach(listener => listener(payload));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      return Object.freeze({
        taskCount: tasks.size,
        activeTaskCount: [...tasks.values()].filter(task => task.enabled && task.active && !task.suspended).length,
        quality,
        listenerCount: listeners.size,
        tasks: Object.freeze([...tasks.values()].map(task => Object.freeze({ ...task, callback: undefined })))
      });
    }
  };
}

function makeHandle(id, region, u, v, center, basis, size = 0.5) {
  let pose = null;
  let restoreCount = 0;
  const history = [];
  return {
    id,
    region,
    u,
    v,
    getGeometry: () => ({ center: [...center], basis, size }),
    capture: () => ({ pose }),
    applyPose(next) { pose = next; history.push(next); },
    restore(snapshot) { pose = snapshot?.pose || null; restoreCount += 1; },
    clearPose() { if (pose && pose.thickness <= 0.000001) pose = null; },
    getPose: () => pose,
    getHistory: () => history,
    getRestoreCount: () => restoreCount
  };
}

function createMockChamber() {
  const cell = 0.5;
  const left = [];
  const right = [];
  const rear = [];
  const rows = 10;
  const cols = 16;
  const depth = 16;
  const X = 4;
  const Y = rows * cell * 0.5;
  const near = 2.5;
  const rearZ = near + depth * cell;

  for (let v = 0; v < rows; v += 1) {
    const y = -Y + (v + 0.5) * cell;
    for (let u = 0; u < depth; u += 1) {
      left.push(makeHandle(
        `left-${u}-${v}`, "left-wall", u, v,
        [-X, y, near + (u + 0.5) * cell],
        { u: [0, 0, 1], v: [0, 1, 0], n: [1, 0, 0] }, cell
      ));
      right.push(makeHandle(
        `right-${u}-${v}`, "right-wall", u, v,
        [X, y, rearZ - (u + 0.5) * cell],
        { u: [0, 0, -1], v: [0, 1, 0], n: [-1, 0, 0] }, cell
      ));
    }
    for (let u = 0; u < cols; u += 1) {
      rear.push(makeHandle(
        `rear-${u}-${v}`, "rear-wall", u, v,
        [-X + (u + 0.5) * cell, y, rearZ],
        { u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, -1] }, cell
      ));
    }
  }

  const catalogs = new Map([
    ["left-wall", left],
    ["right-wall", right],
    ["rear-wall", rear]
  ]);
  return {
    getBlocks(region) { return catalogs.get(region) || []; },
    getEffectTarget() { return { kind: "mock-chamber-block", id: "mock-block-target" }; },
    activePoseCount() {
      return [...catalogs.values()].flat().filter(block => block.getPose()).length;
    },
    allHandles() { return [...catalogs.values()].flat(); }
  };
}

function createEffects() {
  const plays = [];
  let cancelled = 0;
  return {
    play(name, target, options) {
      let resolve;
      const finished = new Promise(value => { resolve = value; });
      const record = { name, target, options };
      plays.push(record);
      return {
        finished,
        cancel(reason) { cancelled += 1; resolve({ status: "cancel", reason }); }
      };
    },
    snapshot() { return { plays: [...plays], cancelled }; }
  };
}

function deferred() {
  let resolve;
  const promise = new Promise(value => { resolve = value; });
  return { promise, resolve };
}

async function flushMicrotasks(count = 5) {
  for (let index = 0; index < count; index += 1) await Promise.resolve();
}

async function drive(runtime, clock, duration, step = 40, inspect = null) {
  const start = clock.now();
  for (let elapsed = 0; elapsed <= duration + step * 3; elapsed += step) {
    clock.set(start + elapsed);
    runtime.step(clock.now());
    inspect?.();
    await flushMicrotasks(1);
  }
}

function assertNoInterSequenceOverlap(instance) {
  const geometry = instance.getActiveGeometry();
  for (let firstIndex = 0; firstIndex < geometry.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < geometry.length; secondIndex += 1) {
      const first = geometry[firstIndex];
      const second = geometry[secondIndex];
      if (first.sequenceId === second.sequenceId) continue;
      const delta = first.pose.centre.map((value, index) => value - second.pose.centre[index]);
      const distance = Math.hypot(...delta);
      const threshold = Math.min(first.pose.size, second.pose.size) * 0.98;
      assert.ok(distance >= threshold, `blocks from ${first.sequenceId} and ${second.sequenceId} overlapped`);
    }
  }
}

function createHarness(options = {}) {
  const clock = createClock();
  const runtime = createManualRuntime();
  const chamber = createMockChamber();
  const effects = createEffects();
  const surface = { id: "environment:chamber-motion" };
  let approvalMode = options.approvalMode || "immediate";
  let approvals = [];
  let reducedMotion = Boolean(options.reducedMotion);
  const claims = new Map();
  let claimSerial = 0;

  const director = options.directorMode === "legacy"
    ? {
        approve() {
          if (approvalMode === "immediate") return true;
          const item = deferred();
          approvals.push(item);
          return item.promise;
        },
        currentMode() { return "ambient"; }
      }
    : {
        envelope(channel, request = {}) {
          assert.equal(channel, "chamber");
          const requested = Math.max(0, Math.min(1, Number(request.intensity) || 0));
          return Object.freeze({
            channel,
            mode: "ambient",
            allowed: true,
            intensity: requested,
            reducedMotion: false
          });
        },
        claim(channel, request = {}) {
          assert.equal(channel, "chamber");
          const id = `test-claim-${++claimSerial}`;
          const record = {
            id,
            channel,
            intensity: Math.max(0, Math.min(1, Number(request.intensity) || 0)),
            released: false
          };
          claims.set(id, record);
          return Object.freeze({
            granted: true,
            id,
            channel,
            intensity: record.intensity,
            mode: "ambient",
            release(reason) {
              record.released = true;
              record.reason = reason;
              claims.delete(id);
              return true;
            }
          });
        },
        currentMode() { return "ambient"; },
        snapshot() { return Object.freeze({ mode: "ambient", claims: claims.size }); }
      };

  const blocks = createBlockRearrangement({
    runtime,
    chamber,
    effects,
    visualDirector: director,
    movementSurface: surface,
    now: clock.now,
    getReducedMotion: () => reducedMotion,
    getQuality: () => runtime.getQuality(),
    seed: options.seed ?? "acceptance-seed",
    strictDependencies: true
  });
  return {
    clock, runtime, chamber, effects, surface, director, blocks,
    setApprovalMode(mode) { approvalMode = mode; },
    setReducedMotion(value) { reducedMotion = Boolean(value); },
    setQuality(value) { runtime.setQuality(value); },
    releaseApprovals(value = true) {
      const pending = approvals;
      approvals = [];
      pending.forEach(item => item.resolve(value));
    },
    activeClaimCount() { return claims.size; }
  };
}

async function runDeterministicSelection(seed) {
  const harness = createHarness({ seed });
  const starts = [];
  harness.blocks.addEventListener("blockmove:start", event => starts.push(event.detail));
  await harness.blocks.init();
  await harness.blocks.applyProfile({ effects: {}, clusterSize: [3, 6] }, { reason: "determinism" });
  const movement = harness.blocks.trigger({ approved: true, duration: 800 });
  await flushMicrotasks();
  assert.equal(starts.length, 1);
  harness.blocks.reset({ reason: "determinism-end" });
  await movement;
  await harness.blocks.destroy();
  return starts[0].blockIds;
}

async function main() {
  const originalRaf = global.requestAnimationFrame;
  global.requestAnimationFrame = () => { throw new Error("module created a private animation loop"); };

  const harness = createHarness();
  const { blocks, runtime, chamber, clock, effects } = harness;
  const events = [];
  [
    "blockmove:start", "blockmove:extract", "blockmove:settle",
    "blockmove:complete", "blockmove:cancel", "blockmove:error"
  ].forEach(type => blocks.addEventListener(type, event => events.push({ type, detail: event.detail })));

  await blocks.init();
  assert.equal(blocks.snapshot().initialised, true);
  assert.equal(blocks.snapshot().taskGroup, "chamber");
  assert.equal(blocks.snapshot().noPrivateAnimationLoop, true);
  assert.equal(runtime.snapshot().taskCount, 1);
  assert.equal(runtime.snapshot().activeTaskCount, 0, "runtime task should sleep after init");

  await blocks.applyProfile({
    intensity: 0.65,
    maxActive: 4,
    clusterSize: [1, 7],
    effects: { start: "electrical-disturbance", settle: "glow-pulse" }
  }, { reason: "acceptance" });

  const first = blocks.trigger({
    approved: true,
    region: "left-wall",
    clusterSize: [3, 6],
    duration: 1200
  });
  await flushMicrotasks();
  clock.set(420);
  runtime.step(clock.now());
  assert.equal(blocks.snapshot().activeSequenceCount, 1);
  assert.ok(chamber.activePoseCount() > 0);
  blocks.reset({ reason: "midpoint-reset" });
  const firstResult = await first;
  assert.equal(firstResult.status, "cancel");
  assert.equal(chamber.activePoseCount(), 0);
  assert.equal(blocks.snapshot().reservedRouteCount, 0);

  clock.set(2000);
  const second = blocks.trigger({
    approved: true,
    region: "right-wall",
    clusterSize: [2, 5],
    duration: 900
  });
  await flushMicrotasks();
  clock.set(2260);
  runtime.step(clock.now());
  const geometryBeforeSuspend = JSON.stringify(blocks.getActiveGeometry());
  blocks.suspend("acceptance");
  clock.set(2700);
  runtime.step(clock.now());
  assert.equal(JSON.stringify(blocks.getActiveGeometry()), geometryBeforeSuspend);
  blocks.resume("acceptance");
  await drive(runtime, clock, 1300);
  assert.equal((await second).status, "complete");
  assert.equal(chamber.activePoseCount(), 0);

  clock.set(5000);
  const third = blocks.trigger({ approved: true, region: "side-walls", duration: 1800 });
  await flushMicrotasks();
  clock.set(5600);
  runtime.step(clock.now());
  const settlePromise = blocks.settle({ reason: "acceptance-settle", duration: 260 });
  await drive(runtime, clock, 500, 30);
  const settleResults = await settlePromise;
  assert.equal(settleResults[0].status, "settled");
  assert.equal((await third).status, "settled");
  assert.equal(chamber.activePoseCount(), 0);

  await blocks.applyProfile({ reducedMotionPolicy: "static", clusterSize: [1, 2] }, { reason: "live-accessibility-test" });
  assert.equal(blocks.snapshot().reducedMotion, false);
  assert.equal(blocks.snapshot().performanceMode, "full");

  harness.setReducedMotion(true);
  assert.equal(blocks.snapshot().reducedMotion, true, "live reduced-motion getter did not update");
  clock.set(7000);
  const reduced = blocks.trigger({ approved: true });
  await flushMicrotasks();
  assert.equal(blocks.snapshot().activeSequences[0].reduced, true);
  await drive(runtime, clock, 650, 25);
  assert.equal((await reduced).status, "complete");

  harness.setReducedMotion(false);
  assert.equal(blocks.snapshot().reducedMotion, false, "full mode did not return after live accessibility change");
  clock.set(7800);
  const restoredFull = blocks.trigger({ approved: true, duration: 700 });
  await flushMicrotasks();
  assert.equal(blocks.snapshot().activeSequences[0].reduced, false);
  await drive(runtime, clock, 950, 25);
  assert.equal((await restoredFull).status, "complete");

  harness.setQuality("reduced");
  assert.equal(blocks.snapshot().hostQuality, "reduced");
  assert.equal(blocks.snapshot().performanceMode, "low");
  assert.equal(blocks.snapshot().runtimeTask.maxFps, 20);
  clock.set(9000);
  const lowFirst = blocks.trigger({ approved: true, duration: 600, clusterSize: [1, 1] });
  const lowSecond = blocks.trigger({ approved: true, duration: 600, clusterSize: [1, 1] });
  await flushMicrotasks(15);
  assert.equal(blocks.snapshot().activeSequenceCount, 1, "low host quality should cap concurrency at one");
  assert.equal((await lowSecond).status, "busy");
  await drive(runtime, clock, 850, 25);
  assert.equal((await lowFirst).status, "complete");

  harness.setQuality("full");
  assert.equal(blocks.snapshot().performanceMode, "full");
  assert.equal(blocks.snapshot().runtimeTask.maxFps, 30);
  assert.equal(chamber.activePoseCount(), 0);
  assert.equal(harness.activeClaimCount(), 0, "visual director claims should be released after completion");

  await blocks.destroy("acceptance-destroy");
  assert.equal(runtime.snapshot().taskCount, 0);
  assert.equal(runtime.snapshot().listenerCount, 0, "runtime quality subscription was not removed");
  assert.equal(chamber.activePoseCount(), 0);
  assert.equal(harness.activeClaimCount(), 0);
  assert.equal(blocks.snapshot().destroyed, true);

  const raceHarness = createHarness({
    seed: "approval-race",
    directorMode: "legacy",
    approvalMode: "deferred"
  });
  const raceBlocks = raceHarness.blocks;
  await raceBlocks.init();
  await raceBlocks.applyProfile({ clusterSize: [1, 1], maxActive: 4, effects: {} }, { reason: "race-test" });
  raceHarness.clock.set(10000);
  const race = Array.from({ length: 10 }, () => raceBlocks.trigger({ duration: 1000 }));
  await flushMicrotasks();
  assert.equal(raceBlocks.snapshot().pendingApprovalCount, 10);
  raceHarness.releaseApprovals(true);
  await flushMicrotasks(20);
  assert.equal(raceBlocks.snapshot().activeSequenceCount, 4, "approval race should admit exactly four sequences");
  assertNoInterSequenceOverlap(raceBlocks);
  await drive(raceHarness.runtime, raceHarness.clock, 1400, 30, () => assertNoInterSequenceOverlap(raceBlocks));
  const raceResults = await Promise.all(race);
  assert.equal(raceResults.filter(result => result.status === "complete").length, 4);
  assert.equal(raceResults.filter(result => result.status === "busy").length, 6);
  assert.equal(raceBlocks.snapshot().activeSequenceCount, 0);

  raceHarness.setApprovalMode("deferred");
  const pending = raceBlocks.trigger();
  await flushMicrotasks();
  assert.equal(raceBlocks.snapshot().pendingApprovalCount, 1);
  await raceBlocks.destroy("pending-approval-destroy");
  raceHarness.releaseApprovals(true);
  const pendingResult = await pending;
  assert.equal(pendingResult.status, "cancel");
  assert.equal(raceHarness.runtime.snapshot().taskCount, 0);
  assert.equal(raceHarness.chamber.activePoseCount(), 0);

  const selectionA = await runDeterministicSelection("same-seed");
  const selectionB = await runDeterministicSelection("same-seed");
  assert.deepEqual(selectionA, selectionB, "same seed should select the same chamber blocks");

  const effectSnapshot = effects.snapshot();
  assert.ok(effectSnapshot.plays.length >= 2, "declared effects dependency was not used");
  assert.equal(events.some(event => event.type === "blockmove:error"), false);

  global.requestAnimationFrame = originalRaf;
  console.log("PASS: NCN PR86 block rearrangement acceptance test");
  console.log(JSON.stringify({
    eventCount: events.length,
    effectPlayCount: effectSnapshot.plays.length,
    final: blocks.snapshot()
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
