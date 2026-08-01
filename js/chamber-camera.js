/*==================================================
  SHARED CHAMBER CAMERA

  Public camera bridge for the chamber, semantic optics and diagnostics.
  Settled geometry remains stable for layout consumers. Live aperture queries
  consume LayeredChamber's read-only presentation publication when available.
==================================================*/

(() => {
  "use strict";

  const CONFIG = Object.freeze({
    near: 2.5,
    cell: 0.5,
    focalRatio: 0.84,
    wallShiftCells: 2,
    finalDepthCells: 16
  });

  const HIDDEN_APERTURE_SIZE = 0.001;

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

  function freezePoint(point) {
    return Object.freeze({ x: point.x, y: point.y });
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

  function rectangleForPoints(points) {
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const right = Math.max(...xs);
    const bottom = Math.max(...ys);
    return rectangle(left, top, right - left, bottom - top);
  }

  function settledPresentation(finalHalfWidth) {
    return Object.freeze({
      elapsed: null,
      progress: 1,
      wallOpen: 1,
      visibleHalfWidth: finalHalfWidth,
      rearDepth: CONFIG.near + CONFIG.finalDepthCells * CONFIG.cell,
      settled: true,
      active: false,
      source: "settled-fallback"
    });
  }

  function livePresentation(finalHalfWidth) {
    const chamber = window.LayeredChamber;
    if (!chamber || chamber.getMode?.() === chamber.MODES?.OFF) {
      return settledPresentation(finalHalfWidth);
    }

    const published = chamber.getPresentationSnapshot?.();
    const visibleHalfWidth = Number(published?.visibleHalfWidth);
    const rearDepth = Number(published?.rearDepth);
    if (!Number.isFinite(visibleHalfWidth) || visibleHalfWidth <= 0
      || !Number.isFinite(rearDepth) || rearDepth <= CONFIG.near) {
      return settledPresentation(finalHalfWidth);
    }

    return Object.freeze({
      elapsed: Number.isFinite(Number(published.elapsed)) ? Number(published.elapsed) : null,
      progress: Math.max(0, Math.min(1, Number(published.progress) || 0)),
      wallOpen: Math.max(0, Math.min(1, Number(published.wallOpen) || 0)),
      visibleHalfWidth: Math.min(finalHalfWidth, visibleHalfWidth),
      rearDepth,
      settled: published.settled === true,
      active: published.active === true,
      source: "layered-chamber"
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
    const presentation = livePresentation(finalHalfWidth);

    function project(x, y, z) {
      const safeZ = Math.max(0.0001, Number(z) || CONFIG.near);
      return Object.freeze({
        x: centreX + Number(x || 0) * focalLength / safeZ,
        y: centreY - Number(y || 0) * focalLength / safeZ,
        scale: CONFIG.near / safeZ
      });
    }

    function settledAperturePointsAt(z, requestedHalfWidth = finalHalfWidth) {
      const safeHalfWidth = Math.max(0, Number(requestedHalfWidth) || 0);
      return Object.freeze([
        freezePoint(project(-safeHalfWidth, halfHeight, z)),
        freezePoint(project(safeHalfWidth, halfHeight, z)),
        freezePoint(project(safeHalfWidth, -halfHeight, z)),
        freezePoint(project(-safeHalfWidth, -halfHeight, z))
      ]);
    }

    function hiddenAperturePoints() {
      const halfPixel = HIDDEN_APERTURE_SIZE * 0.5;
      return Object.freeze([
        Object.freeze({ x: centreX - halfPixel, y: centreY - halfPixel }),
        Object.freeze({ x: centreX + halfPixel, y: centreY - halfPixel }),
        Object.freeze({ x: centreX + halfPixel, y: centreY + halfPixel }),
        Object.freeze({ x: centreX - halfPixel, y: centreY + halfPixel })
      ]);
    }

    function aperturePointsAt(z, requestedHalfWidth = finalHalfWidth) {
      const safeZ = Math.max(0.0001, Number(z) || CONFIG.near);
      if (safeZ > presentation.rearDepth + 0.01) {
        return hiddenAperturePoints();
      }

      const requested = Math.max(0, Number(requestedHalfWidth) || 0);
      const liveHalfWidth = Math.min(requested, presentation.visibleHalfWidth);
      return settledAperturePointsAt(safeZ, liveHalfWidth);
    }

    function apertureAt(z, requestedHalfWidth = finalHalfWidth) {
      return rectangleForPoints(aperturePointsAt(z, requestedHalfWidth));
    }

    const camera = {
      width,
      height,
      centreX,
      centreY,
      near: CONFIG.near,
      far: CONFIG.near + CONFIG.finalDepthCells * CONFIG.cell,
      cell: CONFIG.cell,
      focalRatio: CONFIG.focalRatio,
      focalLength,
      halfWidth,
      halfHeight,
      wallShiftCells: CONFIG.wallShiftCells,
      finalHalfWidth,
      presentation,
      project,
      scaleAt: z => CONFIG.near / Math.max(0.0001, Number(z) || CONFIG.near),
      apertureAt,
      aperturePointsAt,
      settledApertureAt: (z, requestedHalfWidth = finalHalfWidth) => (
        rectangleForPoints(settledAperturePointsAt(z, requestedHalfWidth))
      ),
      settledAperturePointsAt
    };

    camera.nearAperturePoints = settledAperturePointsAt(CONFIG.near);
    camera.nearAperture = rectangleForPoints(camera.nearAperturePoints);
    camera.visibleAperturePoints = aperturePointsAt(
      CONFIG.near,
      presentation.visibleHalfWidth
    );
    camera.visibleAperture = rectangleForPoints(camera.visibleAperturePoints);
    return Object.freeze(camera);
  }

  function attachToChamber() {
    const chamber = window.LayeredChamber;
    if (!chamber) return false;

    chamber.getCameraSnapshot = snapshot;
    chamber.projectPoint = (x, y, z) => snapshot().project(x, y, z);
    chamber.getApertureAt = (z, halfWidth) => snapshot().apertureAt(z, halfWidth);
    chamber.getAperturePointsAt = (z, halfWidth) => snapshot().aperturePointsAt(z, halfWidth);
    return true;
  }

  const API = Object.freeze({
    CONFIG,
    snapshot,
    project: (x, y, z) => snapshot().project(x, y, z),
    apertureAt: (z, halfWidth) => snapshot().apertureAt(z, halfWidth),
    aperturePointsAt: (z, halfWidth) => snapshot().aperturePointsAt(z, halfWidth)
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
