import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";

const baseUrl = process.env.NCN_TEST_URL || "http://127.0.0.1:4173/";
const artifactRoot = "artifacts/integration-roundtrip";
const browser = await chromium.launch({ headless: true });
fs.mkdirSync(artifactRoot, { recursive: true });

function safeName(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
}

async function pageSnapshot(page) {
  return page.evaluate(() => {
    const state = typeof NCN_STATE !== "undefined" ? NCN_STATE : null;
    const visibleRoots = ["redwire-root", "dripfeed-root"].filter(id => {
      const node = document.getElementById(id);
      return node && !node.hidden && getComputedStyle(node).display !== "none";
    });
    const weather = window.NCNIntegration?.getService?.("weather")?.snapshot?.() || null;
    const motion = window.NCNIntegration?.getService?.("chamber-motion")?.snapshot?.() || null;
    const effects = window.NCNIntegration?.getService?.("effects")?.snapshot?.() || null;
    const canvases = [...document.querySelectorAll("canvas.ncn-department-weather-canvas")];
    let visibleWeatherCanvases = 0;
    let weatherInk = 0;

    for (const canvas of canvases) {
      if (!canvas.hidden && getComputedStyle(canvas).visibility !== "hidden") {
        visibleWeatherCanvases += 1;
      }
      if (!canvas.width || !canvas.height) continue;
      try {
        const context = canvas.getContext("2d", { willReadFrequently: true });
        const pixels = context?.getImageData?.(0, 0, canvas.width, canvas.height)?.data || [];
        for (let index = 3; index < pixels.length; index += 4 * 16) {
          if (pixels[index] > 2) weatherInk += 1;
        }
      } catch {
        // Pixel readback is diagnostic only; screenshots remain the visual oracle.
      }
    }

    return {
      application: window.NCNApplications?.current?.() || state?.activeApp || null,
      lifecycle: window.NCNViewerLifecycle?.current?.() || null,
      visibleRoots,
      weather,
      motion,
      effects,
      weatherCanvasCount: canvases.length,
      visibleWeatherCanvases,
      weatherInk,
      activePanel: state?.activePanel || null,
      expandedEntryId: state?.expandedEntryId || null,
      selectedEntryId: state?.selectedEntryId || null,
      opticalEnabled: window.OpticalProjection?.isEnabled?.() ?? null,
      chamberEnabled: window.LayeredChamber?.isEnabled?.() ?? null
    };
  });
}

async function waitForIntegratedViewer(page) {
  await page.waitForFunction(() => (
    window.NCNIntegratedDepartments?.isReady?.() === true
    && Boolean(window.NCNIntegration?.getService?.("effects"))
    && Boolean(window.NCNIntegration?.getService?.("weather"))
    && Boolean(window.NCNIntegration?.getService?.("chamber-motion"))
    && Boolean(window.NCNApplications?.switchTo)
  ), null, { timeout: 30_000 });
  await page.evaluate(() => window.NCNViewerHost?.verify?.({ throwOnFailure: true }));
}

async function capture(page, viewportName, stateName, records) {
  const stem = `${safeName(viewportName)}-${safeName(stateName)}`;
  const snapshot = await pageSnapshot(page);
  const screenshot = `${artifactRoot}/${stem}.png`;
  await page.screenshot({ path: screenshot, fullPage: true });
  records.push({ state: stateName, snapshot, screenshot });
  fs.writeFileSync(
    `${artifactRoot}/${safeName(viewportName)}-partial.json`,
    JSON.stringify({ viewportName, records }, null, 2)
  );
  return snapshot;
}

async function openPanel(page, name) {
  await page.click(`[data-panel="${name}"]`);
  await page.waitForFunction(expected => (
    typeof NCN_STATE !== "undefined" && NCN_STATE.activePanel === expected
  ), name, { timeout: 10_000 });
  await page.waitForSelector("#feed > .entry.panel", { state: "visible", timeout: 10_000 });
}

async function closePanel(page, name) {
  await page.click(`[data-panel="${name}"]`);
  await page.waitForFunction(() => (
    typeof NCN_STATE !== "undefined" && NCN_STATE.activePanel == null
  ), null, { timeout: 10_000 });
}

async function verifyFilterContract(page) {
  const values = await page.locator("#feed > .entry.panel .ncn-select-value").allTextContents();
  assert.deepEqual(
    values.map(value => value.trim().toLowerCase()),
    ["empty", "empty", "empty", "empty", "now"],
    "empty category/area/priority/source sets must remain the deliberate unrestricted default"
  );
}

async function selectStory(page, mobile) {
  const story = page.locator("#feed > .entry:not(.panel)").first();
  await story.waitFor({ state: "visible", timeout: 10_000 });
  const entryId = await story.getAttribute("data-entry-id");
  assert.ok(entryId, "first RedWire story should have an entry id");
  await story.click();

  if (mobile) {
    await page.waitForFunction(id => (
      typeof NCN_STATE !== "undefined"
      && NCN_STATE.expandedEntryId === id
      && document.querySelector(`[data-entry-id="${CSS.escape(id)}"]`)?.classList.contains("expanded")
    ), entryId, { timeout: 10_000 });
  } else {
    await page.waitForFunction(id => (
      typeof NCN_STATE !== "undefined" && NCN_STATE.selectedEntryId === id
    ), entryId, { timeout: 10_000 });
    await page.waitForSelector("#desktop-inspector .headline", { state: "visible", timeout: 10_000 });
  }
}

async function switchApplication(page, application) {
  await page.evaluate(async name => {
    await window.NCNApplications.switchTo(name, {
      animate: false,
      reason: "integration-visual-roundtrip"
    });
  }, application);
  await page.waitForFunction(name => (
    window.NCNApplications?.current?.() === name
    && document.documentElement.dataset.ncnApp === name
  ), application, { timeout: 15_000 });
}

