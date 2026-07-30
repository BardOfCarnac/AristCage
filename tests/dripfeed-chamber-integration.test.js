const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class StyleMap {
  constructor() { this.values = new Map(); }
  setProperty(name, value) { this.values.set(name, String(value)); }
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
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  append(...nodes) { nodes.forEach(node => { node.parent = this; node.isConnected = true; this.children.push(node); }); }
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
const live = new FakeElement('', 'listing-wall live-wall');
const latent = new FakeElement('', 'listing-wall rear-wall');
let reader = null;

const root = new FakeElement('dripfeed-root', 'dripfeed-root');
root.hidden = false;
root.querySelector = selector => {
  if (selector === '.dripfeed-filter-rail') return filter;
  if (selector === '.dripfeed-utility-rail') return utility;
  if (selector === '[data-depth-host]') return stage;
  if (selector === '#dripfeed-chamber-occluder') return root.children.find(child => child.id === 'dripfeed-chamber-occluder') || null;
  if (selector === '[data-reader-target] .reader-card') return reader;
  return null;
};

const viewer = new FakeElement('', 'viewer');
const documentListeners = new Map();
const document = {
  readyState: 'complete',
  documentElement: { dataset: { ncnApp: 'dripfeed' } },
  querySelector(selector) {
    if (selector === '#dripfeed-root') return root;
    if (selector === '.rail') return rail;
    if (selector === '.viewer') return viewer;
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

const app = {
  getSpatialSurfaces() { return { live, latent, reading: reader }; }
};
root.__dripfeedApp = app;

const window = {
  innerWidth: 1000,
  innerHeight: 800,
  NCN_STATE: { activeApp: 'dripfeed' },
  NCNApplications: { current: () => application },
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
      for (const [name, record] of [...sceneRecords]) if (record.options.owner === owner) sceneRecords.delete(name);
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

Object.assign(global, { window, document, CustomEvent });
window.CustomEvent = CustomEvent;

const source = fs.readFileSync('js/dripfeed-chamber-integration.js', 'utf8');
assert.equal(source.includes('requestAnimationFrame('), false, 'integration must not create a private animation loop');
assert.equal(source.includes('setInterval('), false, 'integration must not create a private interval');
assert.equal(source.includes("querySelectorAll('.listing-tile"), false, 'integration must not manipulate individual tiles');

vm.runInThisContext(source, { filename: 'js/dripfeed-chamber-integration.js' });
const bridge = window.NCNDripfeedChamber;
assert.ok(bridge, 'bridge must publish NCNDripfeedChamber');
assert.equal(typeof runtimeCallback, 'function', 'bridge must register one sleeping shared-runtime task');

let state = bridge.snapshot();
assert.equal(state.active, true);
assert.equal(state.integrated, true);
assert.ok(state.geometry, 'initial active Dripfeed must receive chamber geometry');
assert.ok(state.geometry.aperture.top >= 159, 'selected grid line must clear the foreground controls');
assert.ok(state.geometry.readerZ < state.geometry.lineZ, 'reader must be in front of the occluding grid line');
assert.ok(state.geometry.lineZ < state.geometry.liveZ, 'live wall must sit behind the occluding grid line');
assert.ok(state.geometry.liveZ < state.geometry.latentZ, 'latent wall must sit behind the live wall');
assert.ok(state.geometry.rearScale > 0.9 && state.geometry.rearScale < 1, 'latent separation must remain shallow');
assert.equal(root.dataset.chamberReadingState, 'idle');
assert.ok(root.querySelector('#dripfeed-chamber-occluder'), 'host occluder must be mounted');
assert.ok(sceneRecords.has('dripfeed:live'));
assert.ok(sceneRecords.has('dripfeed:latent'));
assert.ok(sceneRecords.has('dripfeed:occluder'));
assert.ok(chamberRefreshes > 0, 'geometry publication must refresh the chamber');

const start = new CustomEvent('dripfeed:open-transmission-start', { detail: { token: 7, postId: 'A' } });
root.dispatchEvent(start);
assert.equal(bridge.snapshot().readingState, 'opening');
root.dispatchEvent(new CustomEvent('dripfeed:open-transmission-cancelled', { detail: { token: 7, postId: 'A' } }));
assert.equal(bridge.snapshot().readingState, 'idle');

reader = new FakeElement('', 'reader-card');
root.dispatchEvent(new CustomEvent('dripfeed:open-transmission-start', { detail: { token: 8, postId: 'B' } }));
root.dispatchEvent(new CustomEvent('dripfeed:open-transmission-ready', { detail: { token: 8, postId: 'B', readingSurface: reader } }));
state = bridge.snapshot();
assert.equal(state.readingState, 'ready');
assert.equal(state.readyToken, 8);
assert.equal(sceneRecords.get('dripfeed:reading').resolver(), reader);
root.dispatchEvent(new CustomEvent('dripfeed:close-transmission', { detail: { token: 8, postId: 'B' } }));
assert.equal(bridge.snapshot().readingState, 'idle');
assert.equal(bridge.snapshot().readyToken, null);

stage.scrollTop = 244;
assert.equal(bridge.snapshot().scrollTop, 244, 'native aperture scrolling must be observable without a private transform loop');

application = 'redwire';
root.hidden = true;
window.dispatchEvent(new CustomEvent('ncn:application-change', { detail: { name: 'redwire', previous: 'dripfeed' } }));
state = bridge.snapshot();
assert.equal(state.active, false);
assert.equal(state.integrated, false);
assert.equal(sceneRecords.size, 0, 'application switch must release every scene registration');
assert.equal(root.querySelector('#dripfeed-chamber-occluder').hidden, true, 'occluder must be hidden outside Dripfeed');

application = 'dripfeed';
root.hidden = false;
window.dispatchEvent(new CustomEvent('ncn:application-change', { detail: { name: 'dripfeed', previous: 'redwire' } }));
assert.equal(bridge.snapshot().active, true);
assert.ok(sceneRecords.has('dripfeed:live'), 'scene registrations must renew on return');

bridge.destroy();
assert.equal(runtimeUnregistered, true, 'destroy must unregister the shared-runtime task');
assert.equal(sceneRecords.size, 0, 'destroy must leave no scene ownership');
assert.equal(root.querySelector('#dripfeed-chamber-occluder'), null, 'destroy must remove the host occluder');

console.log('Dripfeed chamber integration: geometry, plane order, reader lifecycle, scroll and cleanup verified.');
