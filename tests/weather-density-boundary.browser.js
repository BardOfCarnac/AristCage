const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { chromium } = require("playwright");

const baseUrl = process.env.NCN_TEST_URL || "http://127.0.0.1:4173/index.html?app=redwire";
const artifactDir = process.env.NCN_ARTIFACT_DIR || "artifacts/article-mist-descent";
fs.mkdirSync(artifactDir, { recursive: true });

async function waitForWeather(page) {
  await page.waitForFunction(() => (
    Boolean(window.NCNIntegration?.getService?.("weather")?.applyProfile)
    && Boolean(window.NCNChamberCamera?.snapshot)
  ), null, { timeout: 20000 });
}

async function applyMist(page, preset) {
  const minimum = preset === "heavy-mist" ? 90 : 60;
  await page.evaluate(({ preset }) => {
    window.NCNIntegration.applyProfile("weather", {
      enabled: true,
      preset,
      intensity: preset === "heavy-mist" ? 0.92 : 0.52,
      mist: preset === "heavy-mist" ? 0.98 : 0.54,
      quality: "high",
      wind: 0
    }, { reason: "weather-density-boundary-proof" });
  }, { preset });
  await page.waitForFunction(({ preset, minimum }) => {
    const state = window.NCNIntegration?.getService?.("weather")?.snapshot?.();
    return state?.preset === preset && state?.quality === "high" && state?.particles?.mist >= minimum;
  }, { preset, minimum }, { timeout: 10000 });
  await page.waitForTimeout(650);
}

async function outsideChamberPixels(page) {
  return page.evaluate(() => {
    const camera = window.NCNChamberCamera.snapshot();
    const minimumDepth = { far: 8.5, rear: 6.5, middle: 4.35 };
    const result = {};
    for (const [layer, z] of Object.entries(minimumDepth)) {
      const canvas = document.querySelector(`.ncn-department-weather-${layer}`);
      if (!canvas || canvas.hidden || !canvas.width || !canvas.height) {
        result[layer] = { visibleOutside: 0, sampledOutside: 0, maximumAlpha: 0 };
        continue;
      }
      const rect = canvas.getBoundingClientRect();
      const aperture = camera.apertureAt(z, camera.finalHalfWidth);
      const scaleX = canvas.width / Math.max(1, rect.width);
      const scaleY = canvas.height / Math.max(1, rect.height);
      const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      let visibleOutside = 0;
      let sampledOutside = 0;
      let maximumAlpha = 0;
      const step = 4;
      for (let py = 0; py < canvas.height; py += step) {
        const pageY = rect.top + (py + 0.5) / scaleY;
        for (let px = 0; px < canvas.width; px += step) {
          const pageX = rect.left + (px + 0.5) / scaleX;
          const outside = pageX < aperture.left || pageX > aperture.right
            || pageY < aperture.top || pageY > aperture.bottom;
          if (!outside) continue;
          sampledOutside += 1;
          const alpha = data[(py * canvas.width + px) * 4 + 3];
          maximumAlpha = Math.max(maximumAlpha, alpha);
          if (alpha > 2) visibleOutside += 1;
        }
      }
      result[layer] = { visibleOutside, sampledOutside, maximumAlpha };
    }
    return result;
  });
}

async function runViewport(browser, name, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  const failures = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
  });

  const report = {};
  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await waitForWeather(page);

    for (const preset of ["mist", "heavy-mist"]) {
      await applyMist(page, preset);
      const snapshot = await page.evaluate(() => window.NCNIntegration.getService("weather").snapshot());
      const outside = await outsideChamberPixels(page);
      report[preset] = {
        activeBanks: snapshot.particles.mist,
        puffCount: snapshot.diagnostics.depthFrame.puffCount,
        outside
      };

      await page.screenshot({
        path: path.join(artifactDir, `${name}-${preset}-field.png`),
        fullPage: false
      });

      for (const [layer, sample] of Object.entries(outside)) {
        if (sample.visibleOutside !== 0) {
          failures.push(
            `${name} ${preset}: mist escaped the ${layer} chamber aperture at `
            + `${sample.visibleOutside} sampled pixels (maximum alpha ${sample.maximumAlpha})`
          );
        }
      }
    }

    if ((report.mist?.activeBanks || 0) < 60) failures.push(`${name}: ordinary mist remained too empty`);
    if ((report["heavy-mist"]?.activeBanks || 0) < 90) failures.push(`${name}: heavy mist remained too empty`);
    failures.push(...errors.map(error => `${name}: browser error: ${error}`));
  } catch (error) {
    failures.push(`${name}: proof execution failed: ${error?.stack || error}`);
  } finally {
    fs.writeFileSync(
      path.join(artifactDir, `${name}-weather-density-boundary.json`),
      JSON.stringify({ report, failures, errors }, null, 2)
    );
    await context.close();
  }

  return failures;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  try {
    failures.push(...await runViewport(browser, "desktop", { width: 1440, height: 900 }));
    failures.push(...await runViewport(browser, "mobile", { width: 390, height: 844 }));
  } finally {
    await browser.close();
  }

  assert.deepEqual(failures, [], failures.join("\n"));
  console.log("PASS: ordinary and heavy mist use dense bank fields clipped to the chamber wireframe");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
