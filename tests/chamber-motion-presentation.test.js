"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class FakeContext {
  constructor(name) {
    this.name = name;
    this.operations = [];
    this.globalCompositeOperation = "source-over";
    this.fillStyle = "";
    this.strokeStyle = "";
    this.lineWidth = 1;
  }
  setTransform(...args) { this.operations.push(["setTransform", ...args]); }
  clearRect(...args) { this.operations.push(["clearRect", ...args]); }
  beginPath() { this.operations.push(["beginPath"]); }
  moveTo(...args) { this.operations.push(["moveTo", ...args]); }
  lineTo(...args) { this.operations.push(["lineTo", ...args]); }
  closePath() { this.operations.push(["closePath"]); }
  fill() { this.operations.push(["fill", this.globalCompositeOperation, this.fillStyle]); }
  stroke() { this.operations.push(["stroke", this.globalCompositeOperation, this.strokeStyle, this.lineWidth]); }
  save() { this.operations.push(["save"]); }
  restore() { this.operations.push(["restore"]); this.globalCompositeOperation = "source-over"; }
}

class FakeElement {
  constructor(tag = "div", className = "") {
    this.tagName = tag.toUpperCase();
    this.className = className;
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.isConnected = true;
    this.parentElement = null;
    this.width = 0;
    this.height = 0;
  }
  append(child) {
    child.parentElement = this;
    child.isConnected = true;
    this.children.push(child);
  }
  remove() { this.isConnected = false; }
  setAttribute() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }; }
}

class FakeCanvas extends FakeElement {
  constructor(className = "") {
    super("canvas", className);
    this.context = new FakeContext(className || "canvas");
  }
  getContext() { return this.context; }
}

const motionSurface = new FakeElement("div", "ncn-environment-layer--chamber-motion");
const originalCanvas = new FakeCanvas("ncn-chamber-motion-canvas");
originalCanvas.dataset.ncnChamberMotionCanvas = "production";
motionSurface.append(originalCanvas);

const weather = Object.fromEntries(["far", "rear", "middle", "near"].map(key => {
  const layer = new FakeElement("div", `ncn-environment-layer--weather-${key}`);
  const canvas = new FakeCanvas(`ncn-department-weather-canvas ncn-department-weather-${key}`);
  layer.append(canvas);
  return [key, canvas];
}));

const allElements = [motionSurface, originalCanvas, ...Object.values(weather)];
const documentElement = { dataset: {} };
const document = {
  documentElement,
  createElement(tag) { return tag === "canvas" ? new FakeCanvas() : new FakeElement(tag); },
  querySelector(selector) {
    if (selector === ".ncn-environment-layer--chamber-motion") return motionSurface;
    if (selector === "canvas[data-ncn-chamber-motion-canvas='production']") return originalCanvas;
    const weatherMatch = selector.match(/^\.ncn-department-weather-(far|rear|middle|near)$/);
    if (weatherMatch) return weather[weatherMatch[1]];
    return allElements.find(element => element.className === selector.slice(1)) || null;
  }
};

const camera = {
  width: 800,
  height: 600,
  near: 2.5,
  cell: 0.5,
  focalLength: 504,
  project(x, y, z) { return { x: 400 + x * 504 / z, y: 300 - y * 504 / z }; }
};

let geometry = [{
  sequenceId: "sequence-1",
  blockId: "left-2-2",
  phase: "travelling-out",
  pose: {
    centre: [-1.1, -1.7, 5.2],
    basis: { u: [0, 0, 1], v: [0, 1, 0], n: [1, 0, 0] },
    size: 0.5,
    thickness: 0.5,
    localCell: [0, 0],
    clusterCells: [[0, 0], [1, 0]]
  }
}, {
  sequenceId: "sequence-1",
  blockId: "left-3-2",
  phase: "travelling-out",
  pose: {
    centre: [-1.1, -1.7, 5.7],
    basis: { u: [0, 0, 1], v: [0, 1, 0], n: [1, 0, 0] },
    size: 0.5,
    thickness: 0.5,
    localCell: [1, 0],
    clusterCells: [[0, 0], [1, 0]]
  }
}];

const serviceListeners = new Map();
const service = {
  getActiveGeometry: () => geometry,
  addEventListener(type, listener) {
    const list = serviceListeners.get(type) || [];
    list.push(listener);
    serviceListeners.set(type, list);
  },
  removeEventListener(type, listener) {
    const list = serviceListeners.get(type) || [];
    serviceListeners.set(type, list.filter(item => item !== listener));
  }
};

