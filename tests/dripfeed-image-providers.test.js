const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const storage = new Map();
global.localStorage = {
  getItem: key => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key)
};

global.window = { Dripfeed: {} };

function load(path) {
  vm.runInThisContext(fs.readFileSync(path, 'utf8'), { filename: path });
}

load('js/dripfeed-model.js');
load('js/dripfeed-image-providers.js');
load('js/dripfeed-renderer.js');

const DF = window.Dripfeed;
assert.ok(DF.images, 'image provider publication must exist');

(async () => {
  const registry = DF.images.createDefaultRegistry(DF.config);
  assert.deepEqual(registry.list().map(provider => provider.id), ['unsplash', 'pexels']);

  const unsplash = await registry.search({ provider: 'unsplash', query: 'neon city', orientation: 'landscape' });
  assert.equal(unsplash.mode, 'demo');
  assert.ok(unsplash.results.length > 0);
  assert.ok(unsplash.results.every(photo => photo.provider === 'unsplash'));
  assert.ok(unsplash.results.every(photo => photo.orientation === 'landscape'));

  const pexels = await registry.search({ provider: 'pexels', query: 'night market' });
  assert.equal(pexels.mode, 'demo');
  assert.ok(pexels.results.length > 0);
  assert.ok(pexels.results.every(photo => photo.provider === 'pexels'));

  const unsplashStoryImage = registry.toStoryImage(unsplash.results[0]);
  assert.equal(unsplashStoryImage.provider, 'unsplash');
  assert.equal(unsplashStoryImage.credit.providerName, 'Unsplash');
  assert.equal(unsplashStoryImage.usage.hotlinkRequired, true);
  assert.equal(unsplashStoryImage.usage.selectionTrackingRequired, true);
  assert.ok(unsplashStoryImage.urls.display);

  const pexelsStoryImage = registry.toStoryImage(pexels.results[0]);
  assert.equal(pexelsStoryImage.provider, 'pexels');
  assert.equal(pexelsStoryImage.credit.providerName, 'Pexels');
  assert.equal(pexelsStoryImage.usage.selectionTrackingRequired, false);
  assert.match(DF.render.imageCredit(pexelsStoryImage), /Pexels/);

  const legacy = DF.model.normaliseStoryImage({
    provider: 'unsplash',
    id: 'legacy-1',
    url: 'https://images.example/legacy.jpg',
    photographer: { name: 'Legacy Creator', url: 'https://example.test/creator' },
    unsplashUrl: 'https://unsplash.com/'
  });
  assert.equal(legacy.providerImageId, 'legacy-1');
  assert.equal(legacy.urls.display, 'https://images.example/legacy.jpg');
  assert.equal(legacy.credit.creatorName, 'Legacy Creator');

  let fetchCalls = 0;
  global.fetch = async (url, options) => {
    fetchCalls += 1;
    assert.equal(url, 'https://proxy.example/track');
    const body = JSON.parse(options.body);
    assert.equal(body.provider, 'unsplash');
    assert.equal(body.providerImageId, 'live-1');
    assert.equal(body.selectionTrackingUrl, 'https://api.unsplash.com/photos/live-1/download');
    return { ok: true, json: async () => ({ ok: true }) };
  };

  const liveProvider = new DF.images.SearchProvider({
    id: 'unsplash',
    label: 'Unsplash',
    searchEndpoint: 'https://proxy.example/search',
    trackEndpoint: 'https://proxy.example/track'
  });
  const livePhoto = {
    id: 'live-1',
    provider: 'unsplash',
    demo: false,
    downloadLocation: 'https://api.unsplash.com/photos/live-1/download',
    usage: { selectionTrackingRequired: true }
  };

  assert.deepEqual(await liveProvider.registerSelection(livePhoto), { tracked: true });
  assert.deepEqual(await liveProvider.registerSelection(livePhoto), { tracked: false, reason: 'already-tracked' });
  assert.equal(fetchCalls, 1, 'selection event must be sent exactly once');

  assert.throws(() => registry.get('unknown'), /Unknown image provider/);

  console.log('Dripfeed image providers: registry, normalization, attribution and exact-once selection verified.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
