import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseURL = process.env.NCN_TEST_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.NCN_ARTIFACT_DIR || 'artifacts/dripfeed-chamber';
const OWNER = 'integration:dripfeed-chamber';
const EXPECTED_FILTER_LABELS = ['all', 'items', 'services', 'housing', 'jobs', 'rides', 'community'];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function near(actual, expected, tolerance = 0.025) {
  return Math.abs(Number(actual) - Number(expected)) <= tolerance;
}

function semanticLabels(labels) {
  return labels.map(label => String(label).trim().toLocaleLowerCase('en-US'));
}

function assertFilterPresentation(name, phase, labels, transforms, overflow) {
  const semantic = semanticLabels(labels);
  assert(semantic.join('|') === EXPECTED_FILTER_LABELS.join('|'),
    `${name}: ${phase} category labels are incomplete or reordered (${labels.join(', ')}).`);
  assert(transforms.every(value => value === 'uppercase'),
    `${name}: ${phase} category labels are not visually uppercase (${transforms.join(', ')}).`);
  assert(overflow <= 1, `${name}: ${phase} category labels overflow their one-line rail by ${overflow}px.`);
}

async function openAndCloseTransmit(page, name, phase) {
  const button = page.locator('#dripfeed-root .filter-transmit');
  await button.click();
  await page.waitForFunction(() => document.querySelector('#dripfeed-root .submit-overlay')?.classList.contains('open'));

  const opened = await page.evaluate(() => {
    const overlay = document.querySelector('#dripfeed-root .submit-overlay');
    const button = document.querySelector('#dripfeed-root .filter-transmit');
    return {
      overlayOpen: overlay?.classList.contains('open') || false,
      overlayHidden: overlay?.getAttribute('aria-hidden'),
      parentClass: button?.parentElement?.className || ''
    };
  });

  assert(opened.overlayOpen && opened.overlayHidden === 'false',
    `${name}: Transmit did not open during ${phase}.`);
  assert(opened.parentClass.includes('dripfeed-utility-rail'),
    `${name}: Transmit left the utility rail during ${phase}.`);

  await page.locator('#dripfeed-root .submit-overlay .icon-close').click();
  await page.waitForFunction(() => document.querySelector('#dripfeed-root .submit-overlay')?.getAttribute('aria-hidden') === 'true');
  return opened;
}

async function waitForDripfeed(page) {
  await page.goto(`${baseURL}?app=dripfeed`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.NCNDripfeedChamber?.snapshot?.().active === true);
  await page.waitForFunction(() => window.NCNDripfeedChamber?.snapshot?.().geometry?.aperture?.height > 0);
  await page.waitForFunction(() => document.querySelector('#dripfeed-root .live-wall .listing-tile'));
}

