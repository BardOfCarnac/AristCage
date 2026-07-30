const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const listeners = new Map();
const frames = new Map();
let frameSequence = 0;
const responsiveEvents = [];
let observer = null;
let currentApplication = 'dripfeed';

function addListener(type, handler) {
  if (!listeners.has(type)) listeners.set(type, []);
  listeners.get(type).push(handler);
}

function removeListener(type, handler) {
  listeners.set(type, (listeners.get(type) || []).filter(candidate => candidate !== handler));
}

function emit(type, detail = {}) {
  for (const handler of listeners.get(type) || []) handler({ type, detail });
}

function flushFrames() {
  const pending = [...frames.entries()];
  frames.clear();
  for (const [, callback] of pending) callback(performance.now());
}

class FakeResizeObserver {
  constructor(callback) {
    this.callback = callback;
    this.connected = false;
    observer = this;
  }
  observe() { this.connected = true; }
  disconnect() { this.connected = false; }
  trigger() { if (this.connected) this.callback([]); }
}

const root = {
  hidden: false,
  columns: 3,
  __dripfeedApp: null,
  querySelector() { return null; },
  dispatchEvent(event) {
    responsiveEvents.push({ type: event.type, detail: event.detail });
    return true;
  }
};

const app = {
  renderCount: 0,
  depth: {
    claimExternalGeometry() { return true; },
    releaseExternalGeometry() { return true; },
    snapshot() { return {}; }
  },
  render() { this.renderCount += 1; },
  destroy() { this.destroyed = true; }
};
root.__dripfeedApp = app;

const document = {
  querySelector(selector) {
    if (selector === '#dripfeed-root') return root;
    return null;
  }
};

const window = {
  NCNApplications: { current: () => currentApplication },
  NCN_STATE: { activeApp: 'dripfeed' },
  Dripfeed: {
    mechanics: {
      dispatch(target, name, detail) {
        target.dispatchEvent(new CustomEvent(`dripfeed:${name}`, { detail }));
      }
    },
    depth: { PLANE_DEFINITIONS: [] }
  },
  addEventListener: addListener,
  removeEventListener: removeListener
};

class CustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

Object.assign(global, {
  window,
  document,
  CustomEvent,
  ResizeObserver: FakeResizeObserver,
  getComputedStyle: element => ({
    getPropertyValue(name) {
      return name === '--cols' ? String(element.columns) : '';
    }
  }),
  requestAnimationFrame(callback) {
    const id = ++frameSequence;
    frames.set(id, callback);
    return id;
  },
  cancelAnimationFrame(id) {
    frames.delete(id);
  }
});

const source = fs.readFileSync('js/dripfeed-adapter.js', 'utf8');
vm.runInThisContext(source, { filename: 'js/dripfeed-adapter.js' });

const adapter = window.NCNDripfeed;
assert.ok(adapter, 'adapter must publish NCNDripfeed');
assert.equal(adapter.snapshot().responsiveColumns.effective, 3);
assert.equal(adapter.snapshot().responsiveColumns.tracking, true);
assert.equal(adapter.snapshot().responsiveColumns.observerConnected, true);

root.columns = 2;
emit('resize');
flushFrames();
assert.equal(app.renderCount, 1, 'column transition must replan exactly once');
assert.equal(adapter.snapshot().responsiveColumns.effective, 2);
assert.deepEqual(responsiveEvents.at(-1), {
  type: 'dripfeed:responsive-columns-change',
  detail: { previous: 3, columns: 2, reason: 'viewport-resize', rendered: true }
});

emit('resize');
flushFrames();
assert.equal(app.renderCount, 1, 'unchanged effective columns must not replan');

root.columns = 4;
observer.trigger();
flushFrames();
assert.equal(app.renderCount, 2, 'ResizeObserver column transition must replan');
assert.equal(adapter.snapshot().responsiveColumns.effective, 4);

currentApplication = 'redwire';
window.NCN_STATE.activeApp = 'redwire';
root.hidden = true;
root.columns = 2;
emit('resize');
flushFrames();
assert.equal(app.renderCount, 2, 'hidden Dripfeed must not render');
assert.equal(adapter.snapshot().responsiveColumns.effective, 2, 'hidden width changes should still be remembered');

adapter.destroy();
root.columns = 3;
emit('resize');
flushFrames();
assert.equal(app.renderCount, 2, 'destroy must unbind responsive tracking');
assert.equal(observer.connected, false, 'destroy must disconnect the responsive observer');

console.log('Dripfeed responsive columns: effective-count changes replan once and cleanup is complete.');
