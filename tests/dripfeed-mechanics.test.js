const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const storage = new Map();
global.localStorage = {
  getItem: key => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key)
};
global.window = {
  Dripfeed: {
    config: {
      terminalId: '08-441',
      worldNow: '2045-07-14T21:17:00-07:00',
      storageKey: 'test-dripfeed'
    }
  }
};

global.CustomEvent = class CustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
    this.bubbles = options.bubbles;
  }
};

vm.runInThisContext(fs.readFileSync('js/dripfeed-mechanics.js', 'utf8'), {
  filename: 'js/dripfeed-mechanics.js'
});

const M = window.Dripfeed.mechanics;
assert.ok(M, 'mechanics publication must exist');

for (const shape of Object.values(M.SHAPES)) {
  assert.ok(Number.isInteger(shape.width) && shape.width > 0);
  assert.ok(Number.isInteger(shape.height) && shape.height > 0);
  assert.equal(shape.area, shape.width * shape.height, `${shape.key} must use exact square-cell geometry`);
}
assert.deepEqual(
  Object.fromEntries(Object.entries(M.SHAPES).map(([key, shape]) => [key, `${shape.width}x${shape.height}`])),
  { square: '1x1', wide: '2x1', tall: '1x2', feature: '2x2', banner: '3x1', poster: '2x3' }
);

const posts = [
  { id: 'A', listingType: 'offer', category: 'items', title: 'Free chair', body: 'Only screams when occupied.', createdAt: '2045-07-14T21:00:00-07:00', image: null },
  { id: 'B', listingType: 'event', category: 'community', title: 'Sacajawea night market underpass six', body: 'Hot food, cold batteries, used cyberware.', createdAt: '2045-07-14T20:00:00-07:00', image: { orientation: 'landscape' } },
  { id: 'C', listingType: 'offer', category: 'services', title: 'Night courier available before dawn', body: 'Rain, outages and checkpoints included.', createdAt: '2045-07-14T19:00:00-07:00', image: { orientation: 'portrait' } },
  { id: 'D', listingType: 'wanted', category: 'jobs', title: 'Need six people and a truck before sunrise', body: 'Legal work. Mostly legal truck.', createdAt: '2045-07-14T18:00:00-07:00', image: { orientation: 'landscape' }, urgent: true },
  { id: 'E', listingType: 'offer', category: 'housing', title: 'Room available above laundrette', body: 'Warm floor, intermittent electricity, landlord missing.', createdAt: '2045-07-14T17:00:00-07:00', image: null },
  { id: 'F', listingType: 'offer', category: 'services', title: 'Houseplant doctor', body: 'Yellow leaves, bad soil and relationship difficulties.', createdAt: '2045-07-14T16:00:00-07:00', image: { orientation: 'portrait' } }
];

assert.ok(M.envelopeFor(posts[0]).allowed.includes('square'));
assert.ok(M.envelopeFor(posts[1]).allowed.includes('banner'));
assert.ok(M.envelopeFor(posts[2]).allowed.includes('tall'));
assert.ok(M.envelopeFor(posts[3]).allowed.includes('poster'));

const memory = new M.ExposureStore({ storageKey: 'mechanics-test-state' });
const first = new M.BoardPlanner({ columns: 3, seed: 12345, memory, role: 'live' }).plan(posts);
const second = new M.BoardPlanner({ columns: 3, seed: 12345, memory, role: 'live' }).plan(posts);
assert.deepEqual(
  first.placements.map(item => [item.postId, item.shape, item.row, item.column]),
  second.placements.map(item => [item.postId, item.shape, item.row, item.column]),
  'same seed and state must produce a stable board'
);

const occupied = new Set();
for (const item of first.placements) {
  assert.ok(item.column + item.width <= first.columns, `${item.postId} must fit the board width`);
  assert.ok(M.envelopeFor(item.post).allowed.includes(item.shape), `${item.postId} must stay within its shape envelope`);
  for (let row = item.row; row < item.row + item.height; row += 1) {
    for (let column = item.column; column < item.column + item.width; column += 1) {
      const key = `${row}:${column}`;
      assert.ok(!occupied.has(key), `cell ${key} must not overlap`);
      occupied.add(key);
    }
  }
}

memory.markSeen('A', 10);
assert.equal(memory.get('A').timesShown, 1);
memory.markOpened('A', 20);
assert.equal(memory.shouldRemainLive('A'), true, 'opened post remains live during the current cycle');
memory.bumpSeed();
assert.equal(memory.shouldRemainLive('A'), false, 'opened post becomes latent on the next deliberate repack');
memory.restore('A');
assert.equal(memory.shouldRemainLive('A'), true, 'restoring a post returns it to the live candidate pool');
memory.dismiss('A');
assert.equal(memory.shouldRemainLive('A'), false, 'dismissal is the explicit hard exclusion');

const customProfile = memory.setProfile('B', { fontVoice: 'blackletter', imageTreatment: 'inset' });
assert.equal(customProfile.fontVoice, 'blackletter');
assert.equal(memory.profileFor(posts[1]).imageTreatment, 'inset');

console.log('Dripfeed mechanics: deterministic square packing, envelopes, profiles and memory verified.');
