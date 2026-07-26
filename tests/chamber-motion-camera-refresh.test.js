"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class FakeElement {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.isConnected = false;
  }
  append(child) { this.children.push(child); child.isConnected = true; }
  remove() { this.isConnected = false; }
  setAttribute() {}
  getBoundingClientRect() {
    return { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 };
  }
}

class FakeCanvas extends FakeElement {
  constructor() {
    super("canvas");
    this.width = 0;
    this.height = 0;
    this.context = {
      setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
      closePath() {}, fill() {}, stroke() {}, save() {}, restore() {},
      globalCompositeOperation: "source-over", fillStyle: "", strokeStyle: "", lineWidth: 1
    };
  }
  getContext() { return this.context; }
}

const windowTarget = new EventTarget();
windowTarget.devicePixelRatio = 1;
windowTarget.NCNApplications = { current: () => "redwire" };
windowTarget.addEventListener = windowTarget.addEventListener.bind(windowTarget);
windowTarget.removeEventListener = windowTarget.removeEventListener.bind(windowTarget);
windowTarget.dispatchEvent = windowTarget.dispatchEvent.bind(windowTarget);

global.window = windowTarget;
global.Element = FakeElement;
global.document = {
  createElement: tag => tag === "canvas" ? new FakeCanvas() : new FakeElement(tag),
  documentElement: { dataset: {} }
};
global.performance = { now: () => 1000 };

let cameraWidth = 800;
function cameraSnapshot() {
  return {
    width: cameraWidth,
    height: 600,
    cell: 0.5,
    near: 2.5,
    finalHalfWidth: 3,
    halfWidth: 2,
    halfHeight: 2,
    project(x, y, z) { return { x: 400 + x * 100 / z, y: 300 - y * 100 / z }; }
  };
}
windowTarget.NCNChamberCamera = { snapshot: cameraSnapshot };

vm.runInThisContext(fs.readFileSync("js/chamber-motion-adapter.js", "utf8"), {
  filename: "js/chamber-motion-adapter.js"
});

const surface = new FakeElement();
surface.isConnected = true;
const adapter = windowTarget.NCNChamberMotionAdapter.create({
  layers: { chamberMotion: surface },
  chamber: { getCameraSnapshot: cameraSnapshot }
});

let geometryChanges = 0;
adapter.subscribeGeometryChange(() => { geometryChanges += 1; });
const block = adapter.getBlocks("left-wall")[0];
const captured = block.capture();
const geometry = block.getGeometry();
block.applyPose({
  centre: geometry.center,
  basis: geometry.basis,
  size: geometry.size,
  thickness: geometry.size * 0.25,
  phase: "extracting"
});

const before = adapter.snapshot();
cameraWidth = 780;
windowTarget.dispatchEvent(new Event("ncn:chamber-camera-change"));

setImmediate(() => {
  const during = adapter.snapshot();
  assert.equal(geometryChanges, 0, "camera refresh must not invalidate active movement geometry");
  assert.equal(during.activePoseCount, 1, "active pose must survive camera refresh");
  assert.equal(during.capturedHandleCount, 1, "captured handle must remain active");
  assert.equal(during.geometryVersion, before.geometryVersion, "catalogue rebuild must be deferred");
  assert.equal(during.deferredGeometryRefresh, true);

  block.restore(captured);
  block.clearPose();
  setImmediate(() => {
    const after = adapter.snapshot();
    assert.equal(after.activePoseCount, 0);
    assert.equal(after.capturedHandleCount, 0);
    assert.equal(after.deferredGeometryRefresh, false);
    assert.equal(geometryChanges, 1, "deferred geometry refresh should publish after settlement");
    assert.equal(after.geometryVersion, before.geometryVersion + 1);
    adapter.destroy();
    console.log("PASS: active chamber movement survives camera refresh and rebuilds after settlement");
  });
});
