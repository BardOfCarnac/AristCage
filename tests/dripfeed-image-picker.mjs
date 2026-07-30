import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseURL = process.env.NCN_TEST_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.NCN_ARTIFACT_DIR || 'artifacts/dripfeed-image-picker';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function imageData(label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#16080b"/><path d="M0 650L1200 160" stroke="#ef473d" stroke-width="18" opacity=".72"/><text x="600" y="420" fill="white" font-family="monospace" font-size="72" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function liveResult(id = 'live-1') {
  const image = imageData(id.toUpperCase());
  return {
    id,
    provider: 'pexels',
    source: 'pexels',
    alt: 'night market under red lights',
    width: 1200,
    height: 800,
    orientation: 'landscape',
    urls: { thumb: image, small: image, regular: image, full: image },
    photographer: {
      name: 'Integration Photographer',
      url: 'https://unsplash.com/@integration-photographer'
    },
    photoUrl: `https://unsplash.com/photos/${id}`,
    providerUrl: 'https://www.pexels.com/',
    downloadLocation: `https://api.unsplash.com/photos/${id}/download`,
    usage: {
      hotlinkRequired: false,
      selectionTrackingRequired: false,
      localCopyAllowed: true
    },
    demo: false
  };
}

async function fillDetails(page, suffix) {
  await page.fill('#poster-alias', `PickerTester${suffix}`);
  await page.fill('#listing-title', `Provider picker proof ${suffix}`);
  await page.fill('#listing-body', 'A browser-level provider picker contract check inside the chamber-mounted Dripfeed publication.');
  await page.fill('#district', 'Watson');
  await page.fill('#value-label', '€$100');
  await page.fill('#contact-method', `PING PICKER-${suffix}`);
}

async function enterImageStep(page, suffix) {
  await fillDetails(page, suffix);
  await page.locator('[data-wizard-step="1"] [data-submit-action="next"]').click();
  await page.waitForFunction(() => document.querySelector('[data-wizard-step="2"]')?.classList.contains('active'));
  await page.waitForSelector('.photo-result-shell .photo-result');
}

async function commitSelectedImage(page) {
  await page.locator('.photo-result-shell .photo-result').first().click();
  await page.waitForFunction(() => document.querySelectorAll('.crop-preview-grid .crop-preview').length === 4);
  const commit = await page.evaluate(async () => {
    const controller = document.querySelector('#dripfeed-root').__dripfeedApp.submit;
    const results = await Promise.all([controller.next(), controller.next()]);
    return {
      results,
      step: controller.step,
      committedPhotoKey: controller.committedPhotoKey,
      pendingCommit: Boolean(controller.commitPromise)
    };
  });
  assert(commit.step === 3, `concurrent picker commit remained on step ${commit.step}.`);
  assert(Boolean(commit.committedPhotoKey), 'concurrent picker commit did not retain its committed image key.');
  await page.waitForFunction(() => document.querySelector('[data-wizard-step="3"]')?.classList.contains('active'));
}

