"use strict";

const assert = require("node:assert/strict");
require("../block-rearrangement.js");
require("../publication.js");

const publication = globalThis.NCNChamberMotionPublication;
assert.ok(publication, "publication global missing");
assert.equal(publication.autoInstall, false);
assert.equal(publication.manifest.apiVersion, 1);
assert.equal(publication.manifest.name, "chamber-motion");
assert.equal(publication.manifest.replaces, "chamber-motion");
assert.deepEqual([...publication.manifest.dependencies], ["visual-director", "effects"]);
assert.deepEqual([...publication.manifest.layers], ["environment:chamber-motion"]);
assert.deepEqual([...publication.manifest.visualChannels], ["chamber"]);
assert.deepEqual([...publication.manifest.runtimeGroups], ["chamber"]);
assert.equal(publication.manifest.animationLoop, "shared-runtime");
assert.equal(publication.manifest.reducedMotion, true);
assert.equal(publication.manifest.deterministicTesting, true);
assert.deepEqual([...publication.manifest.protectedRoots], []);

let requestedDependency = null;
const effects = { play() { return { finished: Promise.resolve(), cancel() {} }; } };
let reducedMotion = false;
let quality = "full";
const context = {
  runtime: {
    register() { throw new Error("factory construction must not register before init"); },
    getQuality() { return quality; }
  },
  events: { emit() {} },
  director: {
    envelope() { return { allowed: true, intensity: 1, mode: "ambient", reducedMotion: false }; },
    claim() { return { granted: true, intensity: 1, release() {} }; },
    currentMode() { return "ambient"; }
  },
  integration: {
    requireService(name) { requestedDependency = name; return effects; }
  },
  layers: { chamberMotion: { id: "environment:chamber-motion" } },
  settings: {
    get reducedMotion() { return reducedMotion; },
    get quality() { return quality; }
  }
};
const chamber = { getBlocks() { return []; } };
const factory = publication.createFactory({ chamber, seed: "publication-smoke" });
const instance = factory(context);
assert.equal(requestedDependency, "effects");
[
  "init", "applyProfile", "suspend", "resume", "reset", "destroy",
  "trigger", "cancel", "settle", "snapshot"
].forEach(method => assert.equal(typeof instance[method], "function", `${method} missing`));
assert.equal(instance.snapshot().taskGroup, "chamber");
assert.equal(instance.snapshot().noPrivateAnimationLoop, true);
assert.equal(instance.snapshot().reducedMotion, false);
assert.equal(instance.snapshot().performanceMode, "full");
reducedMotion = true;
quality = "reduced";
assert.equal(instance.snapshot().reducedMotion, true, "publication captured reduced-motion instead of reading it live");
assert.equal(instance.snapshot().performanceMode, "low", "publication captured host quality instead of reading it live");

console.log("PASS: NCN PR86 chamber-motion publication contract");
