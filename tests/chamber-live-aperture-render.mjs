import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";

const baseUrl = process.env.NCN_TEST_URL || "http://127.0.0.1:4173/";
const artifactRoot = "artifacts/chamber-live-aperture";
fs.mkdirSync(artifactRoot, { recursive: true });
const browser = await chromium.launch({ headless: true });

async function sampleFrame(page) {
  return page.evaluate(() => {
    const camera = window.NCNChamberCamera?.snapshot?.();
    if (!camera) throw new Error("Shared chamber camera unavailable.");
    const aperture = camera.visibleAperture;
    let ink = 0;
    let outsideInk = 0;
    const canvases = [...document.querySelectorAll("canvas.ncn-department-weather-canvas")]
      .filter(canvas => !canvas.hidden && getComputedStyle(canvas).visibility !== "hidden");

    canvases.forEach(canvas => {
      const rect = canvas.getBoundingClientRect();
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context || rect.width <= 0 || rect.height <= 0) return;
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const scaleX = rect.width / canvas.width;
      const scaleY = rect.height / canvas.height;
      for (let y = 0; y < canvas.height; y += 6) {
        for (let x = 0; x < canvas.width; x += 6) {
          const alpha = data[(y * canvas.width + x) * 4 + 3];
          if (alpha <= 8) continue;
          const pageX = rect.left + x * scaleX;
          const pageY = rect.top + y * scaleY;
          ink += 1;
          if (pageX < aperture.left - 2 || pageX > aperture.right + 2
            || pageY < aperture.top - 2 || pageY > aperture.bottom + 2) outsideInk += 1;
        }
      }
    });

    return {
      presentation: camera.presentation,
      aperture,
      settledAperture: camera.settledApertureAt(camera.near),
      ink,
      outsideInk,
      chamberMode: window.LayeredChamber?.getMode?.() || null,
      weather: window.NCNIntegration?.getService?.("weather")?.snapshot?.() || null
    };
  });
}

async function runCase(name, viewport, reducedMotion = "no-preference") {
  const page = await browser.newPage({ viewport });
  await page.emulateMedia({ reducedMotion });
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("weatherTest", "heavy");
    await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(() => (
      window.NCNIntegratedDepartments?.isReady?.() === true
      && window.LayeredChamber
      && window.NCNChamberCamera
      && window.NCNIntegration?.getService?.("weather")
    ), null, { timeout: 30_000 });

    await page.evaluate(() => {
      window.LayeredChamber.setMode(window.LayeredChamber.MODES.BACKGROUND, {
        persist: false,
        restartAnimation: true
      });
    });

    const samples = [];
    for (const delay of [180, 900, 900, 900, 1_100, 1_300]) {
      await page.waitForTimeout(delay);
      samples.push(await sampleFrame(page));
    }

    const wallOpen = samples.map(sample => sample.presentation.wallOpen);
    const progress = samples.map(sample => sample.presentation.progress);
    for (let index = 1; index < samples.length; index += 1) {
      assert.ok(wallOpen[index] + 1e-9 >= wallOpen[index - 1], `${name}: wall opening must be monotonic`);
      assert.ok(progress[index] + 1e-9 >= progress[index - 1], `${name}: progress must be monotonic`);
    }

    assert.equal(samples[0].presentation.source, "layered-chamber", `${name}: camera must consume chamber publication`);
    assert.equal(samples[0].presentation.settled, false, `${name}: first sample should be during live boot`);
    assert.equal(samples.at(-1).presentation.settled, true, `${name}: final sample should be settled`);
    assert.ok(samples.some(sample => sample.ink > 0), `${name}: heavy Weather must render during chamber boot`);
    assert.ok(
      samples.every(sample => sample.outsideInk <= Math.max(2, Math.ceil(sample.ink * 0.002))),
      `${name}: Weather must remain contained by the live chamber aperture`
    );

    const final = samples.at(-1);
    assert.ok(Math.abs(final.aperture.left - final.settledAperture.left) < 1.5, `${name}: settled left aperture mismatch`);
    assert.ok(Math.abs(final.aperture.right - final.settledAperture.right) < 1.5, `${name}: settled right aperture mismatch`);

    fs.writeFileSync(`${artifactRoot}/${name}.json`, JSON.stringify(samples, null, 2));
    await page.screenshot({ path: `${artifactRoot}/${name}.png`, fullPage: true });
  } finally {
    await page.close();
  }
}

try {
  await runCase("desktop", { width: 1440, height: 900 });
  await runCase("mobile", { width: 390, height: 844 });
  await runCase("desktop-reduced-motion", { width: 1440, height: 900 }, "reduce");
  console.log("Weather remains contained by LayeredChamber's authoritative live aperture on desktop, mobile and reduced motion.");
} finally {
  await browser.close();
}
