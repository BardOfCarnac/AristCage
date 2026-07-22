/*==================================================
  CHAMBER GRID EXTENSION

  Removes the settled intermediate rear panel and continues the existing
  chamber lattice four cells farther back before drawing the final wall.
==================================================*/

window.NCNChamberGridExtension = (() => {
  const CANVAS_ID = "layered-chamber-depth-extension";
  const ORIGINAL_DEPTH_CELLS = 12;
  const EXTRA_DEPTH_CELLS = 4;
  const SETTLE_DELAY = 4560;

  let canvas = null;
  let ctx = null;
  let timer = 0;
  let resizeFrame = 0;
  let bodyObserver = null;
  let stateObserver = null;

  function chamberActive() {
    return document.documentElement.classList.contains("layered-chamber-mode");
  }

  function root() {
    return document.querySelector("#layered-chamber-system");
  }

  function ensureCanvas() {
    const chamberRoot = root();
    if (!chamberRoot) return null;
    if (canvas?.isConnected && canvas.parentElement === chamberRoot) return canvas;

    canvas?.remove();
    canvas = document.createElement("canvas");
    canvas.id = CANVAS_ID;
    canvas.className = "layered-chamber-canvas";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.zIndex = "0";

    const background = chamberRoot.querySelector("#layered-chamber-bg");
    if (background) background.after(canvas);
    else chamberRoot.prepend(canvas);

    ctx = canvas.getContext("2d");
    resizeCanvas();
    return canvas;
  }

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clear() {
    if (!ctx) return;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }

  function point(camera, x, y, z) {
    return camera.project(x, y, z);
  }

  function line(camera, a, b, alpha = .22, width = .8) {
    const A = point(camera, a[0], a[1], a[2]);
    const B = point(camera, b[0], b[1], b[2]);
    ctx.strokeStyle = `rgba(176, 10, 18, ${alpha})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.stroke();
  }

  function drawPass(camera, originalRear, finalRear, alphaScale = 1, widthScale = 1) {
    const cell = camera.cell;
    const X = camera.finalHalfWidth;
    const Y = camera.halfHeight;
    const xCells = Math.round((X * 2) / cell);
    const yCells = Math.round((Y * 2) / cell);

    for (let ix = 0; ix <= xCells; ix++) {
      const x = -X + ix * cell;
      line(camera, [x, -Y, originalRear], [x, -Y, finalRear], .23 * alphaScale, .84 * widthScale);
      line(camera, [x, Y, originalRear], [x, Y, finalRear], .20 * alphaScale, .8 * widthScale);
    }

    for (let iy = 0; iy <= yCells; iy++) {
      const y = -Y + iy * cell;
      line(camera, [-X, y, originalRear], [-X, y, finalRear], .21 * alphaScale, .82 * widthScale);
      line(camera, [X, y, originalRear], [X, y, finalRear], .21 * alphaScale, .82 * widthScale);
    }

    for (let z = originalRear + cell; z <= finalRear + .0001; z += cell) {
      const fade = 1 - ((z - originalRear) / Math.max(cell, finalRear - originalRear)) * .28;
      const alpha = .24 * fade * alphaScale;
      line(camera, [-X, -Y, z], [X, -Y, z], alpha, .78 * widthScale);
      line(camera, [-X, Y, z], [X, Y, z], alpha * .9, .76 * widthScale);
      line(camera, [-X, -Y, z], [-X, Y, z], alpha * .94, .78 * widthScale);
      line(camera, [X, -Y, z], [X, Y, z], alpha * .94, .78 * widthScale);
    }

    for (let ix = 0; ix <= xCells; ix++) {
      const x = -X + ix * cell;
      line(camera, [x, -Y, finalRear], [x, Y, finalRear], .30 * alphaScale, .92 * widthScale);
    }

    for (let iy = 0; iy <= yCells; iy++) {
      const y = -Y + iy * cell;
      line(camera, [-X, y, finalRear], [X, y, finalRear], .30 * alphaScale, .92 * widthScale);
    }
  }

  function draw() {
    timer = 0;
    if (!chamberActive() || !ensureCanvas()) return;

    const camera = window.NCNChamberCamera?.snapshot?.();
    if (!camera) return;

    resizeCanvas();
    clear();

    const originalRear = camera.near + ORIGINAL_DEPTH_CELLS * camera.cell;
    const finalRear = camera.near + (ORIGINAL_DEPTH_CELLS + EXTRA_DEPTH_CELLS) * camera.cell;
    const oldAperture = camera.apertureAt(originalRear, camera.finalHalfWidth);

    ctx.save();
    ctx.fillStyle = "rgba(2, 1, 2, .995)";
    ctx.fillRect(
      Math.floor(oldAperture.left) - 3,
      Math.floor(oldAperture.top) - 3,
      Math.ceil(oldAperture.width) + 6,
      Math.ceil(oldAperture.height) + 6
    );
    ctx.restore();

    drawPass(camera, originalRear, finalRear);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    drawPass(camera, originalRear, finalRear, .18, 1.12);
    ctx.restore();
  }

  function schedule(delay = SETTLE_DELAY) {
    window.clearTimeout(timer);
    timer = 0;
    clear();

    if (!chamberActive()) return;
    ensureCanvas();
    timer = window.setTimeout(draw, delay);
  }

  function handleResize() {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      if (!canvas) return;
      resizeCanvas();
      if (chamberActive()) draw();
    });
  }

  function init() {
    const toggle = document.querySelector("#layered-chamber-toggle");
    toggle?.addEventListener("click", () => schedule());

    stateObserver = new MutationObserver(() => schedule());
    stateObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-chamber-mode"]
    });

    bodyObserver = new MutationObserver(() => {
      if (!canvas?.isConnected && root()) schedule();
    });
    bodyObserver.observe(document.body, { childList: true });

    window.addEventListener("resize", handleResize, { passive: true });
    schedule();
  }

  function destroy() {
    window.clearTimeout(timer);
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    bodyObserver?.disconnect();
    stateObserver?.disconnect();
    window.removeEventListener("resize", handleResize);
    canvas?.remove();
    canvas = null;
    ctx = null;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  return { draw, refresh: () => schedule(0), destroy };
})();
