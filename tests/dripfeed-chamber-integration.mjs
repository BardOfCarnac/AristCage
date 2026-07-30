import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseURL = process.env.NCN_TEST_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.NCN_ARTIFACT_DIR || 'artifacts/dripfeed-chamber';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function runViewport(browser, name, viewport) {
  const page = await browser.newPage({ viewportSize: viewport });
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await page.goto(`${baseURL}?app=dripfeed`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.NCNDripfeedChamber?.snapshot?.().active === true);
  await page.waitForFunction(() => window.NCNDripfeedChamber?.snapshot?.().geometry?.aperture?.height > 0);

  const initial = await page.evaluate(() => {
    const state = window.NCNDripfeedChamber.snapshot();
    const root = document.querySelector('#dripfeed-root');
    const rail = document.querySelector('.rail');
    const stage = root.querySelector('[data-depth-host]');
    const occluder = root.querySelector('#dripfeed-chamber-occluder');
    const filter = root.querySelector('.dripfeed-filter-rail');
    const utility = root.querySelector('.dripfeed-utility-rail');
    const live = root.querySelector('.live-wall');
    const latent = root.querySelector('.rear-wall');
    const rect = element => {
      const box = element.getBoundingClientRect();
      return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    };
    return {
      state,
      rail: rect(rail),
      stage: rect(stage),
      occluder: rect(occluder),
      filter: rect(filter),
      utility: rect(utility),
      live: rect(live),
      latent: rect(latent),
      rootVariables: {
        chamberTop: getComputedStyle(root).getPropertyValue('--drip-chamber-top'),
        controlTop: getComputedStyle(root).getPropertyValue('--drip-chamber-control-top'),
        filterHeight: getComputedStyle(root).getPropertyValue('--drip-chamber-filter-height'),
        utilityTop: getComputedStyle(root).getPropertyValue('--drip-chamber-utility-top'),
        utilityHeight: getComputedStyle(root).getPropertyValue('--drip-chamber-utility-height')
      },
      stageStyle: {
        position: getComputedStyle(stage).position,
        overflowY: getComputedStyle(stage).overflowY,
        backgroundColor: getComputedStyle(stage).backgroundColor
      },
      occluderStyle: {
        position: getComputedStyle(occluder).position,
        borderTopWidth: getComputedStyle(occluder).borderTopWidth,
        zIndex: getComputedStyle(occluder).zIndex
      },
      filterStyle: {
        position: getComputedStyle(filter).position,
        flexWrap: getComputedStyle(filter).flexWrap,
        zIndex: getComputedStyle(filter).zIndex,
        paddingTop: getComputedStyle(filter).paddingTop,
        paddingBottom: getComputedStyle(filter).paddingBottom
      },
      utilityStyle: {
        position: getComputedStyle(utility).position,
        zIndex: getComputedStyle(utility).zIndex,
        paddingTop: getComputedStyle(utility).paddingTop,
        paddingBottom: getComputedStyle(utility).paddingBottom
      },
      scroll: { top: stage.scrollTop, height: stage.scrollHeight, client: stage.clientHeight },
      tileCount: live.querySelectorAll('.listing-tile').length,
      rootBackground: getComputedStyle(root).backgroundColor
    };
  });

  await page.screenshot({ path: path.join(artifactDir, `${name}-initial.png`), fullPage: false });
  await fs.writeFile(path.join(artifactDir, `${name}-initial.json`), JSON.stringify({ initial, errors }, null, 2));
  console.log(`${name} initial geometry: ${JSON.stringify({ rail: initial.rail, filter: initial.filter, utility: initial.utility, stage: initial.stage, variables: initial.rootVariables, geometry: initial.state.geometry })}`);

  const planes = initial.state.planes.reduce((map, plane) => ({ ...map, [plane.role]: plane.z }), {});
  assert(initial.state.integrated, `${name}: Dripfeed was not marked chamber-integrated.`);
  assert(planes.reader < planes.occluder, `${name}: reader is not in front of the occluder.`);
  assert(planes.occluder < planes.live, `${name}: live wall is not behind the occluder.`);
  assert(planes.live < planes.latent, `${name}: latent wall is not behind live.`);
  assert(initial.stageStyle.position === 'fixed', `${name}: stage is not fixed to the chamber aperture.`);
  assert(['auto', 'scroll'].includes(initial.stageStyle.overflowY), `${name}: stage does not own native vertical scrolling.`);
  assert(initial.stage.top >= initial.rail.bottom, `${name}: chamber aperture begins beneath the title rail.`);
  assert(initial.filterStyle.position === 'fixed', `${name}: filter rail is not foreground-fixed.`);
  assert(initial.filterStyle.flexWrap === 'nowrap', `${name}: filter rail wrapped.`);
  assert(initial.filter.top >= initial.rail.bottom - 1, `${name}: filter rail is not immediately beneath the title.`);
  assert(initial.utility.top >= initial.filter.bottom - 1, `${name}: utility controls do not follow the filter rail.`);
  assert(Number(initial.filterStyle.zIndex) > Number(initial.occluderStyle.zIndex), `${name}: filter rail is not in front of the chamber lip.`);
  assert(Number(initial.utilityStyle.zIndex) > Number(initial.occluderStyle.zIndex), `${name}: utility rail is not in front of the chamber lip.`);
  assert(initial.utility.bottom > initial.stage.top, `${name}: controls are not floating over the upper aperture.`);
  assert(Math.abs(initial.stage.left - initial.occluder.left) < 1.5, `${name}: occluder left edge does not match stage.`);
  assert(Math.abs(initial.stage.top - initial.occluder.top) < 1.5, `${name}: occluder top edge does not match stage.`);
  assert(Math.abs(initial.stage.width - initial.occluder.width) < 1.5, `${name}: occluder width does not match stage.`);
  assert(Math.abs(initial.stage.height - initial.occluder.height) < 1.5, `${name}: occluder height does not match stage.`);
  assert(parseFloat(initial.occluderStyle.borderTopWidth) > 0, `${name}: structural occlusion line is absent.`);
  assert(initial.tileCount > 0, `${name}: live wall has no tiles.`);

  const scrollResult = await page.evaluate(() => {
    const stage = document.querySelector('#dripfeed-root [data-depth-host]');
    const first = stage.querySelector('.live-wall .listing-tile');
    const before = first?.getBoundingClientRect().top ?? 0;
    const maximum = Math.max(0, stage.scrollHeight - stage.clientHeight);
    stage.scrollTop = Math.min(maximum, Math.max(80, maximum * 0.45));
    stage.dispatchEvent(new Event('scroll', { bubbles: true }));
    const after = first?.getBoundingClientRect().top ?? 0;
    return { before, after, scrollTop: stage.scrollTop, maximum };
  });
  if (scrollResult.maximum > 1) {
    assert(scrollResult.scrollTop > 0, `${name}: aperture did not accept scroll.`);
    assert(scrollResult.after < scrollResult.before, `${name}: live wall did not move through the fixed aperture.`);
  }

  await page.locator('#dripfeed-root .live-wall .listing-tile').first().click();
  await page.waitForFunction(() => window.NCNDripfeedChamber.snapshot().readingState === 'ready');
  const reading = await page.evaluate(() => {
    const state = window.NCNDripfeedChamber.snapshot();
    const reader = document.querySelector('#dripfeed-root [data-reader-target] .reader-card');
    return { state, connected: Boolean(reader?.isConnected), surface: reader?.dataset.spatialSurface || null };
  });
  assert(reading.connected, `${name}: ready publication has no connected reading surface.`);
  assert(reading.surface === 'reading', `${name}: reader is not published as the reading surface.`);

  await page.locator('#dripfeed-root [data-action="close-reader"]').click();
  await page.waitForFunction(() => window.NCNDripfeedChamber.snapshot().readingState === 'idle');

  await page.evaluate(() => window.NCNApplications.switchTo('redwire', { animate: false }));
  await page.waitForFunction(() => window.NCNApplications.current() === 'redwire');
  const redwire = await page.evaluate(() => {
    const state = window.NCNDripfeedChamber.snapshot();
    const occluder = document.querySelector('#dripfeed-chamber-occluder');
    const ownedScenes = window.NCNScene.snapshot().filter(item => item.owner === window.NCNDripfeedChamber.OWNER);
    return { state, occluderHidden: occluder?.hidden ?? true, ownedScenes };
  });
  assert(redwire.state.active === false, `${name}: bridge remained active in RedWire.`);
  assert(redwire.occluderHidden, `${name}: occluder remained visible in RedWire.`);
  assert(redwire.ownedScenes.length === 0, `${name}: Dripfeed scene ownership remained after switching.`);

  await page.evaluate(() => window.NCNApplications.switchTo('dripfeed', { animate: false }));
  await page.waitForFunction(() => window.NCNDripfeedChamber.snapshot().active === true);
  const returned = await page.evaluate(() => ({
    state: window.NCNDripfeedChamber.snapshot(),
    weather: window.NCNIntegration?.getService?.('weather')?.snapshot?.() || null
  }));
  assert(returned.state.integrated, `${name}: chamber integration did not renew after return.`);
  if (returned.weather) {
    const desired = returned.weather.desired || returned.weather;
    assert(desired.enabled === false, `${name}: Weather remained enabled in Dripfeed.`);
  }

  await page.screenshot({ path: path.join(artifactDir, `${name}.png`), fullPage: false });
  await fs.writeFile(path.join(artifactDir, `${name}.json`), JSON.stringify({ initial, scrollResult, reading, redwire, returned, errors }, null, 2));
  assert(errors.length === 0, `${name}: browser errors: ${errors.join(' | ')}`);
  await page.close();
}

await fs.mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  await runViewport(browser, 'desktop', { width: 1440, height: 900 });
  await runViewport(browser, 'mobile', { width: 390, height: 844 });
  console.log('Dripfeed chamber integration rendered proof passed on desktop and mobile.');
} finally {
  await browser.close();
}