async function captureComposition(page) {
  return page.evaluate(() => {
    const root = document.querySelector('#dripfeed-root');
    const state = window.NCNDripfeedChamber.snapshot();
    const adapter = window.NCNDripfeed.snapshot();
    const surfaces = window.NCNDripfeed.getSpatialSurfaces();
    const rail = document.querySelector('.rail');
    const filter = root.querySelector('.dripfeed-filter-rail');
    const filterChips = root.querySelector('.filter-chips');
    const utility = root.querySelector('.dripfeed-utility-rail');
    const transmit = root.querySelector('.filter-transmit');
    const repack = root.querySelector('[data-action="repack"]');
    const occluder = root.querySelector('#dripfeed-chamber-occluder');

    const rect = element => {
      const box = element.getBoundingClientRect();
      return {
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        width: box.width,
        height: box.height
      };
    };

    const scaleOf = element => {
      const transform = getComputedStyle(element).transform;
      if (!transform || transform === 'none') return { transform, scaleX: 1, scaleY: 1 };
      const matrix = new DOMMatrixReadOnly(transform);
      return { transform, scaleX: matrix.a, scaleY: matrix.d };
    };

    const liveRect = rect(surfaces.live);
    const tiles = [...surfaces.live.querySelectorAll('.listing-tile')].map(tile => {
      const tileRect = rect(tile);
      const h2 = tile.querySelector('.tile-copy h2');
      const body = tile.querySelector('.tile-copy p');
      const footer = tile.querySelector('.tile-footer');
      const visibleRect = element => element && getComputedStyle(element).display !== 'none' ? rect(element) : null;
      const h2Rect = visibleRect(h2);
      const bodyRect = visibleRect(body);
      const footerRect = visibleRect(footer);
      return {
        id: tile.dataset.postId,
        insideWall: tileRect.left >= liveRect.left - 1 && tileRect.right <= liveRect.right + 1,
        headlineInside: !h2Rect || (h2Rect.top >= tileRect.top - 1 && h2Rect.bottom <= tileRect.bottom + 1),
        bodyInside: !bodyRect || (bodyRect.top >= tileRect.top - 1 && bodyRect.bottom <= tileRect.bottom + 1),
        footerInside: !footerRect || (footerRect.top >= tileRect.top - 1 && footerRect.bottom <= tileRect.bottom + 1),
        headlineBodyClear: !h2Rect || !bodyRect || h2Rect.bottom <= bodyRect.top + 1,
        bodyFooterClear: !bodyRect || !footerRect || bodyRect.bottom <= footerRect.top + 1,
        headlineFooterClear: bodyRect || !h2Rect || !footerRect || h2Rect.bottom <= footerRect.top + 1
      };
    });

    const filterButtons = [...filter.querySelectorAll('.filter-chip')];
    const firstTile = surfaces.live.querySelector('.listing-tile');

    return {
      viewport: { width: innerWidth, height: innerHeight },
      state,
      adapter,
      columns: Number(getComputedStyle(root).getPropertyValue('--cols')),
      unit: parseFloat(getComputedStyle(root).getPropertyValue('--unit')),
      rail: rect(rail),
      filter: rect(filter),
      utility: rect(utility),
      stage: rect(surfaces.depthHost),
      occluder: rect(occluder),
      live: liveRect,
      latent: rect(surfaces.latent),
      firstTile: rect(firstTile),
      liveTransform: scaleOf(surfaces.live),
      latentTransform: scaleOf(surfaces.latent),
      liveTileCount: tiles.length,
      latentTileCount: surfaces.latent.querySelectorAll('.listing-tile').length,
      filterLabels: filterButtons.map(button => button.textContent.trim()),
      filterTextTransforms: filterButtons.map(button => getComputedStyle(button).textTransform),
      filterOverflow: filterChips.scrollWidth - filterChips.clientWidth,
      transmitParent: transmit?.parentElement?.className || '',
      repackDisplay: repack ? getComputedStyle(repack).display : 'absent',
      stageStyle: {
        position: getComputedStyle(surfaces.depthHost).position,
        overflowY: getComputedStyle(surfaces.depthHost).overflowY,
        backgroundColor: getComputedStyle(surfaces.depthHost).backgroundColor
      },
      latentStyle: {
        display: getComputedStyle(surfaces.latent).display,
        opacity: getComputedStyle(surfaces.latent).opacity
      },
      tiles,
      scroll: {
        top: surfaces.depthHost.scrollTop,
        height: surfaces.depthHost.scrollHeight,
        client: surfaces.depthHost.clientHeight,
        width: surfaces.depthHost.scrollWidth,
        clientWidth: surfaces.depthHost.clientWidth
      }
    };
  });
}

