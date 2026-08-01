/*==================================================
  SHARED CHAMBER CAMERA

  Public camera bridge for the chamber, semantic optics and diagnostics.
  The settled constants remain stable for layout consumers, while aperture
  queries follow the live chamber opening so environment renderers stay
  contained by the currently visible projection volume.
==================================================*/

(() => {
  const CONFIG = Object.freeze({
    near: 2.5,
    cell: 0.5,
    focalRatio: 0.84,
    wallShiftCells: 2
  });

  const TRAVEL_START = 0.86;
  const TRAVEL_DURATION = 1.54;
  const INFINITY_HOLD = 0.14;
  const RETURN_DURATION = 0.54;
  const WALL_OPEN_DURATION = 1.06;
  const SETTLE_DURATION = 0.46;
  const RETURN_START = TRAVEL_START + TRAVEL_DURATION + INFINITY_HOLD;
  const WALL_OPEN_START = RETURN_START + RETURN_DURATION;
  const PRESENTATION_DONE = WALL_OPEN_START + WALL_OPEN_DURATION + SETTLE_DURATION;

  const PRESENTATION = Object.freeze({
    initialDepthCells: 2,
    finalDepthCells: 16,
    infinityDepthCells: 1000,
    travelStart: TRAVEL_START,
    travelDuration: TRAVEL_DURATION,
    infinityHold: INFINITY_HOLD,
    returnDuration: RETURN_DURATION,
    returnStart: RETURN_START,
    wallOpenDuration: WALL_OPEN_DURATION,
    wallOpenStart: WALL_OPEN_START,
    settleDuration: SETTLE_DURATION,
    done: PRESENTATION_DONE
  });

  const HIDDEN_APERTURE_SIZE = 0.001;
  let presentationStartedAt = 0;

  const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
  const mix = (a, b, amount) => a + (b - a) * amount;
  const easeTravel = value => Math.pow(clamp01(value), 2.72);
  const easeReturn = value => 1 - Math.pow(1 - clamp01(value), 3.35);
  const easeInOut = value => {
    const amount = clamp01(value);
    return amount < 0.5
      ? 4 * amount * amount * amount
      : 1 - Math.pow(-2 * amount + 2, 3) / 2;
  };

  function markPresentationStart() {
    presentationStartedAt = performance.now();
  }

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

  function presentationSnapshot(halfWidth, finalHalfWidth, now = performance.now()) {
    const chamber = window.LayeredChamber;
    const disabled = chamber?.MODES
      && chamber.getMode?.() === chamber.MODES.OFF;

    if (!presentationStartedAt || disabled) {
      return Object.freeze({
        elapsed: PRESENTATION.done,
        wallOpen: 1,
        visibleHalfWidth: finalHalfWidth,
        rearDepth: CONFIG.near + PRESENTATION.finalDepthCells * CONFIG.cell,
        settled: true
      });
    }

    const elapsed = Math.max(0, (now - presentationStartedAt) / 1000);
    const travel = easeTravel(
      (elapsed - PRESENTATION.travelStart) / PRESENTATION.travelDuration
    );
    const returning = easeReturn(
      (elapsed - PRESENTATION.returnStart) / PRESENTATION.returnDuration
    );
    const wallOpen = easeInOut(
      (elapsed - PRESENTATION.wallOpenStart) / PRESENTATION.wallOpenDuration
    );
    const initialDepth = CONFIG.near
      + PRESENTATION.initialDepthCells * CONFIG.cell;
    const finalDepth = CONFIG.near
      + PRESENTATION.finalDepthCells * CONFIG.cell;
    const infinityDepth = CONFIG.near
      + PRESENTATION.infinityDepthCells * CONFIG.cell;
    const rearDepth = returning > 0
      ? mix(infinityDepth, finalDepth, returning)
      : travel > 0
        ? mix(initialDepth, infinityDepth, travel)
        : initialDepth;

    return Object.freeze({
      elapsed,
      wallOpen,
      visibleHalfWidth: halfWidth
        + CONFIG.wallShiftCells * CONFIG.cell * wallOpen,
      rearDepth,
      settled: elapsed >= PRESENTATION.done
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
    const presentation = presentationSnapshot(halfWidth, finalHalfWidth);

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
      far: CONFIG.near + PRESENTATION.finalDepthCells * CONFIG.cell,
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

  function wrapPresentationEntryPoints(chamber) {
    if (!chamber || chamber.__ncnPresentationClockWrapped) return;

    const restart = chamber.restart;
    if (typeof restart === "function") {
      chamber.restart = (...args) => {
        markPresentationStart();
        return restart.apply(chamber, args);
      };
    }

    const setMode = chamber.setMode;
    if (typeof setMode === "function") {
      chamber.setMode = (nextMode, options = {}) => {
        if (
          nextMode !== chamber.MODES?.OFF
          && options.restartAnimation !== false
        ) {
          markPresentationStart();
        }
        return setMode.call(chamber, nextMode, options);
      };
    }

    const enable = chamber.enable;
    if (typeof enable === "function") {
      chamber.enable = (...args) => {
        markPresentationStart();
        return enable.apply(chamber, args);
      };
    }

    Object.defineProperty(chamber, "__ncnPresentationClockWrapped", {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false
    });
  }

  function attachToChamber() {
    const chamber = window.LayeredChamber;
    if (!chamber) return false;

    wrapPresentationEntryPoints(chamber);
    chamber.getCameraSnapshot = snapshot;
    chamber.getPresentationSnapshot = () => snapshot().presentation;
    chamber.projectPoint = (x, y, z) => snapshot().project(x, y, z);
    chamber.getApertureAt = (z, halfWidth) => snapshot().apertureAt(z, halfWidth);
    chamber.getAperturePointsAt = (z, halfWidth) => snapshot().aperturePointsAt(z, halfWidth);
    return true;
  }

  const API = Object.freeze({
    CONFIG,
    PRESENTATION,
    snapshot,
    project: (x, y, z) => snapshot().project(x, y, z),
    apertureAt: (z, halfWidth) => snapshot().apertureAt(z, halfWidth),
    aperturePointsAt: (z, halfWidth) => snapshot().aperturePointsAt(z, halfWidth)
  });

  window.NCNChamberCamera = API;
  attachToChamber();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", markPresentationStart, { once: true });
  } else {
    markPresentationStart();
  }

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
