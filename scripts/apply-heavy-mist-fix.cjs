const fs = require('node:fs');

function replace(path, before, after) {
  const source = fs.readFileSync(path, 'utf8');
  if (!source.includes(before)) throw new Error(`${path}: replacement source not found`);
  fs.writeFileSync(path, source.replace(before, after));
}

replace('departments/weather/weather-presets.js',
`    depthFlow: 0,
    electrical: 0,`,
`    depthFlow: 0,
    verticalFill: 0,
    bankScale: 1,
    bankMultiplier: 1,
    electrical: 0,`);

replace('departments/weather/weather-presets.js',
`    "heavy-mist": preset({
      mist: 0.82,
      moisture: 0.72,
      turbulence: 0.24,
      drift: 0.16,
      depthFlow: -0.026
    }),`,
`    "heavy-mist": preset({
      mist: 0.96,
      moisture: 0.90,
      turbulence: 0.28,
      drift: 0.12,
      depthFlow: -0.018,
      verticalFill: 0.82,
      bankScale: 1.34,
      bankMultiplier: 1.55
    }),`);

replace('departments/weather/weather-module.js',
`    reduced: Object.freeze({ mist: 10, dust: 8, rain: 0, fps: 8, dpr: 1 }),
    low: Object.freeze({ mist: 18, dust: 24, rain: 48, fps: 12, dpr: 1 }),
    medium: Object.freeze({ mist: 36, dust: 40, rain: 96, fps: 30, dpr: 1.2 }),
    high: Object.freeze({ mist: 48, dust: 64, rain: 144, fps: 30, dpr: 1.5 })`,
`    reduced: Object.freeze({ mist: 14, dust: 8, rain: 0, fps: 8, dpr: 1 }),
    low: Object.freeze({ mist: 28, dust: 24, rain: 48, fps: 12, dpr: 1 }),
    medium: Object.freeze({ mist: 56, dust: 40, rain: 96, fps: 30, dpr: 1.2 }),
    high: Object.freeze({ mist: 72, dust: 64, rain: 144, fps: 30, dpr: 1.5 })`);

replace('departments/weather/weather-module.js',
`    "mist", "smoke", "dust", "rain", "haze", "moisture", "turbulence",
    "drift", "fallSpeed", "depthFlow", "electrical"`,
`    "mist", "smoke", "dust", "rain", "haze", "moisture", "turbulence",
    "drift", "fallSpeed", "depthFlow", "verticalFill", "bankScale", "bankMultiplier", "electrical"`);

replace('departments/weather/weather-module.js',
`      bank.lift = randomBetween(0.02, 0.28);
      bank.alpha = randomBetween(0.55, 1.0);`,
`      bank.lift = randomBetween(0.02, 0.28);
      bank.verticalSeed = random();
      bank.scaleSeed = randomBetween(0.88, 1.12);
      bank.alpha = randomBetween(0.55, 1.0);`);

replace('departments/weather/weather-module.js',
`      return Object.freeze({
        density: clamp(APPROVED_MIST.density * presetRatio, 0, 1),
        height: APPROVED_MIST.height,
        opacity: clamp(APPROVED_MIST.opacity * intensityRatio, 0, 1),
        drift: APPROVED_MIST.drift + state.wind.x,
        depthFlow: APPROVED_MIST.depthFlow + state.wind.z,
        turbulence: APPROVED_MIST.turbulence,
        softness: APPROVED_MIST.softness
      });`,
`      const verticalFill = clamp01(state.config.verticalFill);
      return Object.freeze({
        density: clamp(APPROVED_MIST.density * presetRatio, 0, 1),
        height: APPROVED_MIST.height * mix(1, 3.6, verticalFill),
        opacity: clamp(APPROVED_MIST.opacity * intensityRatio, 0, 1),
        drift: APPROVED_MIST.drift + state.wind.x,
        depthFlow: APPROVED_MIST.depthFlow + state.wind.z,
        turbulence: APPROVED_MIST.turbulence,
        softness: APPROVED_MIST.softness,
        verticalFill,
        bankScale: clamp(state.config.bankScale || 1, 0.7, 1.8),
        bankMultiplier: clamp(state.config.bankMultiplier || 1, 1, 1.8)
      });`);

