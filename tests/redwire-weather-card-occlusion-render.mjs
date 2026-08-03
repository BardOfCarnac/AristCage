import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";

const baseUrl = process.env.NCN_TEST_URL || "http://127.0.0.1:4173/";
const artifactRoot = "artifacts/redwire-weather-card-occlusion";
const SMOKE_FRONT_WIND = Object.freeze({ x: 0, y: 0, z: -0.72 });
const browser = await chromium.launch({ headless: true });
fs.mkdirSync(artifactRoot, { recursive: true });

async function waitForVisiblePlateCrossing(page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas.ncn-redwire-weather-foreground");
    if (!canvas || canvas.hidden) return false;
    const canvasRect = canvas.getBoundingClientRect();
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context || canvasRect.width <= 0 || canvasRect.height <= 0) return false;

    const plates = [...document.querySelectorAll(
      ".optical-mode .optical-semantic-item[data-optical-role='plate'] .optical-plate-surface"
    )].filter(node => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && Number(style.opacity) !== 0;
    });

    for (const node of plates) {
      const rect = node.getBoundingClientRect();
      for (const fx of [0.1, 0.25, 0.4, 0.55, 0.7, 0.85]) {
        for (const fy of [0.12, 0.3, 0.5, 0.7, 0.88]) {
          const pageX = rect.left + rect.width * fx;
          const pageY = rect.top + rect.height * fy;
          if (pageX < canvasRect.left || pageX > canvasRect.right
            || pageY < canvasRect.top || pageY > canvasRect.bottom) continue;
          const x = Math.max(0, Math.min(canvas.width - 1,
            Math.floor((pageX - canvasRect.left) * canvas.width / canvasRect.width)));
          const y = Math.max(0, Math.min(canvas.height - 1,
            Math.floor((pageY - canvasRect.top) * canvas.height / canvasRect.height)));
          if (context.getImageData(x, y, 1, 1).data[3] > 8) return true;
        }
      }
    }
    return false;
  }, null, { timeout: 30_000, polling: 100 });
}

