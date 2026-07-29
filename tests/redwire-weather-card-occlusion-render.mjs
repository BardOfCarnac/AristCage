import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";

const baseUrl = process.env.NCN_TEST_URL || "http://127.0.0.1:4173/";
const artifactRoot = "artifacts/redwire-weather-card-occlusion";
const browser = await chromium.launch({ headless: true });
fs.mkdirSync(artifactRoot, { recursive: true });

async function runViewport(name, viewport) {
  const page = await browser.newPage({ viewport });
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

    await page.waitForFunction(() => (
      window.NCNRedWireWeatherCardOcclusion?.snapshot?.().renderedFrames >= 3
    ), null, { timeout: 15_000 });
    await page.waitForTimeout(900);

    const result = await page.evaluate(() => {
      const plates = [...document.querySelectorAll(
        ".optical-mode .optical-semantic-item[data-optical-role='plate'] .optical-plate-surface"
      )].map(node => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
      }).filter(rect => rect.width > 0 && rect.height > 0);

      const inside = value => plates.some(rect => (
        value.x >= rect.left && value.x <= rect.right && value.y >= rect.top && value.y <= rect.bottom
      ));

      const canvases = [...document.querySelectorAll("canvas.ncn-department-weather-canvas")]
        .filter(canvas => !canvas.hidden && getComputedStyle(canvas).visibility !== "hidden");
      const plateSamples = [];
      let outsideInk = 0;

      canvases.forEach((canvas, canvasIndex) => {
        const rect = canvas.getBoundingClientRect();
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context || rect.width <= 0 || rect.height <= 0) return;
        const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        plates.forEach((plate, plateIndex) => {
          for (const fx of [0.25, 0.5, 0.75]) {
            for (const fy of [0.25, 0.5, 0.75]) {
              const pageX = plate.left + plate.width * fx;
              const pageY = plate.top + plate.height * fy;
              if (pageX < rect.left || pageX > rect.right || pageY < rect.top || pageY > rect.bottom) continue;
              const x = Math.max(0, Math.min(canvas.width - 1, Math.floor((pageX - rect.left) * scaleX)));
              const y = Math.max(0, Math.min(canvas.height - 1, Math.floor((pageY - rect.top) * scaleY)));
              const alpha = data[(y * canvas.width + x) * 4 + 3];
              plateSamples.push({ canvasIndex, plateIndex, x, y, alpha });
            }
          }
        });

        for (let y = 0; y < canvas.height; y += 12) {
          for (let x = 0; x < canvas.width; x += 12) {
            const pagePoint = {
              x: rect.left + x / scaleX,
              y: rect.top + y / scaleY
            };
            if (inside(pagePoint)) continue;
            if (data[(y * canvas.width + x) * 4 + 3] > 8) outsideInk += 1;
          }
        }
      });

      return {
        plates,
        canvasCount: canvases.length,
        plateSamples,
        outsideInk,
        bridge: window.NCNRedWireWeatherCardOcclusion?.snapshot?.() || null,
        weather: window.NCNIntegration?.getService?.("weather")?.snapshot?.() || null
      };
    });

    assert.ok(result.plates.length > 0, `${name}: at least one rendered Optical plate is required`);
    assert.equal(result.canvasCount, 4, `${name}: all four Weather canvases should be visible`);
    assert.ok(result.plateSamples.length > 0, `${name}: plate interiors should be sampled`);
    assert.ok(
      result.plateSamples.every(sample => sample.alpha <= 2),
      `${name}: Weather alpha must be erased throughout rendered card interiors`
    );
    assert.ok(result.outsideInk > 20, `${name}: heavy mist should remain visible outside card rectangles`);

    fs.writeFileSync(`${artifactRoot}/${name}.json`, JSON.stringify(result, null, 2));
    await page.screenshot({ path: `${artifactRoot}/${name}.png`, fullPage: true });
  } finally {
    await page.close();
  }
}

try {
  await runViewport("desktop-heavy", { width: 1440, height: 900 });
  await runViewport("mobile-heavy", { width: 390, height: 844 });
  console.log("Heavy Weather remains visible around RedWire cards and is absent from their rendered plate interiors.");
} finally {
  await browser.close();
}
