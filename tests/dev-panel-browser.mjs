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
    panelHidden: document.documentElement.classList.contains("diagnostics-panel-hidden"),
    preview: document.documentElement.dataset.devEnvironmentPreview || null,
    hiddenLayers: document.documentElement.dataset.debugWeatherHiddenLayers || null,
    application: window.NCNApplications?.current?.() || null,
    environment: window.NCNEnvironment?.current?.() || null,
    panel: window.NCNDevPanel?.snapshot?.() || null,
    weather: window.NCNIntegration?.getService?.("weather")?.snapshot?.() || null,
    runtime: window.NCNViewerRuntime?.snapshot?.() || null
  }));
}

async function weatherBaseline(page) {
  return page.evaluate(() => {
    const weather = window.NCNIntegration?.getService?.("weather")?.snapshot?.();
    return {
      qualityOverride: weather?.qualityOverride || "auto",
      seed: weather?.seed ?? null
    };
  });
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
      .map(button => {
        const style = getComputedStyle(button);
        const rect = button.getBoundingClientRect();
        return {
          label: button.textContent.trim(),
          width: rect.width,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          rendered: button.getClientRects().length > 0
            && style.display !== "none"
            && style.visibility !== "hidden"
        };
      })
      .filter(button => button.rendered);
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
    `${viewportName}: the diagnostics panel must not cover the Dev hide/show control`
  );
  assert.ok(geometry.buttons.length > 12, `${viewportName}: mounted laboratory should expose its real controls`);
  const undersized = geometry.buttons.filter(button => button.height < 30);
  assert.deepEqual(undersized, [], `${viewportName}: all rendered buttons should retain practical activation height`);
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

function assertWeatherPreviewPreserved(actual, expected, label) {
  assert.equal(actual.preview, expected.preview, `${label}: environment preview lift must survive`);
  assert.equal(actual.weather.enabled, expected.weather.enabled, `${label}: Weather enabled state must survive`);
  assert.equal(actual.weather.targetPreset, expected.weather.targetPreset, `${label}: Weather preset must survive`);
  assert.equal(actual.weather.targetIntensity, expected.weather.targetIntensity, `${label}: Weather intensity must survive`);
  assert.equal(actual.weather.qualityOverride, expected.weather.qualityOverride, `${label}: Weather quality must survive`);
  assert.equal(actual.weather.seed, expected.weather.seed, `${label}: Weather seed must survive`);
}

async function waitForPanelPresentation(page, hidden) {
  await page.waitForFunction(expectedHidden => {
    const root = document.documentElement;
    const panel = document.querySelector(".diagnostics-panel");
    const toggle = document.querySelector(".diagnostics-toggle");
    return root.classList.contains("diagnostics-on")
      && root.classList.contains("diagnostics-panel-hidden") === expectedHidden
      && (getComputedStyle(panel).display === "none") === expectedHidden
      && toggle?.textContent === (expectedHidden ? "Dev show" : "Dev hide");
  }, hidden, { timeout: 10_000 });
}

async function verifyPresentationRoute(page, viewportName, routeName, trigger) {
  const before = await diagnosticsSnapshot(page);
  await trigger();
  await waitForPanelPresentation(page, true);

  const hidden = await diagnosticsSnapshot(page);
  assert.equal(hidden.rootClass, true, `${viewportName}/${routeName}: presentation toggle must keep diagnostics active`);
  assert.equal(hidden.panelHidden, true, `${viewportName}/${routeName}: panel should hide without exiting`);
  assert.equal(hidden.panel.diagnosticsActive, true, `${viewportName}/${routeName}: laboratory session must remain active`);
  assert.equal(hidden.panel.telemetryActive, true, `${viewportName}/${routeName}: telemetry must remain active`);
  assertWeatherPreviewPreserved(hidden, before, `${viewportName}/${routeName}/hidden`);

  await trigger();
  await waitForPanelPresentation(page, false);
  const shown = await diagnosticsSnapshot(page);
  assert.equal(shown.panelHidden, false, `${viewportName}/${routeName}: second gesture must reveal the panel`);
  assertWeatherPreviewPreserved(shown, before, `${viewportName}/${routeName}/shown`);
}

async function tripleTapRailMark(page) {
  const mark = page.locator(".rail-mark");
  for (let index = 0; index < 3; index += 1) await mark.click();
}

