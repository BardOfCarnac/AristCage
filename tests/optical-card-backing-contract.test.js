const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const profile = fs.readFileSync(path.join(root, "css", "optical-three-plane-profile.css"), "utf8");
const entries = fs.readFileSync(path.join(root, "css", "entries.css"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

function declarationBlock(source, selector) {
  const selectorIndex = source.indexOf(selector);
  assert.notEqual(selectorIndex, -1, `Missing selector: ${selector}`);
  const openingBrace = source.indexOf("{", selectorIndex);
  assert.notEqual(openingBrace, -1, `Missing declaration block for: ${selector}`);

  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(openingBrace + 1, index);
  }

  throw new Error(`Unclosed declaration block for: ${selector}`);
}

const plateSelector = ".optical-mode .optical-semantic-item[data-optical-role=\"plate\"] .optical-plate-surface";
const frameSelector = ".optical-mode .optical-semantic-item[data-optical-role=\"frame\"] .frame";
const plate = declarationBlock(profile, plateSelector);
const frame = declarationBlock(profile, frameSelector);

assert.match(
  plate,
  /radial-gradient\(\s*ellipse\s+closest-side\s+at\s+50%\s+50%\s*,/,
  "Article backing geometry must terminate on the actual card sides."
);
assert.match(plate, /rgba\(0, 0, 0, \.96\) 48%/, "Article backing must retain a stable near-black reading core.");
assert.match(plate, /rgba\(0, 0, 0, 0\) 100%/, "Article backing must reach full transparency at the real perimeter.");
assert.doesNotMatch(plate, /radial-gradient\(\s*[0-9.]+%\s+[0-9.]+%/, "Oversized radial geometry must not move the fade beyond the card.");
assert.match(plate, /box-shadow:\s*none/, "Article backing must not use a shadow blur.");
assert.match(plate, /filter:\s*none/, "Article backing must not use a filter blur.");
assert.doesNotMatch(plate, /blur\(/, "Article backing must remain an alpha-only fade.");

const rimWidth = Number(frame.match(/border:\s*([0-9.]+)px\s+solid/)?.[1]);
assert.equal(rimWidth, 1, "The red article rim must remain a crisp one-pixel stroke.");
assert.match(frame, /rgba\(255, 70, 40, \.42\)/, "The article rim must retain its restrained red colour.");
assert.match(frame, /box-shadow:\s*none/, "The red article rim must not become a blurred glow.");

const cornerSelectors = [".corner-tl", ".corner-tr", ".corner-bl", ".corner-br"];
const cornerWidths = cornerSelectors.flatMap(selector => {
  const block = declarationBlock(entries, selector);
  const widths = [...block.matchAll(/border-(?:top|right|bottom|left):\s*([0-9.]+)px\s+solid/g)]
    .map(match => Number(match[1]));
  assert.equal(widths.length, 2, `${selector} must retain exactly two directional strokes.`);
  return widths;
});
assert.ok(cornerWidths.every(width => width === 2), "The four corner brackets must remain two pixels wide.");
assert.ok(rimWidth < Math.min(...cornerWidths), "The red rim must stay thinner than the corner brackets.");

const projectionIndex = html.indexOf("css/optical-projection.css");
const profileIndex = html.indexOf("css/optical-three-plane-profile.css");
assert.ok(projectionIndex >= 0 && profileIndex > projectionIndex,
  "The three-plane profile must load after the base Optical projection styles.");

console.log("Optical backing geometry reaches the real perimeter, with a 1px rim beneath four 2px corner brackets.");
