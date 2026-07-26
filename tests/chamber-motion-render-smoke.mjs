import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.NCN_TEST_URL || "http://127.0.0.1:4173/";
const browser = await chromium.launch({ headless: true });

async function sample(page) {
  return page.evaluate(() => {
    const service = window.NCNIntegration?.getService?.("chamber-motion")
      || window.NCNModules?.get?.("chamber-motion")
      || null;
    const snapshot = service?.snapshot?.() || null;
    const geometry = service?.getActiveGeometry?.() || [];
    const canvas = document.querySelector("canvas[data-ncn-chamber-motion-canvas='production']");
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
      timestamp: performance.now(),
      panel: typeof NCN_STATE !== "undefined" ? NCN_STATE.activePanel : null,
      lifecycle: window.NCNViewerLifecycle?.current?.() || null,
      director: window.NCNVisualDirector?.currentMode?.() || null,
      activity: window.NCNChamberMotionActivity?.snapshot?.() || null,
      snapshot,
      canvas: canvas ? {
        hidden: canvas.hidden,
        connected: canvas.isConnected,
        width: canvas.width,
        height: canvas.height,
        inkSamples
      } : null,
      poses: geometry.map(item => ({
        blockId: item.blockId,
        phase: item.pose?.phase || item.phase || null,
        centre: [...(item.pose?.centre || item.pose?.center || [])],
        thickness: Number(item.pose?.thickness || 0)
      }))
    };
  });
}

async function runViewport(name, viewport) {
  const page = await browser.newPage({ viewport });
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(String(error?.stack || error)));

  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => (
    window.NCNIntegratedDepartments?.isReady?.() === true
    && Boolean(window.NCNIntegration?.getService?.("chamber-motion"))
    && window.NCNChamberMotionController?.snapshot?.().bound === true
  ), null, { timeout: 30_000 });

  const before = await sample(page);
  assert.equal(before.snapshot?.initialised, true, `${name}: chamber movement service should initialise`);
  assert.equal(before.snapshot?.enabled, true, `${name}: RedWire movement profile should be enabled`);
  assert.equal(before.snapshot?.adapter?.canvasConnected, true, `${name}: movement canvas should be connected`);

  await page.click('[data-panel="filter"]');
  await page.waitForFunction(() => typeof NCN_STATE !== "undefined" && NCN_STATE.activePanel === "filter", null, {
    timeout: 10_000
  });

  const samples = [];
  for (let index = 0; index < 34; index += 1) {
    samples.push(await sample(page));
    await page.waitForTimeout(200);
  }

  const active = samples.filter(item => Number(item.snapshot?.activeSequenceCount || 0) > 0);
  const rendered = samples.filter(item => (
    item.snapshot?.adapter?.canvasVisible === true
    && item.canvas?.hidden === false
    && item.canvas?.inkSamples > 0
    && item.poses.length > 0
  ));
  const phases = new Set(samples.flatMap(item => item.poses.map(pose => pose.phase)));
  const tracks = new Map();
  for (const item of samples) {
    for (const pose of item.poses) {
      if (pose.centre.length !== 3) continue;
      const track = tracks.get(pose.blockId) || [];
      track.push(pose.centre);
      tracks.set(pose.blockId, track);
    }
  }

  let greatestTravel = 0;
  for (const track of tracks.values()) {
    for (let first = 0; first < track.length; first += 1) {
      for (let second = first + 1; second < track.length; second += 1) {
        const distance = Math.hypot(
          track[first][0] - track[second][0],
          track[first][1] - track[second][1],
          track[first][2] - track[second][2]
        );
        greatestTravel = Math.max(greatestTravel, distance);
      }
    }
  }

  const diagnostics = {
    name,
    viewport,
    before,
    activeSamples: active.length,
    renderedSamples: rendered.length,
    phases: [...phases],
    greatestTravel,
    controller: await page.evaluate(() => window.NCNChamberMotionController?.snapshot?.() || null),
    activity: await page.evaluate(() => window.NCNChamberMotionActivity?.snapshot?.() || null),
    consoleErrors,
    pageErrors,
    samples
  };
  console.log(`CHAMBER_RENDER_DIAGNOSTICS:${JSON.stringify(diagnostics)}`);

  assert.ok(active.length >= 8, `${name}: movement should remain active across multiple rendered samples`);
  assert.ok(rendered.length >= 6, `${name}: the canvas should contain visible non-transparent cube pixels`);
  assert.ok(
    phases.has("travelling-out") || phases.has("turning") || phases.has("travelling-in"),
    `${name}: movement must progress beyond extraction`
  );
  assert.ok(greatestTravel > 0.6, `${name}: at least one cube must travel visibly through world space`);
  assert.equal(pageErrors.length, 0, `${name}: page should have no uncaught errors`);

  await page.click('[data-panel="filter"]');
  await page.waitForFunction(() => typeof NCN_STATE !== "undefined" && NCN_STATE.activePanel == null, null, {
    timeout: 10_000
  });
  await page.waitForFunction(() => {
    const service = window.NCNIntegration?.getService?.("chamber-motion");
    const state = service?.snapshot?.();
    return state
      && state.activeSequenceCount === 0
      && state.reservedRouteCount === 0
      && state.adapter?.activePoseCount === 0
      && state.adapter?.canvasVisible === false;
  }, null, { timeout: 10_000 });

  await page.screenshot({ path: `artifacts/chamber-motion-${name}.png`, fullPage: true });
  await page.close();
}

try {
  await runViewport("desktop", { width: 1440, height: 900 });
  await runViewport("mobile", { width: 390, height: 844 });
  console.log("PASS: rendered chamber movement travels visibly on desktop and mobile");
} finally {
  await browser.close();
}
