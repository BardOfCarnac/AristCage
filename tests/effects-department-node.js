#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeClassList {
  constructor(owner) { this.owner = owner; this.values = new Set(); }
  add(...values) { values.forEach(value => this.values.add(value)); this.owner.className = [...this.values].join(" "); }
  remove(...values) { values.forEach(value => this.values.delete(value)); this.owner.className = [...this.values].join(" "); }
  contains(value) { return this.values.has(value); }
}

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.style = {};
    this.dataset = {};
    this.attributes = new Map();
    this.className = "";
    this.classList = new FakeClassList(this);
    this.textContent = "";
    this.isConnected = true;
    this._rect = { left: 100, top: 80, width: 320, height: 140, right: 420, bottom: 220 };
  }
  append(...nodes) {
    nodes.forEach(node => {
      if (!node) return;
      node.parentElement = this;
      node.isConnected = true;
      this.children.push(node);
    });
  }
  remove() {
    if (this.parentElement) {
      const index = this.parentElement.children.indexOf(this);
      if (index >= 0) this.parentElement.children.splice(index, 1);
    }
    this.parentElement = null;
    this.isConnected = false;
  }
  cloneNode(deep = false) {
    const clone = new FakeElement(this.tagName);
    clone.className = this.className;
    clone.dataset = { ...this.dataset };
    clone._rect = { ...this._rect };
    if (deep) this.children.forEach(child => clone.append(child.cloneNode(true)));
    return clone;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  hasAttribute(name) { return this.attributes.has(name); }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { ...this._rect }; }
  get childElementCount() { return this.children.length; }
}

const document = {
  createElement: tag => new FakeElement(tag),
  createElementNS: (_namespace, tag) => new FakeElement(tag)
};

const windowObject = { document };
global.window = windowObject;
global.document = document;
global.Element = FakeElement;
global.performance = global.performance || require("node:perf_hooks").performance;
global.queueMicrotask = global.queueMicrotask || (callback => Promise.resolve().then(callback));

function load(file) {
  const source = fs.readFileSync(file, "utf8");
  vm.runInThisContext(source, { filename: file });
}

const root = path.resolve(__dirname, "..");
load(path.join(root, "js/departments/effects/effects-manifest.js"));
load(path.join(root, "js/departments/effects/effects-public-names.js"));
load(path.join(root, "js/departments/effects/effects-catalogue-signal.js"));
load(path.join(root, "js/departments/effects/effects-catalogue-fault.js"));
load(path.join(root, "js/departments/effects/effects-catalogue-environment.js"));
load(path.join(root, "js/departments/effects/effects-module.js"));

