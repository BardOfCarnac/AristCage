const fs = require("node:fs");

const path = "scripts/apply-mist-density-boundary.cjs";
let source = fs.readFileSync(path, "utf8");

const oldVisualBlock = `replace("departments/weather/tests/weather-mist-visual-contract.test.js",
\`  'const z = bank.z + Math.sin(bank.phase2 + index * 2.1) * bank.depth * 0.28',
  'puffs.sort((a, b) => b.z - a.z)',\`,
\`  'scene.camera?.apertureAt?.(z, scene.bounds.halfWidth)',
  'shiftedClipRect(puff.chamberClip',
  'chamberClipped: true',
  'puffs.sort((a, b) => b.z - a.z)',\`);`;

const newVisualBlock = `replace("departments/weather/tests/weather-mist-visual-contract.test.js",
\`  'const z = bank.z + Math.sin(bank.phase2 + index * 2.1) * bankDepth * 0.28',
  'const verticalRange = scene.bounds.halfHeight * 1.72 * settings.verticalFill',
  'height: APPROVED_MIST.height * mix(1, 3.6, verticalFill)',
  'puffs.sort((a, b) => b.z - a.z)',\`,
\`  'scene.camera?.apertureAt?.(z, scene.bounds.halfWidth)',
  'shiftedClipRect(puff.chamberClip',
  'chamberClipped: true',
  'const verticalRange = scene.bounds.halfHeight * 1.72 * settings.verticalFill',
  'height: APPROVED_MIST.height * mix(1, 3.6, verticalFill)',
  'puffs.sort((a, b) => b.z - a.z)',\`);`;

if (!source.includes(oldVisualBlock)) throw new Error("Main patcher visual-contract block was not found.");
source = source.replace(oldVisualBlock, newVisualBlock);

const workflowAnchor = `replace(".github/workflows/article-mist-descent.yml",`;
const heavyContract = `replace("departments/weather/tests/weather-mist-visual-contract.test.js",
\`  'verticalFill: 0.82',
  'bankScale: 1.34',
  'bankMultiplier: 1.55'\`,
\`  'verticalFill: 0.82',
  'bankScale: 1.08',
  'bankMultiplier: 1.85'\`);

`;

if (!source.includes(workflowAnchor)) throw new Error("Main patcher workflow anchor was not found.");
source = source.replace(workflowAnchor, heavyContract + workflowAnchor);

const browserStart = source.indexOf('write("tests/weather-density-boundary.browser.js", `');
const browserEnd = source.indexOf('\n`);\n\nconsole.log("Applied denser mist fields', browserStart);
if (browserStart < 0 || browserEnd < 0) throw new Error("Embedded browser proof block was not found.");
const browserBlock = source.slice(browserStart, browserEnd).replaceAll("${", "\\${");
source = source.slice(0, browserStart) + browserBlock + source.slice(browserEnd);

fs.writeFileSync(path, source);
console.log("Corrected density-boundary patcher for the current visual contract and embedded browser proof.");
