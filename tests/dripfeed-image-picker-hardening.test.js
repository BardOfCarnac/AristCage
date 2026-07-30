const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const document = { baseURI: 'https://nightcity.test/app/' };
const window = {
  location: { href: 'https://nightcity.test/app/' },
  Dripfeed: {}
};

class SearchProvider {
  constructor(options) {
    Object.assign(this, options);
    this.searchEndpoint ||= '';
    this.trackEndpoint ||= '';
  }
  get live() { return Boolean(this.searchEndpoint); }
  async search() {
    return {
      provider: this.id,
      page: 1,
      total: 1,
      totalPages: 1,
      mode: 'demo',
      results: [{
        id: `${this.id}-demo`,
        provider: this.id,
        demo: true,
        urls: { thumb: 'data:image/png,thumb', small: 'data:image/png,small', regular: 'data:image/png,regular', full: 'data:image/png,full' },
        photographer: { name: 'Demo Artist', url: '#' },
        photoUrl: '#',
        providerUrl: '#',
        usage: {}
      }]
    };
  }
  registerSelection() { return Promise.resolve({ tracked: false, reason: 'legacy' }); }
  toStoryImage(photo) { return photo; }
}

class Registry {
  constructor(providers) { this.providers = new Map(providers.map(provider => [provider.id, provider])); }
  get(id) { return this.providers.get(id); }
  search(request) { return this.get(request.provider).search(request); }
  registerSelection(photo) { return this.get(photo.provider).registerSelection(photo); }
  toStoryImage(photo) { return this.get(photo.provider).toStoryImage(photo); }
}

class SubmitController {
  constructor(app) {
    this.app = app;
    this.step = 1;
    this.source = 'unsplash';
    this.selectedPhoto = null;
    this.committedPhotoKey = '';
    this.results = [];
    this.page = 1;
    this.totalPages = 1;
    this.searchRequest = 0;
  }
  isNetworkSource(source = this.source) { return ['unsplash', 'pexels'].includes(source); }
  providerLabel(source = this.source) { return this.app.images.get(source).label; }
  formValue(id) { return this.app.values?.[id] || ''; }
  update() {}
  updateSelectedPreview() {}
  setPickerState(text) { this.pickerState = text; }
  renderResults() {}
  resetForm() { this.source = 'unsplash'; this.results = []; this.page = 1; this.totalPages = 1; }
}

class App {
  mount() { this.mounted = true; return this; }
  deactivate() { this.deactivated = true; }
  destroy() { this.destroyed = true; }
}

function normaliseRemotePhoto(provider, raw = {}) {
  return {
    ...raw,
    provider: raw.provider || provider,
    id: String(raw.id || ''),
    urls: raw.urls || {},
    photographer: raw.photographer || { name: 'Unknown creator', url: '' },
    photoUrl: raw.photoUrl || '',
    providerUrl: raw.providerUrl || '',
    usage: raw.usage || {},
    demo: Boolean(raw.demo)
  };
}

window.Dripfeed.images = { SearchProvider, Registry, normaliseRemotePhoto };
window.Dripfeed.submit = { SubmitController };
window.Dripfeed.App = App;
window.Dripfeed.render = {
  esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }
};

Object.assign(global, {
  window,
  document,
  DOMException,
  AbortController,
  URL
});

const source = fs.readFileSync('js/dripfeed-image-picker-hardening.js', 'utf8');
assert.equal(source.includes('setInterval('), false, 'picker hardening must not create a recurring loop');
vm.runInThisContext(source, { filename: 'js/dripfeed-image-picker-hardening.js' });

