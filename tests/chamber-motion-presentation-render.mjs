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
    const wall = document.querySelector("canvas[data-ncn-chamber-motion-canvas='wall-matched']");
    const foreground = document.querySelector("canvas[data-ncn-chamber-motion-canvas='foreground-mist']");
    const near = document.querySelector(".ncn-department-weather-near");
    const original = document.querySelector("canvas[data-ncn-chamber-motion-canvas='production']");
    const regions = Array.from(presentation?.projectedRegions || []);
    const bounds = regions.length ? {
      left: Math.max(0, Math.floor(Math.min(...regions.map(region => region.bounds.left)))),
      top: Math.max(0, Math.floor(Math.min(...regions.map(region => region.bounds.top)))),
      right: Math.min(innerWidth, Math.ceil(Math.max(...regions.map(region => region.bounds.right)))),
      bottom: Math.min(innerHeight, Math.ceil(Math.max(...regions.map(region => region.bounds.bottom))))
    } : null;

    function canvasMetrics(target, box) {
      if (!target || target.hidden || !box || box.right <= box.left || box.bottom <= box.top) return null;
      const cssWidth = parseFloat(target.style.width) || innerWidth || 1;
      const cssHeight = parseFloat(target.style.height) || innerHeight || 1;
      const scaleX = target.width / cssWidth;
      const scaleY = target.height / cssHeight;
      const x = Math.max(0, Math.floor(box.left * scaleX));
      const y = Math.max(0, Math.floor(box.top * scaleY));
      const width = Math.max(1, Math.min(target.width - x, Math.ceil((box.right - box.left) * scaleX)));
      const height = Math.max(1, Math.min(target.height - y, Math.ceil((box.bottom - box.top) * scaleY)));
      const data = target.getContext("2d", { willReadFrequently: true })?.getImageData(x, y, width, height)?.data || new Uint8ClampedArray();
      return { data, x, y, width, height, scaleX, scaleY };
    }

    const wallMetrics = canvasMetrics(wall, bounds);
    const foregroundMetrics = canvasMetrics(foreground, bounds);
    let wallPixels = 0;
    let foregroundPixels = 0;
    let overlapPixels = 0;
    let foregroundMaxAlpha = 0;
    let foregroundAlphaSum = 0;
    if (wallMetrics && foregroundMetrics && wallMetrics.width === foregroundMetrics.width && wallMetrics.height === foregroundMetrics.height) {
      for (let index = 3; index < wallMetrics.data.length; index += 4) {
        const wallAlpha = wallMetrics.data[index];
        const foregroundAlpha = foregroundMetrics.data[index];
        if (wallAlpha > 8) wallPixels += 1;
        if (foregroundAlpha > 4) { foregroundPixels += 1; foregroundAlphaSum += foregroundAlpha; }
        if (wallAlpha > 8 && foregroundAlpha > 4) overlapPixels += 1;
        foregroundMaxAlpha = Math.max(foregroundMaxAlpha, foregroundAlpha);
      }
    }

    function meanAlphaInCssRect(metrics, rect) {
      if (!metrics || !bounds || !rect) return 0;
      const left = Math.max(bounds.left, rect.left);
      const top = Math.max(bounds.top, rect.top);
      const right = Math.min(bounds.right, rect.right);
      const bottom = Math.min(bounds.bottom, rect.bottom);
      if (right <= left || bottom <= top) return 0;
      const x0 = Math.max(0, Math.floor((left - bounds.left) * metrics.scaleX));
      const y0 = Math.max(0, Math.floor((top - bounds.top) * metrics.scaleY));
      const x1 = Math.min(metrics.width, Math.ceil((right - bounds.left) * metrics.scaleX));
      const y1 = Math.min(metrics.height, Math.ceil((bottom - bounds.top) * metrics.scaleY));
      let total = 0; let count = 0;
      for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
        total += metrics.data[(y * metrics.width + x) * 4 + 3]; count += 1;
      }
      return count ? total / count : 0;
    }

    let seamRatio = 1;
    if (foregroundMetrics) {
      for (let first = 0; first < regions.length; first += 1) for (let second = first + 1; second < regions.length; second += 1) {
        if (regions[first].sequenceId !== regions[second].sequenceId) continue;
        const a = regions[first].bounds; const b = regions[second].bounds;
        const intersection = { left: Math.max(a.left,b.left), top: Math.max(a.top,b.top), right: Math.min(a.right,b.right), bottom: Math.min(a.bottom,b.bottom) };
        if (intersection.right <= intersection.left || intersection.bottom <= intersection.top) continue;
        const expanded = { left: intersection.left-4, top: intersection.top-4, right: intersection.right+4, bottom: intersection.bottom+4 };
        const inside = meanAlphaInCssRect(foregroundMetrics, intersection);
        const around = meanAlphaInCssRect(foregroundMetrics, expanded);
        if (around > 0.5) seamRatio = Math.max(seamRatio, inside / around);
      }
    }

    function alphaCount(target) {
      if (!target || target.width <= 0 || target.height <= 0) return 0;
      const pixels = target.getContext("2d", { willReadFrequently: true })?.getImageData(0,0,target.width,target.height)?.data || [];
      let count = 0;
      const stride = Math.max(4, Math.floor(pixels.length / 20000 / 4) * 4);
      for (let index = 3; index < pixels.length; index += stride) if (pixels[index] > 0) count += 1;
      return count;
    }

    return {
      application: window.NCNApplications?.current?.() || null,
      presentation,
      geometryCount: geometry.length,
      phases: [...new Set(geometry.map(item => item.phase || item.pose?.phase).filter(Boolean))],
      bounds,
      pixels: {
        wall: wallPixels,
        foreground: foregroundPixels,
        overlap: overlapPixels,
        foregroundMaxAlpha,
        foregroundMeanAlpha: foregroundPixels ? foregroundAlphaSum / foregroundPixels : 0,
        seamRatio
      },
      wallCanvas: wall ? { connected: wall.isConnected, hidden: wall.hidden, alphaSamples: alphaCount(wall) } : null,
      foregroundCanvas: foreground ? { connected: foreground.isConnected, hidden: foreground.hidden, alphaSamples: alphaCount(foreground) } : null,
      nearCanvas: near ? { hidden: near.hidden, visibility: getComputedStyle(near).visibility, alphaSamples: alphaCount(near) } : null,
      original: original ? { hidden: original.hidden, visibility: getComputedStyle(original).visibility } : null
    };
  });
}

