const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class StyleMap {
  constructor() { this.values = new Map(); }
  setProperty(name, value) { this.values.set(name, String(value)); }
  removeProperty(name) { this.values.delete(name); }
  getPropertyValue(name) { return this.values.get(name) || ''; }
}

class FakeElement {
  constructor(id = '', className = '') {
    this.id = id;
    this.className = className;
    this.dataset = {};
    this.style = new StyleMap();
    this.hidden = false;
    this.isConnected = true;
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.scrollTop = 0;
    this.scrollHeight = 1800;
    this.clientHeight = 520;
    this.offsetHeight = 0;
    this.rect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    this.computedTransform = 'none';
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  append(...nodes) {
    nodes.forEach(node => {
      node.parent = this;
      node.isConnected = true;
      this.children.push(node);
    });
  }
  remove() {
    this.isConnected = false;
    if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this);
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  removeEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    this.listeners.set(type, handlers.filter(item => item !== handler));
  }
  dispatchEvent(event) {
    event.target ||= this;
    (this.listeners.get(event.type) || []).forEach(handler => handler(event));
    return true;
  }
  getBoundingClientRect() { return { ...this.rect }; }
  querySelector(selector) {
    if (selector.startsWith('#')) return this.children.find(child => child.id === selector.slice(1)) || null;
    return null;
  }
}

const rail = new FakeElement('', 'rail');
rail.rect = { left: 0, top: 0, right: 1000, bottom: 64, width: 1000, height: 64 };

const filter = new FakeElement('', 'dripfeed-filter-rail');
filter.rect = { left: 0, top: 68, right: 900, bottom: 106, width: 900, height: 38 };
filter.offsetHeight = 38;

const utility = new FakeElement('', 'dripfeed-utility-rail');
utility.rect = { left: 0, top: 110, right: 900, bottom: 152, width: 900, height: 42 };
utility.offsetHeight = 42;

const stage = new FakeElement('', 'demo-stage');
stage.rect = { left: 80, top: 140, right: 920, bottom: 660, width: 840, height: 520 };
const live = new FakeElement('', 'listing-wall live-wall');
live.rect = { left: 90, top: 170, right: 910, bottom: 900, width: 820, height: 730 };
live.computedTransform = 'matrix(0.98, 0, 0, 0.98, 8, 5)';
const latent = new FakeElement('', 'listing-wall rear-wall');
latent.rect = { left: 104, top: 182, right: 896, bottom: 840, width: 792, height: 658 };
latent.computedTransform = 'matrix(0.94, 0, 0, 0.94, 20, 14)';
let reader = null;

const root = new FakeElement('dripfeed-root', 'dripfeed-root');
root.hidden = false;
root.querySelector = selector => {
  if (selector === '#dripfeed-chamber-occluder') return root.children.find(child => child.id === 'dripfeed-chamber-occluder') || null;
  return null;
};

const documentListeners = new Map();
const document = {
  readyState: 'complete',
  querySelector(selector) {
    if (selector === '#dripfeed-root') return root;
    if (selector === '.rail') return rail;
    return null;
  },
  createElement(tag) { return new FakeElement('', tag); },
  addEventListener(type, handler) { documentListeners.set(type, handler); }
};

const windowListeners = new Map();
const sceneRecords = new Map();
let application = 'dripfeed';
let runtimeCallback = null;
let runtimeSuspended = false;
let runtimeUnregistered = false;
let chamberRefreshes = 0;
let geometryOwner = null;
let depthDormant = false;

const camera = {
  width: 1000,
  height: 800,
  near: 2.5,
  cell: 0.5,
  scaleAt(z) { return this.near / z; },
  apertureAt(z) {
    const focal = 672;
    const halfWidth = 3;
    const halfHeight = 1.5;
    const left = 500 - halfWidth * focal / z;
    const right = 500 + halfWidth * focal / z;
    const top = 400 - halfHeight * focal / z;
    const bottom = 400 + halfHeight * focal / z;
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }
};