(async () => {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const resolved = String(url);
    calls.push({ url: resolved, options });
    if ((options.method || 'GET') === 'POST') {
      await new Promise(resolve => setTimeout(resolve, 10));
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return {
      ok: true,
      json: async () => ({
        provider: 'pexels',
        page: 1,
        total: 1,
        totalPages: 1,
        results: [{
          id: 'live-1',
          provider: 'pexels',
          source: 'pexels',
          urls: {
            thumb: 'https://images.example/thumb.jpg',
            small: 'https://images.example/small.jpg',
            regular: 'https://images.example/regular.jpg',
            full: 'https://images.example/full.jpg'
          },
          photographer: { name: 'Creator', url: 'https://creator.example/profile' },
          photoUrl: 'https://unsplash.com/photos/live-1',
          providerUrl: 'https://www.pexels.com/',
          downloadLocation: 'https://api.unsplash.com/photos/live-1/download',
          usage: {
            hotlinkRequired: false,
            selectionTrackingRequired: false,
            localCopyAllowed: true
          }
        }]
      })
    };
  };

  const unsplash = new SearchProvider({
    id: 'unsplash',
    label: 'Unsplash',
    searchEndpoint: '/images/search',
    trackEndpoint: '/images/selection'
  });
  const pexels = new SearchProvider({ id: 'pexels', label: 'Pexels' });
  const registry = new Registry([unsplash, pexels]);

  const payload = await registry.search({ provider: 'unsplash', query: 'neon city', page: 2 });
  assert.match(calls[0].url, /^https:\/\/nightcity\.test\/images\/search\?/);
  assert.equal(payload.provider, 'unsplash');
  assert.equal(payload.results[0].provider, 'unsplash', 'raw provider identity must not override the selected provider');
  assert.deepEqual(payload.results[0].usage, {
    hotlinkRequired: true,
    selectionTrackingRequired: true,
    localCopyAllowed: false
  });
  assert.match(payload.results[0].providerUrl, /^https:\/\/unsplash\.com\//);
  assert.match(payload.results[0].providerUrl, /utm_source=night_city_news/);

  const photo = payload.results[0];
  const firstUse = await Promise.all([
    registry.registerSelection(photo, { eventKey: 'transmission-1' }),
    registry.registerSelection(photo, { eventKey: 'transmission-1' })
  ]);
  assert.equal(firstUse.every(result => result.tracked === true), true);
  assert.equal(calls.filter(call => call.options.method === 'POST').length, 1,
    'concurrent commits for one use must share one provider event');

  await registry.registerSelection(photo, { eventKey: 'transmission-2' });
  assert.equal(calls.filter(call => call.options.method === 'POST').length, 2,
    'a later transmission may use the same photo and must receive its own event');

  const abortController = new AbortController();
  const demoSearchPromise = pexels.search({ query: 'market', signal: abortController.signal });
  abortController.abort();
  await assert.rejects(demoSearchPromise, error => error.name === 'AbortError');

  const resultContainer = { innerHTML: '' };
  const tracking = { textContent: '' };
  const fakeRoot = {
    addEventListener() {},
    removeEventListener() {},
    querySelector(selector) {
      if (selector === '#photo-results') return resultContainer;
      if (selector === '#tracking-state') return tracking;
      return null;
    }
  };
  const app = {
    root: fakeRoot,
    images: registry,
    values: { 'image-query': 'neon city', 'image-orientation': '' },
    toastMessages: [],
    toast(message) { this.toastMessages.push(message); },
    closeOverlay(name) { this.closed = name; },
    openOverlay(name) { this.opened = name; },
    updateApiMode() {}
  };
  const controller = new SubmitController(app);
  controller.results = [photo];
  controller.renderResults();
  assert.match(resultContainer.innerHTML, /Photo by/);
  assert.match(resultContainer.innerHTML, /photo-creator-link/);
  assert.match(resultContainer.innerHTML, /photo-provider-link/);
  assert.match(resultContainer.innerHTML, /target="_blank"/);

  controller.selectedPhoto = photo;
  controller.selectionEventKey = 'controller-transmission';
  const beforeControllerPosts = calls.filter(call => call.options.method === 'POST').length;
  const controllerResults = await Promise.all([
    controller.commitSelection(),
    controller.commitSelection()
  ]);
  assert.deepEqual(controllerResults, [true, true]);
  assert.equal(calls.filter(call => call.options.method === 'POST').length, beforeControllerPosts + 1,
    'rapid USE IMAGE / REVIEW activation must send one event');

  const pending = new AbortController();
  controller.searchAbortController = pending;
  const beforeCancel = controller.searchRequest;
  controller.close();
  assert.equal(pending.signal.aborted, true);
  assert.ok(controller.searchRequest > beforeCancel);
  assert.equal(app.closed, 'submit');

  let deactivationCancelled = false;
  App.prototype.deactivate.call({
    submit: { cancelSearch() { deactivationCancelled = true; } }
  });
  assert.equal(deactivationCancelled, true, 'application deactivation must cancel a pending picker request');

  console.log('Dripfeed image picker hardening: provider authority, linked attribution, per-use tracking and cancellation verified.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
