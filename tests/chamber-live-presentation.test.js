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
assert.equal(/\bLAB\b/.test(chamberSource), false, "The archived Chamber Lab mode must not return to production.");
assert.equal(chamberSource.includes("MutationObserver"), false, "The production shell must not observe the RedWire feed.");
assert.equal(/addEventListener\(["'](?:wheel|touchstart|touchmove|touchend|touchcancel)["']/.test(chamberSource), false,
  "The production shell must not install Chamber Lab interaction listeners.");

function makeHarness(viewport = { width: 1440, height: 900 }) {
  let now = 10_000;
  let rafSerial = 0;
  let removedStorageKey = null;
  const rafCallbacks = new Map();

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
      addEventListener() {}
    };
  }

  const document = {
    readyState: "complete", documentElement: makeNode("html"), body: makeNode("body"),
    createElement: makeNode,
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {}
  };

  class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  }

  const context = {
    console, document,
    localStorage: {
      getItem() { return null; },
      setItem() {},
      removeItem(key) { removedStorageKey = key; }
    },
    performance: { now: () => now },
    innerWidth: viewport.width, innerHeight: viewport.height, devicePixelRatio: 1,
    CustomEvent,
    getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }),
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
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
    removedStorageKey: () => removedStorageKey,
    advance(milliseconds) { now += milliseconds; }
  };
}

function assertMonotonic(values, label) {
  for (let index = 1; index < values.length; index += 1) {
    assert.ok(values[index] + 1e-9 >= values[index - 1], `${label} must be monotonic at sample ${index}`);
  }
}

{
  const harness = makeHarness();
  const { chamber, camera } = harness;

  assert.deepEqual(Object.values(chamber.MODES).sort(), ["background", "off"]);
  assert.equal(chamber.getMode(), chamber.MODES.OFF, "Production chamber must begin explicitly disabled.");
  assert.equal(harness.removedStorageKey(), "ncn-layered-chamber",
    "Initialization must clear the obsolete persisted Chamber Lab selection.");

  const initialOff = chamber.getPresentationSnapshot();
  assert.equal(initialOff.settled, true, "Disabled chamber must publish settled layout geometry.");
  assert.equal(initialOff.active, false);

  chamber.setMode(chamber.MODES.BACKGROUND);
  assert.equal(chamber.getMode(), chamber.MODES.BACKGROUND);
  assert.equal(chamber.isMounted(), true);

  const initial = chamber.getPresentationSnapshot();
  assert.equal(initial.settled, false, "Explicit Background activation must start live presentation.");
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
  assert.ok(chamber.getPresentationSnapshot().elapsed < 0.001,
    "Public restart must reset the chamber-owned clock.");

  harness.advance(1_500);
  chamber.injectEnergy(0.2, 0.5);
  assert.equal(chamber.getPresentationSnapshot().active, true,
    "Energy injection must keep the production shell publication active.");

  const liveCamera = camera.snapshot();
  assert.equal(liveCamera.presentation.source, "layered-chamber");
  assert.equal(liveCamera.presentation.settled, false);

  const beyondRear = liveCamera.apertureAt(liveCamera.presentation.rearDepth + 1);
  assert.ok(beyondRear.width <= 0.002 && beyondRear.height <= 0.002,
    "Depths beyond the moving rear wall must collapse.");

  const visibleDepth = liveCamera.apertureAt(
    Math.max(liveCamera.near, liveCamera.presentation.rearDepth - 0.2)
  );
  assert.ok(visibleDepth.width > 1 && visibleDepth.height > 1,
    "Visible depths must retain a non-zero live aperture.");

  const settledNear = liveCamera.settledApertureAt(liveCamera.near);
  assert.deepEqual(liveCamera.nearAperture, settledNear,
    "nearAperture must remain the settled layout contract.");

  chamber.setMode(chamber.MODES.OFF);
  assert.equal(chamber.isMounted(), false);
  const off = chamber.getPresentationSnapshot();
  assert.equal(off.settled, true);
  assert.equal(off.active, false);

  const fallbackCamera = camera.snapshot();
  assert.equal(fallbackCamera.presentation.source, "settled-fallback");
  assert.equal(fallbackCamera.presentation.settled, true);
  assert.deepEqual(
    fallbackCamera.nearAperture,
    fallbackCamera.settledApertureAt(fallbackCamera.near)
  );

  chamber.enable();
  assert.equal(chamber.getMode(), chamber.MODES.BACKGROUND,
    "Public enable must activate the production Background shell.");
  assert.ok(chamber.getPresentationSnapshot().elapsed < 0.001,
    "Public enable must publish a fresh boot.");
  chamber.disable();
  assert.equal(chamber.getMode(), chamber.MODES.OFF);
}

{
  const mobile = makeHarness({ width: 390, height: 844 });
  mobile.chamber.enable();
  const initialCamera = mobile.camera.snapshot();
  const initialNear = initialCamera.nearAperture;
  mobile.advance(10_000);
  const settledCamera = mobile.camera.snapshot();
  assert.deepEqual(settledCamera.nearAperture, initialNear,
    "Mobile settled near aperture must remain stable across boot.");
  assert.equal(settledCamera.presentation.settled, true);
}

console.log("Production LayeredChamber publishes one authoritative OFF/BACKGROUND presentation and the camera consumes it without Chamber Lab or mirrored choreography.");
