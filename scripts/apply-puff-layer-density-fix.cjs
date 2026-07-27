const fs = require("node:fs");

function replace(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  if (!source.includes(before)) throw new Error(`${path}: replacement source not found`);
  fs.writeFileSync(path, source.replace(before, after));
}

replace(
  "departments/weather/weather-presets.js",
  "      bankMultiplier: 1.18\n    }),",
  "      bankMultiplier: 1.45\n    }),"
);

replace(
  "departments/weather/weather-module.js",
`      sortedBanks.forEach(bank => {
        const pass = mistLayer(bank.z);
        const layerRect = scene.rects.get(pass);
        const floorY = -scene.bounds.halfHeight;`,
`      sortedBanks.forEach(bank => {
        const floorY = -scene.bounds.halfHeight;`
);

replace(
  "departments/weather/weather-module.js",
`          const z = clamp(
            bank.z + Math.sin(bank.phase2 + index * 2.1) * bankDepth * 0.28,
            scene.bounds.near + 0.05,
            scene.bounds.far - 0.05
          );
          const chamberClip = normaliseRect(scene.camera?.apertureAt?.(z, scene.bounds.halfWidth))`,
`          const z = clamp(
            bank.z + Math.sin(bank.phase2 + index * 2.1) * bankDepth * 0.28,
            scene.bounds.near + 0.05,
            scene.bounds.far - 0.05
          );
          const pass = mistLayer(z);
          const layerRect = scene.rects.get(pass);
          const chamberClip = normaliseRect(scene.camera?.apertureAt?.(z, scene.bounds.halfWidth))`
);

replace(
  "departments/weather/tests/weather-module.node.test.js",
  "  assert.equal(approved.particles.mist, 64, 'ordinary mist must use a dense field of smaller banks at normal quality');",
  "  assert.equal(approved.particles.mist, 85, 'ordinary mist must use a dense field of smaller banks at normal quality');"
);

replace(
  "departments/weather/tests/weather-mist-visual-contract.test.js",
  "  'scene.camera?.apertureAt?.(z, scene.bounds.halfWidth)',",
  "  'const pass = mistLayer(z)',\n  'scene.camera?.apertureAt?.(z, scene.bounds.halfWidth)',"
);

console.log("Assigned Weather layers per exact puff depth and increased ordinary mist density.");
