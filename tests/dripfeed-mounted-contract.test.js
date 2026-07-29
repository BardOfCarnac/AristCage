const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class StyleMap {
  constructor() { this.values = new Map(); }
  setProperty(key, value) { this.values.set(key, String(value)); }
  getPropertyValue(key) { return this.values.get(key) || ''; }
}

class FakeElement {
  constructor(className = '') {
    this.className = className;
    this.dataset = {};
    this.style = new StyleMap();
    this.children = [];
    this.hidden = false;
    this.isConnected = true;
    this.attributes = new Map();
    this.listeners = new Map();
    this.textContent = '';
    this.innerHTML = '';
  }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  append(...nodes) { this.children.push(...nodes); nodes.forEach(node => { node.parent = this; node.isConnected = this.isConnected; }); }
  insertBefore(node, before) {
    const index = this.children.indexOf(before);
    if (index < 0) this.append(node);
    else { this.children.splice(index, 0, node); node.parent = this; node.isConnected = this.isConnected; }
  }
  replaceChildren(...nodes) { this.children.forEach(node => { node.isConnected = false; }); this.children = []; this.append(...nodes); }
  addEventListener(type, handler) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(handler); }
  dispatchEvent(event) { (this.listeners.get(event.type) || []).forEach(handler => handler(event)); return true; }
  querySelector(selector) {
    if (selector === '[data-depth-host]') return this.depthHost || null;
    if (selector === '.live-wall') return this.liveWall || this.children.find(node => node.className.includes('live-wall')) || null;
    if (selector === '.rear-wall') return this.rearWall || this.children.find(node => node.className.includes('rear-wall')) || null;
    if (selector === '#result-count') return this.resultCount || null;
    if (selector === '[data-reader-target] .reader-card') return this.readerCard || null;
    return null;
  }
  querySelectorAll(selector) {
    if (selector === '.live-wall [data-post-id]') return (this.liveWall?.children || []).filter(node => node.dataset.postId);
    return [];
  }
}

class Root extends FakeElement {
  constructor() {
    super('root');
    this.depthHost = new FakeElement('depth-host');
    this.liveWall = new FakeElement('listing-wall live-wall');
    this.rearWall = new FakeElement('listing-wall rear-wall');
    this.depthHost.liveWall = this.liveWall;
    this.depthHost.rearWall = this.rearWall;
    this.depthHost.append(this.rearWall, this.liveWall);
    this.resultCount = new FakeElement('result-count');
    this.events = [];
  }
  dispatchEvent(event) { this.events.push(event); return super.dispatchEvent(event); }
  querySelector(selector) {
    if (selector === '[data-depth-host]') return this.depthHost;
    if (selector === '.live-wall') return this.liveWall;
    if (selector === '.rear-wall') return this.rearWall;
    if (selector === '#result-count') return this.resultCount;
    if (selector === '[data-reader-target] .reader-card') return this.readerCard || null;
    return null;
  }
}

let rafId = 0;
const rafs = new Map();
global.requestAnimationFrame = callback => { const id = ++rafId; rafs.set(id, callback); return id; };
global.cancelAnimationFrame = id => rafs.delete(id);
function flushFrames() { const pending = [...rafs.entries()]; rafs.clear(); pending.forEach(([, callback]) => callback()); }

let observerCount = 0;
class FakeIntersectionObserver {
  constructor() { observerCount += 1; this.disconnected = false; }
  observe() {}
  disconnect() { if (!this.disconnected) { observerCount -= 1; this.disconnected = true; } }
}

global.IntersectionObserver = FakeIntersectionObserver;
global.document = { createElement: () => new FakeElement() };
global.getComputedStyle = root => ({ getPropertyValue: key => key === '--cols' ? '3' : root.style.getPropertyValue(key) });
global.CustomEvent = class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; this.bubbles = options.bubbles; } };

global.window = {};
window.IntersectionObserver = FakeIntersectionObserver;

