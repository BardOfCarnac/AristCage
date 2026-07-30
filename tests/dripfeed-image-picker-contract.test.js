const assert = require('node:assert/strict');
const fs = require('node:fs');

const index = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('js/dripfeed-app.js', 'utf8');
const submit = fs.readFileSync('js/dripfeed-submit-controller.js', 'utf8');
const renderer = fs.readFileSync('js/dripfeed-renderer.js', 'utf8');
const hardening = fs.readFileSync('js/dripfeed-image-picker-hardening.js', 'utf8');

const providerIndex = index.indexOf('js/dripfeed-image-providers.js');
const rendererIndex = index.indexOf('js/dripfeed-renderer.js');
const submitIndex = index.indexOf('js/dripfeed-submit-controller.js');
const appIndex = index.indexOf('js/dripfeed-app.js');
const hardeningIndex = index.indexOf('js/dripfeed-image-picker-hardening.js');
const surfaceIndex = index.indexOf('js/dripfeed-surface-controller.js');

assert.ok(providerIndex > 0, 'provider registry must be loaded');
assert.ok(providerIndex < rendererIndex, 'provider registry must load before renderer');
assert.ok(rendererIndex < submitIndex, 'renderer helpers must load before submit controller');
assert.ok(submitIndex < appIndex, 'submit controller must load before app publication');
assert.ok(appIndex < hardeningIndex, 'hardening must patch the completed Dripfeed classes');
assert.ok(hardeningIndex < surfaceIndex, 'hardening must install before the surface controller mounts Dripfeed');
assert.ok(index.includes('css/dripfeed-image-picker.css'), 'provider-neutral picker stylesheet must load');
assert.ok(index.includes('css/dripfeed-image-picker-hardening.css'), 'provider attribution hardening stylesheet must load');
assert.ok(index.includes('css/dripfeed-chamber-integration.css'), 'picker must retain the chamber-integrated baseline');
assert.ok(index.includes('js/dripfeed-chamber-integration.js'), 'picker must retain the chamber integration bridge');

assert.ok(app.includes('data-image-source="unsplash"'));
assert.ok(app.includes('data-image-source="pexels"'));
assert.ok(app.includes('data-source-panel="network"'));
assert.ok(app.includes('id="image-query"'));
assert.ok(app.includes('USE IMAGE / REVIEW'));

assert.ok(submit.includes('this.app.images.registerSelection(photo)'), 'base commit path must delegate provider events');
assert.ok(submit.includes('this.app.images.toStoryImage(this.selectedPhoto)'), 'story image must come from provider mapper');
assert.ok(!submit.includes('this.app.unsplash.track'), 'submit flow must not reach into Unsplash directly');
assert.ok(renderer.includes("['unsplash', 'pexels'].includes(image.provider)"), 'renderer must support both provider credits');

for (const required of [
  'authoritativePhoto',
  'selectionEvents',
  'eventKey',
  'AbortController',
  'application-deactivate',
  'photo-creator-link',
  'photo-provider-link'
]) {
  assert.ok(hardening.includes(required), `picker hardening is missing ${required}`);
}
assert.equal(hardening.includes('setInterval('), false, 'picker hardening must not create recurring work');

console.log('Dripfeed image picker contract: chamber-aware load order, sources and compliance boundary verified.');
