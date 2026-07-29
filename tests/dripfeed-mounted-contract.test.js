const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class StyleMap {
  constructor() { this.values = new Map(); }
  setProperty(key, value) { this.values.set(key, String(value)); }
  getPropertyValue(key) { return this.values.get(key) || ''; }
}

class FakeClassList {
  constructor(owner, initial = '') { this.owner = owner; this.set = new Set(String(initial).split(/\s+/).filter(Boolean)); }
  add(...names) { names.forEach(name => this.set.add(name)); this.sync(); }
  remove(...names) { names.forEach(name => this.set.delete(name)); this.sync(); }
  toggle(name, force) {
    if (force === true) this.set.add(name);
    else if (force === false) this.set.delete(name);
    else if (this.set.has(name)) this.set.delete(name);
    else this.set.add(name);
    this.sync();
    return this.set.has(name);
  }
  contains(name) { return this.set.has(name); }
  sync() { this.owner._className = [...this.set].join(' '); }
}

function dataKey(attribute) {
  return attribute.replace(/^data-/, '').replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

class FakeElement {
  constructor(className = '', tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this._className = className;
    this.classList = new FakeClassList(this, className);
    this.dataset = {};
    this.style = new StyleMap();
    this.children = [];
    this.hidden = false;
    this.isConnected = true;
    this.attributes = new Map();
    this.listeners = new Map();
    this.textContent = '';
    this._innerHTML = '';
    this.parent = null;
    this.id = '';
    this.rect = { left: 20, top: 30, right: 140, bottom: 110, width: 120, height: 80 };
  }
  get className() { return this._className; }
  set className(value) { this._className = String(value); this.classList = new FakeClassList(this, value); }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) {
    this._innerHTML = String(value);
    this.replaceChildren();
    if (this._innerHTML.includes('reader-card')) {
      const match = this._innerHTML.match(/class="([^"]*reader-card[^"]*)"/);
      const card = new FakeElement(match?.[1] || 'reader-card', 'article');
      card.dataset.spatialSurface = this._innerHTML.includes('data-spatial-surface="reading"') ? 'reading' : '';
      this.append(card);
    }
  }
  setAttribute(key, value) {
    this.attributes.set(key, String(value));
    if (key === 'id') this.id = String(value);
    if (key.startsWith('data-')) this.dataset[dataKey(key)] = String(value);
  }
  removeAttribute(key) { this.attributes.delete(key); }
  append(...nodes) {
    nodes.forEach(node => {
      if (!node) return;
      if (node.parent) node.parent.children = node.parent.children.filter(child => child !== node);
      this.children.push(node);
      node.parent = this;
      node.setConnected(this.isConnected);
    });
  }
  after(node) {
    if (!this.parent) return;
    const index = this.parent.children.indexOf(this);
    this.parent.children.splice(index + 1, 0, node);
    node.parent = this.parent;
    node.setConnected(this.parent.isConnected);
  }
  insertBefore(node, before) {
    const index = this.children.indexOf(before);
    if (index < 0) this.append(node);
    else {
      this.children.splice(index, 0, node);
      node.parent = this;
      node.setConnected(this.isConnected);
    }
  }
  replaceChildren(...nodes) {
    this.children.forEach(node => { node.parent = null; node.setConnected(false); });
    this.children = [];
    this.append(...nodes);
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this);
    this.parent = null;
    this.setConnected(false);
  }
  setConnected(value) {
    this.isConnected = Boolean(value);
    this.children.forEach(child => child.setConnected(value));
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  dispatchEvent(event) {
    event.target ||= this;
    event.currentTarget = this;
    (this.listeners.get(event.type) || []).forEach(handler => handler(event));
    return true;
  }
  matches(selector) {
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    const dataMatch = selector.match(/^\[data-([a-z0-9-]+)(?:="([^"]*)")?\]$/i);
    if (dataMatch) {
      const key = dataKey(`data-${dataMatch[1]}`);
      if (!(key in this.dataset)) return false;
      return dataMatch[2] == null || String(this.dataset[key]) === dataMatch[2];
    }
    return false;
  }
  descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
  querySelector(selector) {
    if (selector === '[data-reader-target] .reader-card') {
      return this.querySelector('[data-reader-target]')?.querySelector('.reader-card') || null;
    }
    return this.descendants().find(node => node.matches(selector)) || null;
  }
  querySelectorAll(selector) {
    if (selector === '.live-wall [data-post-id]') {
      return this.querySelector('.live-wall')?.descendants().filter(node => 'postId' in node.dataset) || [];
    }
    if (selector.includes(',')) return [];
    return this.descendants().filter(node => node.matches(selector));
  }
  closest(selector) {
    let node = this;
    while (node) {
      if (node.matches(selector)) return node;
      node = node.parent;
    }
    return null;
  }
  cloneNode(deep = false) {
    const clone = new FakeElement(this.className, this.tagName);
    clone.dataset = { ...this.dataset };
    clone.id = this.id;
    clone.rect = { ...this.rect };
    if (deep) clone.append(...this.children.map(child => child.cloneNode(true)));
    return clone;
  }
  getBoundingClientRect() { return { ...this.rect }; }
}

class Root extends FakeElement {
  constructor() {
    super('root');
    this.events = [];

    this.filterRail = new FakeElement('dripfeed-filter-rail');
    this.utilityRail = new FakeElement('dripfeed-utility-rail');
    this.resetButton = new FakeElement('button');
    this.resetButton.dataset.action = 'reset';
    this.utilityRail.append(this.resetButton);

    this.resultCount = new FakeElement('result-count');
    this.resultCount.id = 'result-count';
    this.utilityRail.append(this.resultCount);

    this.depthHost = new FakeElement('demo-stage');
    this.depthHost.dataset.depthHost = '';
    this.liveWall = new FakeElement('listing-wall live-wall', 'section');
    this.depthHost.append(this.liveWall);

    this.readerOverlay = new FakeElement('overlay reader-overlay', 'section');
    this.readerOverlay.dataset.overlay = 'reader';
    this.readerTarget = new FakeElement('reader-target');
    this.readerTarget.dataset.readerTarget = '';
    this.readerOverlay.append(this.readerTarget);

    this.toast = new FakeElement('toast');
    this.append(this.filterRail, this.utilityRail, this.depthHost, this.readerOverlay, this.toast);
  }
  dispatchEvent(event) { this.events.push(event); return super.dispatchEvent(event); }
}

let rafId = 0;
const rafs = new Map();
global.requestAnimationFrame = callback => { const id = ++rafId; rafs.set(id, callback); return id; };
global.cancelAnimationFrame = id => rafs.delete(id);
function flushFrames() {
  const pending = [...rafs.entries()];
  rafs.clear();
  pending.forEach(([, callback]) => callback());
}
async function settleWithFrames(promise) {
  let settled = false;
  let value;
  let error;
  Promise.resolve(promise).then(result => { settled = true; value = result; }, reason => { settled = true; error = reason; });
  for (let index = 0; index < 24 && !settled; index += 1) {
    flushFrames();
    await Promise.resolve();
  }
  if (!settled) throw new Error('Promise did not settle after flushing animation frames.');
  if (error) throw error;
  return value;
}

let observerCount = 0;
class FakeIntersectionObserver {
  constructor() { observerCount += 1; this.disconnected = false; }
  observe() {}
  disconnect() { if (!this.disconnected) { observerCount -= 1; this.disconnected = true; } }
}

let reducedMotion = true;
global.IntersectionObserver = FakeIntersectionObserver;
global.getComputedStyle = root => ({ getPropertyValue: key => key === '--cols' ? '3' : root.style.getPropertyValue(key) });
global.CustomEvent = class CustomEvent {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail; this.bubbles = options.bubbles; }
};
global.document = {
  body: { style: {} },
  createElement: tag => new FakeElement('', tag),
  addEventListener() {},
  removeEventListener() {}
};
global.window = global;
window.IntersectionObserver = FakeIntersectionObserver;
window.matchMedia = () => ({ get matches() { return reducedMotion; } });

