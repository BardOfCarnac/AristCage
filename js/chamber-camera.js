/*==================================================
  SHARED CHAMBER CAMERA

  Public camera bridge for the chamber, semantic optics and diagnostics.
  The current constants mirror LayeredChamber's settled geometry; all
  consumers read their viewport projection from this one API.
==================================================*/

(() => {
  const CONFIG = Object.freeze({
    near: 2.5,
    cell: 0.5,
    focalRatio: 0.84,
    wallShiftCells: 2
  });

  function snapCells(value) {
    return Math.max(
      CONFIG.cell,
      Math.round(value / CONFIG.cell) * CONFIG.cell
    );
  }

  function dimensions() {
    return {
      width: window.innerWidth,
      height: window.innerHeight
    };
  }

  function rectangle(left, top, width, height) {
    return Object.freeze({
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height
    });
  }

  function snapshot() {
    const { width, height } = dimensions();
    const focalLength = Math.min(width, height) * CONFIG.focalRatio;
    const centreX = width * 0.5;
    const centreY = height * 0.5;
    const halfWidth = snapCells(
      (width * 0.5) * CONFIG.near / focalLength
    );
    const halfHeight = snapCells(
      (height * 0.5) * CONFIG.near / focalLength
    );
    const finalHalfWidth = halfWidth
      + CONFIG.wallShiftCells * CONFIG.cell;

    function project(x, y, z) {
      const safeZ = Math.max(0.0001, Number(z) || CONFIG.near);
      return Object.freeze({
        x: centreX + Number(x || 0) * focalLength / safeZ,
        y: centreY - Number(y || 0) * focalLength / safeZ,
        scale: CONFIG.near / safeZ
      });
    }

    function apertureAt(z, requestedHalfWidth = finalHalfWidth) {
      const topLeft = project(-requestedHalfWidth, halfHeight, z);
      const bottomRight = project(requestedHalfWidth, -halfHeight, z);
      return rectangle(
        topLeft.x,
        topLeft.y,
        bottomRight.x - topLeft.x,
        bottomRight.y - topLeft.y
      );
    }

    const camera = {
      width,
      height,
      centreX,
      centreY,
      near: CONFIG.near,
      cell: CONFIG.cell,
      focalRatio: CONFIG.focalRatio,
      focalLength,
      halfWidth,
      halfHeight,
      wallShiftCells: CONFIG.wallShiftCells,
      finalHalfWidth,
      project,
      scaleAt: z => CONFIG.near / Math.max(0.0001, Number(z) || CONFIG.near),
      apertureAt
    };

    camera.nearAperture = apertureAt(CONFIG.near);
    return Object.freeze(camera);
  }

  function attachToChamber() {
    const chamber = window.LayeredChamber;
    if (!chamber) return false;

    chamber.getCameraSnapshot = snapshot;
    chamber.projectPoint = (x, y, z) => snapshot().project(x, y, z);
    chamber.getApertureAt = (z, halfWidth) => snapshot().apertureAt(z, halfWidth);
    return true;
  }

  const API = Object.freeze({
    CONFIG,
    snapshot,
    project: (x, y, z) => snapshot().project(x, y, z),
    apertureAt: (z, halfWidth) => snapshot().apertureAt(z, halfWidth)
  });

  window.NCNChamberCamera = API;
  attachToChamber();

  let resizeFrame = 0;

  function announceCameraChange() {
    if (resizeFrame) return;

    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      const camera = snapshot();
      window.dispatchEvent(new CustomEvent("ncn:chamber-camera-change", {
        detail: camera
      }));
    });
  }

  window.addEventListener("resize", announceCameraChange, { passive: true });
})();