replace('departments/weather/weather-module.js',
`      const originalCount = Math.round(12 + settings.density * 38);`,
`      const originalCount = Math.round((12 + settings.density * 38) * settings.bankMultiplier);`);

replace('departments/weather/weather-module.js',
`          const x = bank.x + (normal - 0.5) * bank.width * 1.35 + wobble * bank.width * 0.12 * settings.turbulence;
          const z = bank.z + Math.sin(bank.phase2 + index * 2.1) * bank.depth * 0.28;
          const lift = bank.lift + settings.height * (0.18 + 0.26 * Math.sin(bank.phase + index * 1.3) ** 2);
          const centre = project(x, floorY + lift, z, pass, scene);
          const left = project(x - bank.width * (0.30 + 0.09 * index), floorY + lift, z, pass, scene);
          const right = project(x + bank.width * (0.30 + 0.09 * index), floorY + lift, z, pass, scene);
          const upper = project(x, floorY + lift + settings.height * (0.40 + 0.25 * bank.alpha), z, pass, scene);
          const depthA = project(x, floorY + lift * 0.6, clamp(z - bank.depth * 0.32, scene.bounds.near + 0.05, scene.bounds.far), pass, scene);
          const depthB = project(x, floorY + lift * 0.6, clamp(z + bank.depth * 0.32, scene.bounds.near + 0.05, scene.bounds.far), pass, scene);`,
`          const seededScale = mix(1, bank.scaleSeed || 1, settings.verticalFill);
          const bankScale = settings.bankScale * seededScale;
          const bankWidth = bank.width * bankScale;
          const bankDepth = bank.depth * bankScale;
          const x = bank.x + (normal - 0.5) * bankWidth * 1.35 + wobble * bankWidth * 0.12 * settings.turbulence;
          const z = bank.z + Math.sin(bank.phase2 + index * 2.1) * bankDepth * 0.28;
          const verticalRange = scene.bounds.halfHeight * 1.72 * settings.verticalFill;
          const lift = bank.lift
            + (bank.verticalSeed || 0) * verticalRange
            + settings.height * (0.18 + 0.26 * Math.sin(bank.phase + index * 1.3) ** 2);
          const centre = project(x, floorY + lift, z, pass, scene);
          const left = project(x - bankWidth * (0.30 + 0.09 * index), floorY + lift, z, pass, scene);
          const right = project(x + bankWidth * (0.30 + 0.09 * index), floorY + lift, z, pass, scene);
          const upper = project(x, floorY + lift + settings.height * (0.40 + 0.25 * bank.alpha), z, pass, scene);
          const depthA = project(x, floorY + lift * 0.6, clamp(z - bankDepth * 0.32, scene.bounds.near + 0.05, scene.bounds.far), pass, scene);
          const depthB = project(x, floorY + lift * 0.6, clamp(z + bankDepth * 0.32, scene.bounds.near + 0.05, scene.bounds.far), pass, scene);`);

replace('js/article-mist-descent.js',
`        nearerThan: Number(surface.chamberZ),
        viewport
      });`,
`        nearerThan: Number(surface.chamberZ),
        viewport,
        includeAttenuation: false
      });`);

replace('departments/weather/tests/weather-module.node.test.js',
`  assert.deepEqual(snapshot.particles.capacities, { mist: 36, dust: 40, rain: 96 });`,
`  assert.deepEqual(snapshot.particles.capacities, { mist: 56, dust: 40, rain: 96 });`);

replace('departments/weather/tests/weather-module.node.test.js',
`  assert.deepEqual(weather.snapshot().particles.capacities, { mist: 10, dust: 8, rain: 0 });`,
`  assert.deepEqual(weather.snapshot().particles.capacities, { mist: 14, dust: 8, rain: 0 });`);

replace('departments/weather/tests/weather-module.node.test.js',
`  const renders = renderCounts();
  assert.ok(renders.radial > 0, 'approved mist banks must draw radial puffs');`,
`  const renders = renderCounts();
  assert.ok(renders.radial > 0, 'approved mist banks must draw radial puffs');

  weather.applyProfile({ enabled: true, preset: 'heavy-mist', intensity: 0.92, seed: 2045 });
  runtime.handle.enable();
  runtime.step(16, 60);
  const heavy = weather.snapshot();
  assert.equal(heavy.preset, 'heavy-mist');
  assert.ok(heavy.particles.mist > approved.particles.mist,
    'heavy mist must use materially more banks than ordinary mist at normal desktop quality');
  assert.ok(weather.getDepthFrame().puffCount > depthFrame?.puffCount || heavy.particles.mist > 36,
    'heavy mist must publish a denser exact-depth field');

  weather.applyProfile({ enabled: true, preset: 'mist', intensity: 0.42, seed: 2045 });
  runtime.handle.enable();
  runtime.step(16, 40);`);

