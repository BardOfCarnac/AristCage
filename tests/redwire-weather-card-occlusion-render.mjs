import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";

const baseUrl = process.env.NCN_TEST_URL || "http://127.0.0.1:4173/";
const artifactRoot = "artifacts/redwire-weather-card-occlusion";
const browser = await chromium.launch({ headless: true });
fs.mkdirSync(artifactRoot, { recursive: true });

async function visualSnapshot(page) {
  return page.evaluate(() => {
    const plateNode = [...document.querySelectorAll(
      ".optical-mode .optical-semantic-item[data-optical-role='plate'] .optical-plate-surface"
    )].find(node => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && Number(style.opacity) !== 0;
    });
    if (!plateNode) throw new Error("A visible lead Optical plate is required.");

    const plate = plateNode.getBoundingClientRect();
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

    const interiorPoints = [];
    for (const fx of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      for (const fy of [0.2, 0.35, 0.5, 0.65, 0.8]) {
        interiorPoints.push({ x: plate.left + plate.width * fx, y: plate.top + plate.height * fy });
      }
    }

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
      application: window.NCNApplications?.current?.() || null,
      plate: {
        left: plate.left,
        top: plate.top,
        right: plate.right,
        bottom: plate.bottom,
        width: plate.width,
        height: plate.height
      },
      baseCanvasCount: baseCanvases.length,
      baseInterior,
      foregroundInterior,
      edgeInside,
      edgeOutside,
      foregroundPresent: Boolean(foreground),
      foregroundHidden: foreground?.hidden ?? true,
      foregroundZ: Number(foreground ? getComputedStyle(foreground).zIndex : 0) || 0,
      viewerZ: Number(viewer ? getComputedStyle(viewer).zIndex : 0) || 0,
      bridge: window.NCNRedWireWeatherCardOcclusion?.snapshot?.() || null,
      weather: window.NCNIntegration?.getService?.("weather")?.snapshot?.() || null
    };
  });
}

function assertHeavyForeground(result, name) {
  assert.equal(result.application, "redwire", `${name}: RedWire must be active`);
  assert.ok(result.baseCanvasCount >= 4, `${name}: the completed Weather layer set is required`);
  assert.ok(result.baseInterior.every(alpha => alpha <= 2), `${name}: rear Weather must remain erased beneath the plate`);
  assert.equal(result.foregroundPresent, true, `${name}: the foreground compositor must exist`);
  assert.equal(result.foregroundHidden, false, `${name}: the heavy-mist foreground compositor must be visible`);
  assert.ok(result.foregroundZ > result.viewerZ, `${name}: foreground mist must stack above the Optical viewer`);
  assert.ok(Math.max(...result.foregroundInterior) > 8, `${name}: heavy mist must have non-zero alpha over the real lead plate`);
  assert.ok(result.bridge.lastForegroundPuffs > 0, `${name}: the exact-depth pass must render qualifying puffs`);
  assert.ok(result.bridge.lastForegroundRegions > 0, `${name}: the exact plate region must be supplied`);
  assert.equal(result.bridge.weatherPolicyMutation, false, `${name}: Integration must not mutate Weather policy`);
  assert.ok(Math.max(...result.edgeOutside) <= 3, `${name}: foreground pixels must remain transparent outside plate regions`);
  const interiorMax = Math.max(...result.foregroundInterior);
  const edgeMax = Math.max(...result.edgeInside);
  assert.ok(edgeMax <= interiorMax * 0.88 + 18, `${name}: feathered plate edges must not create an abnormal alpha spike`);
  assert.deepEqual(result.weather.wind, { x: 0, y: 0, z: 0 }, `${name}: heavy flow must not alter external Weather wind state`);
}

