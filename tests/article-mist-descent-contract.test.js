const fs = require("fs");
const assert = require("assert");

const integration = fs.readFileSync("js/article-mist-descent.js", "utf8");
const opticalAdapter = fs.readFileSync("js/optical-descent-adapter.js", "utf8");
const weather = fs.readFileSync("departments/weather/weather-module.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");

for (const token of [
  'runtimeHandle = sharedRuntime.register(TASK_NAME, step',
  'group: "article"',
  'priority: 5',
  'service.getDepthFrame(frame?.frame)',
  'depthFrame.renderForeground',
  'privateAnimationLoop: false',
  'weatherSimulation: "read-only-current-depth-frame"'
]) {
  assert.ok(integration.includes(token), `Integration compositor is missing ${token}`);
}

for (const token of [
  'MutationObserver',
  'optical-dismissing',
  'optical-descending',
  'Element.prototype.remove',
  'window.NCNArticleMistDescent.begin(session)',
  'START_DEPTH = 2.5',
  'exposesArticleElements: false',
  'articleRasterisation: false'
]) {
  assert.ok(opticalAdapter.includes(token), `Optical descent adapter is missing ${token}`);
}

for (const forbidden of [
  "html2canvas",
  "toDataURL",
  "createImageBitmap",
  "drawImage",
  "requestAnimationFrame(step)",
  "depthSlices",
  "sliceCount"
]) {
  assert.equal(integration.includes(forbidden), false,
    `Integration must not rasterise articles, create a private loop or prescribe fixed slices: ${forbidden}`);
}

assert.ok(weather.includes("frame?.frame ?? frame?.id"),
  "Weather must recognise the production shared-runtime frame token");
assert.ok(weather.includes("puff.z < nearerThan"),
  "Weather must retain exact per-puff depth ordering");
assert.ok(weather.includes("puffs.sort((a, b) => b.z - a.z)"),
  "Weather foreground puffs must remain back-to-front");

const weatherIndex = index.indexOf("departments/weather/weather-module.js");
const opticalIndex = index.indexOf("js/optical-descent-adapter.js");
const compositorIndex = index.indexOf("js/article-mist-descent.js");
assert.ok(weatherIndex >= 0 && opticalIndex >= 0 && compositorIndex >= 0,
  "index.html must load Weather, the compositor and the Optical descent adapter");
assert.ok(weatherIndex < compositorIndex,
  "Weather publication must load before the integration compositor");
assert.ok(compositorIndex < opticalIndex,
  "The integration compositor must be available before the Optical descent adapter begins observing");

const dripfeedOrder = [
  "css/dripfeed-shell.css?v=independent-app-3",
  "css/dripfeed-overlays.css?v=independent-app-2",
  "css/dripfeed-header-polish.css?v=viewport-reset-1",
  "css/dripfeed-reader-transition.css?v=card-morph-1",
  "css/dripfeed-chamber-compat.css?v=viewport-reset-1"
].map(token => index.indexOf(token));
assert.ok(dripfeedOrder.every(value => value >= 0));
assert.deepEqual([...dripfeedOrder].sort((a, b) => a - b), dripfeedOrder,
  "Protected Dripfeed stylesheet order must remain unchanged");

console.log("Article descent keeps live Optical nodes and reuses the persistent exact-depth Weather field.");
