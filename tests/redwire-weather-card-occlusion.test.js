const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "..", "js", "redwire-weather-card-occlusion.js"), "utf8");

assert.equal(source.includes("requestAnimationFrame"), false, "Card composition must not create a private frame loop.");
assert.equal(source.includes("setInterval"), false, "Card composition must not create an interval.");
assert.equal(source.includes("setWind"), false, "Integration must not own Weather wind policy.");
assert.ok(source.includes("subscribeAfterRender"), "The bridge must consume Weather's completed frame publication.");
assert.ok(source.includes("renderForeground"), "Heavy mist must use Weather's exact-depth foreground renderer.");
assert.ok(source.includes("destination-out"), "Rear Weather must be subtracted beneath Optical plates.");
assert.ok(source.includes("destination-in"), "The foreground pass must be softly constrained to plate regions.");

const listeners = new Map();
const subscriptions = [];
const baseDrawCalls = [];
const foregroundCalls = [];
const maskCalls = [];
const foregroundOptions = [];
const createdCanvases = [];
let application = "redwire";
let preset = "heavy-mist";

const plateRect = Object.freeze({ left: 24, top: 110, right: 364, bottom: 290, width: 340, height: 180 });
const canvasRect = Object.freeze({ left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844 });

const plateItem = { classList: { contains: () => false } };
const plate = {
  closest: () => plateItem,
  getBoundingClientRect: () => plateRect,
  styleState: { display: "block", visibility: "visible", opacity: "1" }
};

function makeContext(log) {
  return {
    globalCompositeOperation: "source-over",
    fillStyle: "",
    filter: "none",
    save() { log.push({ type: "save" }); },
    restore() { log.push({ type: "restore" }); },
    setTransform(...args) { log.push({ type: "setTransform", args }); },
    clearRect(...args) { log.push({ type: "clearRect", args }); },
    beginPath() { log.push({ type: "beginPath" }); },
    roundRect(...args) { log.push({ type: "roundRect", args }); },
    fill() { log.push({ type: "fill", operation: this.globalCompositeOperation }); },
    fillRect(x, y, width, height) {
      log.push({
        type: "fillRect",
        operation: this.globalCompositeOperation,
        fillStyle: this.fillStyle,
        x, y, width, height
      });
    },
    drawImage(...args) {
      log.push({ type: "drawImage", operation: this.globalCompositeOperation, args });
    }
  };
}

const baseContext = makeContext(baseDrawCalls);
const baseCanvas = {
  hidden: false,
  styleState: { display: "block", visibility: "visible", opacity: "1" },
  getBoundingClientRect: () => canvasRect,
  getContext: () => baseContext
};

function makeCanvas() {
  const index = createdCanvases.length;
  const log = index % 2 === 0 ? foregroundCalls : maskCalls;
  const context = makeContext(log);
  const canvas = {
    className: "",
    hidden: false,
    isConnected: false,
    style: {},
    width: 0,
    height: 0,
    setAttribute() {},
    getContext: () => context,
    remove() { this.isConnected = false; },
    context
  };
  createdCanvases.push(canvas);
  return canvas;
}

const depthFrame = {
  renderForeground(context, options) {
    foregroundOptions.push(options);
    context.fillRect(plateRect.left, plateRect.top, 40, 30);
    return 2;
  }
};

const weather = {
  snapshot() {
    return {
      enabled: true,
      preset,
      targetPreset: preset,
      wind: { x: 0, y: 0, z: 0 }
    };
  },
  subscribeAfterRender(listener) {
    let active = true;
    const release = () => {
      active = false;
      return true;
    };
    release.active = () => active;
    subscriptions.push({ listener, release });
    return release;
  },
  getDepthFrame: () => depthFrame
};

const document = {
  documentElement: { clientWidth: 390, clientHeight: 844 },
  body: {
    append(canvas) { canvas.isConnected = true; }
  },
  createElement(tagName) {
    assert.equal(tagName, "canvas");
    return makeCanvas();
  },
  querySelectorAll(selector) {
    if (selector.includes("optical-semantic-item")) return [plate];
    if (selector.includes("ncn-department-weather-canvas")) return [baseCanvas];
    return [];
  }
};

