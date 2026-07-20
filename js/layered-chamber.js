/* Optional chamber subsystem with explicit lifecycle, modes, and optical energy. */
window.LayeredChamber = (() => {
  const STORAGE_KEY = 'ncn-layered-chamber';
  const ROOT_ID = 'layered-chamber-system';
  const MODES = Object.freeze({ OFF: 'off', BACKGROUND: 'background', LAB: 'lab' });

  const geometry = {
    cell: 0.5,
    near: 2.5,
    initialDepthCells: 2,
    finalDepthCells: 12,
    infinityDepthCells: 420,
    focal: 0.84,
    halfWidth: 3,
    halfHeight: 2.5,
    wallShiftCells: 2,
    sliceCount: 6
  };

  const timing = {
    igniteStart: 0.16,
    ignitePeak: 0.72,
    igniteSettle: 1.02,
    travelStart: 0.88,
    travelDuration: 1.48,
    infinityHold: 0.16,
    returnDuration: 0.48,
    wallOpenDuration: 1.02,
    settleDuration: 0.42,
    labDelay: 0.12
  };

  timing.returnStart = timing.travelStart + timing.travelDuration + timing.infinityHold;
  timing.wallOpenStart = timing.returnStart + timing.returnDuration;
  timing.done = timing.wallOpenStart + timing.wallOpenDuration + timing.settleDuration;

  const energy = {
    dormant: 0,
    operating: 0.64,
    bootPeak: 1,
    rearLockPulse: 0.24,
    wallLockPulse: 0.14
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
  let injectedEnergy = 0;
  let injectedAt = 0;
  let injectedDuration = 0;

  const toggle = () => document.querySelector('#layered-chamber-toggle');
  const clamp01 = value => Math.max(0, Math.min(1, value));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const mix = (a, c, t) => a + (c - a) * t;
  const easeOut = t => 1 - Math.pow(1 - clamp01(t), 3);
  const easeIn = t => Math.pow(clamp01(t), 3);
  const easeInOut = t => {
    const n = clamp01(t);
    return n < 0.5 ? 4 * n * n * n : 1 - Math.pow(-2 * n + 2, 3) / 2;
  };
  const pulse = (t, centre, width) => {
    const distance = Math.abs(t - centre) / Math.max(width, 0.001);
    if (distance >= 1) return 0;
    const envelope = 1 - distance;
    return envelope * envelope * (0.82 + Math.cos(distance * Math.PI * 3) * 0.18);
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
    subsystemRoot = bg = fg = b = g = null;
    W = H = 0;
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
    return { x: W / 2 + x * focal / z, y: centreY() - y * focal / z };
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

  function palette(value, alpha) {
    const stops = [
      [38, 2, 6],
      [104, 5, 12],
      [176, 10, 18],
      [244, 24, 24],
      [255, 66, 32]
    ];
    const scaled = clamp01(value) * (stops.length - 1);
    const index = Math.min(stops.length - 2, Math.floor(scaled));
    const local = scaled - index;
    const a = stops[index];
    const c = stops[index + 1];
    return `rgba(${Math.round(mix(a[0], c[0], local))},${Math.round(mix(a[1], c[1], local))},${Math.round(mix(a[2], c[2], local))},${clamp01(alpha)})`;
  }

  function bootEnergy(t) {
    if (t < timing.igniteStart) return 0;
    if (t < timing.ignitePeak) {
      return mix(0.08, energy.bootPeak, easeOut((t - timing.igniteStart) / (timing.ignitePeak - timing.igniteStart)));
    }
    if (t < timing.igniteSettle) {
      return mix(energy.bootPeak, energy.operating, easeInOut((t - timing.ignitePeak) / (timing.igniteSettle - timing.ignitePeak)));
    }
    return energy.operating;
  }

  function injectedEnergyAt(now) {
    if (!injectedDuration) return 0;
    const age = (now - injectedAt) / 1000;
    if (age >= injectedDuration) {
      injectedDuration = 0;
      return 0;
    }
    const n = age / injectedDuration;
    return injectedEnergy * Math.exp(-5.2 * n) * (0.82 + 0.18 * Math.cos(n * Math.PI * 7));
  }

  function state(now) {
    const t = (now - startedAt) / 1000;
    const travel = easeIn((t - timing.travelStart) / timing.travelDuration);
    const returning = easeOut((t - timing.returnStart) / timing.returnDuration);
    const wallOpen = easeInOut((t - timing.wallOpenStart) / timing.wallOpenDuration);
    const rearLock = pulse(t, timing.returnStart + timing.returnDuration, 0.25);
    const wallLock = pulse(t, timing.wallOpenStart + timing.wallOpenDuration, 0.32);
    const base = bootEnergy(t);
    return {
      t,
      travel,
      returning,
      wallOpen,
      energy: clamp01(base + rearLock * energy.rearLockPulse + wallLock * energy.wallLockPulse + injectedEnergyAt(now)),
      rearLock,
      wallLock,
      lab: mode === MODES.LAB ? easeOut((t - timing.done - timing.labDelay) / 0.55) : 0,
      done: t >= timing.done && injectedDuration === 0
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
    return Math.max(0, Math.floor((rearZ - geometry.near) / geometry.cell + 0.00001));
  }

  function finalHalfWidth() {
    return geometry.halfWidth + geometry.wallShiftCells * geometry.cell;
  }

  function visibleHalfWidth(s) {
    return geometry.halfWidth + geometry.wallShiftCells * geometry.cell * s.wallOpen;
  }

  function distanceAttenuation(z) {
    const final = geometry.near + geometry.finalDepthCells * geometry.cell;
    const ratio = final / Math.max(final, z);
    return clamp(Math.pow(ratio, 0.78), 0.018, 1);
  }

  function drawRearWall(ctx, z, visibleX, systemEnergy, alpha) {
    const { cell, halfHeight: Y } = geometry;
    const fullX = finalHalfWidth();
    const xCells = Math.round((fullX * 2) / cell);
    const yCells = Math.round((Y * 2) / cell);
    const attenuation = distanceAttenuation(z);
    const apparentEnergy = clamp01(systemEnergy * (0.28 + attenuation * 0.72));
    const style = palette(apparentEnergy, alpha * attenuation);
    const width = clamp(1.15 * Math.sqrt(attenuation), 0.32, 1.15);

    for (let ix = 0; ix <= xCells; ix++) {
      const x = -fullX + ix * cell;
      if (Math.abs(x) <= visibleX + 0.0001) line(ctx, [x, -Y, z], [x, Y, z], style, width);
    }
    for (let iy = 0; iy <= yCells; iy++) {
      const y = -Y + iy * cell;
      line(ctx, [-visibleX, y, z], [visibleX, y, z], style, width);
    }

    const ap = apertureAt(z, visibleX);
    if (ap.width < 7 || attenuation < 0.08) {
      const radius = clamp(1.2 + systemEnergy * 2.4, 1.2, 3.6);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = palette(clamp01(systemEnergy + 0.18), clamp01(alpha * (0.25 + attenuation * 2.5)));
      ctx.beginPath();
      ctx.arc(W / 2, centreY(), radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawHorizontalPlane(ctx, y, rearZ, visibleX, systemEnergy, alpha) {
    const { cell, near } = geometry;
    const fullX = finalHalfWidth();
    const style = palette(systemEnergy, alpha);
    const xCells = Math.round((fullX * 2) / cell);
    const steps = depthSteps(rearZ);
    for (let ix = 0; ix <= xCells; ix++) {
      const x = -fullX + ix * cell;
      if (Math.abs(x) <= visibleX + 0.0001) line(ctx, [x, y, near], [x, y, rearZ], style);
    }
    for (let iz = 0; iz <= steps; iz++) {
      const z = near + iz * cell;
      const fade = distanceAttenuation(z);
      line(ctx, [-visibleX, y, z], [visibleX, y, z], palette(systemEnergy * (0.45 + fade * 0.55), alpha * fade), clamp(0.45 + fade * 0.55, 0.45, 1));
    }
  }

  function drawSideWall(ctx, side, rearZ, visibleX, systemEnergy, alpha) {
    const { cell, halfHeight: Y, near } = geometry;
    const yCells = Math.round((Y * 2) / cell);
    const steps = depthSteps(rearZ);
    const x = side * visibleX;
    for (let iy = 0; iy <= yCells; iy++) {
      const y = -Y + iy * cell;
      line(ctx, [x, y, near], [x, y, rearZ], palette(systemEnergy, alpha));
    }
    for (let iz = 0; iz <= steps; iz++) {
      const z = near + iz * cell;
      const fade = distanceAttenuation(z);
      line(ctx, [x, -Y, z], [x, Y, z], palette(systemEnergy * (0.45 + fade * 0.55), alpha * fade), clamp(0.45 + fade * 0.55, 0.45, 1));
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
    const tl = project(-halfWidth, geometry.halfHeight, z);
    const br = project(halfWidth, -geometry.halfHeight, z);
    return { left: tl.x, top: tl.y, right: br.x, bottom: br.y, width: br.x - tl.x, height: br.y - tl.y };
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
    ctx.fillText(`SLICE ${String(index).padStart(2, '0')}  Z ${z.toFixed(2)}`, ap.left + 8, ap.top + 7);
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
    ctx.fillText(`S${sliceIndex} / ITEM ${String(itemIndex + 1).padStart(2, '0')}`, tl.x + Math.max(6, width * 0.035), tl.y + height * 0.32);
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
      drawPlaceholderBlock(ctx, sliceIndex, i, z, halfWidth, contentTop - i * lab.itemPitch - (sliceIndex - 1) * 0.08, alpha);
    }
    ctx.restore();
    if (lab.diagnostics) drawSliceFrame(ctx, z, sliceIndex, halfWidth, alpha);
  }

  function drawScrollLaboratory(ctx, s) {
    if (mode !== MODES.LAB || s.lab <= 0) return;
    const halfWidth = visibleHalfWidth(s);
    for (let index = geometry.sliceCount; index >= 1; index--) {
      drawSliceColumn(ctx, index, geometry.near + index * geometry.cell, halfWidth, s.lab);
    }
    ctx.fillStyle = `rgba(255,90,68,${0.48 * s.lab})`;
    ctx.font = '11px monospace';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`SHARED SCROLL ${lab.scroll.toFixed(2)} / ${lab.maxScroll.toFixed(2)}   ·   6 DEPTH CELLS`, 14, H - 14);
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
      drawChamber(b, s, 0.045 + 0.105 * s.energy);
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
    injectedDuration = 0;
    lab.scroll = 0;
    lab.targetScroll = 0;
    requestDraw();
  }

  function injectEnergy(amount = 0.15, duration = 0.55) {
    if (mode === MODES.OFF) return;
    injectedEnergy = clamp(amount, 0, 0.5);
    injectedDuration = Math.max(0.08, duration);
    injectedAt = performance.now();
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
      button.textContent = mode === MODES.OFF ? 'Chamber: Off' : mode === MODES.BACKGROUND ? 'Chamber: Background' : 'Chamber: Lab';
      button.title = 'Click to change mode. Shift-click to restart the current chamber.';
    }
  }

  function clearDocumentState() {
    pageRoot.classList.remove('layered-chamber-mode', 'layered-chamber-background-mode', 'layered-chamber-lab-mode');
    delete pageRoot.dataset.chamberMode;
    const button = toggle();
    if (button) {
      button.setAttribute('aria-pressed', 'false');
      button.textContent = 'Chamber: Off';
      button.title = 'Click to enable the chamber background.';
    }
  }

  function setMode(nextMode, options = {}) {
    const { persist = true, restartAnimation = true } = options;
    if (!isMode(nextMode)) throw new TypeError(`Unknown chamber mode: ${nextMode}`);
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

  function nextMode() {
    if (mode === MODES.OFF) return MODES.BACKGROUND;
    if (mode === MODES.BACKGROUND) return MODES.LAB;
    return MODES.OFF;
  }

  function handleToggle(event) {
    if (event.shiftKey && mode !== MODES.OFF) restart();
    else setMode(nextMode());
  }

  function init() {
    toggle()?.addEventListener('click', handleToggle);
    const stored = localStorage.getItem(STORAGE_KEY);
    const initialMode = stored === 'on' ? MODES.LAB : isMode(stored) ? stored : MODES.OFF;
    setMode(initialMode, { persist: false, restartAnimation: initialMode !== MODES.OFF });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

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
    injectEnergy,
    toggleDiagnostics: () => {
      lab.diagnostics = !lab.diagnostics;
      requestDraw();
    }
  };
})();