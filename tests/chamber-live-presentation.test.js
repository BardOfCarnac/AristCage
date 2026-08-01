const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const chamberSource = fs.readFileSync(path.resolve(__dirname, "..", "js", "layered-chamber.js"), "utf8");
const cameraSource = fs.readFileSync(path.resolve(__dirname, "..", "js", "chamber-camera.js"), "utf8");

assert.equal(cameraSource.includes("wrapPresentationEntryPoints"), false, "Camera must not wrap chamber lifecycle entry points.");
assert.equal(cameraSource.includes("TRAVEL_DURATION"), false, "Camera must not mirror protected chamber timing constants.");
assert.ok(chamberSource.includes("getPresentationSnapshot"), "Chamber must publish its own presentation snapshot.");
assert.ok(chamberSource.includes("presentationState(now)"), "Chamber publication must derive from its own live choreography state.");

function makeHarness(storedMode = "off", viewport = { width: 1440, height: 900 }) {
  let now = 10_000;
  let stored = storedMode;
  let rafSerial = 0;
  const rafCallbacks = new Map();
  const toggleListeners = new Map();

  const drawingContext = {
    setTransform() {}, clearRect() {}, save() {}, restore() {}, beginPath() {},
    moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc() {}, fillRect() {},
    strokeRect() {}, fillText() {},
    measureText(text) { return { width: String(text || "").length * 7 }; },
    globalCompositeOperation: "source-over", strokeStyle: "", fillStyle: "",
    lineWidth: 1, font: "", textBaseline: "top", textAlign: "start"
  };

  function makeNode(tagName = "div") {
    return {
      tagName: String(tagName).toUpperCase(), id: "", className: "", style: {}, dataset: {},
      classList: { toggle() {}, remove() {}, add() {}, contains() { return false; } },
      append() {}, prepend() {}, remove() {}, setAttribute() {},
      getContext() { return drawingContext; }, querySelector() { return null; },
      querySelectorAll() { return []; }, closest() { return null; },
      addEventListener(type, listener) { toggleListeners.set(type, listener); }
    };
  }

  const toggle = makeNode("button");
  const document = {
    readyState: "complete", documentElement: makeNode("html"), body: makeNode("body"),
    createElement: makeNode,
    querySelector(selector) {
      if (selector === "#layered-chamber-toggle") return toggle;
      if (selector === "#feed") return null;
      return null;
    },
    querySelectorAll() { return []; }, addEventListener() {}
  };

  class MutationObserver { observe() {} disconnect() {} }
  class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  }

  const context = {
    console, document,
    localStorage: {
      getItem() { return stored; },
      setItem(_key, value) { stored = value; }
    },
    performance: { now: () => now },
    innerWidth: viewport.width, innerHeight: viewport.height, devicePixelRatio: 1,
    MutationObserver, CustomEvent,
    getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }),
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame(callback) {
      const id = ++rafSerial;
      rafCallbacks.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) { rafCallbacks.delete(id); },
    setTimeout, clearTimeout
  };
  context.window = context;
  const vmContext = vm.createContext(context);
  vm.runInContext(chamberSource, vmContext, { filename: "layered-chamber.js" });
  vm.runInContext(cameraSource, vmContext, { filename: "chamber-camera.js" });

  return {
    chamber: context.LayeredChamber,
    camera: context.NCNChamberCamera,
    advance(milliseconds) { now += milliseconds; },
    click(event = {}) { toggleListeners.get("click")?.({ shiftKey: false, target: toggle, ...event }); }
  };
}

function assertMonotonic(values, label) {
  for (let index = 1; index < values.length; index += 1) {
    assert.ok(values[index] + 1e-9 >= values[index - 1], `${label} must be monotonic at sample ${index}`);
  }
}