const adapter = {
  getSpatialSurfaces() {
    return {
      depthHost: stage,
      live,
      latent,
      reading: reader,
      controls: [filter, utility]
    };
  },
  claimGeometryOwnership(owner) {
    if (geometryOwner && geometryOwner !== owner) return false;
    geometryOwner = owner;
    depthDormant = true;
    return true;
  },
  releaseGeometryOwnership(owner) {
    if (geometryOwner !== owner) return false;
    geometryOwner = null;
    depthDormant = false;
    return true;
  },
  snapshot() {
    return {
      geometryOwner,
      depth: {
        dormant: depthDormant,
        externalOwner: geometryOwner,
        listenersBound: !depthDormant,
        observerConnected: !depthDormant
      }
    };
  }
};

const window = {
  innerWidth: 1000,
  innerHeight: 800,
  NCN_STATE: { activeApp: 'dripfeed' },
  NCNApplications: { current: () => application },
  NCNDripfeed: adapter,
  NCNChamberCamera: { snapshot: () => camera },
  LayeredChamber: { refresh() { chamberRefreshes += 1; } },
  NCNViewerRuntime: {
    register(name, callback, options) {
      assert.equal(name, 'dripfeed:chamber-geometry');
      assert.equal(options.group, 'application');
      runtimeCallback = callback;
      return {
        wake() { if (!runtimeSuspended) callback(); },
        resume() { runtimeSuspended = false; callback(); },
        suspend() { runtimeSuspended = true; },
        unregister() { runtimeUnregistered = true; }
      };
    }
  },
  NCNScene: {
    register(name, resolver, options) { sceneRecords.set(name, { resolver, options }); },
    unregisterOwner(owner) {
      for (const [name, record] of [...sceneRecords]) {
        if (record.options.owner === owner) sceneRecords.delete(name);
      }
    }
  },
  addEventListener(type, handler) {
    if (!windowListeners.has(type)) windowListeners.set(type, []);
    windowListeners.get(type).push(handler);
  },
  removeEventListener(type, handler) {
    const handlers = windowListeners.get(type) || [];
    windowListeners.set(type, handlers.filter(item => item !== handler));
  },
  dispatchEvent(event) {
    (windowListeners.get(event.type) || []).forEach(handler => handler(event));
    return true;
  }
};

class CustomEvent {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
}

function getComputedStyle(element) {
  return { transform: element.computedTransform || 'none' };
}

Object.assign(global, { window, document, CustomEvent, getComputedStyle });
window.CustomEvent = CustomEvent;

const source = fs.readFileSync('js/dripfeed-chamber-integration.js', 'utf8');
assert.equal(source.includes('requestAnimationFrame('), false, 'integration must not create a private animation loop');
assert.equal(source.includes('setInterval('), false, 'integration must not create a private interval');
assert.equal(source.includes('__dripfeedApp'), false, 'integration must not reach through the public adapter');
assert.equal(source.includes("querySelectorAll('.listing-tile"), false, 'integration must not manipulate individual tiles');

vm.runInThisContext(source, { filename: 'js/dripfeed-chamber-integration.js' });
const bridge = window.NCNDripfeedChamber;
assert.ok(bridge, 'bridge must publish NCNDripfeedChamber');
assert.equal(typeof runtimeCallback, 'function', 'bridge must register one sleeping shared-runtime task');