function assertComposition(name, viewport, initial) {
  assert(initial.viewport.width === viewport.width && initial.viewport.height === viewport.height,
    `${name}: requested ${viewport.width}x${viewport.height} but rendered ${initial.viewport.width}x${initial.viewport.height}.`);

  const planes = initial.state.planes.reduce((map, plane) => ({ ...map, [plane.role]: plane }), {});
  assert(initial.state.integrated, `${name}: Dripfeed was not marked chamber-integrated.`);
  assert(initial.adapter.geometryOwner === OWNER, `${name}: public adapter did not publish Integration geometry ownership.`);
  assert(initial.adapter.depth?.dormant === true, `${name}: interim depth adapter is not dormant.`);
  assert(initial.adapter.depth?.listenersBound === false, `${name}: interim depth listeners remain bound.`);
  assert(initial.adapter.depth?.observerConnected === false, `${name}: interim ResizeObserver remains connected.`);
  assert(initial.adapter.responsiveColumns?.effective === initial.columns,
    `${name}: responsive column owner disagrees with computed columns.`);
  assert(initial.adapter.responsiveColumns?.tracking === true,
    `${name}: responsive column tracking is not active.`);

  assert(planes.reader.z < planes.occluder.z, `${name}: reader is not in front of the occluder.`);
  assert(planes.occluder.z < planes.live.z, `${name}: live wall is not behind the occluder.`);
  assert(planes.live.z < planes.latent.z, `${name}: latent wall is not behind live.`);
  assert(initial.state.geometry.calibration?.liveGapCells <= 0.025,
    `${name}: live wall was not calibrated immediately behind the grid line.`);

  assert(initial.stageStyle.position === 'fixed', `${name}: stage is not fixed to the chamber aperture.`);
  assert(['auto', 'scroll'].includes(initial.stageStyle.overflowY), `${name}: stage does not own native scrolling.`);
  assert(initial.latentStyle.display === 'grid', `${name}: latent surface remains display:none.`);
  assert(initial.live.width > 0 && initial.live.height > 0, `${name}: live plane has no rendered rectangle.`);
  assert(initial.latent.width > 0 && initial.latent.height > 0, `${name}: latent plane has no rendered rectangle.`);
  assert(initial.liveTransform.transform !== 'none', `${name}: live plane has no rendered camera transform.`);
  assert(initial.latentTransform.transform !== 'none', `${name}: latent plane has no rendered camera transform.`);
  assert(initial.liveTransform.scaleX < 1, `${name}: live plane is not visually behind the grid line.`);
  assert(initial.latentTransform.scaleX < initial.liveTransform.scaleX, `${name}: latent plane is not visually behind live.`);
  assert(near(initial.liveTransform.scaleX, planes.live.scale), `${name}: live transform does not match camera projection.`);
  assert(near(initial.latentTransform.scaleX, planes.latent.scale), `${name}: latent transform does not match camera projection.`);

  assert(initial.firstTile.top >= initial.utility.bottom + 5,
    `${name}: first readable tile begins beneath the foreground shell.`);
  assert(initial.liveTileCount > 0, `${name}: live wall has no tiles.`);
  assert(Number.isFinite(initial.unit) && initial.unit > 0, `${name}: chamber geometry did not publish a square cell unit.`);
  assert(initial.scroll.width <= initial.scroll.clientWidth + 1, `${name}: wall creates horizontal aperture overflow.`);
  assert(initial.tiles.every(item => item.insideWall), `${name}: a first/last-column tile is clipped outside the live wall.`);
  assert(initial.tiles.every(item => item.headlineInside && item.bodyInside && item.footerInside),
    `${name}: tile text escapes its card.`);
  assert(initial.tiles.every(item => item.headlineBodyClear && item.bodyFooterClear && item.headlineFooterClear),
    `${name}: tile headline/body/footer regions collide.`);

  assertFilterPresentation(name, 'initial', initial.filterLabels, initial.filterTextTransforms, initial.filterOverflow);
  assert(initial.transmitParent.includes('dripfeed-utility-rail'), `${name}: Transmit is not structurally inside the utility rail.`);
  assert(['none', 'absent'].includes(initial.repackDisplay), `${name}: ordinary Repack control remains visible.`);
  assert(initial.rail.height <= (viewport.width <= 430 ? 90 : 145),
    `${name}: compact masthead remains too tall (${initial.rail.height}px).`);

  if (viewport.width <= 430) {
    assert(initial.columns === 2, `${name}: narrow Dripfeed board did not switch to two columns (got ${initial.columns}).`);
  }

  return planes;
}