const window = {
  NCNApplications: { current: () => application },
  NCNIntegration: { getService: name => name === "weather" ? weather : null },
  NCNIntegratedDepartments: { ready: async () => true },
  addEventListener(type, listener) { listeners.set(type, listener); }
};

const context = vm.createContext({
  window,
  document,
  console,
  queueMicrotask,
  getComputedStyle: node => node.styleState || node.style || {},
  innerWidth: 390,
  innerHeight: 844,
  devicePixelRatio: 1,
  setImmediate
});
context.globalThis = context;

vm.runInContext(source, context, { filename: "redwire-weather-card-occlusion.js" });

(async () => {
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(subscriptions.length, 1, "The bridge should subscribe after accepted departments are ready.");
  subscriptions[0].listener({ type: "render", depthFrame });

  const rearErase = baseDrawCalls.find(call => call.type === "fillRect");
  assert.deepEqual(rearErase, {
    type: "fillRect",
    operation: "destination-out",
    fillStyle: "rgba(0,0,0,1)",
    x: 24,
    y: 110,
    width: 340,
    height: 180
  }, "Rear Weather must be removed from the exact visible plate rectangle.");

  assert.equal(foregroundOptions.length, 1, "Heavy mist must execute one exact-depth foreground pass.");
  assert.equal(foregroundOptions[0].regions.length, 1);
  assert.equal(foregroundOptions[0].regions[0].nearerThan, 3.35);
  assert.deepEqual(
    JSON.parse(JSON.stringify(foregroundOptions[0].regions[0].polygons[0])),
    [
      { x: 24, y: 110 },
      { x: 364, y: 110 },
      { x: 364, y: 290 },
      { x: 24, y: 290 }
    ],
    "The foreground renderer must receive the real plate polygon."
  );
  assert.equal(foregroundOptions[0].includeAttenuation, false);

  const foregroundCanvas = createdCanvases[0];
  assert.ok(Number(foregroundCanvas.style.zIndex) > 20, "The direct-body foreground layer must sit above the Optical viewer.");
  assert.equal(foregroundCanvas.style.pointerEvents, "none");
  assert.equal(foregroundCanvas.hidden, false);
  assert.ok(
    foregroundCalls.some(call => call.type === "drawImage" && call.operation === "destination-in"),
    "The replayed mist must receive the feathered exact-region mask."
  );

  preset = "mist";
  subscriptions[0].listener({ type: "render", depthFrame });
  assert.equal(foregroundOptions.length, 1, "Ordinary mist must not receive the foreground pass.");
  assert.equal(foregroundCanvas.hidden, true, "Ordinary mist must clear and hide the foreground layer.");

  const firstGeneration = window.NCNRedWireWeatherCardOcclusion.snapshot().foregroundGeneration;
  application = "dripfeed";
  listeners.get("ncn:application-environment-phase")?.({ detail: { phase: "active", next: "dripfeed" } });
  assert.equal(subscriptions[0].release.active(), false, "Leaving RedWire must release the Weather subscription.");
  assert.equal(foregroundCanvas.isConnected, false, "Leaving RedWire must remove the foreground layer.");
  assert.equal(window.NCNRedWireWeatherCardOcclusion.snapshot().weatherPolicyMutation, false);

  application = "redwire";
  preset = "heavy-mist";
  listeners.get("ncn:application-environment-phase")?.({ detail: { phase: "active", next: "redwire" } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(subscriptions.length, 2, "Returning to RedWire must create a fresh subscription.");
  subscriptions[1].listener({ type: "render", depthFrame });
  const renewed = window.NCNRedWireWeatherCardOcclusion.snapshot();
  assert.ok(renewed.foregroundGeneration > firstGeneration, "Returning to RedWire must create a fresh foreground compositor.");
  assert.equal(renewed.lastForegroundPuffs, 2);
  assert.equal(renewed.active, true);

  console.log("RedWire rear Weather occlusion and exact-depth heavy-mist foreground composition satisfy lifecycle and layering contracts.");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