async function runViewport(viewportName, viewport) {
  const page = await browser.newPage({ viewport });
  const consoleErrors = [];
  const pageErrors = [];
  const records = [];
  const mobile = viewport.width <= 600;

  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(String(error?.stack || error)));

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForIntegratedViewer(page);
    await page.waitForTimeout(1600);

    const initial = await capture(page, viewportName, "redwire-initial", records);
    assert.equal(initial.application, "redwire", `${viewportName}: RedWire should be the initial application`);
    assert.deepEqual(initial.visibleRoots, ["redwire-root"], `${viewportName}: only RedWire should be visible initially`);
    assert.equal(initial.weather?.enabled, true, `${viewportName}: Weather should be enabled for RedWire`);
    assert.ok(Number(initial.weather?.targetIntensity ?? initial.weather?.currentIntensity ?? 0) > 0, `${viewportName}: RedWire should request visible mist`);
    assert.equal(initial.weatherCanvasCount, 4, `${viewportName}: Weather should own four canvases`);
    assert.equal(initial.visibleWeatherCanvases, 4, `${viewportName}: RedWire Weather canvases should be visible`);

    await openPanel(page, "filter");
    await verifyFilterContract(page);
    await capture(page, viewportName, "filter", records);
    await closePanel(page, "filter");

    await openPanel(page, "submit");
    assert.ok(await page.locator("#feed > .entry.panel .submit-form").count(), `${viewportName}: Submit panel should render its form`);
    await capture(page, viewportName, "submit", records);
    await closePanel(page, "submit");

    await selectStory(page, mobile);
    await capture(page, viewportName, mobile ? "article-expanded" : "article-selected", records);

    await switchApplication(page, "dripfeed");
    await page.waitForSelector("#dripfeed-root .listing-tile", { state: "visible", timeout: 15_000 });
    await page.waitForFunction(() => {
      const weather = window.NCNIntegration?.getService?.("weather")?.snapshot?.();
      const motion = window.NCNIntegration?.getService?.("chamber-motion")?.snapshot?.();
      return weather?.enabled === false && motion?.enabled === false;
    }, null, { timeout: 15_000 });
    const dripfeed = await capture(page, viewportName, "dripfeed-wall", records);
    assert.deepEqual(dripfeed.visibleRoots, ["dripfeed-root"], `${viewportName}: only Dripfeed should be visible after switching`);
    assert.equal(Number(dripfeed.weather?.targetIntensity ?? 0), 0, `${viewportName}: Dripfeed should request zero Weather intensity`);
    assert.equal(dripfeed.visibleWeatherCanvases, 0, `${viewportName}: Weather canvases should be hidden in Dripfeed`);

    await page.locator("#dripfeed-root .listing-tile").first().click();
    await page.waitForSelector("#dripfeed-root [data-overlay='reader'].reader-resolved", {
      state: "visible",
      timeout: 15_000
    });
    assert.ok(await page.locator("#dripfeed-root .reader-card").count(), `${viewportName}: Dripfeed reader should contain a card`);
    await capture(page, viewportName, "dripfeed-reader", records);

    await page.locator("#dripfeed-root [data-action='close-reader']").first().click();
    await page.waitForFunction(() => (
      document.querySelector("#dripfeed-root [data-overlay='reader']")?.getAttribute("aria-hidden") === "true"
    ), null, { timeout: 15_000 });

    await switchApplication(page, "redwire");
    await page.waitForFunction(() => {
      const weather = window.NCNIntegration?.getService?.("weather")?.snapshot?.();
      const motion = window.NCNIntegration?.getService?.("chamber-motion")?.snapshot?.();
      return weather?.enabled === true && motion?.enabled === true;
    }, null, { timeout: 15_000 });
    await page.waitForTimeout(1600);
    const returned = await capture(page, viewportName, "redwire-return", records);
    assert.deepEqual(returned.visibleRoots, ["redwire-root"], `${viewportName}: only RedWire should be visible after the round trip`);
    assert.ok(Number(returned.weather?.targetIntensity ?? returned.weather?.currentIntensity ?? 0) > 0, `${viewportName}: RedWire mist intensity should be restored`);
    assert.equal(returned.visibleWeatherCanvases, 4, `${viewportName}: all Weather canvases should return`);

    assert.deepEqual(pageErrors, [], `${viewportName}: no uncaught page errors are allowed`);
    assert.deepEqual(consoleErrors, [], `${viewportName}: no browser console errors are allowed`);

    fs.writeFileSync(
      `${artifactRoot}/${safeName(viewportName)}.json`,
      JSON.stringify({ viewportName, viewport, records, consoleErrors, pageErrors }, null, 2)
    );
  } catch (error) {
    const failure = String(error?.stack || error);
    fs.writeFileSync(`${artifactRoot}/${safeName(viewportName)}-failure.txt`, failure);
    try {
      await page.screenshot({
        path: `${artifactRoot}/${safeName(viewportName)}-failure.png`,
        fullPage: true
      });
    } catch {
      // Preserve the original failure if the page itself is no longer available.
    }
    throw error;
  } finally {
    await page.close();
  }
}

try {
  await runViewport("desktop", { width: 1440, height: 900 });
  await runViewport("mobile", { width: 390, height: 844 });
  console.log("PASS: RedWire, panels, article state, Dripfeed reader and environment profiles survive a desktop/mobile round trip");
} catch (error) {
  console.error(error?.stack || error);
  throw error;
} finally {
  await browser.close();
}