async function exerciseControls(page, name, viewport) {
  const items = page.locator('#dripfeed-root .filter-chip[data-category="items"]');
  const all = page.locator('#dripfeed-root .filter-chip[data-category="all"]');
  const search = page.locator('#dripfeed-root #feed-search');
  const reset = page.locator('#dripfeed-root [data-action="reset"]');

  await items.click();
  await page.waitForFunction(() => document.querySelector('#dripfeed-root .filter-chip[data-category="items"]')?.classList.contains('active'));
  await all.click();

  await search.fill('airport');
  await page.waitForFunction(() => document.querySelectorAll('#dripfeed-root .live-wall .listing-tile').length > 0);

  if (viewport.width > 1050) {
    await reset.click();
    await page.waitForFunction(() => document.querySelectorAll('#dripfeed-root .live-wall .listing-tile').length > 0);
  } else {
    const resetPolicy = await reset.evaluate(element => ({
      display: getComputedStyle(element).display,
      visible: Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length)
    }));
    assert(resetPolicy.display === 'none' && resetPolicy.visible === false,
      `${name}: accepted mobile Reset policy was not explicitly hidden.`);

    // Restore the same filter/search state using only controls exposed by the
    // accepted mobile composition rather than forcing a click on hidden UI.
    await items.click();
    await search.fill('');
    await all.click();
    await page.waitForFunction(() => document.querySelectorAll('#dripfeed-root .live-wall .listing-tile').length > 0);
  }

  const state = await page.evaluate(() => ({
    query: document.querySelector('#dripfeed-root #feed-search')?.value || '',
    category: document.querySelector('#dripfeed-root .filter-chip.active')?.dataset.category || ''
  }));
  assert(state.query === '', `${name}: control round trip did not clear search.`);
  assert(state.category === 'all', `${name}: control round trip did not restore the all-category filter.`);
}