function createRuntime() {
  const tasks = new Map();
  const listeners = new Set();
  let quality = "full";
  let frame = 0;

  function schedule(record) {
    if (!record.enabled || record.suspended || record.timer || !tasks.has(record.name)) return;
    record.timer = setTimeout(() => {
      record.timer = null;
      if (!tasks.has(record.name) || !record.enabled || record.suspended) return;
      const active = record.callback({
        now: performance.now(),
        delta: record.interval,
        elapsed: performance.now(),
        frame: ++frame,
        quality,
        reducedMotion: quality === "reduced",
        task: record.name,
        group: record.group
      }) === true;
      if (active) schedule(record);
      else record.enabled = false;
    }, 1);
  }

  return {
    register(name, callback, options = {}) {
      const record = {
        name,
        callback,
        group: options.group || "default",
        interval: 1000 / Math.max(1, Number(options.maxFps) || 30),
        enabled: options.enabled !== false,
        suspended: false,
        timer: null
      };
      tasks.set(name, record);
      if (record.enabled && options.wake !== false) schedule(record);
      return {
        wake() { schedule(record); },
        enable() { record.enabled = true; record.suspended = false; schedule(record); },
        disable() { record.enabled = false; if (record.timer) clearTimeout(record.timer); record.timer = null; },
        suspend() { record.suspended = true; if (record.timer) clearTimeout(record.timer); record.timer = null; },
        resume() { record.suspended = false; schedule(record); },
        reset() {},
        unregister() { if (record.timer) clearTimeout(record.timer); tasks.delete(name); }
      };
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setQuality(next) {
      quality = next;
      listeners.forEach(listener => listener({ runtime: { quality } }));
    },
    snapshot: () => ({ quality, taskCount: tasks.size }),
    tasks,
    listeners
  };
}

async function main() {
  const checks = [];
  const check = (name, pass, detail = "") => {
    checks.push({ name, pass: Boolean(pass), detail });
    console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? `: ${detail}` : ""}`);
  };
  const layer = new FakeElement("div");
  const target = new FakeElement("article");
  const runtime = createRuntime();
  const claims = new Set();
  const context = {
    runtime,
    director: {
      envelope(channel, options = {}) {
        return { channel, mode: "ambient", allowed: true, intensity: Number(options.intensity) || 0 };
      },
      claim(channel, options = {}) {
        const record = { channel, intensity: Number(options.intensity) || 0 };
        claims.add(record);
        return { granted: true, channel, intensity: record.intensity, release() { claims.delete(record); return true; } };
      }
    },
    layers: { effects: layer },
    settings: {
      get reducedMotion() { return runtime.snapshot().quality === "reduced"; },
      get quality() { return runtime.snapshot().quality; }
    },
    events: { emit() {} },
    applications: { current: () => "redwire" },
    lifecycle: { releaseOwnedLocks() {} }
  };

  check("manifest slot", window.NCNEffectsDepartmentManifest.replaces === "effects");
  check("single writable layer", JSON.stringify(window.NCNEffectsDepartmentManifest.layers) === '["environment:effects"]');
  check("shared runtime manifest", window.NCNEffectsDepartmentManifest.animationLoop === "shared-runtime");
  check("public effect names", window.NCNEffectsDepartmentEffectNames.length === 13);

  const effects = window.createNCNEffectsDepartment(context);
  await effects.init();
  const required = ["init", "applyProfile", "suspend", "resume", "reset", "destroy", "play", "cancel", "clear", "snapshot"];
  check("required interface", required.every(name => typeof effects[name] === "function"));

  let result = await effects.play("glow-pulse", target, { duration: 80, seed: 1 }).finished;
  check("named playback", result.status === "completed");
  check("completion cleanup", effects.snapshot().temporaryNodes === 0 && effects.snapshot().runtimeTasks === 0);

  const cancelling = effects.play("signal-fault", target, { duration: 500, seed: 2 });
  await new Promise(resolve => setTimeout(resolve, 4));
  effects.cancel(cancelling, "test");
  result = await cancelling.finished;
  check("cancel halfway", result.status === "cancelled");
  check("cancel cleanup", effects.snapshot().temporaryNodes === 0 && effects.snapshot().runtimeTasks === 0);

  for (let index = 0; index < 8; index += 1) {
    effects.play("static-burst", target, { duration: 70, seed: index, concurrency: "replace" });
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  await new Promise(resolve => setTimeout(resolve, 20));
  check("rapid replay cleanup", effects.snapshot().temporaryNodes === 0 && effects.snapshot().runtimeTasks === 0);

  const first = effects.play("relay-scan", target, { duration: 70, channel: "fault", concurrency: "queue", seed: 3 });
  const second = effects.play("relay-scan", target, { duration: 70, channel: "fault", concurrency: "queue", seed: 4 });
  await Promise.all([first.finished, second.finished]);
  check("queue drains", effects.snapshot().queued === 0 && effects.snapshot().runtimeTasks === 0);

  const suspended = effects.play("relay-scan", target, { duration: 240, seed: 5 });
  await new Promise(resolve => setTimeout(resolve, 3));
  effects.suspend("test");
  const suspendedState = effects.snapshot().active[0]?.state;
  await new Promise(resolve => setTimeout(resolve, 6));
  effects.resume("test");
  result = await suspended.finished;
  check("suspend resume", suspendedState === "suspended" && result.status === "completed");

  runtime.setQuality("reduced");
  result = await effects.play("displacement", target, { duration: 90, seed: 6 }).finished;
  check("reduced motion", result.status === "completed" && effects.snapshot().reducedMotion);
  runtime.setQuality("full");

  const sequences = [];
  effects.register("deterministic-probe", {
    channel: "interface",
    duration: 55,
    maxFps: 60,
    create({ random }) {
      const values = [];
      sequences.push(values);
      return { frame() { values.push(Number(random().toFixed(8))); } };
    }
  });
  await effects.play("deterministic-probe", target, { seed: 123, channel: "seed-a" }).finished;
  await effects.play("deterministic-probe", target, { seed: 123, channel: "seed-b" }).finished;
  check("deterministic seed", JSON.stringify(sequences[0]) === JSON.stringify(sequences[1]));

  const activeA = effects.play("particle-emission", target, { duration: 900, channel: "environment", seed: 8 });
  const activeB = effects.play("signal-fault", target, { duration: 900, channel: "fault", seed: 9 });
  await new Promise(resolve => setTimeout(resolve, 3));
  effects.clear();
  await Promise.all([activeA.finished, activeB.finished]);
  check("clear all", effects.snapshot().active.length === 0 && effects.snapshot().runtimeTasks === 0 && effects.snapshot().temporaryNodes === 0);

  await effects.destroy("test");
  const final = effects.snapshot();
  check("destroy cleanup", final.destroyed && final.runtimeTasks === 0 && final.temporaryNodes === 0 && final.listenerCount === 0);
  check("director claims released", claims.size === 0);
  check("runtime tasks removed", runtime.tasks.size === 0);
  check("effects layer empty", layer.childElementCount === 0);
  check("source target untouched", target.children.length === 0 && Object.keys(target.style).length === 0);

  const failed = checks.filter(item => !item.pass);
  if (failed.length) {
    console.error(`\n${failed.length} checks failed.`);
    process.exitCode = 1;
  } else {
    console.log(`\n${checks.length}/${checks.length} checks passed.`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
