const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'weather-module.js'), 'utf8');

for (const token of [
  'sprite.width = 192;',
  'sprite.height = 96;',
  'createRadialGradient?.(96, 52, 2, 96, 52, 88)',
  'rgba(255,62,44,.60)',
  'rgba(220,18,29,.40)',
  'rgba(112,3,13,.15)',
  'lane: index % 5',
  'start: mix(-1.2, 1.2, layout())',
  'baseZ: mix(2.75, 10.2, layout())',
  'width: mix(0.8, 2.3, layout())',
  'phase: layout() * 90',
  'drawingContext.globalCompositeOperation = "lighter"',
  'mistRenderer: "terminal-fx-bank-port"'
]) {
  assert.ok(source.includes(token), `Approved mist visual contract is missing: ${token}`);
}

for (const rejected of [
  'sprite.width = 48;',
  'sprite.height = 28;',
  'imageSmoothingEnabled = false',
  'const variants = 4'
]) {
  assert.equal(source.includes(rejected), false, `Superseded mist reconstruction remains: ${rejected}`);
}

console.log('Approved Terminal FX mist visual contract is preserved.');
