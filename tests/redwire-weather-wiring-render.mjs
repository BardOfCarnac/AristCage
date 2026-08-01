import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.NCN_TEST_URL || "http://127.0.0.1:4173/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => (
    window.NCNIntegratedDepartments?.isReady?.() === true
    && window.NCNIntegration?.getService?.("weather")
    && window.NCNRedWireWeatherCardOcclusion?.snapshot?.().active === true
  ), null, { timeout: 30_000 });

  await page.evaluate(() => {
    const service = window.NCNIntegration.getService("weather");
    service.applyProfile({
      enabled: true,
      preset: "heavy-mist",
      intensity: 1,
      wind: { x: 0.22, y: 0, z: 0 },
      quality: "high"
    }, {
      application: "redwire",
      reason: "heavy-mist-control-proof"
    });
  });

  await page.waitForFunction(() => {
    const service = window.NCNIntegration?.getService?.("weather");
    const snapshot = service?.snapshot?.();
    return snapshot?.targetPreset === "heavy-mist"
      && snapshot?.diagnostics?.presetDepthFlow?.foregroundSurgeActive === true
      && service?.getDepthFrame?.()?.presetSurgeDepth === 5.35;
  }, null, { timeout: 15_000 });
  await page.waitForTimeout(500);

  const result = await page.evaluate(() => {
    const service = window.NCNIntegration.getService("weather");
    const frame = service?.getDepthFrame?.() || null;
    return {
      factoryWrapped: window.createNCNWeatherDepartment?.__ncnPresetDepthFlowPolicy === true,
      policy: window.NCNWeatherPresetDepthFlowPolicy?.snapshot?.() || null,
      serviceKeys: service ? Object.keys(service).sort() : [],
      snapshot: service?.snapshot?.() || null,
      frame: frame ? {
        keys: Object.keys(frame).sort(),
        token: frame.token || null,
        presetSurgeDepth: frame.presetSurgeDepth ?? null,
        elapsedMs: frame.elapsedMs ?? null,
        hasForegroundRenderer: typeof frame.renderForeground === "function"
      } : null,
      bridge: window.NCNRedWireWeatherCardOcclusion?.snapshot?.() || null,
      plateCount: document.querySelectorAll(
        ".optical-mode .optical-semantic-item[data-optical-role='plate'] .optical-plate-surface"
      ).length
    };
  });

  console.log(JSON.stringify(result, null, 2));
  assert.equal(result.factoryWrapped, true, "The production Weather factory must be wrapped before department installation.");
  assert.equal(result.snapshot?.targetPreset, "heavy-mist", "The installed service must accept the post-start Heavy Mist control profile.");
  assert.equal(result.snapshot?.diagnostics?.presetDepthFlow?.foregroundSurgeActive, true, "The installed service must report the heavy surge active.");
  assert.ok(result.frame, "The installed Weather service must publish a current depth frame.");
  assert.equal(result.frame.presetSurgeDepth, 5.35, "The installed service depth frame must include the preset surge decoration.");
  assert.equal(result.frame.hasForegroundRenderer, true);
  assert.ok(result.plateCount > 0, "Optical plates must be available to foreground composition.");
  console.log("The post-start Heavy Mist control exposes Weather's decorated depth frame to RedWire composition.");
} finally {
  await page.close();
  await browser.close();
}