const tasks = new Map();
const runtime = {
  register(name, callback, options) {
    const task = { name, callback, options, active: true, unregistered: false };
    tasks.set(name, task);
    return {
      wake() { task.active = true; },
      unregister() { task.unregistered = true; tasks.delete(name); },
      snapshot: () => ({ name, group: options.group, priority: options.priority, maxFps: options.maxFps })
    };
  }
};

const windowTarget = new EventTarget();
Object.assign(windowTarget, {
  devicePixelRatio: 1,
  innerWidth: 800,
  innerHeight: 600,
  NCNChamberCamera: { snapshot: () => camera },
  NCNViewerRuntime: runtime,
  NCNIntegratedDepartments: { ready: async () => true },
  NCNIntegration: { getService: name => name === "chamber-motion" ? service : null },
  addEventListener: windowTarget.addEventListener.bind(windowTarget),
  removeEventListener: windowTarget.removeEventListener.bind(windowTarget),
  dispatchEvent: windowTarget.dispatchEvent.bind(windowTarget)
});

global.window = windowTarget;
global.document = document;
global.Element = FakeElement;
global.performance = { now: () => 1000 };
global.console = console;

const source = fs.readFileSync("js/chamber-motion-presentation.js", "utf8");
vm.runInThisContext(source, { filename: "js/chamber-motion-presentation.js" });

(async () => {
  await windowTarget.NCNChamberPresentation.ready();
  assert.equal(originalCanvas.style.visibility, "hidden", "the old differently styled canvas must be suppressed");
  assert.equal(tasks.size, 2, "presentation and occlusion must use two shared-runtime tasks");

  [...tasks.values()].sort((a, b) => b.options.priority - a.options.priority).forEach(task => task.callback({ now: 1000, delta: 33 }));

  const wallCanvas = motionSurface.children.find(child => child.dataset.ncnChamberMotionCanvas === "wall-matched");
  assert.ok(wallCanvas, "wall-matched canvas must be mounted");
  assert.equal(wallCanvas.hidden, false, "active geometry must reveal the wall-matched canvas");

  const fills = wallCanvas.context.operations.filter(operation => operation[0] === "fill");
  const strokes = wallCanvas.context.operations.filter(operation => operation[0] === "stroke");
  assert.ok(fills.some(operation => operation[2] === "rgba(0,0,0,1)"), "moving faces must use the opaque chamber-black fill");
  assert.ok(strokes.length > 0, "moving faces must receive chamber optical strokes");
  assert.equal(strokes.some(operation => operation[2] === "rgba(255,62,40,0.46)"), false, "the old privileged bright edge must not be used");
  assert.ok(strokes.some(operation => operation[1] === "lighter"), "the settled chamber's low optical glow pass must be retained");

  for (const key of ["far", "rear", "middle"]) {
    assert.ok(
      weather[key].context.operations.some(operation => operation[0] === "fill" && operation[1] === "destination-out"),
      `${key} Weather must be cut out behind moving solids`
    );
  }
  assert.equal(
    weather.near.context.operations.some(operation => operation[0] === "fill" && operation[1] === "destination-out"),
    false,
    "near Weather remains available in front of moving solids"
  );

  const active = windowTarget.NCNChamberPresentation.snapshot();
  assert.equal(active.style, "layered-chamber-settled-optical");
  assert.equal(active.occlusionMode, "weather-behind-silhouette");
  assert.equal(active.noPrivateAnimationLoop, true);
  assert.equal(active.lastGeometryCount, 2);
  assert.ok(active.renderedFaceCount > 0);
  assert.equal(active.maskedCanvasCount, 3);

  geometry = [];
  [...tasks.values()].forEach(task => task.callback({ now: 1033, delta: 33 }));
  assert.equal(wallCanvas.hidden, true, "presentation must sleep and hide after geometry settles");

  assert.equal(windowTarget.NCNChamberPresentation.destroy("test"), true);
  assert.equal(originalCanvas.style.visibility, "", "destroy must restore the incumbent canvas presentation");
  assert.equal(tasks.size, 0, "destroy must unregister both runtime tasks");
  console.log("PASS: wall-matched chamber presentation and Weather occlusion restoration");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
