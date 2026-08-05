import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";

const baseUrl = process.env.NCN_TEST_URL || "http://127.0.0.1:4173/";
const artifactRoot = "artifacts/integration-roundtrip";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 760 } });
const pageErrors = [];
const consoleErrors = [];

fs.mkdirSync(artifactRoot, { recursive: true });
page.on("pageerror", error => pageErrors.push(String(error?.stack || error)));
page.on("console", message => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

async function snapshot(label) {
  const state = await page.evaluate(() => ({
    desktop: window.matchMedia("(min-width: 601px)").matches,
    selectedEntryId: typeof NCN_STATE !== "undefined" ? NCN_STATE.selectedEntryId : null,
    activePanel: typeof NCN_STATE !== "undefined" ? NCN_STATE.activePanel : null,
    feedEntries: document.querySelectorAll("#feed > .entry:not(.panel)").length,
    activeFeedEntries: document.querySelectorAll("#feed > .entry.active").length,
    inspectorEntries: document.querySelectorAll("#desktop-inspector > .entry").length,
    visibleHeadlines: [...document.querySelectorAll("#feed .headline")].filter(node => {
      const style = getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0;
    }).length,
    projectionFunctionPresent: typeof window.updateProjection !== "undefined"
  }));
  await page.screenshot({
    path: `${artifactRoot}/desktop-breakpoint-${label}.png`,
    fullPage: true
  });
  return state;
}

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => (
    window.NCNIntegratedDepartments?.isReady?.() === true
    && window.NCNApplications?.current?.() === "redwire"
    && document.querySelector("#desktop-inspector > .entry")
  ), null, { timeout: 30_000 });
  await page.waitForTimeout(800);

  const desktopInitial = await snapshot("desktop-initial");
  assert.equal(desktopInitial.desktop, true);
  assert.equal(desktopInitial.projectionFunctionPresent, false,
    "The archived updateProjection global must remain absent.");
  assert.ok(desktopInitial.selectedEntryId,
    "Desktop RedWire must retain a selected story before the breakpoint crossing.");
  assert.equal(desktopInitial.inspectorEntries, 1,
    "Desktop RedWire must begin with one inspector entry.");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => (
    window.matchMedia("(min-width: 601px)").matches === false
    && document.querySelectorAll("#desktop-inspector > .entry").length === 0
    && document.querySelectorAll("#feed > .entry:not(.panel)").length > 0
  ), null, { timeout: 12_000 });
  await page.waitForTimeout(500);

  const mobile = await snapshot("mobile");
  assert.equal(mobile.desktop, false);
  assert.equal(mobile.inspectorEntries, 0,
    "Crossing to mobile must clear the desktop inspector.");
  assert.ok(mobile.feedEntries > 0,
    "Crossing to mobile must leave the RedWire feed mounted.");
  assert.ok(mobile.visibleHeadlines > 0,
    "Presence activation must complete after crossing to mobile.");

  await page.setViewportSize({ width: 900, height: 760 });
  await page.waitForFunction(() => (
    window.matchMedia("(min-width: 601px)").matches === true
    && document.querySelectorAll("#desktop-inspector > .entry").length === 1
    && document.querySelectorAll("#feed > .entry.active").length === 1
  ), null, { timeout: 12_000 });
  await page.waitForTimeout(500);

  const desktopReturned = await snapshot("desktop-returned");
  assert.equal(desktopReturned.desktop, true);
  assert.equal(desktopReturned.inspectorEntries, 1,
    "Returning to desktop must rebuild the inspector.");
  assert.equal(desktopReturned.activeFeedEntries, 1,
    "Returning to desktop must restore one active feed selection.");
  assert.ok(desktopReturned.visibleHeadlines > 0,
    "Presence activation must complete after returning to desktop.");
  assert.equal(desktopReturned.selectedEntryId, desktopInitial.selectedEntryId,
    "Responsive reflow must preserve the selected RedWire story.");

  assert.deepEqual(pageErrors, [],
    "The 601px breakpoint round trip must produce no uncaught page errors.");
  assert.deepEqual(consoleErrors, [],
    "The 601px breakpoint round trip must produce no console errors.");

  fs.writeFileSync(
    `${artifactRoot}/desktop-breakpoint-roundtrip.json`,
    JSON.stringify({
      desktopInitial,
      mobile,
      desktopReturned,
      pageErrors,
      consoleErrors
    }, null, 2)
  );

  console.log("PASS: RedWire crosses the 601px breakpoint in both directions without the archived parallax renderer.");
} catch (error) {
  fs.writeFileSync(
    `${artifactRoot}/desktop-breakpoint-failure.txt`,
    String(error?.stack || error)
  );
  try {
    await page.screenshot({
      path: `${artifactRoot}/desktop-breakpoint-failure.png`,
      fullPage: true
    });
  } catch {
    // Preserve the original assertion or browser failure.
  }
  throw error;
} finally {
  await page.close();
  await browser.close();
}