let state = bridge.snapshot();
assert.equal(state.active, true);
assert.equal(state.integrated, true);
assert.equal(state.adapter.geometryOwner, bridge.OWNER);
assert.equal(state.adapter.depth.dormant, true, 'interim depth adapter must be dormant');
assert.equal(state.adapter.depth.listenersBound, false);
assert.equal(state.adapter.depth.observerConnected, false);
assert.ok(state.geometry, 'active Dripfeed must receive chamber geometry');
assert.ok(state.geometry.leadingClearance > 0, 'initial publication must reserve scrollable foreground clearance');
assert.ok(state.geometry.planes.reader.z < state.geometry.lineZ);
assert.ok(state.geometry.lineZ < state.geometry.planes.live.z);
assert.ok(state.geometry.planes.live.z < state.geometry.planes.latent.z);
assert.ok(state.geometry.planes.reader.scale > 1, 'reader projection must be forward');
assert.ok(state.geometry.planes.live.scale < 1, 'live projection must be behind the line');
assert.ok(state.geometry.planes.latent.scale < state.geometry.planes.live.scale, 'latent projection must be behind live');
assert.ok(root.querySelector('#dripfeed-chamber-occluder'));
assert.ok(sceneRecords.has('dripfeed:live'));
assert.ok(sceneRecords.has('dripfeed:latent'));
assert.ok(sceneRecords.has('dripfeed:depth-host'));
assert.ok(chamberRefreshes > 0);

root.dispatchEvent(new CustomEvent('dripfeed:open-transmission-start', { detail: { token: 7, postId: 'A' } }));
root.dispatchEvent(new CustomEvent('dripfeed:open-transmission-start', { detail: { token: 8, postId: 'B' } }));
root.dispatchEvent(new CustomEvent('dripfeed:open-transmission-cancelled', { detail: { token: 7, postId: 'A' } }));
state = bridge.snapshot();
assert.equal(state.readingState, 'opening', 'stale cancellation must not clear a newer opening');
assert.equal(state.pendingToken, 8);

reader = new FakeElement('', 'reader-card');
reader.rect = { left: 160, top: 120, right: 840, bottom: 700, width: 680, height: 580 };
reader.computedTransform = 'matrix(1.08, 0, 0, 1.08, 0, 0)';
root.dispatchEvent(new CustomEvent('dripfeed:open-transmission-ready', {
  detail: { token: 8, postId: 'B', readingSurface: reader }
}));
state = bridge.snapshot();
assert.equal(state.readingState, 'ready');
assert.equal(state.readyToken, 8);
assert.equal(sceneRecords.get('dripfeed:reading').resolver(), reader);
root.dispatchEvent(new CustomEvent('dripfeed:close-transmission', { detail: { token: 8, postId: 'B' } }));
assert.equal(bridge.snapshot().readingState, 'idle');

application = 'redwire';
root.hidden = true;
window.dispatchEvent(new CustomEvent('ncn:application-change', { detail: { name: 'redwire', previous: 'dripfeed' } }));
state = bridge.snapshot();
assert.equal(state.active, false);
assert.equal(state.rootEventsBound, false, 'publication listeners must be removed while inactive');
assert.equal(state.integrated, false);
assert.equal(sceneRecords.size, 0);
assert.equal(geometryOwner, null);

root.dispatchEvent(new CustomEvent('dripfeed:open-transmission-start', { detail: { token: 99, postId: 'hidden' } }));
assert.equal(bridge.snapshot().pendingToken, null, 'hidden Dripfeed events must not mutate chamber state');

window.dispatchEvent(new CustomEvent('ncn:application-environment-phase', {
  detail: { phase: 'empty', previous: 'redwire', next: 'dripfeed' }
}));
assert.equal(geometryOwner, bridge.OWNER, 'geometry ownership must be preclaimed before Dripfeed activation');
application = 'dripfeed';
root.hidden = false;
window.dispatchEvent(new CustomEvent('ncn:application-change', { detail: { name: 'dripfeed', previous: 'redwire' } }));
assert.equal(bridge.snapshot().active, true);
assert.ok(sceneRecords.has('dripfeed:live'));

bridge.destroy();
assert.equal(runtimeUnregistered, true);
assert.equal(sceneRecords.size, 0);
assert.equal(root.querySelector('#dripfeed-chamber-occluder'), null);

console.log('Dripfeed chamber integration: camera planes, geometry handoff, stale tokens and inactive cleanup verified.');