replace('tests/article-mist-descent-contract.test.js',
`  'depthFrame.renderForeground',`,
`  'depthFrame.renderForeground',
  'includeAttenuation: false',`);

replace('tests/article-mist-descent.browser.js',
`async function compositorPixels(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector(".ncn-article-mist-compositor");
    if (!canvas || canvas.hidden || !canvas.width || !canvas.height) return 0;
    const context = canvas.getContext("2d");
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let visible = 0;
    const stride = 4 * 12;
    for (let index = 3; index < data.length; index += stride) {
      if (data[index] > 2) visible += 1;
    }
    return visible;
  });
}`,
`async function compositorCoverage(page, rect) {
  return page.evaluate(bounds => {
    const canvas = document.querySelector(".ncn-article-mist-compositor");
    if (!canvas || canvas.hidden || !canvas.width || !canvas.height || !bounds) return { visible: 0, total: 0, ratio: 0 };
    const context = canvas.getContext("2d");
    const scaleX = canvas.width / window.innerWidth;
    const scaleY = canvas.height / window.innerHeight;
    const left = Math.max(0, Math.floor(bounds.left * scaleX));
    const top = Math.max(0, Math.floor(bounds.top * scaleY));
    const right = Math.min(canvas.width, Math.ceil((bounds.left + bounds.width) * scaleX));
    const bottom = Math.min(canvas.height, Math.ceil((bounds.top + bounds.height) * scaleY));
    const width = Math.max(1, right - left);
    const height = Math.max(1, bottom - top);
    const data = context.getImageData(left, top, width, height).data;
    let visible = 0;
    let total = 0;
    const step = 6;
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const alpha = data[(y * width + x) * 4 + 3];
        total += 1;
        if (alpha > 4) visible += 1;
      }
    }
    return { visible, total, ratio: total ? visible / total : 0 };
  }, rect);
}

async function enableHeavyMist(page) {
  await page.evaluate(() => {
    window.NCNIntegration.applyProfile("weather", {
      enabled: true,
      preset: "heavy-mist",
      intensity: 0.92,
      mist: 0.96,
      wind: 0
    }, { reason: "article-mist-rendered-proof" });
  });
  await page.waitForFunction(() => {
    const state = window.NCNIntegration?.getService?.("weather")?.snapshot?.();
    return state?.preset === "heavy-mist" && state?.particles?.mist > 36;
  }, null, { timeout: 10000 });
}`);

replace('tests/article-mist-descent.browser.js',
`  await waitForReady(page);
  assert.equal(await removeLowestArticle(page), true,`,
`  await waitForReady(page);
  await enableHeavyMist(page);
  assert.equal(await removeLowestArticle(page), true,`);

replace('tests/article-mist-descent.browser.js',
`  let pixels = await compositorPixels(page);
  if (!pixels) {
    await page.waitForTimeout(180);
    pixels = await compositorPixels(page);
  }
  assert.ok(pixels > 0, \`${name}: the foreground compositor never received persistent mist pixels\`);`,
`  let coverage = await compositorCoverage(page, middle);
  if (coverage.ratio < 0.03) {
    await page.waitForTimeout(180);
    coverage = await compositorCoverage(page, await activeRect(page));
  }
  assert.ok(coverage.ratio >= 0.03,
    \`${name}: heavy mist covered only ${(coverage.ratio * 100).toFixed(2)}% of the descending article sample\`);`);

replace('tests/article-mist-descent.browser.js',
`  await page.reload({ waitUntil: "networkidle" });
  await waitForReady(page);
  assert.equal(await removeLowestArticle(page), true,`,
`  await page.reload({ waitUntil: "networkidle" });
  await waitForReady(page);
  await enableHeavyMist(page);
  assert.equal(await removeLowestArticle(page), true,`);

console.log('Applied heavy mist volume, descent attenuation and rendered coverage corrections.');
