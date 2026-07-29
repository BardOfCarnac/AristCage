const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'weather-module.js'), 'utf8');
const presets = fs.readFileSync(path.resolve(__dirname, '..', 'weather-presets.js'), 'utf8');

for (const token of [
  'density: 0.62',
  'height: 0.34',
  'opacity: 0.58',
  'drift: 0.18',
  'depthFlow: -0.12',
  'turbulence: 0.42',
  'softness: 0.66',
  'bankCount: 36',
  'bank.width = randomBetween(0.62, 1.58)',
  'bank.depth = randomBetween(0.38, 1.15)',
  'bank.lift = randomBetween(0.02, 0.28)',
  'bank.verticalSeed = random()',
  'bank.scaleSeed = randomBetween(0.88, 1.12)',
  'bank.alpha = randomBetween(0.55, 1.0)',
  'bank.speed = randomBetween(0.72, 1.28)',
  'bank.puffs = Math.round(randomBetween(3, 5))',
  'const sideSpeed = settings.drift * 0.22',
  'const depthSpeed = settings.depthFlow * 0.28',
  'createRadialGradient?.(0, 0, 0.08, 0, 0, 1)',
  'const smoke = clamp01(state.config.smoke)',
  'const heat = clamp01(state.config.electrical)',
  'mix(214, 92, smoke)',
  'mix(18, 2, smoke)',
  'mix(30, 12, smoke)',
  'mix(baseRed, 255, heat)',
  'mix(baseGreen, 104, heat)',
  'mix(baseBlue, 52, heat)',
  'mistRenderer: "floor-mist-test-01-banks"',
  'floorVeil: false',
  'generalHaze: false',
  'frontEnergy: false',
  'const DEPTH_CONVENTION = "smaller-positive-z-is-nearer"',
  'function buildMistPuffs(settings, scene)',
  'const pass = mistLayer(z)',
  'scene.camera?.apertureAt?.(z, scene.bounds.halfWidth)',
  'shiftedClipRect(puff.chamberClip',
  'chamberClipped: true',
  'const verticalRange = scene.bounds.halfHeight * 1.72 * settings.verticalFill',
  'height: APPROVED_MIST.height * mix(1, 3.6, verticalFill)',
  'puffs.sort((a, b) => b.z - a.z)',
  'function publishDepthFrame(runtimeFrame, scene, puffs)',
  'function getDepthFrame(frameToken = null)',
  'if (!(puff.z < nearerThan)',
  'renderForeground',
  'getDepthFrame,',
  'depthFrame: Object.freeze({'
]) {
  assert.ok(source.includes(token), `Approved mist visual contract is missing: ${token}`);
}

for (const rejected of [
  'function drawFloorVeil',
  'function renderHaze',
  'createLinearGradient',
  'function drawFrontEnergy',
  'buildMistSprites',
  'drawImage',
  'sprite.width = 48',
  'sprite.width = 192',
  'imageSmoothingEnabled',
  'rgba(206, 188, 188',
  'depthSlices',
  'sliceCount',
  'NCNOptical',
  'articleId',
  'getArticle'
]) {
  assert.equal(source.includes(rejected), false, `Unapproved mist extra, white body or reconstruction remains: ${rejected}`);
}

const ordinaryMistMatch = presets.match(/\n    mist: preset\(\{([\s\S]*?)\n    \}\),\n    "heavy-mist": preset\(\{/);
assert.ok(ordinaryMistMatch, 'Ordinary mist preset block is unavailable.');
const ordinaryMist = ordinaryMistMatch[1];
for (const token of [
  'mist: 0.54',
  'verticalFill: 0.04',
  'bankScale: 1.52',
  'bankMultiplier: 1.58'
]) {
  assert.ok(ordinaryMist.includes(token), `Broad-bank ordinary mist contract is missing: ${token}`);
}

for (const token of [
  'smoke: 0',
  'smoke: preset({',
  'smoke: 1',
  'haze: 0',
  '"heavy-mist": preset({',
  'verticalFill: 0.82',
  'bankScale: 1.08',
  'bankMultiplier: 1.85'
]) {
  assert.ok(presets.includes(token), `Weather palette or volume preset is missing: ${token}`);
}

for (const hazeValue of ['haze: 0.12', 'haze: 0.23', 'haze: 0.48', 'haze: 0.17', 'haze: 0.24', 'haze: 0.31']) {
  assert.equal(presets.includes(hazeValue), false, `Weather preset still requests unapproved haze: ${hazeValue}`);
}

console.log('Weather owns the broad overlapping ordinary-bank preset without host-profile assertions, haze, veils or fixed slices.');