async function runViewport(browser, name, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await waitForDripfeed(page);
  const initial = await captureComposition(page);
  const planes = assertComposition(name, viewport, initial);
  await exerciseControls(page, name, viewport);
  const transmitInitial = await openAndCloseTransmit(page, name, 'initial publication');
  await page.screenshot({ path: path.join(artifactDir, `${name}-initial.png`), fullPage: false });

  const scrollResult = await page.evaluate(() => {
    const stage = window.NCNDripfeed.getSpatialSurfaces().depthHost;
    const first = stage.querySelector('.live-wall .listing-tile');
    const before = first?.getBoundingClientRect().top ?? 0;
    const maximum = Math.max(0, stage.scrollHeight - stage.clientHeight);
    stage.scrollTop = Math.min(maximum, Math.max(120, maximum * 0.35));
    stage.dispatchEvent(new Event('scroll', { bubbles: true }));
    const after = first?.getBoundingClientRect().top ?? 0;
    return { before, after, scrollTop: stage.scrollTop, maximum };
  });
  if (scrollResult.maximum > 1) {
    assert(scrollResult.scrollTop > 0, `${name}: aperture did not accept native scroll.`);
    assert(scrollResult.after < scrollResult.before, `${name}: wall did not move through the fixed aperture.`);
  }

  await page.evaluate(() => { window.NCNDripfeed.getSpatialSurfaces().depthHost.scrollTop = 0; });
  await page.locator('#dripfeed-root .live-wall .listing-tile').first().click();
  await page.waitForFunction(() => window.NCNDripfeedChamber.snapshot().readingState === 'ready');

  const reading = await page.evaluate(() => {
    const surfaces = window.NCNDripfeed.getSpatialSurfaces();
    const target = document.querySelector('#dripfeed-root [data-reader-target]');
    const overlay = target?.closest('.reader-overlay');
    const card = target?.querySelector('.reader-card');
    const actions = card?.querySelector('.reader-actions');
    const close = target?.querySelector('.icon-close');
    const rail = document.querySelector('.rail');
    const reader = surfaces.reading;
    const transform = getComputedStyle(target).transform;
    const matrix = transform && transform !== 'none' ? new DOMMatrixReadOnly(transform) : null;
    const rect = element => {
      const box = element?.getBoundingClientRect?.();
      return box ? {
        left: box.left, top: box.top, right: box.right, bottom: box.bottom,
        width: box.width, height: box.height
      } : null;
    };
    return {
      connected: Boolean(reader?.isConnected),
      surface: reader?.dataset.spatialSurface || null,
      targetTransform: transform,
      targetScale: matrix?.a || 1,
      fit: target?.dataset.chamberReaderFit || null,
      layoutWidth: parseFloat(target?.dataset.chamberReaderLayoutWidth || '0'),
      layoutMaxHeight: parseFloat(target?.dataset.chamberReaderMaxHeight || '0'),
      target: rect(target),
      card: rect(card),
      actions: rect(actions),
      overlay: rect(overlay),
      close: rect(close),
      rail: rect(rail),
      viewport: { width: innerWidth, height: innerHeight },
      cardFit: card?.dataset.chamberReaderFit || null,
      cardMaxHeight: parseFloat(card?.dataset.chamberReaderMaxHeight || '0'),
      clientHeight: card?.clientHeight || 0,
      scrollHeight: card?.scrollHeight || 0
    };
  });
  assert(reading.connected, `${name}: ready publication has no connected reader.`);
  assert(reading.surface === 'reading', `${name}: reader is not published through the spatial contract.`);
  assert(reading.targetTransform !== 'none', `${name}: reader plane has no rendered camera transform.`);
  assert(reading.targetScale > 1, `${name}: reader did not resolve forward of the chamber grid.`);
  assert(near(reading.targetScale, planes.reader.scale, 0.04), `${name}: reader transform does not match camera projection.`);
  assert(reading.fit === 'contained', `${name}: reader layout was not inversely fitted before scaling.`);
  assert(reading.layoutWidth > 0 && reading.layoutMaxHeight > 0,
    `${name}: reader fit did not publish positive layout limits.`);
  assert(reading.target.left >= reading.overlay.left - 1 && reading.target.right <= reading.overlay.right + 1,
    `${name}: scaled reader escapes the overlay horizontally (${reading.target.left}..${reading.target.right} vs ${reading.overlay.left}..${reading.overlay.right}).`);
  assert(reading.target.top >= reading.overlay.top - 1 && reading.target.bottom <= reading.overlay.bottom + 1,
    `${name}: scaled reader target escapes the overlay vertically (${reading.target.top}..${reading.target.bottom} vs ${reading.overlay.top}..${reading.overlay.bottom}).`);
  assert(reading.cardFit === 'contained' && reading.cardMaxHeight > 0,
    `${name}: scrolling reader card did not receive the inverse height cap.`);
  assert(reading.card.left >= reading.overlay.left - 1 && reading.card.right <= reading.overlay.right + 1,
    `${name}: scaled reader card escapes the overlay horizontally.`);
  assert(reading.card.top >= reading.overlay.top - 1 && reading.card.bottom <= reading.overlay.bottom + 1,
    `${name}: scaled reader card escapes the overlay vertically (${reading.card.top}..${reading.card.bottom} vs ${reading.overlay.top}..${reading.overlay.bottom}).`);
  assert(reading.actions && reading.actions.bottom <= reading.card.bottom + 1 && reading.actions.bottom <= reading.viewport.height + 1,
    `${name}: reader action row remains below the reachable scrolling card.`);
  assert(Math.abs((reading.target.left + reading.target.right) - (reading.overlay.left + reading.overlay.right)) <= 2,
    `${name}: scaled reader is not centred in the overlay.`);
  assert(reading.close.left >= 0 && reading.close.right <= reading.viewport.width + 1,
    `${name}: reader close control is clipped horizontally.`);
  assert(reading.close.top >= reading.rail.bottom - 1 && reading.close.bottom <= reading.viewport.height + 1,
    `${name}: reader close control is hidden by the rail or viewport.`);
  await page.screenshot({ path: path.join(artifactDir, `${name}-reader-open.png`), fullPage: false });

  await page.getByRole('button', { name: 'RETURN LIVE' }).click();
  await page.waitForFunction(() => window.NCNDripfeedChamber.snapshot().readingState === 'idle');
  const releasedReader = await page.evaluate(() => {
    const target = document.querySelector('#dripfeed-root [data-reader-target]');
    return {
      width: target?.style.getPropertyValue('width') || '',
      maxHeight: target?.style.getPropertyValue('max-height') || '',
      transformOrigin: target?.style.getPropertyValue('transform-origin') || '',
      alignSelf: target?.style.getPropertyValue('align-self') || '',
      fit: target?.dataset.chamberReaderFit || null,
      layoutWidth: target?.dataset.chamberReaderLayoutWidth || null,
      layoutMaxHeight: target?.dataset.chamberReaderMaxHeight || null
    };
  });
  assert(Object.values(releasedReader).every(value => value === '' || value === null),
    `${name}: reader target retained stale Integration fitting after close: ${JSON.stringify(releasedReader)}`);
  await page.evaluate(() => window.NCNDripfeed.repack());
  await page.waitForFunction(() => window.NCNDripfeed.getSpatialSurfaces().latent?.querySelectorAll('.listing-tile').length > 0);

  const latentProof = await page.evaluate(() => {
    const surfaces = window.NCNDripfeed.getSpatialSurfaces();
    const transform = getComputedStyle(surfaces.latent).transform;
    const matrix = transform && transform !== 'none' ? new DOMMatrixReadOnly(transform) : null;
    const box = surfaces.latent.getBoundingClientRect();
    return {
      liveCount: surfaces.live.querySelectorAll('.listing-tile').length,
      latentCount: surfaces.latent.querySelectorAll('.listing-tile').length,
      latentScale: matrix?.a || 1,
      display: getComputedStyle(surfaces.latent).display,
      width: box.width,
      height: box.height
    };
  });
  assert(latentProof.latentCount > 0, `${name}: programmatic repack did not create a real latent member.`);
  assert(latentProof.width > 0 && latentProof.height > 0, `${name}: latent publication has no rendered rectangle.`);
  assert(latentProof.display === 'grid', `${name}: latent publication is not mounted as a grid.`);
  assert(latentProof.latentScale < initial.liveTransform.scaleX, `${name}: latent publication is not rendered behind live.`);

  const transmitAfterRoundTrip = await openAndCloseTransmit(page, name, 'reader and repack round trip');
  await page.screenshot({ path: path.join(artifactDir, `${name}-latent.png`), fullPage: false });

  await page.evaluate(() => window.NCNApplications.switchTo('redwire', { animate: false }));
  await page.waitForFunction(() => window.NCNApplications.current() === 'redwire');
  const redwire = await page.evaluate(() => ({
    state: window.NCNDripfeedChamber.snapshot(),
    occluderHidden: document.querySelector('#dripfeed-chamber-occluder')?.hidden ?? true,
    ownedScenes: window.NCNScene.snapshot().filter(item => item.owner === window.NCNDripfeedChamber.OWNER),
    adapter: window.NCNDripfeed.snapshot()
  }));
  assert(redwire.state.active === false, `${name}: bridge remained active in RedWire.`);
  assert(redwire.state.rootEventsBound === false, `${name}: hidden publication listeners remained bound.`);
  assert(redwire.occluderHidden, `${name}: occluder remained visible in RedWire.`);
  assert(redwire.ownedScenes.length === 0, `${name}: Dripfeed scene ownership remained after switching.`);
  assert(redwire.adapter.geometryOwner === null, `${name}: public geometry ownership was not released.`);

  await page.evaluate(() => window.NCNApplications.switchTo('dripfeed', { animate: false }));
  await page.waitForFunction(() => window.NCNDripfeedChamber.snapshot().active === true);
  const returned = await page.evaluate(() => ({
    state: window.NCNDripfeedChamber.snapshot(),
    adapter: window.NCNDripfeed.snapshot(),
    weather: window.NCNIntegration?.getService?.('weather')?.snapshot?.() || null
  }));
  assert(returned.state.integrated, `${name}: chamber integration did not renew after return.`);
  assert(returned.adapter.depth?.dormant === true, `${name}: interim depth adapter resumed after return.`);
  if (returned.weather) {
    const desired = returned.weather.desired || returned.weather;
    assert(desired.enabled === false, `${name}: Weather remained enabled in Dripfeed.`);
  }

  await fs.writeFile(
    path.join(artifactDir, `${name}.json`),
    JSON.stringify({ initial, transmitInitial, scrollResult, reading, latentProof, transmitAfterRoundTrip, redwire, returned, errors }, null, 2)
  );
  assert(errors.length === 0, `${name}: browser errors: ${errors.join(' | ')}`);
  await context.close();
}

