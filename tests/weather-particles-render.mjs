import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";

const baseUrl = process.env.NCN_TEST_URL || "http://127.0.0.1:4173/";
const artifactRoot = "artifacts/weather-particle-field";
fs.mkdirSync(artifactRoot, { recursive: true });
const browser = await chromium.launch({ headless: true });

async function applyProfile(page, profile, reason) {
  await page.evaluate(({ selected, controlReason }) => {
    const weather = window.NCNIntegration.getService("weather");
    weather.applyProfile(selected, {
      application: window.NCNApplications?.current?.() || "redwire",
      reason: controlReason
    });
  }, { selected: profile, controlReason: reason });
}

async function sample(page) {
  return page.evaluate(() => {
    const weather = window.NCNIntegration.getService("weather");
    const snapshot = weather.snapshot();
    const camera = window.NCNChamberCamera?.snapshot?.() || null;
    const aperture = camera?.visibleAperture || camera?.nearAperture || null;
    const particleCanvases = [...document.querySelectorAll("canvas.ncn-department-weather-particle-canvas")]
      .filter(canvas => !canvas.hidden && getComputedStyle(canvas).visibility !== "hidden");
    const plate = [...document.querySelectorAll(
      ".optical-mode .optical-semantic-item[data-optical-role='plate'] .optical-plate-surface"
    )].find(node => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && Number(style.opacity) !== 0;
    }) || null;
    const plateRect = plate?.getBoundingClientRect?.() || null;

    function alphaAtPage(canvas, pageX, pageY) {
      const rect = canvas.getBoundingClientRect();
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context || rect.width <= 0 || rect.height <= 0
        || pageX < rect.left || pageX > rect.right || pageY < rect.top || pageY > rect.bottom) return 0;
      const x = Math.max(0, Math.min(canvas.width - 1, Math.floor((pageX - rect.left) * canvas.width / rect.width)));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.floor((pageY - rect.top) * canvas.height / rect.height)));
      return context.getImageData(x, y, 1, 1).data[3];
    }

    const layerInk = {};
    let totalInk = 0;
    let outsideInk = 0;
    particleCanvases.forEach(canvas => {
      const rect = canvas.getBoundingClientRect();
      const context = canvas.getContext("2d", { willReadFrequently: true });
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const scaleX = rect.width / canvas.width;
      const scaleY = rect.height / canvas.height;
      let ink = 0;
      let outside = 0;
      for (let y = 0; y < canvas.height; y += 2) {
        for (let x = 0; x < canvas.width; x += 2) {
          const alpha = data[(y * canvas.width + x) * 4 + 3];
          if (alpha <= 2) continue;
          ink += 1;
          if (aperture) {
            const pageX = rect.left + x * scaleX;
            const pageY = rect.top + y * scaleY;
            if (pageX < aperture.left - 2 || pageX > aperture.right + 2
              || pageY < aperture.top - 2 || pageY > aperture.bottom + 2) outside += 1;
          }
        }
      }
      const layer = ["far", "rear", "middle", "near"].find(key => canvas.classList.contains(`ncn-department-weather-particle-canvas-${key}`)) || "unknown";
      layerInk[layer] = ink;
      totalInk += ink;
      outsideInk += outside;
    });

    let plateInteriorAlpha = [];
    if (plateRect) {
      const points = [];
      for (const fx of [0.25, 0.5, 0.75]) {
        for (const fy of [0.25, 0.5, 0.75]) {
          points.push({ x: plateRect.left + plateRect.width * fx, y: plateRect.top + plateRect.height * fy });
        }
      }
      plateInteriorAlpha = points.map(point => Math.max(0, ...particleCanvases.map(canvas => alphaAtPage(canvas, point.x, point.y))));
    }

    return {
      application: window.NCNApplications?.current?.() || null,
      factoryDecorated: window.createNCNWeatherDepartment?.__ncnDepthParticleField === true,
      publicationDecorated: window.NCNWeatherDepartment?.createWeather?.__ncnDepthParticleField === true,
      particlePublicationInstalled: window.NCNWeatherParticleField?.installed?.() === true,
      camera: camera ? { presentation: camera.presentation, aperture } : null,
      snapshot,
      particleCanvasCount: particleCanvases.length,
      layerInk,
      totalInk,
      outsideInk,
      platePresent: Boolean(plateRect),
      plateInteriorAlpha,
      compositor: window.NCNRedWireWeatherCardOcclusion?.snapshot?.() || null
    };
  });
}

