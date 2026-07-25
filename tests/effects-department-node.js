#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const removedEffectSnapshots = [];

class FakeClassList {
  constructor(owner) { this.owner = owner; this.values = new Set(); }
  add(...values) { values.forEach(value => this.values.add(value)); this.owner.className = [...this.values].join(" "); }
  remove(...values) { values.forEach(value => this.values.delete(value)); this.owner.className = [...this.values].join(" "); }
  contains(value) { return this.values.has(value); }
}

function serialiseElement(element) {
  return {
    tagName: element.tagName,
    className: element.className,
    dataset: { ...element.dataset },
    style: { ...element.style },
    attributes: Object.fromEntries(element.attributes),
    children: element.children.map(serialiseElement)
  };
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
    this.hidden = false;
    this.isConnected = true;
    this.namespaceURI = null;
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
    if (this.dataset?.ncnEffectNode === "1") removedEffectSnapshots.push(serialiseElement(this));
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
  createElementNS: (namespace, tag) => {
    const element = new FakeElement(tag);
    element.namespaceURI = namespace;
    return element;
  }
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
        resume() { record.enabled = true; record.suspended = false; schedule(record); },
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

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const effectNodes = layer => layer.children.filter(child => child.dataset?.ncnEffectNode === "1");
const latestEffectNode = layer => effectNodes(layer).at(-1) || null;

async function main() {
  const checks = [];
  const check = (name, pass, detail = "") => {
    checks.push({ name, pass: Boolean(pass), detail });
    console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? `: ${detail}` : ""}`);
  };

  const layer = new FakeElement("div");
  layer.className = "host-effects-layer";
  layer.style.position = "absolute";
  layer.style.zIndex = "14";
  layer.dataset.hostOwned = "true";
  const originalLayerState = JSON.stringify({ className: layer.className, style: layer.style, dataset: layer.dataset });
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
  effects.applyProfile({ enabled: true, ambient: true, interaction: true, intensity: 1 }, { application: "redwire", reason: "test" });
  const required = ["init", "applyProfile", "suspend", "resume", "reset", "destroy", "play", "cancel", "clear", "snapshot"];
  check("required interface", required.every(name => typeof effects[name] === "function"));
  check("canonical registry locked", effects.snapshot().registryLocked && typeof effects.register === "undefined");
  check("host layer geometry untouched", originalLayerState === JSON.stringify({ className: layer.className, style: layer.style, dataset: layer.dataset }));

  let result = await effects.play("glow-pulse", target, { duration: 80, seed: 1 }).finished;
  check("named playback", result.status === "completed");
  check("completion cleanup", effects.snapshot().temporaryNodes === 0 && effects.snapshot().runtimeTasks === 0);

  const cancelling = effects.play("signal-fault", target, { duration: 500, seed: 2 });
  await sleep(4);
  effects.cancel(cancelling, "test");
  result = await cancelling.finished;
  check("cancel halfway", result.status === "cancelled");
  check("cancel cleanup", effects.snapshot().temporaryNodes === 0 && effects.snapshot().runtimeTasks === 0);

  for (let index = 0; index < 8; index += 1) {
    effects.play("static-burst", target, { duration: 70, seed: index, concurrency: "replace" });
    await sleep(1);
  }
  await sleep(20);
  check("rapid replay cleanup", effects.snapshot().temporaryNodes === 0 && effects.snapshot().runtimeTasks === 0);

  const first = effects.play("relay-scan", target, { duration: 70, channel: "fault", concurrency: "queue", seed: 3 });
  const second = effects.play("relay-scan", target, { duration: 70, channel: "fault", concurrency: "queue", seed: 4 });
  await Promise.all([first.finished, second.finished]);
  check("queue drains", effects.snapshot().queued === 0 && effects.snapshot().runtimeTasks === 0);

  const suspendedEffect = effects.play("relay-scan", target, { duration: 260, seed: 5, purpose: "required" });
  await sleep(3);
  effects.suspend("test");
  const suspensionNodes = effectNodes(layer);
  const claimsDuringSuspend = claims.size;
  const blockedDuringSuspend = effects.play("light-flash", target, { duration: 80, purpose: "required" });
  const blockedResult = await blockedDuringSuspend.finished;
  const nodesAfterBlockedPlay = effectNodes(layer).length;
  check("suspend hides active output", suspensionNodes.length > 0 && suspensionNodes.every(node => node.hidden));
  check("suspend releases claims", claimsDuringSuspend === 0);
  check("play while suspended creates no work", blockedResult.reason === "suspended" && nodesAfterBlockedPlay === suspensionNodes.length && claims.size === 0);
  effects.resume("test");
  check("resume reveals active output", effectNodes(layer).every(node => !node.hidden));
  result = await suspendedEffect.finished;
  check("suspend resume completion", result.status === "completed");

  const ambient = effects.play("particle-emission", target, { duration: 500, purpose: "ambient", seed: 7 });
  const interaction = effects.play("glow-pulse", target, { duration: 500, purpose: "interaction", seed: 8 });
  await sleep(3);
  effects.applyProfile({ enabled: true, ambient: false, interaction: false, intensity: 1 }, { application: "dripfeed", reason: "profile-test" });
  const [ambientResult, interactionResult] = await Promise.all([ambient.finished, interaction.finished]);
  const ignoredAmbient = await effects.play("particle-emission", target, { duration: 80, purpose: "ambient" }).finished;
  const ignoredInteraction = await effects.play("glow-pulse", target, { duration: 80, purpose: "interaction" }).finished;
  const requiredResult = await effects.play("light-flash", target, { duration: 80, purpose: "required" }).finished;
  check("profile clears disallowed active work", ambientResult.status === "cancelled" && interactionResult.status === "cancelled");
  check("profile rejects disallowed requests", ignoredAmbient.reason === "profile-ambient-disabled" && ignoredInteraction.reason === "profile-interaction-disabled");
  check("required purpose survives profile suppression", requiredResult.status === "completed");
  effects.applyProfile({ enabled: true, ambient: true, interaction: true, intensity: 1 }, { application: "redwire", reason: "restore" });

  const dynamic = effects.play("light-flash", target, {
    duration: 3000,
    intensity: 0.05,
    purpose: "required",
    concurrency: "merge",
    seed: 9
  });
  await sleep(2);
  const beforeOpacity = Number(latestEffectNode(layer)?.style.opacity || 0);
  const merged = effects.play("light-flash", target, {
    duration: 3000,
    intensity: 1,
    purpose: "required",
    concurrency: "merge",
    seed: 10
  });
  await sleep(2);
  const afterMergeOpacity = Number(latestEffectNode(layer)?.style.opacity || 0);
  const mergedIntensity = effects.snapshot().active.find(item => item.id === dynamic.id)?.intensity || 0;
  dynamic.setIntensity(0.01, "attenuation-test");
  await sleep(2);
  const afterAttenuationOpacity = Number(latestEffectNode(layer)?.style.opacity || 0);
  const attenuatedIntensity = effects.snapshot().active.find(item => item.id === dynamic.id)?.intensity || 0;
  check("merge reuses and strengthens active effect", merged === dynamic && mergedIntensity > 0.9 && afterMergeOpacity > beforeOpacity);
  check("active attenuation reaches visual output", attenuatedIntensity < 0.02 && afterAttenuationOpacity < afterMergeOpacity);
  dynamic.cancel("dynamic-test-complete");
  await dynamic.finished;

  runtime.setQuality("reduced");
  result = await effects.play("displacement", target, { duration: 90, seed: 11, purpose: "required" }).finished;
  check("reduced motion", result.status === "completed" && effects.snapshot().reducedMotion);
  runtime.setQuality("full");

  removedEffectSnapshots.length = 0;
  await effects.play("static-burst", target, { duration: 90, seed: 123, channel: "seed-a", purpose: "required" }).finished;
  const firstSeededSnapshot = removedEffectSnapshots.at(-1);
  await effects.play("static-burst", target, { duration: 90, seed: 123, channel: "seed-b", purpose: "required" }).finished;
  const secondSeededSnapshot = removedEffectSnapshots.at(-1);
  check("deterministic seed", JSON.stringify(firstSeededSnapshot) === JSON.stringify(secondSeededSnapshot));

  const activeA = effects.play("particle-emission", target, { duration: 900, channel: "environment", seed: 12, purpose: "required" });
  const activeB = effects.play("signal-fault", target, { duration: 900, channel: "fault", seed: 13, purpose: "required" });
  await sleep(3);
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
  check("host layer still untouched after destroy", originalLayerState === JSON.stringify({ className: layer.className, style: layer.style, dataset: layer.dataset }));

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