async function runResponsiveTransition(browser) {
  const context = await browser.newContext({ viewport: { width: 520, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await waitForDripfeed(page);
  await page.evaluate(() => {
    window.__dripfeedResponsiveEvents = [];
    document.querySelector('#dripfeed-root').addEventListener('dripfeed:responsive-columns-change', event => {
      window.__dripfeedResponsiveEvents.push(event.detail);
    });
  });

  const before = await page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    columns: Number(getComputedStyle(document.querySelector('#dripfeed-root')).getPropertyValue('--cols')),
    adapter: window.NCNDripfeed.snapshot()
  }));
  assert(before.columns === 3, `responsive transition: expected three columns at 520px, got ${before.columns}.`);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => {
    const root = document.querySelector('#dripfeed-root');
    const surfaces = window.NCNDripfeed.getSpatialSurfaces();
    const columns = Number(getComputedStyle(root).getPropertyValue('--cols'));
    const adapterColumns = window.NCNDripfeed.snapshot().responsiveColumns?.effective;
    const filter = root.querySelector('.filter-chips');
    return columns === 2
      && adapterColumns === 2
      && surfaces.depthHost.scrollWidth <= surfaces.depthHost.clientWidth + 1
      && filter.scrollWidth <= filter.clientWidth + 1;
  });

  const after = await captureComposition(page);
  assert(after.viewport.width === 390, `responsive transition: resize did not reach 390px (got ${after.viewport.width}).`);
  assert(after.columns === 2, 'responsive transition: computed column count did not become two.');
  assert(after.adapter.responsiveColumns?.effective === 2,
    'responsive transition: Dripfeed column owner did not publish two columns.');
  assert(after.scroll.width <= after.scroll.clientWidth + 1,
    'responsive transition: implicit horizontal overflow remained after replan.');
  assert(after.tiles.every(item => item.insideWall),
    'responsive transition: a tile remains clipped outside the two-column wall.');
  assertFilterPresentation('responsive transition', '390px', after.filterLabels, after.filterTextTransforms, after.filterOverflow);

  const events = await page.evaluate(() => window.__dripfeedResponsiveEvents);
  assert(events.some(event => event.previous === 3 && event.columns === 2 && event.rendered === true),
    'responsive transition: no rendered three-to-two column event was published.');

  await openAndCloseTransmit(page, 'responsive transition', '390px resize');
  await page.screenshot({ path: path.join(artifactDir, 'responsive-transition.png'), fullPage: false });
  await fs.writeFile(
    path.join(artifactDir, 'responsive-transition.json'),
    JSON.stringify({ before, after, events, errors }, null, 2)
  );
  assert(errors.length === 0, `responsive transition: browser errors: ${errors.join(' | ')}`);
  await context.close();
}

await fs.mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  await runViewport(browser, 'desktop', { width: 1440, height: 900 });
  await runViewport(browser, 'mobile', { width: 390, height: 844 });
  await runResponsiveTransition(browser);
  console.log('Dripfeed chamber proof passed: compact semantic labels, uppercase presentation, controls, planes and responsive replan retained.');
} finally {
  await browser.close();
}
