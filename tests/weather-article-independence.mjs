import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const artifactRoot = path.join(root, "artifacts", "integration-roundtrip", "weather-article-independence");
fs.mkdirSync(artifactRoot, { recursive: true });

const browser = await chromium.launch({ headless: true });
const browserErrors = [];
let page = null;

function stablePolicy(snapshot) {
  return {
    targetPreset: snapshot.targetPreset,
    targetIntensity: snapshot.targetIntensity,
    quality: snapshot.quality,
    qualityOverride: snapshot.qualityOverride,
    seed: snapshot.seed,
    wind: snapshot.wind,
    controls: snapshot.zones?.controls,
    visibleCanvases: snapshot.resources?.visibleCanvases
  };
}

async function mountedSnapshot(targetPage) {
  return targetPage.evaluate(() => {
    const weather = window.NCNIntegration?.getService?.("weather");
    const snapshot = weather?.snapshot?.() || null;
    const currentView = window.NCNViewerHost?.context?.().views?.current?.() || null;
    return {
      weather: snapshot,
      expandedEntryId: typeof NCN_STATE !== "undefined" ? NCN_STATE.expandedEntryId : null,
      hostReading: Boolean(currentView?.isReading?.()),
      visibleWeatherCanvases: [...document.querySelectorAll(".ncn-department-weather-canvas")]
        .filter(canvas => !canvas.hidden && getComputedStyle(canvas).visibility !== "hidden")
        .length,
      application: window.NCNApplications?.current?.() || null
    };
  });
}

async function waitForStablePhase(
  targetPage,
  expectedEntryId,
  expectedReading,
  baseline,
  minimumFrame,
  dustFloor
) {
  await targetPage.waitForFunction(({
    expectedEntryId,
    expectedReading,
    baseline,
    minimumFrame,
    dustFloor
  }) => {
    const weather = window.NCNIntegration?.getService?.("weather")?.snapshot?.();
    const currentView = window.NCNViewerHost?.context?.().views?.current?.() || null;
    const expandedEntryId = typeof NCN_STATE !== "undefined" ? NCN_STATE.expandedEntryId : null;
    if (!weather) return false;
    return expandedEntryId === expectedEntryId
      && Boolean(currentView?.isReading?.()) === expectedReading
      && weather.frameCount >= minimumFrame
      && weather.targetPreset === baseline.targetPreset
      && Math.abs(Number(weather.targetIntensity) - Number(baseline.targetIntensity)) < 0.0001
      && weather.quality === baseline.quality
      && weather.qualityOverride === baseline.qualityOverride
      && weather.seed === baseline.seed
      && Number(weather.particles?.dust) >= dustFloor
      && weather.zones?.controls === baseline.controls
      && !("reading" in (weather.zones || {}))
      && weather.resources?.visibleCanvases === 4;
  }, {
    expectedEntryId,
    expectedReading,
    baseline,
    minimumFrame,
    dustFloor
  }, { timeout: 15_000 });
  return mountedSnapshot(targetPage);
}

