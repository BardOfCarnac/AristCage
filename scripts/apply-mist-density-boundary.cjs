const fs = require("node:fs");

function replace(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  if (!source.includes(before)) {
    throw new Error(`${path}: replacement source not found:\n${before.slice(0, 180)}`);
  }
  fs.writeFileSync(path, source.replace(before, after));
}

function write(path, content) {
  fs.mkdirSync(require("node:path").dirname(path), { recursive: true });
  fs.writeFileSync(path, content);
}

replace("departments/weather/weather-presets.js",
`    mist: preset({
      mist: 0.48,
      moisture: 0.42,
      turbulence: 0.17,
      drift: 0.20,
      depthFlow: -0.018
    }),`,
`    mist: preset({
      mist: 0.54,
      moisture: 0.48,
      turbulence: 0.17,
      drift: 0.20,
      depthFlow: -0.018,
      verticalFill: 0.10,
      bankScale: 0.88,
      bankMultiplier: 1.18
    }),`);

replace("departments/weather/weather-presets.js",
`    "heavy-mist": preset({
      mist: 0.96,
      moisture: 0.90,
      turbulence: 0.28,
      drift: 0.12,
      depthFlow: -0.018,
      verticalFill: 0.82,
      bankScale: 1.34,
      bankMultiplier: 1.55
    }),`,
`    "heavy-mist": preset({
      mist: 0.98,
      moisture: 0.92,
      turbulence: 0.28,
      drift: 0.12,
      depthFlow: -0.018,
      verticalFill: 0.82,
      bankScale: 1.08,
      bankMultiplier: 1.85
    }),`);

replace("departments/weather/weather-module.js",
`  const QUALITY = Object.freeze({
    reduced: Object.freeze({ mist: 14, dust: 8, rain: 0, fps: 8, dpr: 1 }),
    low: Object.freeze({ mist: 28, dust: 24, rain: 48, fps: 12, dpr: 1 }),
    medium: Object.freeze({ mist: 56, dust: 40, rain: 96, fps: 30, dpr: 1.2 }),
    high: Object.freeze({ mist: 72, dust: 64, rain: 144, fps: 30, dpr: 1.5 })
  });`,
`  const QUALITY = Object.freeze({
    reduced: Object.freeze({ mist: 20, dust: 8, rain: 0, fps: 8, dpr: 1 }),
    low: Object.freeze({ mist: 48, dust: 24, rain: 48, fps: 12, dpr: 1 }),
    medium: Object.freeze({ mist: 96, dust: 40, rain: 96, fps: 30, dpr: 1.2 }),
    high: Object.freeze({ mist: 128, dust: 64, rain: 144, fps: 30, dpr: 1.5 })
  });`);

replace("departments/weather/weather-module.js",
`      bank.width = randomBetween(0.90, 2.40);
      bank.depth = randomBetween(0.60, 2.00);`,
`      bank.width = randomBetween(0.62, 1.58);
      bank.depth = randomBetween(0.38, 1.15);`);

replace("departments/weather/weather-module.js",
`      const originalCount = Math.round((12 + settings.density * 38) * settings.bankMultiplier);`,
`      const originalCount = Math.round((18 + settings.density * 58) * settings.bankMultiplier);`);

replace("departments/weather/weather-module.js",
`          const z = bank.z + Math.sin(bank.phase2 + index * 2.1) * bankDepth * 0.28;
          const verticalRange = scene.bounds.halfHeight * 1.72 * settings.verticalFill;`,
`          const z = clamp(
            bank.z + Math.sin(bank.phase2 + index * 2.1) * bankDepth * 0.28,
            scene.bounds.near + 0.05,
            scene.bounds.far - 0.05
          );
          const chamberClip = normaliseRect(scene.camera?.apertureAt?.(z, scene.bounds.halfWidth))
            || Object.freeze({
              left: layerRect.left,
              top: layerRect.top,
              right: layerRect.left + layerRect.width,
              bottom: layerRect.top + layerRect.height,
              width: layerRect.width,
              height: layerRect.height
            });
          const verticalRange = scene.bounds.halfHeight * 1.72 * settings.verticalFill;`);

