const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const index = read("index.html");
const chamber = read("js/layered-chamber.js");
const chamberCss = read("css/layered-chamber.css");
const config = read("js/config.js");
const data = read("js/data.js");
const app = read("js/app.js");
const actions = read("js/actions.js");
const layout = read("js/layout.js");
const projectionCss = read("css/projection.css");
const diagnostics = read("js/diagnostics.js");
const weather = read("departments/weather/weather-module.js");
const weatherFallback = read("js/weather-renderer.js");
const motionFallback = read("js/chamber-motion.js");
const motionAdapter = read("js/chamber-motion-adapter.js");
const motionPresentation = read("js/chamber-motion-presentation.js");
const departmentInstaller = read("js/integration-departments.js");
const probe = read("js/production-ownership-probe.js");
const inventory = read("docs/architecture/production-ownership-inventory.md");

assert.equal(
  fs.existsSync(path.join(root, "js/projection.js")),
  false,
  "The archived DOM parallax renderer must not remain in the production tree."
);
assert.doesNotMatch(index, /js\/projection\.js/, "Production must not load the archived parallax renderer.");
assert.match(index, /js\/projection-engine\.js/, "The active Projection lifecycle engine must remain installed.");
assert.doesNotMatch(data, /NCN_PROJECTION_PROFILE/, "The archived per-part depth profile must be absent.");
assert.doesNotMatch(config, /\bprojection\s*:\s*\{/, "The archived parallax travel configuration must be absent.");
assert.doesNotMatch(app, /updateProjection/, "Application boot must not invoke the archived parallax renderer.");
assert.doesNotMatch(actions, /updateProjection/, "Interaction code must not install parallax scroll or resize updates.");
assert.doesNotMatch(layout, /updateProjection/, "Projection transactions must not call the archived parallax renderer.");
assert.doesNotMatch(projectionCss, /--projection-y/, "Production CSS must not retain the old scroll offset variable.");
assert.doesNotMatch(projectionCss, /translateY\(var\(--projection-y/, "Production objects must not use the archived parallax transform.");

assert.match(chamber, /MODES\s*=\s*Object\.freeze\(\{\s*OFF:\s*"off",\s*BACKGROUND:\s*"background"\s*\}\)/,
  "The production chamber must expose only OFF and BACKGROUND modes.");
assert.doesNotMatch(chamber, /\bLAB\b|drawLiveFeed|liveArticles|drawArticle|articlePitch|articleHeight/,
  "Chamber Lab rendering must be absent from the production chamber.");
assert.doesNotMatch(chamber, /new\s+MutationObserver|addEventListener\(["'](?:wheel|touchstart|touchmove|touchend|touchcancel)["']/,
  "Chamber Lab observers and input listeners must not survive in production.");
assert.doesNotMatch(chamberCss, /layered-chamber-lab-mode|layered-chamber-toggle/,
  "Chamber Lab and its production toggle styles must be absent.");
assert.equal((chamber.match(/makeCanvas\("layered-chamber-(?:bg|fg)"\)/g) || []).length, 2,
  "The production chamber must own exactly its two established canvases.");

assert.doesNotMatch(index, /id="(?:layered-chamber-toggle|heuristic-rangefinder-toggle|optical-projection-toggle)"/,
  "Legacy and developer renderer toggles must not appear in the normal rail.");
assert.doesNotMatch(diagnostics, /NCN_PROJECTION_PROFILE|DOM projection profile|data-debug-offset/,
  "Diagnostics must not retain the archived DOM-parallax model.");
assert.match(diagnostics, /data-debug-renderer="optical"/,
  "Optical development control should remain available inside diagnostics.");
assert.match(diagnostics, /data-debug-renderer="rangefinder"/,
  "Rangefinder development control should remain available inside diagnostics.");

assert.deepEqual(
  [...weather.matchAll(/const LAYER_KEYS = Object\.freeze\(\[([^\]]+)\]\)/g)]
    .map(match => match[1].replace(/[\s"']/g, "").split(",")),
  [["far", "rear", "middle", "near"]],
  "Weather must own exactly the four canonical layer keys."
);
assert.equal(
  (weather.match(/context\.runtime\?\.register\?\.\(/g) || []).length,
  1,
  "Weather must register exactly one shared-runtime task."
);
assert.match(weather, /group:\s*"environment"[\s\S]*priority:\s*20/,
  "The canonical Weather task must remain in the environment group at priority 20."
);

assert.match(motionAdapter, /dataset\.ncnChamberMotionCanvas\s*=\s*"production"/,
  "The canonical movement geometry adapter canvas must be identifiable.");
assert.match(motionPresentation, /dataset\.ncnChamberMotionCanvas\s*=\s*"wall-matched"/,
  "The wall-matched movement presentation canvas must be identifiable.");
assert.match(motionPresentation, /dataset\.ncnChamberMotionCanvas\s*=\s*"foreground-mist"/,
  "The movement foreground-mist presentation canvas must be identifiable.");

assert.match(index, /js\/weather-renderer\.js/, "The current startup Weather fallback must remain explicitly visible until its dedicated cleanup stage.");
assert.match(index, /js\/chamber-motion\.js/, "The current startup movement fallback must remain explicitly visible until its dedicated cleanup stage.");
assert.match(weatherFallback, /runtime\?\.register\?\.\("weather-mist"/,
  "The retired Weather fallback runtime registration must be inventoried by name.");
assert.match(weatherFallback, /className\s*=\s*"ncn-floor-mist"/,
  "The retired Weather fallback canvas must remain identifiable.");
assert.match(motionFallback, /runtime\?\.register\?\.\("chamber-motion"/,
  "The retired movement fallback runtime registration must be inventoried by name.");
assert.match(motionFallback, /className\s*=\s*"ncn-chamber-block"/,
  "The retired movement fallback node must remain identifiable.");
assert.match(departmentInstaller, /ncnLegacyWeatherRetired/, "Canonical installation must explicitly retire the Weather fallback.");
assert.match(departmentInstaller, /ncnLegacyChamberMotionRetired/, "Canonical installation must explicitly retire the movement fallback.");

assert.match(probe, /ownershipProbe=1|params\.get\("ownershipProbe"\) !== "1"/,
  "The browser inventory probe must be explicitly query-gated.");
assert.doesNotMatch(probe, /MutationObserver|\.register\(/,
  "The ownership probe must install no observer or runtime task.");
assert.match(probe, /connectedCanvasBaseline:\s*allCanvases\.length\s*===\s*10/,
  "The mounted probe must enforce the observed connected canvas baseline.");
assert.match(probe, /canonicalCanvasBaseline:[\s\S]*===\s*9/,
  "The mounted probe must separate nine canonical canvases from compatibility residue.");
assert.match(probe, /compatibilityWeatherDormant/, "The retired Weather fallback must be proved dormant.");
assert.match(probe, /compatibilityMotionDormant/, "The retired movement fallback must be proved dormant.");
assert.match(index, /js\/production-ownership-probe\.js/,
  "Production assembly must load the inert ownership probe source.");

assert.match(inventory, /archive\/chamber-lab-final-2026-08-04/,
  "The Chamber Lab archive branch must be documented.");
assert.match(inventory, /archive\/pre-optics-parallax-final-2026-08-04/,
  "The parallax archive branch must be documented.");
assert.match(inventory, /c46b80e00502d6368a68709e934bdbff49825978/,
  "The exact pre-removal source commit must be documented.");
assert.match(inventory, /ordinary RedWire baseline is therefore \*\*ten connected canvases\*\*/,
  "The connected baseline canvas count must be explicit.");
assert.match(inventory, /Nine belong to active canonical owners/,
  "The canonical canvas count must be distinguished from compatibility residue.");
assert.match(inventory, /Retired compatibility residue still installed/,
  "Current fallback debt must be documented rather than hidden.");
assert.match(inventory, /legacy environment adapter/,
  "The later cleanup stage for compatibility fallbacks must be named.");
assert.match(inventory, /Heavy mist may create one mounted/, "Conditional compositor resources must be disclosed.");

console.log("Production ownership contract passed: legacy viewers are archived, canonical and compatibility resources are separated, and the mounted ledger is enforceable.");
