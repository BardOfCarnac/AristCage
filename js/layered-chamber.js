/* Optional chamber subsystem with explicit lifecycle and operating modes. */
window.LayeredChamber = (() => {
  const STORAGE_KEY = 'ncn-layered-chamber';
  const ROOT_ID = 'layered-chamber-system';
  const MODES = Object.freeze({
    OFF: 'off',
    BACKGROUND: 'background',
    LAB: 'lab'
  });

  const geometry = {
    cell: 0.5,
    near: 2.5,
    initialDepthCells: 2,
    finalDepthCells: 12,
    infinityDepthCells: 120,
    focal: 0.84,
    halfWidth: 3,
    halfHeight: 2.5,
    wallShiftCells: 2,
    sliceCount: 6
  };

  const timing = {
    igniteStart: 0.35,
    igniteDuration: 0.7,
    travelStart: 0.82,
    travelDuration: 1.35,
    returnStart: 2.0,
    returnDuration: 0.38,
    wallOpenStart: 2.38,
    wallOpenDuration: 1.1,
    done: 3.55
  };

  const lab = {
    itemsPerSlice: 20,
    itemPitch: 1.15,
    itemHeight: 0.78,
    scroll: 0,
    targetScroll: 0,
    maxScroll: 18,
    dragging: false,
    lastTouchY: 0,
    diagnostics: true
  };

  const pageRoot = document.documentElement;
  let mode = MODES.OFF;
  let mounted = false;
  let subsystemRoot = null;
  let bg = null;
  let fg = null;
  let b = null;
  let g = null;
  let W = 0;
  let H = 0;
  let DPR = 1;
  let raf = 0;
  let startedAt = 0;

  const toggle = () => document.querySelector('#layered-chamber-toggle');
  const clamp01 = value => Math.max(0, Math.min(1, value));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const mix = (a, c, t) => a + (c - a) * t;
  const easeOut = t => 1 - Math.pow(1 - clamp01(t), 3);
  const easeInOut = t => {
    const n = clamp01(t);
    return n < 0.5 ? 4 * n * n * n : 1 - Math.pow(-2 * n + 2, 3) / 2;
  };
  const snapCells = value =>
    Math.max(geometry.cell, Math.round(value / geometry.cell) * geometry.cell);

  function isMode(value) {
    return Object.values(MODES).includes(value);
  }

  function makeCanvas(id) {
    const canvas = document.createElement('canvas');
    canvas.id = id;
    canvas.className = 'layered-chamber-canvas';
    subsystemRoot.append(canvas);
    return canvas;
  }

  function createSubsystemRoot() {
    const node = document.createElement('div');
    node.id = ROOT_ID;
    node.className = 'layered-chamber-system';
    node.setAttribute('aria-hidden', 'true');
    document.body.prepend(node);
    return node;
  }

  function mount() {
    if (mounted) return;

    subsystemRoot = createSubsystemRoot();
    bg = makeCanvas('layered-chamber-bg');
    fg = makeCanvas('layered-chamber-fg');
    b = bg.getContext('2d');
    g = fg.getContext('2d');

    addEventListener('resize', resize, { passive: true });
    addEventListener('wheel', wheel, { passive: false });
    addEventListener('touchstart', touchStart, { passive: true });
    addEventListener('touchmove', touchMove, { passive: false });
    addEventListener('touchend', touchEnd, { passive: true });
    addEventListener('touchcancel', touchEnd, { passive: true });

    mounted = true;
    resize();
  }

  function unmount() {
    if (!mounted) return;

    if (raf) cancelAnimationFrame(raf);
    raf = 0;

    removeEventListener('resize', resize);
    removeEventListener('wheel', wheel);
    removeEventListener('touchstart', touchStart);
    removeEventListener('touchmove', touchMove);
    removeEventListener('touchend', touchEnd);
    removeEventListener('touchcancel', touchEnd);

    subsystemRoot?.remove();
    subsystemRoot = null;
    bg = null;
    fg = null;
    b = null;
    g = null;
    W = 0;
    H = 0;
    lab.dragging = false;
    mounted = false;
  }

  function focalLength() {
    return Math.min(W, H) * geometry.focal;
  }

  function centreY() {
    return H * 0.5;
  }

  function fitGeometryToViewport() {
    const focal = focalLength();

    geometry.halfWidth = snapCells((W * 0.5) * geometry.near / focal);
    geometry.halfHeight = snapCells((H * 0.5) * geometry.near / focal);
    geometry.wallShiftCells = 2;
  }

  function resize() {
    if (!mounted || !bg || !fg) return;

    DPR = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth;
    H = innerHeight;
    fitGeometryToViewport();

    for (const canvas of [bg, fg]) {
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      canvas.getContext('2d').setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    requestDraw();
  }

  function project(x, y, z) {
    const focal = focalLength();
    return {
      x: W / 2 + x * focal / z,
      y: centreY() - y * focal / z
    };
  }

  function line(ctx, a, c, style, width = 1) {
    const A = project(a[0], a[1], a[2]);
    const C = project(c[0], c[1], c[2]);
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(C.x, C.y);
    ctx.stroke();
  }

  function colour(energy, alpha) {
    const r = Math.round(mix(112, 255, energy));
    const green = Math.round(mix(120, 24, energy));
    const blue = Math.round(mix(128, 32, energy));
    return `rgba(${r},${green},${blue},${alpha})`;
  }

  function state(now) {
    const t = (now - startedAt) / 1000;
    return {
      t,
      energy: easeOut((t - timing.igniteStart) / timing.igniteDuration),
      travel: easeInOut((t - timing.travelStart) / timing.travelDuration),
      returning: easeOut((t - timing.returnStart) / timing.returnDuration),
      wallOpen: easeInOut((t - timing.wallOpenStart) / timing.wallOpenDuration),
      lab: mode === MODES.LAB
        ? easeOut((t - timing.done + 0.08) / 0.55)
        : 0,
      done: t >= timing.done
    };
  }

  function rearDepth(s) {
    const initial = geometry.near + geometry.initialDepthCells * geometry.cell;
    const final = geometry.near + geometry.finalDepthCells * geometry.cell;
    const infinity = geometry.near + geometry.infinityDepthCells * geometry.cell;
    if (s.returning > 0) return mix(infinity, final, s.returning);
    if (s.travel > 0) return mix(initial, infinity, s.travel);
    return initial;
  }

  function depthSteps(rearZ) {
    return Math.max(
      0,
      Math.floor((rearZ - geometry.near) / geometry.cell + 0.00001)
    );
  }

  function finalHalfWidth() {
    return geometry.halfWidth + geometry.wallShiftCells * geometry.cell;
  }

  function visibleHalfWidth(s) {
    return geometry.halfWidth +
      geometry.wallShiftCells * geometry.cell * s.wallOpen;
  }

  function drawRearWall(ctx, z, visibleX, energy, alpha) {
    const { cell, halfHeight: Y } = geometry;
    const fullX = finalHalfWidth();
    const xCells = Math.round((fullX * 2) / cell);
    const yCells = Math.round((Y * 2) / cell);
    const style = colour(energy, alpha);

    for (let ix = 0; ix <= xCells; ix++) {
      const x = -fullX + ix * cell;
      if (Math.abs(x) <= visibleX + 0.0001) {
        line(ctx, [x, -Y, z], [x, Y, z], style, 1.05);
      }
    }
    for (let iy = 0; iy <= yCells; iy++) {
      const y = -Y + iy * cell;
      line(ctx, [-visibleX, y, z], [visibleX, y, z], style, 1.05);
    }
  }

  function drawHorizontalPlane(ctx, y, rearZ, visibleX, energy, alpha) {
    const { cell, near } = geometry;
    const fullX = finalHalfWidth();
    const style = colour(energy, alpha);
    const xCells = Math.round((fullX * 2) / cell);
    const steps = depthSteps(rearZ);

    for (let ix = 0; ix <= xCells; ix++) {
      const x = -fullX + ix * cell;
      if (Math.abs(x) <= visibleX + 0.0001) {
        line(ctx, [x, y, near], [x, y, rearZ], style);
      }
    }
    for (let iz = 0; iz <= steps; iz++) {
      const z = near + iz * cell;
      line(ctx, [-visibleX, y, z], [visibleX, y, z], style);
    }
  }

  function drawSideWall(ctx, side, rearZ, visibleX, energy, alpha) {
    const { cell, halfHeight: Y, near } = geometry;
    const style = colour(energy, alpha);
    const yCells = Math.round((Y * 2) / cell);
    const steps = depthSteps(rearZ);
    const x = side * visibleX;

    for (let iy = 0; iy <= yCells; iy++) {
      const y = -Y + iy * cell;
      line(ctx, [x, y, near], [x, y, rearZ], style);
    }
    for (let iz = 0; iz <= steps; iz++) {
      const z = near + iz * cell;
      line(ctx, [x, -Y, z], [x, Y, z], style);
    }
  }

  function drawChamber(ctx, s, alpha) {
    const rearZ = rearDepth(s);
    const visibleX = visibleHalfWidth(s);

    drawRearWall(ctx, rearZ, visibleX, s.energy, alpha * 1.2);
    drawHorizontalPlane(ctx, -geometry.halfHeight, rearZ, visibleX, s.energy, alpha);
    drawHorizontalPlane(ctx, geometry.halfHeight, rearZ, visibleX, s.energy, alpha);
    drawSideWall(ctx, -1, rearZ, visibleX, s.energy, alpha);
    drawSideWall(ctx, 1, rearZ, visibleX, s.energy, alpha);
  }

  function apertureAt(z, halfWidth) {
    const Y = geometry.halfHeight;
    const tl = project(-halfWidth, Y, z);
    const br = project(halfWidth, -Y, z);
    return {
      left: tl.x,
      top: tl.y,
      right: br.x,
      bottom: br.y,
      width: br.x - tl.x,
      height: br.y - tl.y
    };
  }

  function drawSliceFrame(ctx, z, index, halfWidth, alpha) {
    const ap = apertureAt(z, halfWidth);
    ctx.strokeStyle = `rgba(255,84,62,${0.12 + alpha * 0.26})`;
    ctx.lineWidth = index === 1 ? 1.4 : 0.8;
    ctx.setLineDash(index === 1 ? [] : [5, 5]);
    ctx.strokeRect(ap.left, ap.top, ap.width, ap.height);
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(255,92,68,${0.32 + alpha * 0.35})`;
    ctx.font = '10px monospace';
    ctx.textBaseline = 'top';
    ctx.fillText(
      `SLICE ${String(index).padStart(2, '0')}  Z ${z.toFixed(2)}`,
      ap.left + 8,
      ap.top + 7
    );
  }

  function drawPlaceholderBlock(ctx, sliceIndex, itemIndex, z, halfWidth, worldY, alpha) {
    const scale = focalLength() / z;
    const inset = geometry.cell * (1.05 + sliceIndex * 0.08);
    const tl = project(-halfWidth + inset, worldY, z);
    const br = project(halfWidth - inset, worldY - lab.itemHeight, z);
    const width = br.x - tl.x;
    const height = br.y - tl.y;
    if (br.y < -40 || tl.y > H + 40 || width <= 0) return;

    const strength = 0.16 + (geometry.sliceCount - sliceIndex + 1) * 0.025;
    ctx.fillStyle = `rgba(18,3,5,${0.45 + sliceIndex * 0.045})`;
    ctx.fillRect(tl.x, tl.y, width, height);
    ctx.strokeStyle = `rgba(255,58,48,${strength * alpha})`;
    ctx.lineWidth = Math.max(0.65, scale * 0.006);
    ctx.strokeRect(tl.x, tl.y, width, height);

    const labelSize = clamp(11 * scale / 90, 8, 13);
    ctx.fillStyle = `rgba(255,120,98,${0.42 * alpha})`;
    ctx.font = `${labelSize}px monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillText(
      `S${sliceIndex} / ITEM ${String(itemIndex + 1).padStart(2, '0')}`,
      tl.x + Math.max(6, width * 0.035),
      tl.y + height * 0.32
    );

    const bars = 2 + ((sliceIndex + itemIndex) % 3);
    for (let n = 0; n < bars; n++) {
      const barY = tl.y + height * (0.55 + n * 0.11);
      const barW = width * (0.74 - n * 0.09 - (itemIndex % 3) * 0.035);
      ctx.fillStyle = `rgba(255,62,48,${(0.13 + n * 0.025) * alpha})`;
      ctx.fillRect(tl.x + width * 0.035, barY, barW, Math.max(1, height * 0.025));
    }
  }

  function drawSliceColumn(ctx, sliceIndex, z, halfWidth, alpha) {
    const ap = apertureAt(z, halfWidth);
    ctx.save();
    ctx.beginPath();
    ctx.rect(ap.left, ap.top, ap.width, ap.height);
    ctx.clip();

    const contentTop = geometry.halfHeight - geometry.cell * 1.35 + lab.scroll;
    for (let i = 0; i < lab.itemsPerSlice; i++) {
      const y = contentTop - i * lab.itemPitch - (sliceIndex - 1) * 0.08;
      drawPlaceholderBlock(ctx, sliceIndex, i, z, halfWidth, y, alpha);
    }
    ctx.restore();

    if (lab.diagnostics) drawSliceFrame(ctx, z, sliceIndex, halfWidth, alpha);
  }

  function drawScrollLaboratory(ctx, s) {
    if (mode !== MODES.LAB || s.lab <= 0) return;
    const halfWidth = visibleHalfWidth(s);

    for (let index = geometry.sliceCount; index >= 1; index--) {
      const z = geometry.near + index * geometry.cell;
      drawSliceColumn(ctx, index, z, halfWidth, s.lab);
    }

    ctx.fillStyle = `rgba(255,90,68,${0.48 * s.lab})`;
    ctx.font = '11px monospace';
    ctx.textBaseline = 'bottom';
    ctx.fillText(
      `SHARED SCROLL ${lab.scroll.toFixed(2)} / ${lab.maxScroll.toFixed(2)}   ·   6 DEPTH CELLS`,
      14,
      H - 14
    );
  }

  function settleScroll() {
    if (mode !== MODES.LAB) return false;
    const delta = lab.targetScroll - lab.scroll;
    if (Math.abs(delta) < 0.001) {
      lab.scroll = lab.targetScroll;
      return false;
    }
    lab.scroll += delta * 0.18;
    return true;
  }

  function draw(now = performance.now()) {
    raf = 0;
    if (!mounted || mode === MODES.OFF || !W || !b || !g) return;

    b.clearRect(0, 0, W, H);
    g.clearRect(0, 0, W, H);

    const s = state(now);
    drawChamber(b, s, 0.34);
    if (s.energy > 0) {
      b.save();
      b.globalCompositeOperation = 'lighter';
      drawChamber(b, s, 0.075 * s.energy);
      b.restore();
    }

    drawScrollLaboratory(g, s);
    const movingScroll = settleScroll();
    if (!s.done || movingScroll) requestDraw();
  }

  function requestDraw() {
    if (mounted && mode !== MODES.OFF && !raf) raf = requestAnimationFrame(draw);
  }

  function setScroll(value) {
    if (mode !== MODES.LAB) return;
    lab.targetScroll = clamp(value, 0, lab.maxScroll);
    requestDraw();
  }

  function wheel(event) {
    if (mode !== MODES.LAB || event.target.closest?.('.rail')) return;
    event.preventDefault();
    setScroll(lab.targetScroll + event.deltaY * 0.0065);
  }

  function touchStart(event) {
    if (mode !== MODES.LAB || event.target.closest?.('.rail') || !event.touches.length) return;
    lab.dragging = true;
    lab.lastTouchY = event.touches[0].clientY;
  }

  function touchMove(event) {
    if (mode !== MODES.LAB || !lab.dragging || !event.touches.length) return;
    event.preventDefault();
    const y = event.touches[0].clientY;
    const delta = lab.lastTouchY - y;
    lab.lastTouchY = y;
    setScroll(lab.targetScroll + delta * 0.018);
  }

  function touchEnd() {
    lab.dragging = false;
  }

  function restart() {
    if (mode === MODES.OFF) return;
    if (!mounted) mount();
    startedAt = performance.now();
    lab.scroll = 0;
    lab.targetScroll = 0;
    requestDraw();
  }

  function updateDocumentState() {
    pageRoot.classList.toggle('layered-chamber-mode', mode !== MODES.OFF);
    pageRoot.classList.toggle('layered-chamber-background-mode', mode === MODES.BACKGROUND);
    pageRoot.classList.toggle('layered-chamber-lab-mode', mode === MODES.LAB);
    pageRoot.dataset.chamberMode = mode;

    const button = toggle();
    if (button) {
      button.setAttribute('aria-pressed', String(mode !== MODES.OFF));
      button.textContent = mode === MODES.OFF
        ? 'Chamber Off'
        : mode === MODES.BACKGROUND
          ? 'Restart Background'
          : 'Restart Chamber';
    }
  }

  function clearDocumentState() {
    pageRoot.classList.remove(
      'layered-chamber-mode',
      'layered-chamber-background-mode',
      'layered-chamber-lab-mode'
    );
    delete pageRoot.dataset.chamberMode;

    const button = toggle();
    if (button) {
      button.setAttribute('aria-pressed', 'false');
      button.textContent = 'Chamber Off';
    }
  }

  function setMode(nextMode, options = {}) {
    const { persist = true, restartAnimation = true } = options;

    if (!isMode(nextMode)) {
      throw new TypeError(`Unknown chamber mode: ${nextMode}`);
    }

    if (nextMode === MODES.OFF) {
      mode = MODES.OFF;
      unmount();
      clearDocumentState();
      if (persist) localStorage.setItem(STORAGE_KEY, MODES.OFF);
      return;
    }

    mode = nextMode;
    mount();
    updateDocumentState();
    if (persist) localStorage.setItem(STORAGE_KEY, nextMode);
    if (restartAnimation) restart();
    else requestDraw();
  }

  function handleToggle() {
    if (mode === MODES.OFF) setMode(MODES.LAB);
    else restart();
  }

  function init() {
    toggle()?.addEventListener('click', handleToggle);

    const stored = localStorage.getItem(STORAGE_KEY);
    const initialMode = stored === 'on'
      ? MODES.LAB
      : isMode(stored)
        ? stored
        : MODES.OFF;

    setMode(initialMode, {
      persist: false,
      restartAnimation: initialMode !== MODES.OFF
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  return {
    MODES,
    mount,
    unmount: () => setMode(MODES.OFF),
    restart,
    setMode,
    getMode: () => mode,
    isMounted: () => mounted,
    isEnabled: () => mode !== MODES.OFF,
    enable: () => setMode(MODES.LAB),
    disable: () => setMode(MODES.OFF),
    refresh: requestDraw,
    setScroll,
    toggleDiagnostics: () => {
      lab.diagnostics = !lab.diagnostics;
      requestDraw();
    }
  };
})();