async function visualSnapshot(page) {
  return page.evaluate(() => {
    const plateNodes = [...document.querySelectorAll(
      ".optical-mode .optical-semantic-item[data-optical-role='plate'] .optical-plate-surface"
    )].filter(node => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && Number(style.opacity) !== 0;
    });
    if (!plateNodes.length) throw new Error("At least one visible Optical plate is required.");

    const baseCanvases = [...document.querySelectorAll("canvas.ncn-department-weather-canvas")]
      .filter(canvas => !canvas.hidden && getComputedStyle(canvas).visibility !== "hidden");
    const foreground = document.querySelector("canvas.ncn-redwire-weather-foreground");
    const viewer = document.querySelector(".viewer");

    function alphaAtPage(canvas, pageX, pageY) {
      if (!canvas || canvas.hidden) return 0;
      const rect = canvas.getBoundingClientRect();
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context || rect.width <= 0 || rect.height <= 0
        || pageX < rect.left || pageX > rect.right || pageY < rect.top || pageY > rect.bottom) return 0;
      const x = Math.max(0, Math.min(canvas.width - 1, Math.floor((pageX - rect.left) * canvas.width / rect.width)));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.floor((pageY - rect.top) * canvas.height / rect.height)));
      return context.getImageData(x, y, 1, 1).data[3];
    }

    function interiorPointsFor(rect) {
      const points = [];
      for (const fx of [0.08, 0.18, 0.28, 0.38, 0.5, 0.62, 0.72, 0.82, 0.92]) {
        for (const fy of [0.1, 0.23, 0.36, 0.5, 0.64, 0.77, 0.9]) {
          points.push({ x: rect.left + rect.width * fx, y: rect.top + rect.height * fy });
        }
      }
      return points;
    }

    function samplePlate(node) {
      const plate = node.getBoundingClientRect();
      const interiorPoints = interiorPointsFor(plate);
      const baseInterior = interiorPoints.map(point => Math.max(
        0,
        ...baseCanvases.map(canvas => alphaAtPage(canvas, point.x, point.y))
      ));
      const foregroundInterior = interiorPoints.map(point => alphaAtPage(foreground, point.x, point.y));

      const edgeInside = [];
      const edgeOutside = [];
      const edgeInset = 3;
      const outsideOffset = 3;
      for (let step = 0.08; step <= 0.92; step += 0.04) {
        const x = plate.left + plate.width * step;
        const y = plate.top + plate.height * step;
        edgeInside.push(
          alphaAtPage(foreground, x, plate.top + edgeInset),
          alphaAtPage(foreground, x, plate.bottom - edgeInset),
          alphaAtPage(foreground, plate.left + edgeInset, y),
          alphaAtPage(foreground, plate.right - edgeInset, y)
        );
        edgeOutside.push(
          alphaAtPage(foreground, x, plate.top - outsideOffset),
          alphaAtPage(foreground, x, plate.bottom + outsideOffset),
          alphaAtPage(foreground, plate.left - outsideOffset, y),
          alphaAtPage(foreground, plate.right + outsideOffset, y)
        );
      }

      return {
        plate: {
          left: plate.left,
          top: plate.top,
          right: plate.right,
          bottom: plate.bottom,
          width: plate.width,
          height: plate.height
        },
        chamberDepth: Number(node.closest(".optical-plane")?.dataset?.chamberDepth) || null,
        baseInterior,
        foregroundInterior,
        edgeInside,
        edgeOutside,
        maxForegroundAlpha: Math.max(0, ...foregroundInterior),
        activeSamples: foregroundInterior.filter(alpha => alpha > 8).length
      };
    }

    const plates = plateNodes.map(samplePlate);
    const selected = [...plates].sort((a, b) => b.maxForegroundAlpha - a.maxForegroundAlpha)[0];
    const uniquePoints = new Map();
    plateNodes.forEach(node => {
      interiorPointsFor(node.getBoundingClientRect()).forEach(point => {
        const key = `${Math.round(point.x)}:${Math.round(point.y)}`;
        if (!uniquePoints.has(key)) uniquePoints.set(key, point);
      });
    });
    const uniqueForeground = [...uniquePoints.values()]
      .map(point => alphaAtPage(foreground, point.x, point.y));

    return {
      application: window.NCNApplications?.current?.() || null,
      ...selected,
      visiblePlateCount: plates.length,
      crossedPlateCount: plates.filter(item => item.maxForegroundAlpha > 8).length,
      uniquePlateSampleCount: uniqueForeground.length,
      uniquePlateActiveSamples: uniqueForeground.filter(alpha => alpha > 8).length,
      uniquePlateCoverage: uniqueForeground.length
        ? uniqueForeground.filter(alpha => alpha > 8).length / uniqueForeground.length
        : 0,
      baseCanvasCount: baseCanvases.length,
      foregroundPresent: Boolean(foreground),
      foregroundHidden: foreground?.hidden ?? true,
      foregroundZ: Number(foreground ? getComputedStyle(foreground).zIndex : 0) || 0,
      viewerZ: Number(viewer ? getComputedStyle(viewer).zIndex : 0) || 0,
      bridge: window.NCNRedWireWeatherCardOcclusion?.snapshot?.() || null,
      weather: window.NCNIntegration?.getService?.("weather")?.snapshot?.() || null
    };
  });
}

function assertAtmosphericForeground(result, name, expectedPreset) {
  assert.equal(result.application, "redwire", `${name}: RedWire must be active`);
  assert.equal(result.weather.targetPreset, expectedPreset, `${name}: the requested Weather preset must be active`);
  assert.ok(result.baseCanvasCount >= 4, `${name}: the completed Weather layer set is required`);
  assert.ok(result.baseInterior.every(alpha => alpha <= 2), `${name}: rear Weather must remain erased beneath the crossed plate`);
  assert.equal(result.foregroundPresent, true, `${name}: the foreground compositor must exist`);
  assert.equal(result.foregroundHidden, false, `${name}: the atmospheric foreground compositor must be visible`);
  assert.ok(result.foregroundZ > result.viewerZ, `${name}: foreground Weather must stack above the Optical viewer`);

  assert.ok(result.activeSamples > 0, `${name}: a real atmospheric bank must cross at least one visible plate`);
  assert.ok(result.uniquePlateActiveSamples > 0, `${name}: foreground Weather must occupy real visible article area`);

  assert.ok(result.bridge.lastForegroundPuffs > 0, `${name}: the exact-depth pass must render qualifying puffs`);
  assert.ok(result.bridge.lastForegroundRegions > 0, `${name}: the exact plate regions must be supplied`);
  assert.equal(result.bridge.foregroundDepthMode, "optical-plate",
    `${name}: the foreground threshold must follow the article's real Optical plate depth`);
  assert.equal(result.bridge.foregroundPresetPolicy, "all-enabled-atmosphere",
    `${name}: foreground composition must not be restricted to Heavy Mist`);
  assert.ok(Math.abs(result.bridge.lastForegroundThreshold - result.chamberDepth) < 0.01,
    `${name}: the rendered region must use the actual plate chamber depth`);
  assert.equal(result.bridge.weatherPolicyMutation, false, `${name}: Integration must not mutate Weather policy`);
  assert.ok(Math.max(...result.edgeOutside) <= 3, `${name}: foreground pixels must remain transparent outside the crossed plate`);
  const interiorMax = Math.max(...result.foregroundInterior);
  const edgeMax = Math.max(...result.edgeInside);
  assert.ok(edgeMax <= interiorMax * 0.88 + 18, `${name}: feathered plate edges must not create an abnormal alpha spike`);
}