async function verifyPanelHidePreservesWeather(page, viewportName) {
  await verifyPresentationRoute(page, viewportName, "floating-control", () => page.locator(".diagnostics-toggle").click());
}

async function verifyKeyboardAndMarkPreserveWeather(page, viewportName) {
  await verifyPresentationRoute(page, viewportName, "keyboard", () => page.keyboard.press("Control+Shift+D"));
  await verifyPresentationRoute(page, viewportName, "triple-mark", () => tripleTapRailMark(page));
}

async function verifyDisabledCleanup(page, viewportName, application, baseline) {
  await page.locator(".diagnostics-panel").evaluate(panel => { panel.scrollTop = panel.scrollHeight; });
  await page.waitForFunction(() => {
    const panel = document.querySelector(".diagnostics-panel");
    const title = document.querySelector(".diagnostics-title");
    const exit = document.querySelector("[data-debug-disable-diagnostics]");
    const panelRect = panel.getBoundingClientRect();
    const exitRect = exit.getBoundingClientRect();
    return getComputedStyle(title).position === "sticky"
      && exit.getClientRects().length > 0
      && exitRect.top >= panelRect.top - 1
      && exitRect.bottom <= panelRect.bottom + 1;
  }, null, { timeout: 10_000 });
  await page.locator("[data-debug-disable-diagnostics]").click();
  await waitForDiagnostics(page, false);

  await page.waitForFunction(({ expectedApplication, expectedBaseline }) => {
    const weather = window.NCNIntegration?.getService?.("weather")?.snapshot?.();
    const applicationReady = expectedApplication === "dripfeed"
      ? weather?.enabled === false && Number(weather.targetIntensity) === 0
      : weather?.enabled === true
        && weather.targetPreset === "mist"
        && Math.abs(Number(weather.targetIntensity) - 0.46) < 0.01;
    return applicationReady
      && weather?.qualityOverride === expectedBaseline.qualityOverride
      && weather?.seed === expectedBaseline.seed;
  }, { expectedApplication: application, expectedBaseline: baseline }, { timeout: 15_000 });

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
  assert.equal(cleaned.weather.qualityOverride, baseline.qualityOverride, `${viewportName}/${application}: Weather quality must return to its canonical pre-lab value`);
  assert.equal(cleaned.weather.seed, baseline.seed, `${viewportName}/${application}: Weather seed must return to its canonical pre-lab value`);
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
    await verifyKeyboardAndMarkPreserveWeather(page, viewportName);
    await switchApplication(page, "dripfeed");
    await page.waitForSelector("#dripfeed-root .listing-tile", { state: "visible", timeout: 15_000 });
    const dripfeedBaseline = await weatherBaseline(page);
    assert.equal(dripfeedBaseline.qualityOverride, "auto", `${viewportName}/dripfeed: canonical profile should own automatic Weather quality`);
    await page.locator('[data-debug-weather="mist"]').click();
    await page.waitForFunction(() => document.documentElement.dataset.devEnvironmentPreview === "true", null, { timeout: 10_000 });
    await verifyPanelHidePreservesWeather(page, viewportName);
    await page.locator('[data-debug-weather-layer="rear"]').click();
    await verifyDisabledCleanup(page, viewportName, "dripfeed", dripfeedBaseline);

    await page.locator("#dripfeed-root .listing-tile").first().click();
    await page.waitForSelector("#dripfeed-root [data-overlay='reader'].reader-resolved", { state: "visible", timeout: 15_000 });
    await page.locator("#dripfeed-root [data-action='close-reader']").first().click();
    await page.waitForFunction(() => document.querySelector("#dripfeed-root [data-overlay='reader']")?.getAttribute("aria-hidden") === "true", null, { timeout: 15_000 });

    await enableWithKeyboard(page);
    await switchApplication(page, "redwire");
    const redwireBaseline = await weatherBaseline(page);
    assert.equal(redwireBaseline.qualityOverride, "auto", `${viewportName}/redwire: canonical profile should own automatic Weather quality`);
    await page.locator('[data-debug-weather="heavy"]').click();
    await page.locator('[data-debug-weather-layer="far"]').click();
    await verifyDisabledCleanup(page, viewportName, "redwire", redwireBaseline);

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
  console.log("PASS: All diagnostics presentation routes preserve Weather, sticky explicit cleanup works, and RedWire/Dripfeed remain usable on desktop and mobile");
} finally {
  await browser.close();
}
