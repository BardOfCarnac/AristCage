import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";

const baseUrl = process.env.NCN_TEST_URL || "http://127.0.0.1:4173/";
const artifactRoot = "artifacts/dev-panel-browser";
const browser = await chromium.launch({ headless: true });
fs.mkdirSync(artifactRoot, { recursive: true });

function safeName(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
}

async function waitForViewer(page) {
  await page.waitForFunction(() => (
    window.NCNIntegratedDepartments?.isReady?.() === true
    && Boolean(window.NCNIntegration?.getService?.("weather"))
    && Boolean(window.NCNIntegration?.getService?.("chamber-motion"))
    && Boolean(window.NCNDevPanel)
    && Boolean(window.NCNViewerRuntime)
  ), null, { timeout: 30_000 });
  await page.evaluate(() => window.NCNViewerHost?.verify?.({ throwOnFailure: true }));
}

async function setRange(page, name, value) {
  await page.locator(`[data-debug-weather-input="${name}"]`).evaluate((input, next) => {
    input.value = String(next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

async function diagnosticsSnapshot(page) {
  return page.evaluate(() => ({
    rootClass: document.documentElement.classList.contains("diagnostics-on"),
    preview: document.documentElement.dataset.devEnvironmentPreview || null,
    hiddenLayers: document.documentElement.dataset.debugWeatherHiddenLayers || null,
    application: window.NCNApplications?.current?.() || null,
    environment: window.NCNEnvironment?.current?.() || null,
    panel: window.NCNDevPanel?.snapshot?.() || null,
    weather: window.NCNIntegration?.getService?.("weather")?.snapshot?.() || null,
    runtime: window.NCNViewerRuntime?.snapshot?.() || null
  }));
}

async function waitForDiagnostics(page, enabled) {
  await page.waitForFunction(expected => {
    const snapshot = window.NCNDevPanel?.snapshot?.();
    return document.documentElement.classList.contains("diagnostics-on") === expected
      && snapshot?.diagnosticsActive === expected
      && snapshot?.telemetryActive === expected
      && snapshot?.bindingsActive === expected;
  }, enabled, { timeout: 15_000 });
}

async function switchApplication(page, name) {
  await page.locator(`[data-debug-app="${name}"]`).first().click();
  await page.waitForFunction(expected => (
    window.NCNApplications?.current?.() === expected
    && document.documentElement.dataset.ncnApp === expected
  ), name, { timeout: 15_000 });
}

async function capture(page, viewportName, stateName) {
  const path = `${artifactRoot}/${safeName(viewportName)}-${safeName(stateName)}.png`;
  await page.screenshot({ path, fullPage: true });
  return path;
}

async function verifyPanelGeometry(page, viewportName) {
  const geometry = await page.evaluate(() => {
    const panel = document.querySelector(".diagnostics-panel");
    const toggle = document.querySelector(".diagnostics-toggle");
    const panelRect = panel.getBoundingClientRect();
    const toggleRect = toggle.getBoundingClientRect();
    const buttons = [...panel.querySelectorAll("button")]
      .filter(button => getComputedStyle(button).display !== "none")
      .map(button => {
        const rect = button.getBoundingClientRect();
        return { width: rect.width, height: rect.height, left: rect.left, right: rect.right };
      });
    return {
      panel: {
        left: panelRect.left,
        right: panelRect.right,
        top: panelRect.top,
        bottom: panelRect.bottom,
        width: panelRect.width,
        height: panelRect.height,
        clientWidth: panel.clientWidth,
        clientHeight: panel.clientHeight,
        scrollWidth: panel.scrollWidth,
        scrollHeight: panel.scrollHeight,
        overflowY: getComputedStyle(panel).overflowY
      },
      toggle: {
        left: toggleRect.left,
        right: toggleRect.right,
        top: toggleRect.top,
        bottom: toggleRect.bottom,
        width: toggleRect.width,
        height: toggleRect.height
      },
      buttons
    };
  });

  assert.ok(geometry.panel.scrollHeight > geometry.panel.clientHeight, `${viewportName}: the full laboratory should require and support internal scrolling`);
  assert.ok(["auto", "scroll"].includes(geometry.panel.overflowY), `${viewportName}: diagnostics panel must expose vertical scrolling`);
  assert.ok(geometry.panel.scrollWidth <= geometry.panel.clientWidth + 2, `${viewportName}: diagnostics panel must not overflow horizontally`);
  assert.ok(
    geometry.panel.right <= geometry.toggle.left || geometry.panel.bottom <= geometry.toggle.top || geometry.panel.left >= geometry.toggle.right,
    `${viewportName}: the diagnostics panel must not cover the Dev-off control`
  );
  assert.ok(geometry.buttons.length > 12, `${viewportName}: mounted laboratory should expose its real controls`);
  assert.ok(geometry.buttons.every(button => button.height >= 30), `${viewportName}: all visible buttons should retain practical activation height`);
  assert.ok(geometry.buttons.every(button => button.left >= geometry.panel.left - 1 && button.right <= geometry.panel.right + 1), `${viewportName}: buttons must stay inside the panel`);
}

async function verifyWeatherControls(page, viewportName) {
  await page.locator('[data-debug-weather="heavy"]').click();
  await page.waitForFunction(() => {
    const weather = window.NCNIntegration?.getService?.("weather")?.snapshot?.();
    return weather?.targetPreset === "heavy-mist" && Math.abs(Number(weather.targetIntensity) - 0.8) < 0.01;
  }, null, { timeout: 15_000 });

  await setRange(page, "duration", 0);
  await setRange(page, "intensity", 0.67);
  await setRange(page, "wind-x", 0.35);
  await setRange(page, "wind-y", -0.2);
  await setRange(page, "wind-z", 0.15);
  await setRange(page, "reading", 0.31);
  await setRange(page, "controls", 0.44);
  await page.locator('[data-debug-weather-input="quality"]').selectOption("high");
  await page.locator('[data-debug-weather-action="apply"]').click();

  await page.waitForFunction(() => {
    const weather = window.NCNIntegration?.getService?.("weather")?.snapshot?.();
    return weather?.targetPreset === "heavy-mist"
      && Math.abs(Number(weather.targetIntensity) - 0.67) < 0.01
      && Math.abs(Number(weather.wind?.x) - 0.35) < 0.01
      && Math.abs(Number(weather.wind?.y) + 0.2) < 0.01
      && Math.abs(Number(weather.wind?.z) - 0.15) < 0.01
      && weather.qualityOverride === "high";
  }, null, { timeout: 15_000 });

  const initialSeed = await page.evaluate(() => window.NCNIntegration.getService("weather").snapshot().seed);
  await page.locator('[data-debug-weather-input="seed"]').fill("98765");
  await page.locator('[data-debug-weather-action="reseed"]').click();
  await page.waitForFunction(previous => window.NCNIntegration.getService("weather").snapshot().seed !== previous, initialSeed, { timeout: 10_000 });

  await page.locator('[data-debug-weather-layer="near"]').click();
  await page.waitForFunction(() => (
    document.documentElement.dataset.debugWeatherHiddenLayers?.split(/\s+/).includes("near")
    && getComputedStyle(document.querySelector(".ncn-department-weather-near")).visibility === "hidden"
  ), null, { timeout: 10_000 });

  const runtimeMetric = page.locator('[data-debug-weather-metric="runtime"]');
  const before = await runtimeMetric.textContent();
  await page.waitForFunction(previous => {
    const node = document.querySelector('[data-debug-weather-metric="runtime"]');
    return node && node.textContent !== previous;
  }, before, { timeout: 5_000 });

  const report = await page.evaluate(() => window.NCNDevPanel.weatherReport());
  assert.equal(report.selectedPreset, "heavy", `${viewportName}: diagnostic report should retain selected preset`);
  assert.deepEqual(report.hiddenLayers, ["near"], `${viewportName}: report should include canvas isolation`);
  assert.equal(report.controls.quality, "high", `${viewportName}: report should include quality override`);
}

async function verifyDisabledCleanup(page, viewportName, application) {
  await page.locator(".diagnostics-toggle").click();
  await waitForDiagnostics(page, false);

  await page.waitForFunction(expected => {
    const weather = window.NCNIntegration?.getService?.("weather")?.snapshot?.();
    if (expected === "dripfeed") return weather?.enabled === false && Number(weather.targetIntensity) === 0;
    return weather?.enabled === true
      && weather.targetPreset === "mist"
      && Math.abs(Number(weather.targetIntensity) - 0.46) < 0.01;
  }, application, { timeout: 15_000 });

  const cleaned = await diagnosticsSnapshot(page);
  assert.equal(cleaned.rootClass, false, `${viewportName}/${application}: diagnostics class should be removed`);
  assert.equal(cleaned.preview, null, `${viewportName}/${application}: preview lift should be removed`);
  assert.equal(cleaned.hiddenLayers, null, `${viewportName}/${application}: layer isolation should be cleared`);
  assert.equal(cleaned.panel.telemetryActive, false, `${viewportName}/${application}: telemetry task should be unregistered`);
  assert.equal(cleaned.panel.telemetryTask, null, `${viewportName}/${application}: no diagnostics task handle should remain`);
  assert.equal(cleaned.panel.bindingsActive, false, `${viewportName}/${application}: delegated controls should be unbound`);
  assert.equal(cleaned.panel.motionBindingsActive, false, `${viewportName}/${application}: movement listeners should be unbound`);
  assert.equal(cleaned.panel.eventSubscriptionCount, 0, `${viewportName}/${application}: event-bus subscriptions should be released`);
  assert.equal(cleaned.panel.overrideActive, false, `${viewportName}/${application}: override state should be cleared`);
  assert.equal(cleaned.environment, application, `${viewportName}/${application}: canonical application profile should be active`);
}

async function enableWithKeyboard(page) {
  await page.keyboard.press("Control+Shift+D");
  await waitForDiagnostics(page, true);
}

async function runViewport(viewportName, viewport) {
  const mobile = viewport.width <= 600;
  const page = await browser.newPage({ viewport });
  const consoleErrors = [];
  const pageErrors = [];

  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(String(error?.stack || error)));

  try {
    await page.goto(`${baseUrl}?debug=1`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForViewer(page);
    await waitForDiagnostics(page, true);
    await page.waitForSelector("[data-debug-weather-lab]", { state: "visible", timeout: 10_000 });

    await verifyPanelGeometry(page, viewportName);
    await capture(page, viewportName, "laboratory-top");
    await page.locator(".diagnostics-panel").evaluate(panel => { panel.scrollTop = panel.scrollHeight; });
    await capture(page, viewportName, "laboratory-bottom");
    await page.locator(".diagnostics-panel").evaluate(panel => { panel.scrollTop = 0; });

    await verifyWeatherControls(page, viewportName);
    await switchApplication(page, "dripfeed");
    await page.waitForSelector("#dripfeed-root .listing-tile", { state: "visible", timeout: 15_000 });
    await page.locator('[data-debug-weather="mist"]').click();
    await page.waitForFunction(() => document.documentElement.dataset.devEnvironmentPreview === "true", null, { timeout: 10_000 });
    await page.locator('[data-debug-weather-layer="rear"]').click();
    await verifyDisabledCleanup(page, viewportName, "dripfeed");

    await page.locator("#dripfeed-root .listing-tile").first().click();
    await page.waitForSelector("#dripfeed-root [data-overlay='reader'].reader-resolved", { state: "visible", timeout: 15_000 });
    await page.locator("#dripfeed-root [data-action='close-reader']").first().click();
    await page.waitForFunction(() => document.querySelector("#dripfeed-root [data-overlay='reader']")?.getAttribute("aria-hidden") === "true", null, { timeout: 15_000 });

    await enableWithKeyboard(page);
    await switchApplication(page, "redwire");
    await page.locator('[data-debug-weather="heavy"]').click();
    await page.locator('[data-debug-weather-layer="far"]').click();
    await verifyDisabledCleanup(page, viewportName, "redwire");

    const story = page.locator("#feed > .entry:not(.panel)").first();
    await story.waitFor({ state: "visible", timeout: 10_000 });
    await story.click();
    if (mobile) {
      await page.waitForFunction(() => Boolean(document.querySelector("#feed > .entry.expanded")), null, { timeout: 10_000 });
    } else {
      await page.waitForSelector("#desktop-inspector .headline", { state: "visible", timeout: 10_000 });
    }

    assert.deepEqual(pageErrors, [], `${viewportName}: no uncaught page errors are allowed`);
    assert.deepEqual(consoleErrors, [], `${viewportName}: no browser console errors are allowed`);

    const final = await diagnosticsSnapshot(page);
    fs.writeFileSync(`${artifactRoot}/${safeName(viewportName)}.json`, JSON.stringify({ viewportName, viewport, final, consoleErrors, pageErrors }, null, 2));
  } catch (error) {
    fs.writeFileSync(`${artifactRoot}/${safeName(viewportName)}-failure.txt`, String(error?.stack || error));
    try {
      await page.screenshot({ path: `${artifactRoot}/${safeName(viewportName)}-failure.png`, fullPage: true });
    } catch {
      // Preserve the original failure.
    }
    throw error;
  } finally {
    await page.close();
  }
}

try {
  await runViewport("desktop", { width: 1440, height: 900 });
  await runViewport("mobile", { width: 390, height: 844 });
  console.log("PASS: Weather laboratory interaction, cleanup and RedWire/Dripfeed usability verified on desktop and mobile");
} finally {
  await browser.close();
}