function phaseKey(phases) {
  if (phases.some(phase => String(phase).includes("extract"))) return "extraction";
  if (phases.some(phase => String(phase).includes("turn"))) return "turning";
  if (phases.some(phase => String(phase).includes("travelling-in") || String(phase).includes("settling"))) return "inward";
  return null;
}

async function runViewport(name, viewport) {
  const page = await browser.newPage({ viewport });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(String(error?.stack || error)));

  await page.goto(`${baseUrl}?weatherTest=heavy&motionTest=large`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => (
    window.NCNIntegratedDepartments?.isReady?.() === true
    && window.NCNChamberPresentation?.snapshot?.().initialised === true
    && window.NCNIntegration?.getService?.("weather")?.afterRenderContract?.timing === "synchronous-after-completed-weather-canvas-render"
  ), null, { timeout: 30_000 });

  const before = await sample(page);
  assert.equal(before.presentation?.installationState, "ready", `${name}: presentation installation must be complete`);
  assert.equal(before.presentation?.style, "layered-chamber-settled-optical", `${name}: wall-matched style must be active`);
  assert.equal(before.presentation?.weatherSynchronized, true, `${name}: Weather composition must use the Weather-owned synchronous contract`);
  assert.equal(before.presentation?.noPrivateAnimationLoop, true, `${name}: presentation must use shared runtime only`);
  assert.equal(before.original?.visibility, "hidden", `${name}: old bright-edged renderer must be suppressed`);

  await page.click('[data-panel="filter"]');
  await page.waitForFunction(() => typeof NCN_STATE !== "undefined" && NCN_STATE.activePanel === "filter", null, { timeout: 10_000 });

  const samples = [];
  const captures = new Map();
  for (let index = 0; index < 100 && (captures.size < 3 || samples.length < 6); index += 1) {
    const current = await sample(page);
    samples.push(current);
    const key = phaseKey(current.phases);
    const inspectable = current.geometryCount > 0
      && current.pixels.wall > 0
      && current.pixels.foreground > 0
      && current.pixels.overlap > 0
      && current.foregroundCanvas?.hidden === false;
    if (key && inspectable && !captures.has(key)) {
      captures.set(key, current);
      fs.writeFileSync(`artifacts/chamber-presentation-${name}-${key}.json`, JSON.stringify(current, null, 2));
      await page.screenshot({ path: `artifacts/chamber-presentation-${name}-${key}.png`, fullPage: false });
    }
    await page.waitForTimeout(150);
  }

  const rendered = samples.filter(item => item.geometryCount > 0 && item.pixels.wall > 0);
  const foreground = samples.filter(item => item.pixels.foreground > 0 && item.pixels.overlap > 0);
  const synchronized = samples.filter(item => (
    Number(item.presentation?.weatherFrameCount || 0) > 0
    && Number(item.presentation?.maskedCanvasCount || 0) === 1
    && item.presentation?.occlusionMode === "native-rear-piecewise-conservative-cell-depth"
  ));
  const seamSafe = foreground.filter(item => item.pixels.seamRatio < 3.5 && item.pixels.foregroundMaxAlpha <= 255);

  // Interrupt a real movement with RedWire -> Dripfeed and prove no old Weather pixels are restored.
  const oldToken = samples.at(-1)?.presentation?.backupToken || null;
  await page.evaluate(() => window.NCNApplications.switchTo("dripfeed", { animate: false, reason: "chamber-weather-proof" }));
  await page.waitForFunction(() => window.NCNApplications?.current?.() === "dripfeed", null, { timeout: 15_000 });
  await page.waitForTimeout(150);
  const dripfeed = await sample(page);
  await page.screenshot({ path: `artifacts/chamber-presentation-${name}-dripfeed-clean.png`, fullPage: false });
  assert.equal(dripfeed.presentation?.backupToken, null, `${name}: Dripfeed must hold no RedWire Weather backup`);
  assert.equal(dripfeed.wallCanvas?.hidden, true, `${name}: moving wall canvas must be hidden in Dripfeed`);
  assert.equal(dripfeed.foregroundCanvas?.hidden, true, `${name}: foreground mist canvas must be hidden in Dripfeed`);
  assert.equal(dripfeed.foregroundCanvas?.alphaSamples || 0, 0, `${name}: Dripfeed must contain no foreground mist residue`);
  assert.equal(dripfeed.nearCanvas?.alphaSamples || 0, 0, `${name}: Dripfeed must contain no stale near-Weather pixels`);

  await page.evaluate(() => window.NCNApplications.switchTo("redwire", { animate: false, reason: "chamber-weather-proof-return" }));
  await page.waitForFunction(() => window.NCNApplications?.current?.() === "redwire", null, { timeout: 15_000 });
  await page.waitForFunction(old => {
    const state = window.NCNChamberPresentation?.snapshot?.();
    return state && state.backupToken && state.backupToken !== old;
  }, oldToken, { timeout: 15_000 });
  const returned = await sample(page);

  const diagnostics = {
    name, viewport, before,
    renderedSamples: rendered.length,
    synchronizedSamples: synchronized.length,
    foregroundOverlapSamples: foreground.length,
    seamSafeSamples: seamSafe.length,
    captures: Object.fromEntries(captures),
    oldToken,
    dripfeed,
    returned,
    pageErrors,
    samples
  };
  fs.writeFileSync(`artifacts/chamber-presentation-${name}-summary.json`, JSON.stringify(diagnostics, null, 2));

  assert.ok(rendered.length >= 6, `${name}: wall-matched blocks must be visibly rendered repeatedly`);
  assert.ok(foreground.length >= 3, `${name}: non-transparent foreground mist must overlap real wall pixels`);
  assert.ok(synchronized.length >= 4, `${name}: near Weather must be frame-bound to moving solids`);
  assert.ok(seamSafe.length >= 3, `${name}: foreground opacity must not show abnormal internal overlap spikes`);
  for (const key of ["extraction", "turning", "inward"]) assert.ok(captures.has(key), `${name}: ${key} requires a human-inspectable moving block/mist capture`);
  assert.equal(samples.some(item => item.original?.visibility !== "hidden"), false, `${name}: old renderer must remain suppressed`);
  assert.equal(returned.presentation?.backupToken === oldToken, false, `${name}: returning to RedWire must use a new Weather frame`);
  assert.equal(pageErrors.length, 0, `${name}: page must have no uncaught errors`);

  await page.close();
}

try {
  await runViewport("desktop", { width: 1440, height: 900 });
  await runViewport("mobile", { width: 390, height: 844 });
  console.log("PASS: frame-bound conservative Weather composition has inspectable mid-motion proof on desktop and mobile");
} finally {
  await browser.close();
}
