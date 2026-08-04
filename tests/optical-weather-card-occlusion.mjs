import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const artifactRoot = path.join(root, "artifacts", "optical-card-backing");
const projection = fs.readFileSync(path.join(root, "css", "optical-projection.css"), "utf8");
const profile = fs.readFileSync(path.join(root, "css", "optical-three-plane-profile.css"), "utf8");
const occlusion = fs.readFileSync(path.join(root, "js", "redwire-weather-card-occlusion.js"), "utf8");
const weatherColour = Object.freeze([22, 96, 174]);

fs.mkdirSync(artifactRoot, { recursive: true });

const cssStops = [...profile.matchAll(/rgba\(0, 0, 0, ([0-9.]+)\) ([0-9]+)%/g)]
  .slice(0, 6)
  .map(match => [Number(match[2]) / 100, Number(match[1])]);
const jsStops = [...occlusion.matchAll(/Object\.freeze\(\[([0-9.]+), ([0-9.]+)\]\)/g)]
  .slice(0, 6)
  .map(match => [Number(match[1]), Number(match[2])]);
assert.deepEqual(jsStops, cssStops,
  "Weather occlusion must use the same six offsets and alpha values as the Optical backing.");
assert.deepEqual(cssStops.at(-1), [1, 0.35],
  "The card and Weather occlusion must finish at 35% opacity, or 65% transparency.");
assert.doesNotMatch(occlusion, /fillStyle\s*=\s*["']rgba\(0,0,0,1\)["']/,
  "Weather occlusion must not restore the former opaque rectangular erase.");
assert.match(occlusion, /createRadialGradient\(0, 0, 0, 0, 0, 0\.5\)/,
  "Weather occlusion must construct the same closest-side ellipse as the card backing.");

function assertWeatherSamples(name, samples) {
  assert.ok(samples.centre <= 20,
    `${name}: Weather must remain substantially erased beneath the near-black reading core, got alpha ${samples.centre}.`);
  assert.ok(samples.shoulder >= 70 && samples.shoulder <= 190,
    `${name}: Weather must return progressively through the alpha shoulder, got alpha ${samples.shoulder}.`);

  for (const [point, alpha] of Object.entries(samples)) {
    if (point === "centre" || point === "shoulder") continue;
    assert.ok(alpha >= 145 && alpha <= 185,
      `${name}: ${point} must retain Weather beneath a 65%-transparent perimeter, got alpha ${alpha}.`);
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html>
    <html class="optical-mode">
      <head><meta charset="utf-8"><style>
        html, body { margin: 0; min-height: 100%; background: rgb(3, 5, 10); }
        body { padding: 30px; display: grid; gap: 30px; }
        canvas.ncn-department-weather-canvas {
          position: fixed;
          inset: 0;
          width: 900px;
          height: 700px;
          z-index: 0;
        }
        .sample-card { position: relative; z-index: 1; }
        .sample-card.compact { width: 360px; height: 140px; }
        .sample-card.expanded { width: 520px; height: 280px; }
        .sample-card > .optical-semantic-item { left: 0; top: 0; width: 100%; height: 100%; }
        ${projection}
        ${profile}
      </style></head>
      <body>
        <canvas class="ncn-department-weather-canvas" width="900" height="700" aria-hidden="true"></canvas>
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

  await page.evaluate(colour => {
    window.NCNApplications = Object.freeze({ current: () => "redwire" });
    window.NCNIntegratedDepartments = Object.freeze({ ready: async () => true });
    window.NCNIntegration = Object.freeze({ getService: () => null });
    const canvas = document.querySelector("canvas.ncn-department-weather-canvas");
    const context = canvas.getContext("2d");
    context.fillStyle = `rgba(${colour.join(",")},1)`;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }, weatherColour);
  await page.addScriptTag({ content: occlusion });

  const proof = await page.evaluate(() => {
    const canvas = document.querySelector("canvas.ncn-department-weather-canvas");
    const context = canvas.getContext("2d");
    const canvasRect = canvas.getBoundingClientRect();
    const rectangles = Object.fromEntries(["compact", "expanded"].map(name => {
      const rect = document.querySelector(`#${name} .optical-plate-surface`).getBoundingClientRect();
      return [name, { x: rect.x, y: rect.y, width: rect.width, height: rect.height }];
    }));

    const erased = window.NCNRedWireWeatherCardOcclusion.apply();
    const alphaAt = (x, y) => {
      const px = Math.max(0, Math.min(canvas.width - 1,
        Math.round((x - canvasRect.left) * canvas.width / canvasRect.width)));
      const py = Math.max(0, Math.min(canvas.height - 1,
        Math.round((y - canvasRect.top) * canvas.height / canvasRect.height)));
      return context.getImageData(px, py, 1, 1).data[3];
    };

    const sample = rect => {
      const inset = 1;
      const left = rect.x;
      const top = rect.y;
      const right = left + rect.width - 1;
      const bottom = top + rect.height - 1;
      const centreX = left + rect.width / 2;
      const centreY = top + rect.height / 2;
      return {
        centre: alphaAt(centreX, centreY),
        shoulder: alphaAt(left + rect.width * 0.10, centreY),
        left: alphaAt(left + inset, centreY),
        right: alphaAt(right - inset, centreY),
        top: alphaAt(centreX, top + inset),
        bottom: alphaAt(centreX, bottom - inset),
        topLeft: alphaAt(left + inset, top + inset),
        topRight: alphaAt(right - inset, top + inset),
        bottomLeft: alphaAt(left + inset, bottom - inset),
        bottomRight: alphaAt(right - inset, bottom - inset)
      };
    };

    return {
      erased,
      rectangles,
      samples: {
        compact: sample(rectangles.compact),
        expanded: sample(rectangles.expanded)
      },
      snapshot: window.NCNRedWireWeatherCardOcclusion.snapshot()
    };
  });

  assert.equal(proof.erased, 2, "One Weather canvas must receive one alpha-shaped erase for each visible plate.");
  assertWeatherSamples("compact card", proof.samples.compact);
  assertWeatherSamples("expanded card", proof.samples.expanded);
  assert.equal(proof.snapshot.lastPlateCount, 2);
  assert.equal(proof.snapshot.lastCanvasCount, 1);

  await page.screenshot({
    path: path.join(artifactRoot, "weather-through-translucent-rim.png"),
    fullPage: true
  });
  fs.writeFileSync(
    path.join(artifactRoot, "weather-through-translucent-rim.json"),
    JSON.stringify({ weatherColour, ...proof }, null, 2)
  );
  console.log("Weather remains visible beneath every 65%-transparent card edge while the reading core retains matched alpha occlusion.");
} finally {
  await browser.close();
}
