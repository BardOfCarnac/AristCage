const fs = require('node:fs');

function replace(path, before, after) {
  const source = fs.readFileSync(path, 'utf8');
  if (!source.includes(before)) throw new Error(`${path}: source block not found`);
  fs.writeFileSync(path, source.replace(before, after));
}

replace('departments/weather/tests/weather-module.node.test.js',
`  assert.ok(weather.getDepthFrame().puffCount > depthFrame?.puffCount || heavy.particles.mist > 36,
    'heavy mist must publish a denser exact-depth field');`,
`  const heavyDepthFrame = weather.getDepthFrame();
  assert.ok(heavyDepthFrame.puffCount >= heavy.particles.mist * 3,
    'heavy mist must publish an exact-depth puff field for every active bank');`);

replace('tests/article-mist-descent.browser.js',
`  assert.ok(coverage.ratio >= 0.03,
    \`${name}: heavy mist covered only \${(coverage.ratio * 100).toFixed(2)}% of the descending article sample\`);

  await page.screenshot({
    path: path.join(artifactDir, \`${name}-mid-descent.png\`),
    fullPage: false
  });`,
`  fs.writeFileSync(
    path.join(artifactDir, \`${name}-coverage.json\`),
    JSON.stringify({ start, middle, coverage }, null, 2)
  );
  await page.screenshot({
    path: path.join(artifactDir, \`${name}-mid-descent.png\`),
    fullPage: false
  });
  assert.ok(coverage.ratio >= 0.03,
    \`${name}: heavy mist covered only \${(coverage.ratio * 100).toFixed(2)}% of the descending article sample\`);`);

console.log('Corrected heavy mist deterministic and rendered proof ordering.');
