/*==================================================
  OPTICAL PORT MAP

  Optional bridge used only by the Optics renderer. The semantic profile
  names readable design depths, while this adapter maps those depths onto
  exact 0.5-cell chamber grid ports. The chamber renderer itself is not
  changed and the normal feed does not depend on this file.
==================================================*/

(() => {
  const chamber = window.LayeredChamber;
  const baseSnapshot = chamber?.getCameraSnapshot;
  if (!chamber || typeof baseSnapshot !== "function") return;

  const PORT_DEPTHS = new Map([
    [5.50, 7.00], // plate
    [5.30, 6.50], // frame
    [5.00, 6.00], // corners
    [4.70, 5.50], // priority
    [4.30, 5.00], // detail labels
    [4.10, 4.50], // detail values
    [3.70, 4.00], // body
    [3.30, 3.50], // meta
    [2.90, 3.00], // tags
    [2.50, 2.50]  // headline
  ]);

  function mappedDepth(value, camera) {
    const z = Number(value);
    if (!Number.isFinite(z)) return camera.near;

    for (const [designDepth, portDepth] of PORT_DEPTHS) {
      if (Math.abs(z - designDepth) < 0.001) return portDepth;
    }

    return camera.near
      + Math.round((z - camera.near) / camera.cell) * camera.cell;
  }

  chamber.getCameraSnapshot = () => {
    const camera = baseSnapshot.call(chamber);
    if (!camera) return camera;

    const scaleAt = camera.scaleAt.bind(camera);
    const apertureAt = camera.apertureAt.bind(camera);
    const aperturePointsAt = camera.aperturePointsAt?.bind(camera);

    return Object.freeze({
      ...camera,
      opticalPortDepth: z => mappedDepth(z, camera),
      scaleAt: z => scaleAt(mappedDepth(z, camera)),
      apertureAt: (z, halfWidth) => apertureAt(mappedDepth(z, camera), halfWidth),
      aperturePointsAt: aperturePointsAt
        ? (z, halfWidth) => aperturePointsAt(mappedDepth(z, camera), halfWidth)
        : undefined
    });
  };
})();
