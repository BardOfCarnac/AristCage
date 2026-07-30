const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'redwire-weather-card-occlusion.js'), 'utf8');

assert.equal(source.includes('requestAnimationFrame'), false, 'Card occlusion must not create a private frame loop.');
assert.equal(source.includes('setInterval'), false, 'Card occlusion must not create an interval.');
assert.ok(source.includes('subscribeAfterRender'), 'Card occlusion must consume Weather completed-frame publication.');
assert.ok(source.includes('destination-out'), 'Card occlusion must subtract Weather rather than redesign Optical plates.');

const listeners = new Map();
const subscriptions = [];
const drawCalls = [];
let application = 'redwire';

const plateRect = Object.freeze({ left: 24, top: 110, right: 364, bottom: 290, width: 340, height: 180 });
const canvasRect = Object.freeze({ left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844 });

const plateItem = {
  classList: { contains: () => false }
};
const plate = {
  closest: () => plateItem,
  getBoundingClientRect: () => plateRect,
  styleState: { display: 'block', visibility: 'visible', opacity: '1' }
};

const drawingContext = {
  globalCompositeOperation: 'source-over',
  fillStyle: '',
  save() {},
  restore() {},
  fillRect(x, y, width, height) {
    drawCalls.push({
      operation: this.globalCompositeOperation,
      fillStyle: this.fillStyle,
      x,
      y,
      width,
      height
    });
  }
};

const canvas = {
  hidden: false,
  styleState: { display: 'block', visibility: 'visible', opacity: '1' },
  getBoundingClientRect: () => canvasRect,
  getContext: () => drawingContext
};

const weather = {
  subscribeAfterRender(listener) {
    let active = true;
    const release = () => {
      active = false;
      return true;
    };
    release.active = () => active;
    subscriptions.push({ listener, release });
    return release;
  }
};

const document = {
  querySelectorAll(selector) {
    if (selector.includes('optical-semantic-item')) return [plate];
    if (selector.includes('ncn-department-weather-canvas')) return [canvas];
    return [];
  }
};

const window = {
  NCNApplications: { current: () => application },
  NCNIntegration: { getService: name => name === 'weather' ? weather : null },
  NCNIntegratedDepartments: { ready: async () => true },
  addEventListener(type, listener) {
    listeners.set(type, listener);
  }
};

const context = vm.createContext({
  window,
  document,
  console,
  queueMicrotask,
  getComputedStyle: node => node.styleState,
  setImmediate
});

vm.runInContext(source, context, { filename: 'redwire-weather-card-occlusion.js' });

(async () => {
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(subscriptions.length, 1, 'The bridge should subscribe once after accepted departments are ready.');
  subscriptions[0].listener({ type: 'render' });

  assert.deepEqual(drawCalls, [{
    operation: 'destination-out',
    fillStyle: 'rgba(0,0,0,1)',
    x: 24,
    y: 110,
    width: 340,
    height: 180
  }], 'The exact visible Optical plate rectangle should be removed from Weather.');

  application = 'dripfeed';
  subscriptions[0].listener({ type: 'render' });
  assert.equal(drawCalls.length, 1, 'Dripfeed must not receive RedWire card occlusion work.');

  subscriptions[0].release();
  application = 'redwire';
  listeners.get('ncn:application-environment-phase')?.({
    detail: { phase: 'active', next: 'redwire' }
  });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(subscriptions.length, 2, 'The bridge should renew its Weather subscription after application switching clears it.');
  assert.equal(window.NCNRedWireWeatherCardOcclusion.snapshot().active, true, 'The renewed subscription should be active.');

  console.log('RedWire Optical plates fully occlude completed Weather frames without private recurring work.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
