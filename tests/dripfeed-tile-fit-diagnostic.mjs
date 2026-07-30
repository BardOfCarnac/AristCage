import { chromium } from 'playwright';

const baseURL = process.env.NCN_TEST_URL || 'http://127.0.0.1:4173/';
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['mobile', { width: 390, height: 844 }]
  ]) {
    const page = await browser.newPage({ viewport });
    await page.goto(`${baseURL}?app=dripfeed`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.NCNDripfeedChamber?.snapshot?.().active === true);
    await page.waitForSelector('#dripfeed-root .live-wall .listing-tile');
    const result = await page.evaluate(() => {
      const surfaces = window.NCNDripfeed.getSpatialSurfaces();
      const rect = element => {
        const box = element.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom, height: box.height };
      };
      return [...surfaces.live.querySelectorAll('.listing-tile')].map(tile => {
        const visible = element => element && getComputedStyle(element).display !== 'none';
        const headline = tile.querySelector('.tile-copy h2');
        const body = tile.querySelector('.tile-copy p');
        const credit = tile.querySelector('.photo-credit');
        const footer = tile.querySelector('.tile-footer');
        const tileRect = rect(tile);
        const headlineRect = visible(headline) ? rect(headline) : null;
        const bodyRect = visible(body) ? rect(body) : null;
        const creditRect = visible(credit) ? rect(credit) : null;
        const footerRect = visible(footer) ? rect(footer) : null;
        const regions = [headlineRect, bodyRect, creditRect, footerRect].filter(Boolean);
        const clear = regions.every((region, index) => !regions[index + 1] || region.bottom <= regions[index + 1].top + 1);
        return {
          id: tile.dataset.postId,
          shape: tile.dataset.shape,
          tile: tileRect,
          headline: headlineRect,
          body: bodyRect,
          credit: creditRect,
          footer: footerRect,
          clear,
          computed: {
            containerType: getComputedStyle(tile).containerType,
            gridRow: tile.style.gridRow,
            gridColumn: tile.style.gridColumn
          }
        };
      });
    });
    console.log(`DRIPFEED_TILE_FIT_${name.toUpperCase()}=${JSON.stringify(result)}`);
    await page.close();
  }
} finally {
  await browser.close();
}