replace("departments/weather/weather-module.js",
`            pageX: centre.x + layerRect.left,
            pageY: centre.y + layerRect.top,
            radiusX,`,
`            pageX: centre.x + layerRect.left,
            pageY: centre.y + layerRect.top,
            chamberClip,
            radiusX,`);

replace("departments/weather/weather-module.js",
`    function drawMistPuff(targetContext, puff, x = puff.localX, y = puff.localY) {
      targetContext.save?.();
      targetContext.translate?.(x, y);`,
`    function shiftedClipRect(rect, originX = 0, originY = 0) {
      if (!rect) return null;
      return {
        left: rect.left - originX,
        top: rect.top - originY,
        width: rect.width,
        height: rect.height
      };
    }

    function drawMistPuff(targetContext, puff, x = puff.localX, y = puff.localY, clipRect = null) {
      targetContext.save?.();
      if (clipRect && typeof targetContext.rect === "function" && typeof targetContext.clip === "function") {
        targetContext.beginPath?.();
        targetContext.rect(clipRect.left, clipRect.top, clipRect.width, clipRect.height);
        targetContext.clip();
      }
      targetContext.translate?.(x, y);`);

replace("departments/weather/weather-module.js",
`          drawMistPuff(targetContext, puff, puff.pageX - originX, puff.pageY - originY);
          rendered += 1;`,
`          drawMistPuff(
            targetContext,
            puff,
            puff.pageX - originX,
            puff.pageY - originY,
            shiftedClipRect(puff.chamberClip, originX, originY)
          );
          rendered += 1;`);

replace("departments/weather/weather-module.js",
`      puffs.forEach(puff => drawMistPuff(contexts.get(puff.layer), puff));`,
`      puffs.forEach(puff => {
        const layer = scene.rects.get(puff.layer);
        drawMistPuff(
          contexts.get(puff.layer),
          puff,
          puff.localX,
          puff.localY,
          shiftedClipRect(puff.chamberClip, layer.left, layer.top)
        );
      });`);

replace("departments/weather/weather-module.js",
`        depthRange,
        renderForeground`,
`        depthRange,
        chamberClipped: true,
        renderForeground`);

replace("departments/weather/tests/weather-module.node.test.js",
`  assert.deepEqual(snapshot.particles.capacities, { mist: 56, dust: 40, rain: 96 });`,
`  assert.deepEqual(snapshot.particles.capacities, { mist: 96, dust: 40, rain: 96 });`);

replace("departments/weather/tests/weather-module.node.test.js",
`  assert.equal(approved.particles.mist, 36, 'approved Low mist must use 36 banks at normal quality');`,
`  assert.equal(approved.particles.mist, 69, 'ordinary mist must use a dense field of smaller banks at normal quality');`);

replace("departments/weather/tests/weather-module.node.test.js",
`  assert.deepEqual(weather.snapshot().particles.capacities, { mist: 14, dust: 8, rain: 0 });`,
`  assert.deepEqual(weather.snapshot().particles.capacities, { mist: 20, dust: 8, rain: 0 });`);

replace("departments/weather/tests/weather-module.node.test.js",
`  assert.equal(depthFrame.depthConvention, 'smaller-positive-z-is-nearer');`,
`  assert.equal(depthFrame.depthConvention, 'smaller-positive-z-is-nearer');
  assert.equal(depthFrame.chamberClipped, true, 'published mist puffs must remain clipped to the chamber aperture');`);

replace("departments/weather/tests/weather-mist-visual-contract.test.js",
`  'bank.width = randomBetween(0.90, 2.40)',
  'bank.depth = randomBetween(0.60, 2.00)',`,
`  'bank.width = randomBetween(0.62, 1.58)',
  'bank.depth = randomBetween(0.38, 1.15)',`);

