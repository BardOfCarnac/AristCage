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
  'bank.width = randomBetween(0.90, 2.40)',
  'bank.depth = randomBetween(0.60, 2.00)',
  'bank.lift = randomBetween(0.02, 0.28)',
  'bank.alpha = randomBetween(0.55, 1.0)',
  'bank.speed = randomBetween(0.72, 1.28)',
  'bank.puffs = Math.round(randomBetween(3, 5))',
  'const sideSpeed = settings.drift * 0.22',
  'const depthSpeed = settings.depthFlow * 0.28',
  'createRadialGradient?.(0, 0, 0.08, 0, 0, 1)',
  'rgba(206, 188, 188',
  'rgba(255, 38, 35',
  'mistRenderer: "floor-mist-test-01-banks"',
  'floorVeil: false',
  'generalHaze: false',
  'frontEnergy: false'
]) {
  assert.ok(source.includes(token), `Approved Floor Mist visual contract is missing: ${token}`);
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
  'imageSmoothingEnabled'
]) {
  assert.equal(source.includes(rejected), false, `Unapproved mist extra or reconstruction remains: ${rejected}`);
}

for (const hazeValue of ['haze: 0.12', 'haze: 0.23', 'haze: 0.48', 'haze: 0.17', 'haze: 0.24', 'haze: 0.31']) {
  assert.equal(presets.includes(hazeValue), false, `Weather preset still requests unapproved haze: ${hazeValue}`);
}

console.log('Approved Floor Mist bank visual contract is preserved without haze extras.');
