from pathlib import Path
import os
import subprocess


def replace_once(path, old, new):
    source = Path(path).read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one replacement, found {count}')
    Path(path).write_text(source.replace(old, new, 1))


replace_once('js/dripfeed-chamber-integration.js', """  function readerTarget(publication = readyPublication) {
    return publication?.readingSurface?.closest?.('[data-reader-target]') || null;
  }

  function releaseReaderPlacement(publication = readyPublication) {
    const target = readerTarget(publication);
    if (!target?.style) return false;
    target.style.removeProperty?.('width');
    target.style.removeProperty?.('max-height');
    target.style.removeProperty?.('transform-origin');
    target.style.removeProperty?.('align-self');
    delete target.dataset.chamberReaderFit;
    delete target.dataset.chamberReaderLayoutWidth;
    delete target.dataset.chamberReaderMaxHeight;
    return true;
  }
""", """  function readerTarget(publication = readyPublication) {
    return publication?.readerTarget
      || publication?.readingSurface?.closest?.('[data-reader-target]')
      || null;
  }

  function readerCard(publication = readyPublication) {
    return publication?.readerCard
      || (publication?.readingSurface?.matches?.('.reader-card') ? publication.readingSurface : null)
      || readerTarget(publication)?.querySelector?.('.reader-card')
      || null;
  }

  function releaseReaderPlacement(publication = readyPublication) {
    const target = readerTarget(publication);
    const card = readerCard(publication);
    let released = false;
    if (target?.style) {
      target.style.removeProperty?.('width');
      target.style.removeProperty?.('max-height');
      target.style.removeProperty?.('transform-origin');
      target.style.removeProperty?.('align-self');
      delete target.dataset.chamberReaderFit;
      delete target.dataset.chamberReaderLayoutWidth;
      delete target.dataset.chamberReaderMaxHeight;
      released = true;
    }
    if (card?.style) {
      card.style.removeProperty?.('max-height');
      delete card.dataset.chamberReaderFit;
      delete card.dataset.chamberReaderMaxHeight;
      released = true;
    }
    return released;
  }
""")

replace_once('js/dripfeed-chamber-integration.js', """  function fitReaderPlacement(publication, scale) {
    const target = readerTarget(publication);
    const overlay = target?.closest?.('.reader-overlay') || target?.parentElement || null;
    if (!target?.style || !overlay) return false;
""", """  function fitReaderPlacement(publication, scale) {
    const target = readerTarget(publication);
    const card = readerCard(publication);
    const overlay = target?.closest?.('.reader-overlay') || target?.parentElement || null;
    if (!target?.style || !card?.style || !overlay) return false;
""")

replace_once('js/dripfeed-chamber-integration.js', """    target.style.setProperty('width', `${layoutWidth}px`);
    target.style.setProperty('max-height', `${layoutMaxHeight}px`);
    target.style.setProperty('transform-origin', '50% 0');
    target.style.setProperty('align-self', 'start');
    target.dataset.chamberReaderFit = 'contained';
    target.dataset.chamberReaderLayoutWidth = layoutWidth.toFixed(3);
    target.dataset.chamberReaderMaxHeight = layoutMaxHeight.toFixed(3);
    return true;
""", """    target.style.setProperty('width', `${layoutWidth}px`);
    target.style.setProperty('transform-origin', '50% 0');
    target.style.setProperty('align-self', 'start');
    card.style.setProperty('max-height', `${layoutMaxHeight}px`);
    target.dataset.chamberReaderFit = 'contained';
    target.dataset.chamberReaderLayoutWidth = layoutWidth.toFixed(3);
    target.dataset.chamberReaderMaxHeight = layoutMaxHeight.toFixed(3);
    card.dataset.chamberReaderFit = 'contained';
    card.dataset.chamberReaderMaxHeight = layoutMaxHeight.toFixed(3);
    return true;
""")

replace_once('js/dripfeed-chamber-integration.js', """        pendingOpen = null;
        readyPublication = Object.freeze({
          token: detail.token,
          postId: detail.postId,
          readingSurface: detail.readingSurface
        });
""", """        pendingOpen = null;
        const target = detail.readingSurface.closest?.('[data-reader-target]') || null;
        const card = detail.readingSurface.matches?.('.reader-card')
          ? detail.readingSurface
          : target?.querySelector?.('.reader-card') || null;
        if (!target || !card) break;
        readyPublication = Object.freeze({
          token: detail.token,
          postId: detail.postId,
          readingSurface: detail.readingSurface,
          readerTarget: target,
          readerCard: card
        });
""")

