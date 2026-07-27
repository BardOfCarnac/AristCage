import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";

const baseUrl = process.env.NCN_TEST_URL || "http://127.0.0.1:4173/";
const browser = await chromium.launch({ headless: true });
fs.mkdirSync("artifacts", { recursive: true });

async function sample(page) {
  return page.evaluate(() => {
    const presentation = window.NCNChamberPresentation?.snapshot?.() || null;
    const service = window.NCNIntegration?.getService?.("chamber-motion") || null;
    const geometry = service?.getActiveGeometry?.() || [];
    const canvas = document.querySelector("canvas[data-ncn-chamber-motion-canvas='wall-matched']");
    const original = document.querySelector("canvas[data-ncn-chamber-motion-canvas='production']");
    let inkSamples = 0;
    if (canvas && !canvas.hidden && canvas.width > 0 && canvas.height > 0) {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      const pixels = context?.getImageData?.(0, 0, canvas.width, canvas.height)?.data || [];
      const stride = 4 * 32;
      for (let index = 3; index < pixels.length; index += stride) {
        if (pixels[index] > 0) inkSamples += 1;
      }
    }
    return {
      presentation,
      geometryCount: geometry.length,
      phases: [...new Set(geometry.map(item => item.phase || item.pose?.phase).filter(Boolean))],
      wallCanvas: canvas ? {
        connected: canvas.isConnected,
        hidden: canvas.hidden,
        width: canvas.width,
        height: canvas.height,
        inkSamples
      } : null,
      original: original ? {
        hidden: original.hidden,
        visibility: getComputedStyle(original).visibility
      } : null
    };
  });
}

async function runViewport(name, viewport) {
  const page = await browser.newPage({ viewport });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(String(error?.stack || error)));

  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => (
    window.NCNIntegratedDepartments?.isReady?.() === true
    && window.NCNChamberPresentation?.snapshot?.().initialised === true
  ), null, { timeout: 30_000 });

  const before = await sample(page);
  assert.equal(before.presentation?.style, "layered-chamber-settled-optical", `${name}: restored presentation style must be active`);
  assert.equal(before.presentation?.noPrivateAnimationLoop, true, `${name}: presentation must use shared runtime only`);
  assert.equal(before.original?.visibility, "hidden", `${name}: old bright-edged renderer must be suppressed`);

  await page.click('[data-panel="filter"]');
  await page.waitForFunction(() => typeof NCN_STATE !== "undefined" && NCN_STATE.activePanel === "filter", null, {
    timeout: 10_000
  });

  const samples = [];
  for (let index = 0; index < 34; index += 1) {
    samples.push(await sample(page));
    await page.waitForTimeout(200);
  }

  const rendered = samples.filter(item => (
    item.geometryCount > 0
    && item.wallCanvas?.hidden === false
    && item.wallCanvas?.inkSamples > 0
  ));
  const phases = new Set(samples.flatMap(item => item.phases));
  const occluded = samples.filter(item => (
    Number(item.presentation?.occlusionPasses || 0) > 0
    && Number(item.presentation?.maskedCanvasCount || 0) >= 3
  ));

  const diagnostics = {
    name,
    viewport,
    before,
    renderedSamples: rendered.length,
    occlusionSamples: occluded.length,
    phases: [...phases],
    final: samples.at(-1),
    pageErrors,
    samples
  };
  fs.writeFileSync(`artifacts/chamber-presentation-${name}.json`, JSON.stringify(diagnostics, null, 2));
  await page.screenshot({ path: `artifacts/chamber-presentation-${name}.png`, fullPage: true });

  assert.ok(rendered.length >= 6, `${name}: wall-matched blocks must be visibly rendered for several samples`);
  assert.ok(
    phases.has("travelling-out") || phases.has("turning") || phases.has("travelling-in"),
    `${name}: restored presentation must follow movement beyond extraction`
  );
  assert.ok(occluded.length >= 4, `${name}: Weather behind the blocks must receive repeated occlusion passes`);
  assert.equal(samples.some(item => item.original?.visibility !== "hidden"), false, `${name}: old renderer must remain suppressed`);
  assert.equal(pageErrors.length, 0, `${name}: page must have no uncaught errors`);

  await page.click('[data-panel="filter"]');
  await page.waitForFunction(() => typeof NCN_STATE !== "undefined" && NCN_STATE.activePanel == null, null, {
    timeout: 10_000
  });
  await page.waitForFunction(() => {
    const state = window.NCNChamberPresentation?.snapshot?.();
    return state && state.lastGeometryCount === 0 && state.canvasVisible === false;
  }, null, { timeout: 10_000 });

  await page.close();
}

try {
  await runViewport("desktop", { width: 1440, height: 900 });
  await runViewport("mobile", { width: 390, height: 844 });
  console.log("PASS: restored wall-matched blocks and Weather occlusion render on desktop and mobile");
} finally {
  await browser.close();
}