try {
  page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  page.on("pageerror", error => browserErrors.push(`pageerror: ${error.stack || error.message}`));
  page.on("console", message => {
    if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
  });

  await page.goto("http://127.0.0.1:4173/index.html?app=redwire", { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.NCNIntegratedDepartments?.ready);
  await page.evaluate(() => window.NCNIntegratedDepartments.ready());
  await page.waitForFunction(() => (
    window.NCNApplications?.current?.() === "redwire"
    && window.NCNIntegration?.getService?.("weather")?.snapshot?.().enabled === true
    && document.querySelectorAll(".entry:not(.panel)").length >= 2
  ), null, { timeout: 20_000 });

  await page.evaluate(async () => {
    const weather = window.NCNIntegration.getService("weather");
    await weather.applyProfile({
      enabled: true,
      preset: "dust",
      intensity: 0.8,
      quality: "low",
      seed: 2045,
      wind: { x: 0, y: 0, z: 0 },
      controlAttenuation: 0.68
    }, {
      application: "redwire",
      reason: "weather-article-independence-proof"
    });
  });

  await page.waitForFunction(() => {
    const snapshot = window.NCNIntegration?.getService?.("weather")?.snapshot?.();
    return snapshot?.targetPreset === "dust"
      && snapshot?.qualityOverride === "low"
      && snapshot?.particles?.dust > 0
      && snapshot?.resources?.visibleCanvases === 4
      && !("reading" in (snapshot?.zones || {}));
  }, null, { timeout: 15_000 });

  await page.waitForTimeout(750);
  const baselineMounted = await mountedSnapshot(page);
  assert.equal(baselineMounted.application, "redwire");
  assert.equal(baselineMounted.hostReading, false, "The closed mobile feed must begin outside reading state.");
  assert.equal(baselineMounted.visibleWeatherCanvases, 4, "All four canonical Weather canvases must be visible.");
  assert.ok(baselineMounted.weather.particles.dust > 0, "The deterministic Dust field must be populated.");
  assert.equal("reading" in baselineMounted.weather.zones, false,
    "Canonical Weather diagnostics must not publish article-reading state.");

  const baseline = stablePolicy(baselineMounted.weather);
  const baselineDust = Number(baselineMounted.weather.particles.dust);
  const dustFloor = Math.max(1, Math.floor(baselineDust * 0.75));
  assert.ok(dustFloor > Math.floor(baselineDust * 0.58),
    "The sustained-density floor must distinguish full Weather from the former 0.58 reading scale.");

  const entries = await page.locator(".entry:not(.panel)").evaluateAll(nodes => (
    nodes.slice(0, 2).map(node => node.dataset.entryId)
  ));
  assert.equal(entries.length, 2, "The mounted RedWire feed must provide two articles for open/switch proof.");
  assert.ok(entries.every(Boolean));

  await page.screenshot({ path: path.join(artifactRoot, "mobile-closed-baseline.png"), fullPage: true });

  await page.locator(`.entry[data-entry-id="${entries[0]}"]`).click();
  const opened = await waitForStablePhase(
    page,
    entries[0],
    true,
    baseline,
    baselineMounted.weather.frameCount + 6,
    dustFloor
  );
  await page.screenshot({ path: path.join(artifactRoot, "mobile-first-article-open.png"), fullPage: true });

  await page.locator(`.entry[data-entry-id="${entries[1]}"]`).scrollIntoViewIfNeeded();
  await page.locator(`.entry[data-entry-id="${entries[1]}"]`).click();
  const switched = await waitForStablePhase(
    page,
    entries[1],
    true,
    baseline,
    opened.weather.frameCount + 6,
    dustFloor
  );
  await page.screenshot({ path: path.join(artifactRoot, "mobile-second-article-open.png"), fullPage: true });

  await page.locator(`.entry[data-entry-id="${entries[1]}"]`).click();
  const closed = await waitForStablePhase(
    page,
    null,
    false,
    baseline,
    switched.weather.frameCount + 6,
    dustFloor
  );
  await page.screenshot({ path: path.join(artifactRoot, "mobile-closed-restored.png"), fullPage: true });

  for (const [name, phase] of Object.entries({ opened, switched, closed })) {
    assert.deepEqual(stablePolicy(phase.weather), baseline,
      `${name}: article interaction must not change Weather profile, controls or canvases.`);
    assert.ok(Number(phase.weather.particles.dust) >= dustFloor,
      `${name}: the live Dust field must remain above the full-intensity continuity floor.`);
    assert.equal("reading" in phase.weather.zones, false,
      `${name}: Weather must not acquire a reading-zone diagnostic field.`);
  }

  assert.ok(opened.weather.frameCount > baselineMounted.weather.frameCount,
    "Weather must continue advancing while the first article is open.");
  assert.ok(switched.weather.frameCount > opened.weather.frameCount,
    "Weather must continue advancing while switching articles.");
  assert.ok(closed.weather.frameCount > switched.weather.frameCount,
    "Weather must continue advancing while the second article closes.");
  assert.equal(opened.hostReading, true, "The first article must activate the real host reading state.");
  assert.equal(switched.hostReading, true, "Article switching must retain the real host reading state.");
  assert.equal(closed.hostReading, false, "Closing the article must clear the real host reading state.");
  assert.deepEqual(browserErrors, [], "Article reading proof must not emit browser errors.");

  const report = {
    viewport: { width: 390, height: 844 },
    entries,
    baselineDust,
    dustFloor,
    baseline: baselineMounted,
    opened,
    switched,
    closed,
    browserErrors
  };
  fs.writeFileSync(path.join(artifactRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log("Canonical Weather remained unchanged and active through mobile article open, switch and close.");
} catch (error) {
  const failureState = page ? await mountedSnapshot(page).catch(() => null) : null;
  fs.writeFileSync(path.join(artifactRoot, "failure-state.json"), `${JSON.stringify(failureState, null, 2)}\n`);
  fs.writeFileSync(path.join(artifactRoot, "failure.txt"), `${error.stack || error}\n`);
  throw error;
} finally {
  await browser.close();
}
