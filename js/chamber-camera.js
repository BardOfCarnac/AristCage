/*==================================================
  SHARED CHAMBER CAMERA

  Thin public bridge over the permanent chamber runtime. Geometry is owned
  by LayeredChamber; no consumer carries a second copy of its constants.
==================================================*/
(() => {
  'use strict';

  function fallbackSnapshot() {
    const config = window.LayeredChamber?.getGeometryConfig?.() || {
      near: 2.5,
      cell: 0.5,
      focal: 0.84,
      wallShiftCells: 2,
      halfWidth: 3,
      halfHeight: 2.5
    };
    const width = innerWidth;
    const height = innerHeight;
    const focalLength = Math.min(width, height) * config.focal;
    const centreX = width * 0.5;
    const centreY = height * 0.5;
    const snap = value => Math.max(config.cell, Math.round(value / config.cell) * config.cell);
    const halfWidth = snap((width * 0.5) * config.near / focalLength);
    const halfHeight = snap((height * 0.5) * config.near / focalLength);
    const finalHalfWidth = halfWidth + config.wallShiftCells * config.cell;
    const project = (x, y, z) => {
      const safeZ = Math.max(0.0001, Number(z) || config.near);
      return {
        x: centreX + Number(x || 0) * focalLength / safeZ,
        y: centreY - Number(y || 0) * focalLength / safeZ,
        scale: config.near / safeZ
      };
    };
    const aperturePointsAt = (z, requestedHalfWidth = finalHalfWidth) => [
      project(-requestedHalfWidth, halfHeight, z),
      project(requestedHalfWidth, halfHeight, z),
      project(requestedHalfWidth, -halfHeight, z),
      project(-requestedHalfWidth, -halfHeight, z)
    ];
    const apertureAt = (z, requestedHalfWidth) => {
      const points = aperturePointsAt(z, requestedHalfWidth);
      const xs = points.map(point => point.x);
      const ys = points.map(point => point.y);
      const left = Math.min(...xs);
      const top = Math.min(...ys);
      const right = Math.max(...xs);
      const bottom = Math.max(...ys);
      return { left, top, right, bottom, width: right - left, height: bottom - top };
    };
    return {
      width,
      height,
      centreX,
      centreY,
      near: config.near,
      cell: config.cell,
      focalRatio: config.focal,
      focalLength,
      halfWidth,
      halfHeight,
      wallShiftCells: config.wallShiftCells,
      finalHalfWidth,
      project,
      scaleAt: z => config.near / Math.max(0.0001, Number(z) || config.near),
      apertureAt,
      aperturePointsAt
    };
  }

  function snapshot() {
    return window.LayeredChamber?.getCameraSnapshot?.() || fallbackSnapshot();
  }

  const API = Object.freeze({
    snapshot,
    project: (x, y, z) => snapshot().project(x, y, z),
    apertureAt: (z, halfWidth) => snapshot().apertureAt(z, halfWidth),
    aperturePointsAt: (z, halfWidth) => snapshot().aperturePointsAt(z, halfWidth)
  });

  window.NCNChamberCamera = API;

  let resizeFrame = 0;
  addEventListener('resize', () => {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      dispatchEvent(new CustomEvent('ncn:chamber-camera-change', { detail: snapshot() }));
    });
  }, { passive: true });
})();