replace_once('tests/dripfeed-chamber-integration.mjs', """    const overlay = target?.closest('.reader-overlay');
    const close = target?.querySelector('.icon-close');
    const rail = document.querySelector('.rail');
""", """    const overlay = target?.closest('.reader-overlay');
    const card = target?.querySelector('.reader-card');
    const actions = card?.querySelector('.reader-actions');
    const close = target?.querySelector('.icon-close');
    const rail = document.querySelector('.rail');
""")

replace_once('tests/dripfeed-chamber-integration.mjs', """      target: rect(target),
      overlay: rect(overlay),
      close: rect(close),
      rail: rect(rail),
      viewport: { width: innerWidth, height: innerHeight },
      clientHeight: target?.clientHeight || 0,
      scrollHeight: target?.scrollHeight || 0
""", """      target: rect(target),
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
""")

replace_once('tests/dripfeed-chamber-integration.mjs', """  assert(reading.target.top >= reading.overlay.top - 1 && reading.target.bottom <= reading.overlay.bottom + 1,
    `${name}: scaled reader escapes the overlay vertically (${reading.target.top}..${reading.target.bottom} vs ${reading.overlay.top}..${reading.overlay.bottom}).`);
  assert(Math.abs((reading.target.left + reading.target.right) - (reading.overlay.left + reading.overlay.right)) <= 2,
    `${name}: scaled reader is not centred in the overlay.`);
  assert(reading.close.left >= 0 && reading.close.right <= reading.viewport.width + 1,
""", """  assert(reading.target.top >= reading.overlay.top - 1 && reading.target.bottom <= reading.overlay.bottom + 1,
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
""")

replace_once('tests/dripfeed-chamber-integration.mjs', """  await page.getByRole('button', { name: 'RETURN LIVE' }).click();
  await page.waitForFunction(() => window.NCNDripfeedChamber.snapshot().readingState === 'idle');
  await page.evaluate(() => window.NCNDripfeed.repack());
""", """  await page.getByRole('button', { name: 'RETURN LIVE' }).click();
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
""")

replace_once('tests/dripfeed-fixed-band-contract.test.js', """  'fitReaderPlacement',
  'releaseReaderPlacement',
  "target.style.setProperty('width'",
  "target.style.setProperty('max-height'",
  "target.style.setProperty('transform-origin', '50% 0')",
""", """  'fitReaderPlacement',
  'releaseReaderPlacement',
  'publication?.readerTarget',
  'publication?.readerCard',
  "target.style.setProperty('width'",
  "card.style.setProperty('max-height'",
  "target.style.setProperty('transform-origin', '50% 0')",
""")

replace_once('docs/DRIPFEED-CHAMBER-INTEGRATION.md', """- before applying the camera-derived foreground scale, Integration inversely fits the reader's layout width and maximum height to the overlay content box;
- resize and camera changes recalculate that fit, while close, application exit and destruction release the inline placement.

This preserves the foreground plane and larger content treatment without allowing the transformed card, close control or action row to leave the rail-safe viewport. The desktop and mobile browser proof opens a real transmission, checks the published camera scale, and rejects any reader or close-control edge outside the overlay.
""", """- before applying the camera-derived foreground scale, Integration inversely fits the target width and applies the inverse maximum height to the actual scrolling `.reader-card`;
- the ready publication retains direct target/card references so cleanup still succeeds after the card is detached from the target;
- resize and camera changes recalculate that fit, while close, application exit and destruction release both target and card placement.

This preserves the foreground plane and larger content treatment without allowing the transformed card, close control or action row to leave the rail-safe viewport. The desktop and mobile browser proof opens a real transmission, checks the published camera scale, measures the wrapper, scrolling card and action row, and verifies the empty target has no stale fit after close.
""")

subprocess.run(['git', 'config', 'user.name', 'AristCage Integration'], check=True)
subprocess.run(['git', 'config', 'user.email', 'integration@aristcage.invalid'], check=True)
subprocess.run([
    'git', 'add',
    'js/dripfeed-chamber-integration.js',
    'tests/dripfeed-chamber-integration.mjs',
    'tests/dripfeed-fixed-band-contract.test.js',
    'docs/DRIPFEED-CHAMBER-INTEGRATION.md'
], check=True)
subprocess.run(['git', 'commit', '-m', 'Fit and release the actual Dripfeed reader card'], check=True)
subprocess.run(['git', 'push', 'origin', f"HEAD:{os.environ['HEAD_REF']}"], check=True)
