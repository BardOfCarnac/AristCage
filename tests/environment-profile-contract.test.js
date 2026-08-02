const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

let domReady = null;
let diagnosticsMounted = false;
let mistClick = null;
let serviceEnabled = false;
const appliedProfiles = [];

const readout = { profile: { textContent: '' }, state: { textContent: '' } };
const inertButton = { addEventListener() {} };
const mistButton = {
  addEventListener(type, handler) {
    if (type === 'click') mistClick = handler;
  }
};
const diagnosticsPanel = {
  querySelector(selector) {
    if (selector === '.diagnostics-environment-section') return diagnosticsMounted ? {} : null;
    if (selector === '.diagnostics-title') {
      return { insertAdjacentHTML() { diagnosticsMounted = true; } };
    }
    if (selector === '[data-debug-environment="realign"]') return inertButton;
    if (selector === '[data-debug-environment="block"]') return inertButton;
    if (selector === '[data-debug-environment="mist"]') return mistButton;
    if (selector === '[data-debug-environment-profile]') return readout.profile;
    if (selector === '[data-debug-viewer-state]') return readout.state;
    return null;
  }
};

global.window = global;
global.requestAnimationFrame = callback => { callback(); return 1; };
global.CustomEvent = class CustomEvent {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
};
global.addEventListener = () => {};
global.dispatchEvent = () => true;
global.MutationObserver = class MutationObserver {
  constructor(callback) { this.callback = callback; }
  observe() {}
  disconnect() {}
};
global.document = {
  readyState: 'loading',
  documentElement: { dataset: {} },
  body: {},
  addEventListener(type, handler) {
    if (type === 'DOMContentLoaded') domReady = handler;
  },
  querySelector(selector) {
    return selector === '.diagnostics-panel' ? diagnosticsPanel : null;
  }
};

global.NCNViewerLifecycle = {
  STATES: { READY: 'ready' },
  transition() {},
  current() { return 'ready'; }
};
global.NCNEnvironmentHost = { ensure() {} };
global.LayeredChamber = {
  MODES: { BACKGROUND: 'background', OFF: 'off' },
  getMode() { return 'background'; },
  mount() {},
  refresh() {}
};
global.NCNChamberCamera = { snapshot() { return null; } };
global.OpticalProjection = { enable() {}, disable() {}, refresh() {} };
global.HeuristicRangefinder = { disable() {} };
global.NCNRealignment = { run() { return false; } };
global.NCNEffects = { setProfile() {} };
global.NCNChamberMotion = { disable() {}, configure() {} };
global.NCNWeatherRenderer = { disable() {}, configure() {}, setWeather() {} };
global.NCNApplications = { current() { return 'redwire'; } };
global.NCNIntegration = {
  isReady() { return true; },
  applyProfile(name, profile, meta = {}) {
    appliedProfiles.push({ name, profile: { ...profile }, meta: { ...meta } });
    return true;
  },
  getService(name) {
    if (name !== 'weather') return null;
    return { snapshot() { return { desired: { enabled: serviceEnabled } }; } };
  }
};

const source = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'environment-manager.js'), 'utf8');
vm.runInThisContext(source, { filename: 'js/environment-manager.js' });

assert.ok(global.NCNEnvironment, 'Environment manager must publish NCNEnvironment.');

const redwireWeather = global.NCNEnvironment.profile('redwire').weather;
assert.deepEqual(redwireWeather, {
  enabled: true,
  preset: 'mist',
  intensity: 0.46,
  mist: 0.46,
  wind: 0,
  quality: 'auto',
  seed: 2045,
  readingAttenuation: 0.48,
  controlAttenuation: 0.68
});
assert.equal(Object.isFrozen(redwireWeather), true, 'RedWire Weather profile must remain immutable.');

const dripfeedWeather = global.NCNEnvironment.profile('dripfeed').weather;
assert.deepEqual(dripfeedWeather, {
  enabled: false,
  preset: 'clear',
  intensity: 0,
  mist: 0,
  wind: 0,
  quality: 'auto',
  seed: 2045
});

assert.equal(typeof domReady, 'function', 'Environment manager must defer mounting until DOM readiness.');
domReady();

const initialWeather = appliedProfiles.find(entry => entry.name === 'weather');
assert.deepEqual(initialWeather?.profile, redwireWeather,
  'Initial RedWire activation must route the published Weather profile through Integration.');
assert.equal(typeof mistClick, 'function', 'Diagnostics Mist control must be mounted.');

appliedProfiles.length = 0;
serviceEnabled = false;
mistClick();
assert.deepEqual(appliedProfiles.find(entry => entry.name === 'weather')?.profile, redwireWeather,
  'Diagnostics must reproduce the complete enabled RedWire Weather profile.');

appliedProfiles.length = 0;
serviceEnabled = true;
mistClick();
assert.deepEqual(appliedProfiles.find(entry => entry.name === 'weather')?.profile, {
  enabled: false,
  preset: 'clear',
  intensity: 0,
  mist: 0,
  wind: 0,
  quality: 'auto',
  seed: 2045,
  readingAttenuation: 0.48,
  controlAttenuation: 0.68
}, 'Diagnostics must disable Weather cleanly while retaining the next enabled profile policy.');

assert.equal(readout.profile.textContent, 'REDWIRE');
assert.equal(readout.state.textContent, 'READY');

console.log('Integration owns the RedWire broad-bank Weather profile, canonical quality/seed, diagnostics reproduction and Dripfeed-disabled policy.');