function assertCommon(result, name, minimumLayers = 3) {
  assert.equal(result.application, "redwire", `${name}: RedWire must be active`);
  assert.equal(result.factoryDecorated, true, `${name}: production Weather factory must be particle-decorated`);
  assert.equal(result.publicationDecorated, true, `${name}: Weather publication factory must be particle-decorated`);
  assert.equal(result.particlePublicationInstalled, true, `${name}: particle publication marker must be active`);
  assert.equal(result.particleCanvasCount, 4, `${name}: all four particle depth canvases must be visible`);
  assert.ok(result.totalInk > 4, `${name}: particle canvases must contain visible ink`);
  assert.ok(Object.values(result.layerInk).filter(value => value > 0).length >= minimumLayers, `${name}: particle ink must occupy the expected chamber depth layers`);
  assert.ok(result.outsideInk <= Math.max(2, Math.ceil(result.totalInk * 0.01)), `${name}: particles must remain inside the live chamber aperture`);
  assert.equal(result.snapshot?.diagnostics?.particleRenderer?.sharedRuntime, true, `${name}: particles must use the shared runtime`);
  assert.equal(result.snapshot?.diagnostics?.particleRenderer?.privateAnimationLoop, false, `${name}: particles must not create a private loop`);
  assert.equal(result.snapshot?.diagnostics?.particleRenderer?.runtimePriority, 22, `${name}: particles must render before Weather completed-frame publication`);
  assert.ok(result.snapshot?.particles?.depthField?.drawn > 0, `${name}: depth field must report rendered particles`);
  assert.ok(result.compositor?.lastCanvasCount >= 8, `${name}: existing Optical compositor must see base and particle Weather canvases`);
  if (result.platePresent) {
    assert.ok(result.plateInteriorAlpha.every(alpha => alpha <= 2), `${name}: particle Weather must remain erased beneath Optical plates`);
  }
}

async function runCase(name, viewport, profile, expectations, reducedMotion = "no-preference") {
  const page = await browser.newPage({ viewport });
  await page.emulateMedia({ reducedMotion });
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(() => {
      const camera = window.NCNChamberCamera?.snapshot?.();
      return window.NCNIntegratedDepartments?.isReady?.() === true
        && Boolean(window.NCNIntegration?.getService?.("weather"))
        && window.NCNWeatherParticleField?.installed?.() === true
        && Boolean(camera)
        && Boolean(camera.visibleAperture || camera.nearAperture);
    }, null, { timeout: 30_000 });

    await applyProfile(page, profile, `particle-render-proof:${name}`);
    await page.waitForFunction(minimum => {
      const snapshot = window.NCNIntegration?.getService?.("weather")?.snapshot?.();
      return snapshot?.particles?.depthField?.active >= minimum
        && snapshot?.particles?.depthField?.drawn > 0
        && snapshot?.resources?.visibleParticleCanvases === 4
        && window.NCNRedWireWeatherCardOcclusion?.snapshot?.().lastCanvasCount >= 8;
    }, expectations.minimumActive, { timeout: 30_000 });
    await page.waitForTimeout(700);

    const result = await sample(page);
    fs.writeFileSync(`${artifactRoot}/${name}.json`, JSON.stringify(result, null, 2));
    await page.screenshot({ path: `${artifactRoot}/${name}.png`, fullPage: true });

    assertCommon(result, name, expectations.minimumLayers || 3);
    const field = result.snapshot.particles.depthField;
    if (expectations.ash) assert.ok(field.kinds.ash > 0, `${name}: dark ash silhouettes are required`);
    if (expectations.ember) assert.ok(field.kinds.ember > 0, `${name}: glowing embers are required`);
    if (expectations.electrical) assert.ok(field.kinds.electrical > 0, `${name}: electrical flecks are required`);
    if (expectations.lightCatch) assert.ok(field.lightCaught > 0, `${name}: particles must become visible in chamber light`);
    if (expectations.smoke) assert.ok(field.smokeSuppressed > 0, `${name}: smoke must suppress some embedded particle light`);
    if (expectations.maximumActive) assert.ok(field.active <= expectations.maximumActive, `${name}: reduced-motion pool must remain bounded`);
  } finally {
    await page.close();
  }
}

try {
  await runCase(
    "desktop-smoke",
    { width: 1440, height: 900 },
    { enabled: true, preset: "smoke", intensity: 1, wind: { x: 0.12, y: 0, z: 0 }, quality: "high" },
    { minimumActive: 28, ash: true, ember: true, lightCatch: true, smoke: true }
  );
  await runCase(
    "mobile-electrical",
    { width: 390, height: 844 },
    { enabled: true, preset: "electrical-weather", intensity: 1, wind: { x: 0.18, y: 0, z: 0 }, quality: "high" },
    { minimumActive: 28, electrical: true, lightCatch: true }
  );
  await runCase(
    "desktop-reduced-smoke",
    { width: 1440, height: 900 },
    { enabled: true, preset: "smoke", intensity: 1, wind: { x: 0.12, y: 0, z: 0 }, quality: "high" },
    { minimumActive: 8, maximumActive: 18, minimumLayers: 2, ash: true, ember: true, lightCatch: true },
    "reduce"
  );
  console.log("Depth-aware Weather particles render across chamber layers, respond to mist/smoke/light, preserve Optical occlusion and remain bounded under reduced motion.");
} finally {
  await browser.close();
}