class Memory {
  constructor() { this.state = { seed: 1, cycle: 0 }; this.records = new Map(); }
  record(id) {
    if (!this.records.has(id)) this.records.set(id, { opened: 0, openedCycle: -1, dismissed: false, timesShown: 0 });
    return this.records.get(id);
  }
  get(id) { return { ...this.record(id) }; }
  shouldRemainLive(id) {
    const record = this.record(id);
    return !record.dismissed && !(record.opened > 0 && this.state.cycle > record.openedCycle);
  }
  markOpened(id) { const record = this.record(id); record.opened += 1; record.openedCycle = this.state.cycle; }
  markSeen(id) { this.record(id).timesShown += 1; }
  dismiss(id) { this.record(id).dismissed = true; }
  restore(id) { const record = this.record(id); record.dismissed = false; record.openedCycle = this.state.cycle; }
  bumpSeed() { this.state.seed += 1; this.state.cycle += 1; }
  profileFor(post) { return { fontVoice: post.fontVoice || 'wire', imageTreatment: 'none' }; }
}

class BoardPlanner {
  constructor(options) { this.columns = options.columns; this.role = options.role; }
  plan(posts) {
    return {
      columns: this.columns,
      rows: Math.max(1, Math.ceil(posts.length / this.columns)),
      placements: posts.map((post, index) => ({
        post,
        postId: post.id,
        role: this.role,
        shape: 'square',
        className: 'tile-square',
        width: 1,
        height: 1,
        column: index % this.columns,
        row: Math.floor(index / this.columns),
        fontVoice: 'wire',
        imageTreatment: 'none',
        textBudget: { headlineLines: 3, bodyLines: 2 }
      }))
    };
  }
}

