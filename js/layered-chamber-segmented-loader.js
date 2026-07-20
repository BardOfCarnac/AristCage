/* Loads the chamber renderer and upgrades long depth rails into optically attenuated segments. */
(() => {
  const sourceUrl = 'js/layered-chamber.js?v=segmented-depth-1';

  const segmentedFunction = `
  function opticalDepthLine(ctx, x, y, nearZ, farZ, energyLevel, alpha, widthScale = 1) {
    const { cell } = geometry;
    const maxStep = cell;
    let z0 = nearZ;

    while (z0 < farZ - 0.0001) {
      const z1 = Math.min(farZ, z0 + maxStep);
      opticalLine(ctx, [x, y, z0], [x, y, z1], energyLevel, alpha, widthScale);
      z0 = z1;
    }
  }
`;

  fetch(sourceUrl, { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error(`Unable to load chamber renderer: ${response.status}`);
      return response.text();
    })
    .then(source => {
      const insertionPoint = `
  function drawRearWall(ctx, z, visibleX, systemEnergy, alpha) {
`;

      if (!source.includes(insertionPoint)) {
        throw new Error('Chamber renderer insertion point was not found.');
      }

      source = source.replace(insertionPoint, `${segmentedFunction}${insertionPoint}`);

      const horizontalRail = `opticalLine(ctx, [x, y, near], [x, y, rearZ], systemEnergy, alpha, 0.92);`;
      const sideRail = `opticalLine(ctx, [x, y, near], [x, y, rearZ], systemEnergy, alpha, 0.92);`;

      if (!source.includes(horizontalRail)) {
        throw new Error('Horizontal chamber rails were not found.');
      }

      source = source.replace(
        horizontalRail,
        `opticalDepthLine(ctx, x, y, near, rearZ, systemEnergy, alpha, 0.92);`
      );

      if (!source.includes(sideRail)) {
        throw new Error('Side chamber rails were not found.');
      }

      source = source.replace(
        sideRail,
        `opticalDepthLine(ctx, x, y, near, rearZ, systemEnergy, alpha, 0.92);`
      );

      (0, eval)(`${source}\n//# sourceURL=layered-chamber-segmented.js`);
    })
    .catch(error => {
      console.error('[LayeredChamber]', error);
    });
})();