async function applyWeather(page, preset, intensity, reason, wind = { x: 0, y: 0, z: 0 }) {
  await page.evaluate(({ selectedPreset, selectedIntensity, selectedWind, controlReason }) => {
    const weather = window.NCNIntegration.getService("weather");
    weather.applyProfile({
      enabled: true,
      preset: selectedPreset,
      intensity: selectedIntensity,
      wind: selectedWind,
      quality: "high"
    }, {
      application: "redwire",
      reason: controlReason
    });
  }, {
    selectedPreset: preset,
    selectedIntensity: intensity,
    selectedWind: wind,
    controlReason: reason
  });

  await page.waitForFunction(selectedPreset => {
    const weather = window.NCNIntegration?.getService?.("weather")?.snapshot?.();
    const bridge = window.NCNRedWireWeatherCardOcclusion?.snapshot?.();
    return weather?.targetPreset === selectedPreset
      && bridge?.lastForegroundRegions > 0;
  }, preset, { timeout: 15_000 });
}

async function runViewport(name, viewport, reducedMotion = "no-preference") {
  const page = await browser.newPage({ viewport });
  await page.emulateMedia({ reducedMotion });
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });

    await page.waitForFunction(() => (
      window.NCNIntegratedDepartments?.isReady?.() === true
      && window.NCNRedWireWeatherCardOcclusion?.snapshot?.().active === true
      && document.querySelectorAll(
        ".optical-mode .optical-semantic-item[data-optical-role='plate'] .optical-plate-surface"
      ).length > 0
    ), null, { timeout: 30_000 });

    await applyWeather(page, "heavy-mist", 1, "heavy-mist-article-obscuration-proof", { x: 0.22, y: 0, z: 0 });
    await page.waitForFunction(() => {
      const weather = window.NCNIntegration?.getService?.("weather")?.snapshot?.();
      return weather?.diagnostics?.effectiveDepthFlow?.mist < -0.8
        && weather?.diagnostics?.effectiveDepthFlow?.heavyMistPrimeCount >= 1;
    }, null, { timeout: 15_000 });
    await waitForVisiblePlateCrossing(page);

    const heavy = await visualSnapshot(page);
    assertAtmosphericForeground(heavy, `${name} heavy`, "heavy-mist");
    assert.equal(heavy.weather.wind.z, 0, `${name}: preset motion must not leak into the public wind contract`);
    assert.equal(heavy.weather.diagnostics.effectiveDepthFlow.configured, -0.72,
      `${name}: Weather must expose the declared heavy-mist depth flow`);
    assert.ok(heavy.weather.diagnostics.effectiveDepthFlow.mist < -0.8,
      `${name}: Weather must calculate the canonical effective forward flow`);
    assert.ok(heavy.weather.diagnostics.effectiveDepthFlow.heavyMistPrimeCount >= 1,
      `${name}: Weather must prime a genuine near-depth chamber bank`);
    const firstGeneration = heavy.bridge.foregroundGeneration;
    await page.screenshot({ path: `${artifactRoot}/${name}-heavy.png`, fullPage: true });

    await applyWeather(page, "mist", 1, "ordinary-mist-article-obscuration-proof");
    await page.waitForFunction(() => (
      window.NCNIntegration.getService("weather")?.snapshot?.().diagnostics?.effectiveDepthFlow?.mist === -0.12
    ), null, { timeout: 15_000 });
    await waitForVisiblePlateCrossing(page);
    const ordinary = await visualSnapshot(page);
    assertAtmosphericForeground(ordinary, `${name} ordinary`, "mist");
    assert.equal(ordinary.weather.wind.z, 0, `${name}: ordinary mist must have no hidden depth wind`);
    assert.equal(ordinary.weather.diagnostics.effectiveDepthFlow.mist, -0.12,
      `${name}: ordinary mist must retain the accepted baseline flow`);
    await page.screenshot({ path: `${artifactRoot}/${name}-mist.png`, fullPage: true });

    await applyWeather(page, "smoke", 1, "smoke-article-obscuration-proof", SMOKE_FRONT_WIND);
    await page.waitForFunction(expectedZ => {
      const weather = window.NCNIntegration.getService("weather")?.snapshot?.();
      return weather?.wind?.z === expectedZ
        && weather?.diagnostics?.effectiveDepthFlow?.mist < -0.8;
    }, SMOKE_FRONT_WIND.z, { timeout: 15_000 });
    await waitForVisiblePlateCrossing(page);
    const smoke = await visualSnapshot(page);
    assertAtmosphericForeground(smoke, `${name} smoke`, "smoke");
    assert.equal(smoke.weather.wind.z, SMOKE_FRONT_WIND.z,
      `${name}: the bad-terminal smoke proof must retain its declared forward draft`);
    assert.ok(smoke.weather.diagnostics.effectiveDepthFlow.mist < -0.8,
      `${name}: the smoke bank must be driven through the article plane`);
    await page.screenshot({ path: `${artifactRoot}/${name}-smoke.png`, fullPage: true });

    await page.evaluate(async () => {
      await window.NCNApplications.switchTo("dripfeed", { animate: false, reason: "foreground-lifecycle-proof" });
    });
    await page.waitForFunction(() => window.NCNApplications.current() === "dripfeed", null, { timeout: 15_000 });
    await page.waitForFunction(() => !document.querySelector("canvas.ncn-redwire-weather-foreground"), null, { timeout: 15_000 });

    const dripfeed = await page.evaluate(() => ({
      application: window.NCNApplications.current(),
      foreground: Boolean(document.querySelector("canvas.ncn-redwire-weather-foreground")),
      bridge: window.NCNRedWireWeatherCardOcclusion.snapshot(),
      weather: window.NCNIntegration.getService("weather")?.snapshot?.() || null
    }));
    assert.equal(dripfeed.application, "dripfeed");
    assert.equal(dripfeed.foreground, false, `${name}: Dripfeed must contain no foreground compositor residue`);
    assert.equal(dripfeed.bridge.active, false, `${name}: Dripfeed must release the RedWire Weather subscription`);
    if (dripfeed.weather) {
      assert.notEqual(dripfeed.weather.targetPreset, "smoke",
        `${name}: Dripfeed must not retain the Smoke profile`);
      assert.equal(dripfeed.weather.wind.z, 0,
        `${name}: application switching must leave no altered wind residue`);
    }

    await page.evaluate(async () => {
      await window.NCNApplications.switchTo("redwire", { animate: false, reason: "foreground-return-proof" });
    });
    await page.waitForFunction(() => (
      window.NCNApplications.current() === "redwire"
      && window.NCNRedWireWeatherCardOcclusion?.snapshot?.().active === true
    ), null, { timeout: 15_000 });
    await applyWeather(page, "smoke", 1, "foreground-return-proof", SMOKE_FRONT_WIND);
    await page.waitForFunction(previousGeneration => (
      window.NCNRedWireWeatherCardOcclusion?.snapshot?.().foregroundGeneration > previousGeneration
    ), firstGeneration, { timeout: 15_000 });
    await waitForVisiblePlateCrossing(page);

    const returned = await visualSnapshot(page);
    assertAtmosphericForeground(returned, `${name} returned smoke`, "smoke");
    assert.ok(returned.bridge.foregroundGeneration > firstGeneration, `${name}: returning to RedWire must create a fresh compositor`);

    fs.writeFileSync(`${artifactRoot}/${name}.json`, JSON.stringify({ heavy, ordinary, smoke, dripfeed, returned }, null, 2));
    await page.screenshot({ path: `${artifactRoot}/${name}-returned.png`, fullPage: true });
  } finally {
    await page.close();
  }
}

try {
  await runViewport("desktop", { width: 1440, height: 900 });
  await runViewport("mobile", { width: 390, height: 844 });
  await runViewport("desktop-reduced-motion", { width: 1440, height: 900 }, "reduce");
  console.log("Heavy mist, ordinary mist and smoke can all cross Optical article plates at the plates' real chamber depth, while application switching leaves no compositor residue.");
} finally {
  await browser.close();
}