class App {
  constructor(posts) {
    this.root = new Root();
    this.store = { posts };
    this.state = { category: 'all', query: '', active: null };
    this.depth = {
      reading: false,
      afterRender() {},
      setReading: value => { this.depth.reading = Boolean(value); },
      resume() {},
      pause() {},
      destroy() {}
    };
    this.readerTransition = new window.Dripfeed.readerTransition.ReaderTransition(this);
  }
  mount() { this.mounted = true; return this; }
  render() { this.renderWall(); }
  visiblePosts() {
    const query = this.state.query.toLowerCase();
    return this.store.posts.filter(post => (this.state.category === 'all' || post.category === this.state.category)
      && (!query || `${post.title} ${post.body}`.toLowerCase().includes(query)));
  }
  openReader(post, source) { return this.readerTransition.open(post, source); }
  activate() { this.root.hidden = false; this.depth.resume(); this.render(); }
  deactivate() { this.depth.pause(); this.readerTransition.close({ immediate: true }); this.root.hidden = true; }
  destroy() { this.readerTransition.destroy(); this.depth.destroy(); this.root.setConnected(false); this.mounted = false; }
  toast(message) { this.root.toast.textContent = message; }
}

const DF = window.Dripfeed = {
  App,
  model: {
    CATEGORIES: {
      items: { label: 'Items', code: 'ITM', mark: '□' },
      services: { label: 'Services', code: 'SRV', mark: '◇' }
    },
    LISTING_TYPES: { offer: { label: 'Offering', short: 'OFFER' } },
    effectiveState: () => 'live',
    relativeTime: () => 'NOW',
    expiryLabel: () => '3D'
  },
  mechanics: {
    ExposureStore: Memory,
    BoardPlanner,
    FONT_VOICES: { wire: { className: 'font-wire' } },
    IMAGE_TREATMENTS: {},
    dispatch(root, name, detail) { return root.dispatchEvent(new CustomEvent(`dripfeed:${name}`, { detail, bubbles: true })); }
  },
  render: {
    esc: value => String(value ?? ''),
    imageCredit: () => '',
    reviewCard: () => '<article class="review-card base"></article>',
    readerMarkup: post => `<article class="reader-card"><h2>${post.title}</h2><div class="reader-actions"><button class="button primary" data-action="close-reader">RETURN TO DRIPFEED</button></div></article>`
  },
  submit: {},
  config: {}
};