class Memory {
  constructor() { this.state = { seed: 1, cycle: 0 }; this.records = new Map(); }
  record(id) { if (!this.records.has(id)) this.records.set(id, { opened: 0, openedCycle: -1, dismissed: false }); return this.records.get(id); }
  shouldRemainLive(id) { const r = this.record(id); return !r.dismissed && !(r.opened > 0 && this.state.cycle > r.openedCycle); }
  markOpened(id) { const r = this.record(id); r.opened += 1; r.openedCycle = this.state.cycle; }
  markSeen() {}
  bumpSeed() { this.state.seed += 1; this.state.cycle += 1; }
}

class BoardPlanner {
  constructor(options) { this.columns = options.columns; this.role = options.role; }
  plan(posts) {
    return {
      columns: this.columns,
      rows: posts.length,
      placements: posts.map((post, index) => ({
        post, postId: post.id, role: this.role, shape: 'square', className: 'tile-square',
        width: 1, height: 1, column: index % this.columns, row: Math.floor(index / this.columns),
        fontVoice: 'wire', imageTreatment: 'none', textBudget: { headlineLines: 3, bodyLines: 2 }
      }))
    };
  }
}

class FakeReaderTransition {
  constructor(app) { this.app = app; this.mode = 'accept'; this.opened = false; }
  async open(post) {
    if (this.mode === 'reject') return false;
    const card = new FakeElement('reader-card');
    card.dataset.postId = post.id;
    this.app.root.readerCard = card;
    this.opened = true;
    if (this.mode === 'interrupt') this.app.deactivate();
    return true;
  }
  async close() { if (this.app.root.readerCard) this.app.root.readerCard.isConnected = false; this.app.root.readerCard = null; this.opened = false; return true; }
}

class App {
  constructor(posts) {
    this.root = new Root();
    this.store = { posts };
    this.state = { category: 'all', query: '', active: null };
    this.depth = { afterRender() {} };
    this.readerTransition = new FakeReaderTransition(this);
    this.surface = {
      installed: true,
      memory: new Memory(),
      exposureObserver: null,
      exposureTimers: new Map(),
      sessionSeen: new Set(),
      lastLivePlan: null,
      lastLatentPlan: null
    };
  }
  visiblePosts() {
    const query = this.state.query.toLowerCase();
    return this.store.posts.filter(post => (this.state.category === 'all' || post.category === this.state.category)
      && (!query || `${post.title} ${post.body}`.toLowerCase().includes(query)));
  }
  getSpatialSurfaces() { return { live: this.root.liveWall, latent: this.root.rearWall, reading: this.root.readerCard || null }; }
  activate() { this.root.hidden = false; }
  deactivate() { this.readerTransition.close(); this.root.hidden = true; }
  destroy() { this.root.isConnected = false; }
}

const DF = window.Dripfeed = {
  App,
  mechanics: {
    BoardPlanner,
    dispatch(root, name, detail) { return root.dispatchEvent(new CustomEvent(`dripfeed:${name}`, { detail, bubbles: true })); }
  },
  model: {},
  render: { esc: value => String(value) },
  surface: {
    installed: true,
    tile(post) { const node = new FakeElement('listing-tile'); node.dataset.postId = post.id; return node; }
  }
};

vm.runInThisContext(fs.readFileSync('js/dripfeed-surface-contract-fix.js', 'utf8'), { filename: 'dripfeed-surface-contract-fix.js' });
assert.ok(DF.surfaceContract?.installed, 'mounted contract correction must install');

const posts = [
  { id: 'A', category: 'items', title: 'A', body: 'alpha' },
  { id: 'B', category: 'items', title: 'B', body: 'beta' },
  { id: 'C', category: 'services', title: 'C', body: 'gamma' },
  { id: 'D', category: 'services', title: 'D', body: 'delta' },
  { id: 'E', category: 'items', title: 'E', body: 'epsilon' }
];

