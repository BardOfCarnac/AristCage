import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const artifactRoot = path.join(root, "artifacts", "optical-card-backing");
const projection = fs.readFileSync(path.join(root, "css", "optical-projection.css"), "utf8");
const profile = fs.readFileSync(path.join(root, "css", "optical-three-plane-profile.css"), "utf8");
const backdrop = Object.freeze([22, 96, 174]);
const edgeOpacity = 0.35;
const expectedEdge = Object.freeze(backdrop.map(channel => Math.round(channel * (1 - edgeOpacity))));

fs.mkdirSync(artifactRoot, { recursive: true });

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function decodePng(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(buffer.subarray(0, 8).equals(signature), "Rendered proof is not a PNG.");

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colourType = 0;
  let interlace = 0;
  const idat = [];

  for (let offset = 8; offset < buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colourType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  assert.equal(bitDepth, 8, "Rendered proof must use eight-bit PNG channels.");
  assert.ok(colourType === 2 || colourType === 6, `Unsupported PNG colour type: ${colourType}`);
  assert.equal(interlace, 0, "Rendered proof must be a non-interlaced PNG.");

  const channels = colourType === 6 ? 4 : 3;
  const stride = width * channels;
  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(height * stride);
  let sourceOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const source = inflated.subarray(sourceOffset, sourceOffset + stride);
    sourceOffset += stride;
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    const previous = y === 0 ? null : pixels.subarray((y - 1) * stride, y * stride);

    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const above = previous ? previous[x] : 0;
      const upperLeft = previous && x >= channels ? previous[x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) predictor = paeth(left, above, upperLeft);
      else assert.equal(filter, 0, `Unsupported PNG filter: ${filter}`);
      row[x] = (source[x] + predictor) & 0xff;
    }
  }

  return {
    width,
    height,
    pixel(x, y) {
      const px = Math.max(0, Math.min(width - 1, Math.round(x)));
      const py = Math.max(0, Math.min(height - 1, Math.round(y)));
      const offset = (py * width + px) * channels;
      return [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
    }
  };
}

function sampleCard(image, rect) {
  const inset = 1;
  const left = rect.x;
  const top = rect.y;
  const right = left + rect.width - 1;
  const bottom = top + rect.height - 1;
  const centreX = left + rect.width / 2;
  const centreY = top + rect.height / 2;
  return Object.freeze({
    centre: image.pixel(centreX, centreY),
    left: image.pixel(left + inset, centreY),
    right: image.pixel(right - inset, centreY),
    top: image.pixel(centreX, top + inset),
    bottom: image.pixel(centreX, bottom - inset),
    topLeft: image.pixel(left + inset, top + inset),
    topRight: image.pixel(right - inset, top + inset),
    bottomLeft: image.pixel(left + inset, bottom - inset),
    bottomRight: image.pixel(right - inset, bottom - inset)
  });
}

function maximumDifference(actual, expected) {
  return Math.max(...actual.map((channel, index) => Math.abs(channel - expected[index])));
}

function assertCard(name, samples) {
  assert.ok(Math.max(...samples.centre) <= 12,
    `${name}: centre must remain nearly black, got ${samples.centre.join(",")}.`);

  for (const [point, colour] of Object.entries(samples)) {
    if (point === "centre") continue;
    assert.ok(maximumDifference(colour, expectedEdge) <= 16,
      `${name}: ${point} must retain roughly 35% black at the perimeter, got ${colour.join(",")}.`);
    assert.ok(maximumDifference(colour, backdrop) >= 30,
      `${name}: ${point} must not become fully transparent.`);
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html>
    <html class="optical-mode">
      <head><meta charset="utf-8"><style>
        html, body { margin: 0; background: rgb(${backdrop.join(",")}); }
        body { padding: 30px; display: grid; gap: 30px; }
        .sample-card { position: relative; }
        .sample-card.compact { width: 360px; height: 140px; }
        .sample-card.expanded { width: 520px; height: 280px; }
        .sample-card > .optical-semantic-item { left: 0; top: 0; width: 100%; height: 100%; }
        ${projection}
        ${profile}
      </style></head>
      <body>
        <div id="compact" class="sample-card compact">
          <div class="optical-semantic-item" data-optical-role="plate">
            <div class="optical-plate-surface"></div>
          </div>
        </div>
        <div id="expanded" class="sample-card expanded">
          <div class="optical-semantic-item" data-optical-role="plate">
            <div class="optical-plate-surface"></div>
          </div>
        </div>
      </body>
    </html>`);

  const rectangles = {
    compact: await page.locator("#compact .optical-plate-surface").boundingBox(),
    expanded: await page.locator("#expanded .optical-plate-surface").boundingBox()
  };
  assert.ok(rectangles.compact && rectangles.expanded, "Both mounted card backings must render.");
  assert.ok(rectangles.compact.width < 360 && rectangles.expanded.width < 520,
    "Proof must sample the transformed Optical plate rather than the unscaled host card.");

  const screenshotPath = path.join(artifactRoot, "mounted-perimeter.png");
  const screenshot = await page.screenshot({ path: screenshotPath, fullPage: true });
  const image = decodePng(screenshot);
  const samples = {
    compact: sampleCard(image, rectangles.compact),
    expanded: sampleCard(image, rectangles.expanded)
  };

  assertCard("compact card", samples.compact);
  assertCard("expanded card", samples.expanded);
  fs.writeFileSync(
    path.join(artifactRoot, "mounted-perimeter.json"),
    JSON.stringify({ backdrop, edgeOpacity, expectedEdge, rectangles, samples }, null, 2)
  );
  console.log("Mounted compact and expanded Optical backings retain black centres and finish at roughly 65% transparency.");
} finally {
  await browser.close();
}