vm.runInThisContext(fs.readFileSync('js/dripfeed-reader-transition.js', 'utf8'), { filename: 'js/dripfeed-reader-transition.js' });
vm.runInThisContext(fs.readFileSync('js/dripfeed-surface-controller.js', 'utf8'), { filename: 'js/dripfeed-surface-controller.js' });
assert.ok(DF.surface?.installed, 'unified production surface controller must install');
assert.equal(DF.surface, DF.surfaceContract, 'production and mounted harness must consume one publication implementation');
assert.equal(DF.surface.version, '1.2.0');

const posts = [
  { id: 'A', category: 'items', listingType: 'offer', title: 'A', body: 'alpha', valueLabel: '10', district: 'Watson' },
  { id: 'B', category: 'items', listingType: 'offer', title: 'B', body: 'beta', valueLabel: '20', district: 'Watson' },
  { id: 'C', category: 'services', listingType: 'offer', title: 'C', body: 'gamma', valueLabel: '30', district: 'Heywood' },
  { id: 'D', category: 'services', listingType: 'offer', title: 'D', body: 'delta', valueLabel: '40', district: 'Heywood' },
  { id: 'E', category: 'items', listingType: 'offer', title: 'E', body: 'epsilon', valueLabel: '50', district: 'Watson' }
];

function makeApp() {
  const app = new App(posts).mount();
  flushFrames();
  return app;
}

function eventTypes(app) { return app.root.events.map(event => event.type); }
function assertCloseReadyInvariant(app) {
  let readyBalance = 0;
  for (const event of app.root.events) {
    if (event.type === 'dripfeed:open-transmission-ready') readyBalance += 1;
    if (event.type === 'dripfeed:close-transmission') {
      assert.ok(readyBalance > 0, 'every close publication must have one preceding unmatched ready publication');
      readyBalance -= 1;
    }
  }
}