(async () => {
  const app = new App(posts);
  app.surface.active = true;
  app.renderWall();
  assert.equal(app.surface.lastLivePlan.placements.length, 5);

  app.readerTransition.mode = 'accept';
  assert.equal(await app.openReader(posts[0], new FakeElement('source')), true);
  assert.equal(app.surface.memory.record('A').opened, 1, 'accepted open marks opened memory');
  app.renderWall();
  assert.equal(app.surface.lastLivePlan.placements.some(item => item.postId === 'A'), true, 'opened post remains live in opening cycle');
  app.surface.memory.bumpSeed();
  app.renderWall();
  assert.equal(app.surface.lastLivePlan.placements.length, 4, 'live wall may contain fewer than six eligible posts');
  assert.equal(app.surface.lastLivePlan.placements.some(item => item.postId === 'A'), false, 'opened post leaves live wall after repack');
  assert.equal(app.surface.lastLatentPlan.placements.some(item => item.postId === 'A'), true, 'opened post enters latent wall after repack');

  app.state.category = 'services';
  app.state.query = 'delta';
  app.renderWall();
  const published = [...app.surface.lastLivePlan.placements, ...app.surface.lastLatentPlan.placements].map(item => item.post);
  assert.deepEqual(published.map(post => post.id), ['D'], 'both surfaces must derive from the same category/search filter');
  const wallsEvent = app.root.events.filter(event => event.type === 'dripfeed:walls-change').at(-1);
  assert.equal(wallsEvent.detail.liveCount + wallsEvent.detail.latentCount, 1, 'walls-change reports filtered publication counts');

  const rejected = new App(posts);
  rejected.surface.active = true;
  rejected.readerTransition.mode = 'reject';
  assert.equal(await rejected.openReader(posts[1], new FakeElement('source')), false);
  assert.equal(rejected.surface.memory.record('B').opened, 0, 'rejected open must not mutate opened memory');
  assert.ok(rejected.root.events.some(event => event.type === 'dripfeed:open-transmission-start'));
  assert.ok(rejected.root.events.some(event => event.type === 'dripfeed:open-transmission-cancelled' && event.detail.reason === 'rejected'));
  assert.ok(!rejected.root.events.some(event => event.type === 'dripfeed:open-transmission-ready'));

  const accepted = new App(posts);
  accepted.surface.active = true;
  accepted.readerTransition.mode = 'accept';
  assert.equal(await accepted.openReader(posts[2], new FakeElement('source')), true);
  const ready = accepted.root.events.find(event => event.type === 'dripfeed:open-transmission-ready');
  assert.equal(ready.detail.readingSurface, accepted.root.readerCard, 'ready event includes real reading surface');

  const interrupted = new App(posts);
  interrupted.surface.active = true;
  interrupted.readerTransition.mode = 'interrupt';
  assert.equal(await interrupted.openReader(posts[3], new FakeElement('source')), false);
  assert.equal(interrupted.surface.memory.record('D').opened, 0, 'interrupted open must not mutate opened memory');
  assert.ok(interrupted.root.events.some(event => event.type === 'dripfeed:open-transmission-cancelled' && event.detail.reason === 'interrupted'));

  rafs.clear();
  observerCount = 0;
  const cleanup = new App(posts);
  cleanup.surface.active = true;
  cleanup.renderWall();
  assert.notEqual(cleanup.surface.exposureFrame, null, 'render schedules one exposure frame');
  cleanup.destroy();
  assert.equal(cleanup.surface.exposureFrame, null, 'destroy cancels deferred exposure frame');
  assert.equal(rafs.size, 0, 'no deferred frame remains after destroy');
  flushFrames();
  assert.equal(observerCount, 0, 'no observer is installed after destroyed frame cleanup');
  assert.equal(cleanup.surface.exposureTimers.size, 0, 'no exposure timer remains after cleanup');

  console.log('Dripfeed mounted contract: lifecycle, filtering, reader events and cleanup verified.');
})().catch(error => { console.error(error); process.exitCode = 1; });
