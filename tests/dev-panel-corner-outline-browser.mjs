import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.NCN_TEST_URL || "http://127.0.0.1:4173/";
const browser = await chromium.launch({ headless: true });

async function waitForViewer(page) {
  await page.waitForFunction(() => (
    window.NCNIntegratedDepartments?.isReady?.() === true
    && Boolean(window.NCNIntegration?.getService?.("weather"))
    && Boolean(window.NCNDevPanel)
    && document.documentElement.classList.contains("diagnostics-on")
    && document.querySelectorAll(".corners").length > 0
  ), null, { timeout: 30_000 });
}

async function waitForPresentation(page, hidden) {
  await page.waitForFunction(expectedHidden => {
    const root = document.documentElement;
    const panel = document.querySelector(".diagnostics-panel");
    return root.classList.contains("diagnostics-on")
      && root.classList.contains("diagnostics-panel-hidden") === expectedHidden
      && Boolean(panel)
      && (getComputedStyle(panel).display === "none") === expectedHidden;
  }, hidden, { timeout: 10_000 });
}

async function renderedCornerOutlines(page) {
  return page.evaluate(() => [...document.querySelectorAll(".corners")]
    .filter(node => node.getClientRects().length > 0)
    .map(node => {
      const style = getComputedStyle(node);
      return {
        style: style.outlineStyle,
        width: style.outlineWidth,
        color: style.outlineColor
      };
    }));
}

async function assertCornerDiagnostics(page, expectedVisible, label) {
  await page.waitForFunction(visible => {
    const rendered = [...document.querySelectorAll(".corners")]
      .filter(node => node.getClientRects().length > 0);
    if (!rendered.length) return false;
    return rendered.every(node => {
      const style = getComputedStyle(node);
      const outlined = style.outlineStyle === "dashed" && parseFloat(style.outlineWidth) > 0;
      return outlined === visible;
    });
  }, expectedVisible, { timeout: 10_000 });

  const outlines = await renderedCornerOutlines(page);
  assert.ok(outlines.length > 0, `${label}: at least one rendered corner layer is required`);
  for (const outline of outlines) {
    const outlined = outline.style === "dashed" && parseFloat(outline.width) > 0;
    assert.equal(outlined, expectedVisible, `${label}: corner diagnostic outline visibility must follow panel presentation`);
  }
}

async function tripleTapMark(page) {
  const mark = page.locator(".rail-mark");
  for (let index = 0; index < 3; index += 1) await mark.click();
}

async function verifyRoute(page, label, trigger) {
  await assertCornerDiagnostics(page, true, `${label}/shown-before`);
  await trigger();
  await waitForPresentation(page, true);
  await assertCornerDiagnostics(page, false, `${label}/hidden`);

  await trigger();
  await waitForPresentation(page, false);
  await assertCornerDiagnostics(page, true, `${label}/shown-after`);
}

const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const consoleErrors = [];
const pageErrors = [];
page.on("console", message => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", error => pageErrors.push(String(error?.stack || error)));

try {
  await page.goto(`${baseUrl}?debug=1`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await waitForViewer(page);
  await page.waitForSelector(".diagnostics-panel", { state: "visible", timeout: 10_000 });

  await verifyRoute(page, "floating-control", () => page.locator(".diagnostics-toggle").click());
  await verifyRoute(page, "keyboard", () => page.keyboard.press("Control+Shift+D"));
  await verifyRoute(page, "triple-mark", () => tripleTapMark(page));

  await page.locator("[data-debug-disable-diagnostics]").click();
  await page.waitForFunction(() => !document.documentElement.classList.contains("diagnostics-on"), null, { timeout: 15_000 });
  await assertCornerDiagnostics(page, false, "explicit-exit");

  assert.deepEqual(pageErrors, [], "corner outline proof must not produce uncaught page errors");
  assert.deepEqual(consoleErrors, [], "corner outline proof must not produce browser console errors");
  console.log("PASS: corner diagnostic outlines follow floating, keyboard and triple-mark panel presentation routes");
} finally {
  await page.close();
  await browser.close();
}