async function runViewport(browser, name, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  let selectionRequests = 0;
  let slowSearchStarted = false;

  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await page.route('**/images/search**', async route => {
    const url = new URL(route.request().url());
    const query = url.searchParams.get('query') || '';
    if (query === 'slow search') {
      slowSearchStarted = true;
      await new Promise(resolve => setTimeout(resolve, 500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ provider: 'pexels', page: 1, total: 1, totalPages: 1, results: [liveResult('slow-result')] })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ provider: 'pexels', page: 1, total: 1, totalPages: 1, results: [liveResult()] })
    });
  });

  await page.route('**/images/selection', async route => {
    selectionRequests += 1;
    await new Promise(resolve => setTimeout(resolve, 90));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  await page.goto(`${baseURL}?app=dripfeed`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.NCNDripfeedChamber?.snapshot?.().active === true);
  await page.waitForFunction(() => document.querySelector('#dripfeed-root')?.__dripfeedApp);

  await page.evaluate(() => {
    const app = document.querySelector('#dripfeed-root').__dripfeedApp;
    const provider = app.images.get('unsplash');
    provider.searchEndpoint = '/images/search';
    provider.trackEndpoint = '/images/selection';
    window.__pickerCancelReasons = [];
    const originalCancel = app.submit.cancelSearch.bind(app.submit);
    app.submit.cancelSearch = reason => {
      window.__pickerCancelReasons.push(reason);
      return originalCancel(reason);
    };
  });

  await page.locator('[data-action="open-submit"]').click();
  await page.waitForFunction(() => document.querySelector('[data-overlay="submit"]')?.classList.contains('open'));
  await enterImageStep(page, 'A');

  const firstResult = await page.evaluate(() => {
    const controller = document.querySelector('#dripfeed-root').__dripfeedApp.submit;
    const photo = controller.results[0];
    return {
      provider: photo.provider,
      usage: photo.usage,
      providerUrl: photo.providerUrl,
      creatorHref: document.querySelector('.photo-creator-link')?.href || '',
      providerHref: document.querySelector('.photo-provider-link')?.href || ''
    };
  });
  assert(firstResult.provider === 'unsplash', `${name}: raw provider spoof escaped the selected provider boundary.`);
  assert(firstResult.usage.hotlinkRequired === true, `${name}: Unsplash hotlink requirement was not authoritative.`);
  assert(firstResult.usage.selectionTrackingRequired === true, `${name}: Unsplash selection event was not authoritative.`);
  assert(firstResult.usage.localCopyAllowed === false, `${name}: Unsplash local-copy prohibition was not authoritative.`);
  assert(firstResult.providerUrl.startsWith('https://unsplash.com/'), `${name}: provider home was not normalized to Unsplash.`);
  assert(firstResult.creatorHref.includes('utm_source=night_city_news'), `${name}: creator attribution lacks referral parameters.`);
  assert(firstResult.providerHref.includes('utm_source=night_city_news'), `${name}: provider/photo attribution lacks referral parameters.`);

  await commitSelectedImage(page);
  assert(selectionRequests === 1, `${name}: rapid USE IMAGE / REVIEW produced ${selectionRequests} selection events.`);
  assert(await page.locator('#review-target .photo-credit a').count() >= 2, `${name}: review attribution links are missing.`);

  await page.check('#image-safeguard');
  await page.check('#review-confirm');
  await page.locator('[data-wizard-step="3"] [data-submit-action="transmit"]').click();
  await page.waitForFunction(() => !document.querySelector('[data-overlay="submit"]')?.classList.contains('open'));
  await page.waitForSelector('.live-wall [data-post-id] .photo-credit a');
  const publishedTitle = await page.locator('.live-wall [data-post-id] h2').first().textContent();
  assert(publishedTitle?.includes('Provider picker proof A'), `${name}: provider-backed transmission did not publish.`);

  await page.locator('[data-action="open-submit"]').click();
  await enterImageStep(page, 'B');
  await commitSelectedImage(page);
  assert(selectionRequests === 2, `${name}: a later transmission using the same photo did not receive its own event.`);

  await page.locator('[data-wizard-step="3"] [data-submit-action="back"]').click();
  await page.fill('#image-query', 'slow search');
  await page.locator('[data-wizard-step="2"] [data-submit-action="search"]').click();
  await page.waitForFunction(() => document.querySelector('#picker-state')?.textContent.includes('Searching'));
  for (let attempt = 0; attempt < 20 && !slowSearchStarted; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert(slowSearchStarted, `${name}: delayed search request did not start.`);

  await page.evaluate(() => window.NCNApplications.switchTo('redwire', { animate: false }));
  await page.waitForFunction(() => window.NCNApplications.current() === 'redwire');
  await new Promise(resolve => setTimeout(resolve, 600));

  const cancellation = await page.evaluate(() => {
    const app = document.querySelector('#dripfeed-root').__dripfeedApp;
    return {
      reasons: window.__pickerCancelReasons,
      resultIds: app.submit.results.map(photo => photo.id)
    };
  });
  assert(cancellation.reasons.includes('application-deactivate'), `${name}: application switch did not cancel the picker search.`);
  assert(!cancellation.resultIds.includes('slow-result'), `${name}: a cancelled hidden-app response mutated picker results.`);

  await page.evaluate(() => window.NCNApplications.switchTo('dripfeed', { animate: false }));
  await page.waitForFunction(() => window.NCNDripfeedChamber?.snapshot?.().active === true);
  const returned = await page.evaluate(() => ({
    weather: window.NCNIntegration?.getService?.('weather')?.snapshot?.() || null,
    chamber: window.NCNDripfeedChamber.snapshot(),
    overlayOpen: document.querySelector('[data-overlay="submit"]')?.classList.contains('open') || false
  }));
  if (returned.weather) {
    const desired = returned.weather.desired || returned.weather;
    assert(desired.enabled === false, `${name}: Weather leaked into Dripfeed after picker round trip.`);
  }
  assert(returned.chamber.active === true, `${name}: chamber placement did not renew after picker round trip.`);
  assert(returned.overlayOpen === false, `${name}: submit overlay leaked across application switching.`);

  await page.screenshot({ path: path.join(artifactDir, `${name}-picker.png`), fullPage: false });
  await fs.writeFile(path.join(artifactDir, `${name}.json`), JSON.stringify({
    viewport,
    firstResult,
    selectionRequests,
    cancellation,
    returned,
    errors
  }, null, 2));
  assert(errors.length === 0, `${name}: browser errors: ${errors.join(' | ')}`);
  await context.close();
}

await fs.mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  await runViewport(browser, 'desktop', { width: 1280, height: 800 });
  await runViewport(browser, 'mobile', { width: 390, height: 844 });
  console.log('Dripfeed image picker rendered proof passed: attribution, per-use tracking, cancellation and chamber round trip retained.');
} finally {
  await browser.close();
}