async function runViewport(name, viewport, reducedMotion = "no-preference") {
  const page = await browser.newPage({ viewport });
  await page.emulateMedia({ reducedMotion });
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("weatherTest", "heavy");
    await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });

    await page.waitForFunction(() => (
      window.NCNIntegratedDepartments?.isReady?.() === true
      && window.NCNRedWireWeatherCardOcclusion?.snapshot?.().active === true
      && document.querySelectorAll(
        ".optical-mode .optical-semantic-item[data-optical-role='plate'] .optical-plate-surface"
      ).length > 0
    ), null, { timeout: 30_000 });

    await page.waitForFunction(() => {
      const bridge = window.NCNRedWireWeatherCardOcclusion?.snapshot?.();
      const canvas = document.querySelector("canvas.ncn-redwire-weather-foreground");
      return bridge?.lastForegroundPuffs > 0 && canvas && !canvas.hidden;
    }, null, { timeout: 30_000 });
    await page.waitForTimeout(500);

    const heavy = await visualSnapshot(page);
    assertHeavyForeground(heavy, `${name} heavy`);
    const firstGeneration = heavy.bridge.foregroundGeneration;
    const initialWind = heavy.weather.wind;
    await page.screenshot({ path: `${artifactRoot}/${name}-heavy.png`, fullPage: true });

    await page.evaluate(() => {
      const weather = window.NCNIntegration.getService("weather");
      weather.applyProfile({
        enabled: true,
        preset: "mist",
        intensity: 0.54,
        wind: { x: 0, y: 0, z: 0 }
      }, { reason: "ordinary-mist-foreground-proof" });
    });
    await page.waitForFunction(() => {
      const weather = window.NCNIntegration.getService("weather")?.snapshot?.();
      const bridge = window.NCNRedWireWeatherCardOcclusion?.snapshot?.();
      const canvas = document.querySelector("canvas.ncn-redwire-weather-foreground");
      return weather?.targetPreset === "mist"
        && bridge?.lastForegroundPuffs === 0
        && (!canvas || canvas.hidden);
    }, null, { timeout: 15_000 });

    const ordinary = await visualSnapshot(page);
    assert.ok(Math.max(...ordinary.foregroundInterior) <= 2, `${name}: ordinary mist must not receive a foreground replay`);
    assert.deepEqual(ordinary.weather.wind, initialWind, `${name}: ordinary mist must preserve external wind state`);

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
    if (dripfeed.weather?.wind) {
      assert.deepEqual(dripfeed.weather.wind, initialWind, `${name}: application switching must leave no altered Weather wind residue`);
    }

    await page.evaluate(async () => {
      await window.NCNApplications.switchTo("redwire", { animate: false, reason: "foreground-return-proof" });
      const weather = window.NCNIntegration.getService("weather");
      weather.applyProfile({
        enabled: true,
        preset: "heavy-mist",
        intensity: 0.98,
        wind: { x: 0, y: 0, z: 0 }
      }, { reason: "foreground-return-proof" });
    });
    await page.waitForFunction(previousGeneration => {
      const bridge = window.NCNRedWireWeatherCardOcclusion?.snapshot?.();
      const canvas = document.querySelector("canvas.ncn-redwire-weather-foreground");
      return window.NCNApplications.current() === "redwire"
        && bridge?.active === true
        && bridge.foregroundGeneration > previousGeneration
        && bridge.lastForegroundPuffs > 0
        && canvas && !canvas.hidden;
    }, firstGeneration, { timeout: 30_000 });

    const returned = await visualSnapshot(page);
    assertHeavyForeground(returned, `${name} returned heavy`);
    assert.ok(returned.bridge.foregroundGeneration > firstGeneration, `${name}: returning to RedWire must create a fresh compositor`);

    fs.writeFileSync(`${artifactRoot}/${name}.json`, JSON.stringify({ heavy, ordinary, dripfeed, returned }, null, 2));
    await page.screenshot({ path: `${artifactRoot}/${name}-returned.png`, fullPage: true });
  } finally {
    await page.close();
  }
}

try {
  await runViewport("desktop", { width: 1440, height: 900 });
  await runViewport("mobile", { width: 390, height: 844 });
  await runViewport("desktop-reduced-motion", { width: 1440, height: 900 }, "reduce");
  console.log("Heavy mist crosses real Optical plates above the viewer, ordinary mist does not, and application switching leaves no foreground or Weather-policy residue.");
} finally {
  await browser.close();
}
