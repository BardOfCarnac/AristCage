/*==================================================
  OPTICAL PORT MAP

  Optional bridge used only by the Optics renderer. Semantic article
  objects are grouped onto three exact chamber grid ports while the
  chamber renderer and ordinary feed remain unchanged.

  Port 1: headline and corners
  Port 2: priority, compact tags and metadata
  Port 3: body, expanded information, frame and backing plate
==================================================*/

(() => {
  const chamber = window.LayeredChamber;
  const baseSnapshot = chamber?.getCameraSnapshot;
  if (!chamber || typeof baseSnapshot !== "function") return;

  const PORT_DEPTHS = new Map([
    [5.50, 3.50], // plate -> body/info/frame port
    [5.30, 3.50], // frame -> body/info port
    [5.00, 2.50], // corners -> headline port
    [4.70, 3.00], // priority
    [4.30, 3.50], // detail labels -> body/info port
    [4.10, 3.50], // detail values -> body/info port
    [3.70, 3.50], // body
    [3.30, 3.00], // meta -> priority/tags port
    [2.90, 3.00], // compact tags
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