{
  const harness = makeHarness("background");
  const { chamber, camera } = harness;
  assert.equal(typeof chamber.getPresentationSnapshot, "function");

  const initial = chamber.getPresentationSnapshot();
  assert.equal(initial.settled, false, "Stored-mode boot must start live presentation.");
  assert.equal(initial.active, true);
  assert.equal(initial.wallOpen, 0);
  assert.equal(initial.rearDepth, 3.5);

  const wallOpenSamples = [];
  const progressSamples = [];
  for (const offset of [0, 800, 900, 800, 800, 700, 700, 1000]) {
    harness.advance(offset);
    const sample = chamber.getPresentationSnapshot();
    wallOpenSamples.push(sample.wallOpen);
    progressSamples.push(sample.progress);
  }
  assertMonotonic(wallOpenSamples, "wall-open publication");
  assertMonotonic(progressSamples, "presentation progress");

  harness.advance(5_000);
  const settled = chamber.getPresentationSnapshot();
  assert.equal(settled.settled, true);
  assert.equal(settled.wallOpen, 1);
  assert.ok(settled.visibleHalfWidth > initial.visibleHalfWidth);
  assert.equal(settled.rearDepth, 10.5);

  harness.advance(2_000);
  chamber.restart();
  assert.ok(chamber.getPresentationSnapshot().elapsed < 0.001, "Public restart must reset the chamber-owned clock.");

  harness.advance(1_500);
  harness.click({ shiftKey: true });
  assert.ok(chamber.getPresentationSnapshot().elapsed < 0.001, "Shift-restart must reset closure-local chamber state.");

  chamber.setMode(chamber.MODES.OFF, { persist: false });
  const off = chamber.getPresentationSnapshot();
  assert.equal(off.settled, true);
  assert.equal(off.active, false);

  harness.click();
  assert.equal(chamber.getMode(), chamber.MODES.BACKGROUND, "Toolbar enable should enter background mode.");
  assert.ok(chamber.getPresentationSnapshot().elapsed < 0.001, "Toolbar enable must publish a fresh boot.");

  chamber.setMode(chamber.MODES.LAB, { persist: false });
  assert.ok(chamber.getPresentationSnapshot().elapsed < 0.001, "Public setMode restart must publish a fresh boot.");

  const liveCamera = camera.snapshot();
  assert.equal(liveCamera.presentation.source, "layered-chamber");
  assert.equal(liveCamera.presentation.settled, false);

  const beyondRear = liveCamera.apertureAt(liveCamera.presentation.rearDepth + 1);
  assert.ok(beyondRear.width <= 0.002 && beyondRear.height <= 0.002, "Depths beyond the moving rear wall must collapse.");

  const visibleDepth = liveCamera.apertureAt(Math.max(liveCamera.near, liveCamera.presentation.rearDepth - 0.2));
  assert.ok(visibleDepth.width > 1 && visibleDepth.height > 1, "Visible depths must retain a non-zero live aperture.");

  const settledNear = liveCamera.settledApertureAt(liveCamera.near);
  assert.deepEqual(liveCamera.nearAperture, settledNear, "nearAperture must remain the settled layout contract.");

  chamber.setMode(chamber.MODES.OFF, { persist: false });
  const fallbackCamera = camera.snapshot();
  assert.equal(fallbackCamera.presentation.source, "settled-fallback");
  assert.equal(fallbackCamera.presentation.settled, true);
  assert.deepEqual(fallbackCamera.nearAperture, fallbackCamera.settledApertureAt(fallbackCamera.near));
}

{
  const mobile = makeHarness("background", { width: 390, height: 844 });
  const initialCamera = mobile.camera.snapshot();
  const initialNear = initialCamera.nearAperture;
  mobile.advance(10_000);
  const settledCamera = mobile.camera.snapshot();
  assert.deepEqual(settledCamera.nearAperture, initialNear, "Mobile settled near aperture must remain stable across boot.");
  assert.equal(settledCamera.presentation.settled, true);
}

console.log("LayeredChamber publishes one authoritative live presentation and the camera consumes it without mirrored choreography.");
