const assert = require('node:assert/strict');
const fs = require('node:fs');

const index = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('js/dripfeed-app.js', 'utf8');
const submit = fs.readFileSync('js/dripfeed-submit-controller.js', 'utf8');
const renderer = fs.readFileSync('js/dripfeed-renderer.js', 'utf8');

const providerIndex = index.indexOf('js/dripfeed-image-providers.js');
const rendererIndex = index.indexOf('js/dripfeed-renderer.js');
const submitIndex = index.indexOf('js/dripfeed-submit-controller.js');
const appIndex = index.indexOf('js/dripfeed-app.js');

assert.ok(providerIndex > 0, 'provider registry must be loaded');
assert.ok(providerIndex < rendererIndex, 'provider registry must load before renderer');
assert.ok(rendererIndex < submitIndex, 'renderer helpers must load before submit controller');
assert.ok(submitIndex < appIndex, 'submit controller must load before app mount');
assert.ok(index.includes('css/dripfeed-image-picker.css'), 'provider-neutral picker stylesheet must load');

assert.ok(app.includes('data-image-source="unsplash"'));
assert.ok(app.includes('data-image-source="pexels"'));
assert.ok(app.includes('data-source-panel="network"'));
assert.ok(app.includes('id="image-query"'));
assert.ok(app.includes('USE IMAGE / REVIEW'));

assert.ok(submit.includes('this.app.images.registerSelection(photo)'), 'commit path must delegate provider event');
assert.ok(submit.includes('this.app.images.toStoryImage(this.selectedPhoto)'), 'story image must come from provider mapper');
assert.ok(!submit.includes('this.app.unsplash.track'), 'submit flow must not reach into Unsplash directly');
assert.ok(renderer.includes("['unsplash', 'pexels'].includes(image.provider)"), 'renderer must support both provider credits');

console.log('Dripfeed image picker contract: load order, source tabs and provider boundary verified.');
