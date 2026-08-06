const assert = require('node:assert/strict');
const fs = require('node:fs');

// Reuse the established mounted-owner harness, then exercise its public pure
// geometry contract with multiple viewport sizes.
require('./dripfeed-chamber-integration.test.js');

const bridge = global.window?.NCNDripfeedChamber;
assert.ok(bridge?.computeGeometry, 'Dripfeed chamber bridge must publish computeGeometry().');

const source = fs.readFileSync('js/dripfeed-chamber-integration.js', 'utf8');
for (const retired of [
  'MAX_GRID_STEPS',
  'VIEWPORT_MARGIN',
  'MIN_APERTURE_HEIGHT',
  'APERTURE_ADVANCE_CELLS',
  'fitsViewport'
]) {
  assert.equal(source.includes(retired), false,
    `Viewport-fitting depth policy must remain removed: ${retired}`);
}
for (const required of [
  'LIVE_LINE_STEP = 1',
  'LATENT_LINE_STEP = 2',
  "placement: 'shared-fixed-bands'",
  "setPx(element, '--drip-reader-x', 0)",
  "setPx(element, '--drip-reader-y', 0)",
  'fitReaderPlacement',
  'releaseReaderPlacement',
  "target.style.setProperty('width'",
  "target.style.setProperty('max-height'",
  "target.style.setProperty('transform-origin', '50% 0')",
  "target.style.setProperty('align-self', 'start')"
]) {
  assert.equal(source.includes(required), true,
    `Fixed-band or reader-centering contract is missing: ${required}`);
}

function near(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(Number(actual) - Number(expected)) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}.`);
}

function verifyViewport(width, height) {
  let apertureReads = 0;
  const camera = {
    width,
    height,
    near: 2.5,
    cell: 0.5,
    scaleAt(z) { return this.near / z; },
    apertureAt() {
      apertureReads += 1;
      throw new Error('Fixed semantic placement must not ask the camera to select a fitting aperture.');
    }
  };

  const geometry = bridge.computeGeometry(camera, {
    railBottom: 64,
    filterHeight: 32,
    utilityHeight: 42
  });

  assert.ok(geometry, `${width}x${height}: geometry was not published.`);
  assert.equal(apertureReads, 0,
    `${width}x${height}: viewport-fitting camera aperture was consulted.`);
  assert.equal(geometry.depthConvention, 'smaller-positive-z-is-nearer');
  assert.equal(geometry.gridStep, 1);
  assert.equal(geometry.calibration.placement, 'shared-fixed-bands');
  assert.equal(geometry.calibration.liveBand, 1);
  assert.equal(geometry.calibration.latentBand, 2);
  near(geometry.calibration.liveGapCells, 0.005);
  near(geometry.calibration.readerOffsetCells, 0.08);

  // near=2.5 and cell=0.5: first line=3.0, live immediately behind it,
  // latent immediately behind the second line, reader just behind near.
  near(geometry.lineZ, 3);
  near(geometry.planes.live.z, 3.0025);
  near(geometry.planes.latent.z, 3.5025);
  near(geometry.planes.reader.z, 2.54);
  assert.ok(geometry.planes.reader.z < geometry.lineZ);
  assert.ok(geometry.lineZ < geometry.planes.live.z);
  assert.ok(geometry.planes.live.z < geometry.planes.latent.z);

  near(geometry.planes.live.scale, 3 / 3.0025);
  near(geometry.planes.latent.scale, 3 / 3.5025);
  near(geometry.planes.reader.scale, 3 / 2.54);

  const expectedTop = 64 + 2 + 32 + 2 + 42;
  assert.deepEqual(geometry.controls, {
    top: 66,
    filterHeight: 32,
    utilityTop: 100,
    utilityHeight: 42,
    bottom: expectedTop,
    left: 0,
    width
  });
  assert.deepEqual(geometry.aperture, {
    left: 0,
    top: expectedTop,
    right: width,
    bottom: height,
    width,
    height: height - expectedTop
  });
}

verifyViewport(1440, 900);
verifyViewport(520, 844);
verifyViewport(390, 844);

console.log('Dripfeed fixed-band contract: viewport-independent first/second article bands and centered foreground reader verified.');