(async () => {
  const app = makeApp();
  assert.equal(app.surface.lastLivePlan.placements.length, 5);

  const sourceA = new FakeElement('source');
  assert.equal(await settleWithFrames(app.openReader(posts[0], sourceA)), true);
  assert.equal(app.surface.memory.record('A').opened, 1, 'accepted open marks opened memory only at ready');
  assert.ok(eventTypes(app).includes('dripfeed:open-transmission-ready'));
  assert.equal(app.surface.readyPublication.postId, 'A');
  assert.equal(await app.readerTransition.close({ immediate: true }), true);
  assert.equal(eventTypes(app).filter(type => type === 'dripfeed:close-transmission').length, 1);
  assert.equal(app.surface.readyPublication, null);
  assertCloseReadyInvariant(app);

  app.renderWall();
  assert.equal(app.surface.lastLivePlan.placements.some(item => item.postId === 'A'), true, 'opened post remains live in its opening cycle');
  app.surface.memory.bumpSeed();
  app.renderWall();
  assert.equal(app.surface.lastLivePlan.placements.length, 4, 'live wall may contain fewer than six eligible posts');
  assert.equal(app.surface.lastLivePlan.placements.some(item => item.postId === 'A'), false);
  assert.equal(app.surface.lastLatentPlan.placements.some(item => item.postId === 'A'), true, 'opened post becomes latent after repack');

  app.dismissPost('B');
  assert.equal(app.surface.lastLivePlan.placements.some(item => item.postId === 'B'), false, 'dismissed post leaves live publication');
  assert.equal(app.surface.lastLatentPlan.placements.some(item => item.postId === 'B'), false, 'dismissed post leaves latent publication');
  assert.equal(app.getSurfaceSnapshot().excludedCount, 1);
  app.restorePost('B');
  assert.equal(app.surface.lastLivePlan.placements.some(item => item.postId === 'B'), true, 'restore returns a dismissed post according to the current cycle');
  assert.ok(DF.render.readerMarkup(posts[0]).includes('>DISMISS<'));
  assert.ok(!DF.render.readerMarkup(posts[0]).includes('FILE TO REAR'));

  app.state.category = 'services';
  app.state.query = 'delta';
  app.renderWall();
  const published = [...app.surface.lastLivePlan.placements, ...app.surface.lastLatentPlan.placements].map(item => item.post.id);
  assert.deepEqual(published, ['D'], 'both walls derive from the same category/search filter');
  const wallsEvent = app.root.events.filter(event => event.type === 'dripfeed:walls-change').at(-1);
  assert.equal(wallsEvent.detail.liveCount + wallsEvent.detail.latentCount, 1);

  const interrupted = makeApp();
  const interruptedOpen = interrupted.openReader(posts[2], new FakeElement('source'));
  interrupted.deactivate();
  assert.equal(await settleWithFrames(interruptedOpen), false);
  assert.equal(interrupted.surface.memory.record('C').opened, 0);
  assert.ok(interrupted.root.events.some(event => event.type === 'dripfeed:open-transmission-cancelled' && event.detail.reason === 'interrupted'));
  assert.ok(!interrupted.root.events.some(event => event.type === 'dripfeed:open-transmission-ready'));
  assert.ok(!interrupted.root.events.some(event => event.type === 'dripfeed:close-transmission'));
  assertCloseReadyInvariant(interrupted);

  const failed = makeApp();
  reducedMotion = false;
  const throwingSource = new FakeElement('source');
  let rectReads = 0;
  throwingSource.getBoundingClientRect = () => {
    rectReads += 1;
    if (rectReads > 1) throw new Error('injected geometry failure after reader markup');
    return { ...throwingSource.rect };
  };
  await assert.rejects(
    () => settleWithFrames(failed.openReader(posts[3], throwingSource)),
    /injected geometry failure/
  );
  reducedMotion = true;
  assert.equal(failed.state.active, null, 'failed open clears active post');
  assert.equal(failed.root.querySelector('[data-reader-target] .reader-card'), null, 'failed open removes connected reading surface');
  assert.equal(failed.readerTransition.opened, false);
  assert.equal(failed.readerTransition.busy, false);
  assert.equal(failed.readerTransition.flightStage, null);
  assert.equal(failed.readerTransition.sourceElement, null);
  assert.equal(failed.root.readerOverlay.classList.contains('open'), false);
  assert.equal(failed.root.readerOverlay.classList.contains('reader-transitioning'), false);
  assert.equal(failed.depth.reading, false);
  assert.equal(failed.surface.memory.record('D').opened, 0, 'failed open does not mutate opened memory');
  assert.equal(failed.root.events.filter(event => event.type === 'dripfeed:open-transmission-cancelled').length, 1);
  assert.ok(!failed.root.events.some(event => event.type === 'dripfeed:open-transmission-ready'));
  assert.ok(!failed.root.events.some(event => event.type === 'dripfeed:close-transmission'));
  assertCloseReadyInvariant(failed);

  rafs.clear();
  observerCount = 0;
  const cleanup = new App(posts).mount();
  DF.surface.clearExposure(cleanup);
  cleanup.surface.active = true;
  cleanup.root.hidden = false;
  cleanup.renderWall();
  assert.notEqual(cleanup.surface.exposureFrame, null, 'render schedules one retained exposure frame');
  cleanup.destroy();
  assert.equal(cleanup.surface.exposureFrame, null, 'destroy cancels deferred exposure frame');
  assert.equal(rafs.size, 0);
  flushFrames();
  assert.equal(observerCount, 0);
  assert.equal(cleanup.surface.exposureTimers.size, 0);

  console.log('Dripfeed mounted production stack: exclusion, ready-gated close, failed-open cleanup and lifecycle verified.');
})().catch(error => { console.error(error); process.exitCode = 1; });