replace("departments/weather/tests/weather-mist-visual-contract.test.js",
`  'const z = bank.z + Math.sin(bank.phase2 + index * 2.1) * bank.depth * 0.28',
  'puffs.sort((a, b) => b.z - a.z)',`,
`  'scene.camera?.apertureAt?.(z, scene.bounds.halfWidth)',
  'shiftedClipRect(puff.chamberClip',
  'chamberClipped: true',
  'puffs.sort((a, b) => b.z - a.z)',`);

replace(".github/workflows/article-mist-descent.yml",
`          node --check tests/article-mist-descent.browser.js`,
`          node --check tests/article-mist-descent.browser.js
          node --check tests/weather-density-boundary.browser.js`);

replace(".github/workflows/article-mist-descent.yml",
`      - name: Run desktop and mobile rendered proof
        run: node tests/article-mist-descent.browser.js`,
`      - name: Run desktop and mobile rendered proof
        run: |
          node tests/weather-density-boundary.browser.js
          node tests/article-mist-descent.browser.js`);

write("tests/weather-density-boundary.browser.js", `const fs = require("fs");
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
        result[layer] = { visibleOutside: 0, sampledOutside: 0 };
        continue;
      }
      const rect = canvas.getBoundingClientRect();
      const aperture = camera.apertureAt(z, camera.finalHalfWidth);
      const scaleX = canvas.width / Math.max(1, rect.width);
      const scaleY = canvas.height / Math.max(1, rect.height);
      const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      let visibleOutside = 0;
      let sampledOutside = 0;
      const step = 4;
      for (let py = 0; py < canvas.height; py += step) {
        const pageY = rect.top + (py + 0.5) / scaleY;
        for (let px = 0; px < canvas.width; px += step) {
          const pageX = rect.left + (px + 0.5) / scaleX;
          const outside = pageX < aperture.left || pageX > aperture.right
            || pageY < aperture.top || pageY > aperture.bottom;
          if (!outside) continue;
          sampledOutside += 1;
          if (data[(py * canvas.width + px) * 4 + 3] > 2) visibleOutside += 1;
        }
      }
      result[layer] = { visibleOutside, sampledOutside };
    }
    return result;
  });
}

async function runViewport(browser, name, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await waitForWeather(page);

  const report = {};
  for (const preset of ["mist", "heavy-mist"]) {
    await applyMist(page, preset);
    const snapshot = await page.evaluate(() => window.NCNIntegration.getService("weather").snapshot());
    const outside = await outsideChamberPixels(page);
    report[preset] = {
      activeBanks: snapshot.particles.mist,
      puffCount: snapshot.diagnostics.depthFrame.puffCount,
      outside
    };
    for (const [layer, sample] of Object.entries(outside)) {
      assert.equal(sample.visibleOutside, 0,
        `${name} ${preset}: mist escaped the ${layer} chamber aperture at ${sample.visibleOutside} sampled pixels`);
    }
    await page.screenshot({
      path: path.join(artifactDir, `${name}-${preset}-field.png`),
      fullPage: false
    });
  }

  assert.ok(report.mist.activeBanks >= 60, `${name}: ordinary mist remained too empty`);
  assert.ok(report["heavy-mist"].activeBanks >= 90, `${name}: heavy mist remained too empty`);
  fs.writeFileSync(path.join(artifactDir, `${name}-weather-density-boundary.json`), JSON.stringify(report, null, 2));
  assert.deepEqual(errors, [], `${name}: browser errors: ${errors.join(" | ")}`);
  await context.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    await runViewport(browser, "desktop", { width: 1440, height: 900 });
    await runViewport(browser, "mobile", { width: 390, height: 844 });
    console.log("PASS: ordinary and heavy mist use dense bank fields clipped to the chamber wireframe");
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
`);

console.log("Applied denser mist fields and exact chamber-aperture clipping.");
