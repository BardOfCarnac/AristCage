const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { chromium } = require("playwright");

const baseUrl = process.env.NCN_TEST_URL || "http://127.0.0.1:4173/index.html?app=redwire";
const artifactDir = process.env.NCN_ARTIFACT_DIR || "artifacts/article-mist-descent";
fs.mkdirSync(artifactDir, { recursive: true });

async function waitForReady(page) {
  await page.waitForFunction(() => (
    Boolean(window.NCNArticleMistDescent)
    && Boolean(window.NCNOpticalDescentAdapter)
    && Boolean(window.NCNIntegration?.getService?.("weather")?.getDepthFrame?.())
    && document.querySelectorAll(".optical-plane-system .optical-semantic-item").length > 0
  ), null, { timeout: 20000 });
}

async function removeLowestArticle(page) {
  return page.evaluate(() => {
    const entries = [...document.querySelectorAll("#feed > .entry:not(.panel)")]
      .filter(entry => entry.getBoundingClientRect().height > 0);
    const target = entries.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0];
    if (!target) return false;
    target.remove();
    return true;
  });
}

async function activeRect(page) {
  return page.evaluate(() => {
    const item = document.querySelector(".ncn-optical-descent-stage .optical-semantic-item.optical-descending");
    if (!item) return null;
    const rect = item.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  });
}

async function compositorCoverage(page, rect) {
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
      quality: "high",
      wind: 0
    }, { reason: "article-mist-rendered-proof" });
  });
  await page.waitForFunction(() => {
    const state = window.NCNIntegration?.getService?.("weather")?.snapshot?.();
    return state?.preset === "heavy-mist"
      && state?.quality === "high"
      && state?.particles?.mist > 36;
  }, null, { timeout: 10000 });
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
  await waitForReady(page);
  await enableHeavyMist(page);
  assert.equal(await removeLowestArticle(page), true, `${name}: expected a removable article`);

  await page.waitForFunction(() => (
    window.NCNArticleMistDescent.snapshot().active > 0
    && window.NCNOpticalDescentAdapter.snapshot().active > 0
    && document.querySelectorAll(".ncn-optical-descent-stage .optical-descending").length > 0
  ), null, { timeout: 5000 });

  const start = await activeRect(page);
  assert.ok(start, `${name}: live Optical nodes were not taken into the descent stage`);
  await page.waitForTimeout(360);
  const middle = await activeRect(page);
  assert.ok(middle, `${name}: descent ended before the middle sample`);
  assert.ok(middle.top > start.top + 4, `${name}: article did not move downward through the chamber`);
  assert.ok(middle.width < start.width, `${name}: article did not move deeper in the chamber`);

  let coverage = await compositorCoverage(page, middle);
  if (coverage.ratio < 0.03) {
    await page.waitForTimeout(180);
    coverage = await compositorCoverage(page, await activeRect(page));
  }
  fs.writeFileSync(
    path.join(artifactDir, `${name}-coverage.json`),
    JSON.stringify({ start, middle, coverage }, null, 2)
  );
  await page.screenshot({
    path: path.join(artifactDir, `${name}-mid-descent.png`),
    fullPage: false
  });
  assert.ok(coverage.ratio >= 0.03,
    `${name}: heavy mist covered only ${(coverage.ratio * 100).toFixed(2)}% of the descending article sample`);

  await page.waitForFunction(() => (
    window.NCNArticleMistDescent.snapshot().active === 0
    && window.NCNOpticalDescentAdapter.snapshot().active === 0
    && !document.querySelector(".ncn-optical-descent-stage .optical-descending")
    && document.querySelector(".ncn-article-mist-compositor")?.hidden === true
  ), null, { timeout: 5000 });

  await page.reload({ waitUntil: "networkidle" });
  await waitForReady(page);
  await enableHeavyMist(page);
  assert.equal(await removeLowestArticle(page), true, `${name}: expected a second removable article`);
  await page.waitForFunction(() => window.NCNArticleMistDescent.snapshot().active > 0, null, { timeout: 5000 });
  await page.evaluate(async () => {
    await window.NCNApplications.switchTo("dripfeed", { animate: false, reason: "article-mist-browser-test" });
  });
  await page.waitForFunction(() => (
    window.NCNArticleMistDescent.snapshot().active === 0
    && window.NCNOpticalDescentAdapter.snapshot().active === 0
    && !document.querySelector(".ncn-optical-descent-stage .optical-descending")
  ), null, { timeout: 5000 });

  assert.deepEqual(errors, [], `${name}: browser errors: ${errors.join(" | ")}`);
  await context.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    await runViewport(browser, "desktop", { width: 1440, height: 900 });
    await runViewport(browser, "mobile", { width: 390, height: 844 });
    console.log("PASS: full-quality heavy mist occupies the chamber and occludes live descending Optical articles");
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
