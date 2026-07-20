/* Geometry-only boot chamber built from five persistent planes. */
window.LayeredChamber = (() => {
  const KEY = 'ncn-layered-chamber';
  const root = document.documentElement;

  const geometry = {
    cell: 0.5,
    halfWidth: 3,
    halfHeight: 2.5,
    near: 2.5,
    initialDepthCells: 2,
    finalDepthCells: 12,
    infinityDepthCells: 120,
    wallShiftCells: 4,
    focal: 0.84
  };

  const timing = {
    hold: 0.65,
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

  let enabled = false;
  let bg, fg, b, g;
  let W = 0, H = 0, DPR = 1, raf = 0;
  let startedAt = 0;

  const toggle = () => document.querySelector('#layered-chamber-toggle');
  const clamp01 = value => Math.max(0, Math.min(1, value));
  const mix = (a, c, t) => a + (c - a) * t;
  const easeOut = t => 1 - Math.pow(1 - clamp01(t), 3);
  const easeInOut = t => {
    const n = clamp01(t);
    return n < 0.5 ? 4 * n * n * n : 1 - Math.pow(-2 * n + 2, 3) / 2;
  };

  function makeCanvas(id) {
    const canvas = document.createElement('canvas');
    canvas.id = id;
    canvas.className = 'layered-chamber-canvas';
    document.body.prepend(canvas);
    return canvas;
  }

  function ensure() {
    if (bg) return;
    bg = makeCanvas('layered-chamber-bg');
    fg = makeCanvas('layered-chamber-fg');
    b = bg.getContext('2d');
    g = fg.getContext('2d');
  }

  function resize() {
    ensure();
    DPR = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth;
    H = innerHeight;
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
    const focal = Math.min(W, H) * geometry.focal;
    return {
      x: W / 2 + x * focal / z,
      y: H * 0.53 - y * focal / z
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
    const energy = easeOut((t - timing.igniteStart) / timing.igniteDuration);
    const travel = easeInOut((t - timing.travelStart) / timing.travelDuration);
    const returning = easeOut((t - timing.returnStart) / timing.returnDuration);
    const wallOpen = easeInOut((t - timing.wallOpenStart) / timing.wallOpenDuration);
    return { t, energy, travel, returning, wallOpen, done: t >= timing.done };
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

  function drawRearWall(ctx, z, energy, alpha) {
    const { cell, halfWidth: X, halfHeight: Y } = geometry;
    const xCells = Math.round((X * 2) / cell);
    const yCells = Math.round((Y * 2) / cell);
    const style = colour(energy, alpha);

    for (let ix = 0; ix <= xCells; ix++) {
      const x = -X + ix * cell;
      line(ctx, [x, -Y, z], [x, Y, z], style, 1.05);
    }
    for (let iy = 0; iy <= yCells; iy++) {
      const y = -Y + iy * cell;
      line(ctx, [-X, y, z], [X, y, z], style, 1.05);
    }
  }

  function drawFloor(ctx, rearZ, energy, alpha) {
    const { cell, halfWidth: X, halfHeight: Y, near } = geometry;
    const style = colour(energy, alpha);
    const xCells = Math.round((X * 2) / cell);
    const steps = depthSteps(rearZ);

    for (let ix = 0; ix <= xCells; ix++) {
      const x = -X + ix * cell;
      line(ctx, [x, -Y, near], [x, -Y, rearZ], style);
    }
    for (let iz = 0; iz <= steps; iz++) {
      const z = near + iz * cell;
      line(ctx, [-X, -Y, z], [X, -Y, z], style);
    }
  }

  function drawCeiling(ctx, rearZ, energy, alpha) {
    const { cell, halfWidth: X, halfHeight: Y, near } = geometry;
    const style = colour(energy, alpha);
    const xCells = Math.round((X * 2) / cell);
    const steps = depthSteps(rearZ);

    for (let ix = 0; ix <= xCells; ix++) {
      const x = -X + ix * cell;
      line(ctx, [x, Y, near], [x, Y, rearZ], style);
    }
    for (let iz = 0; iz <= steps; iz++) {
      const z = near + iz * cell;
      line(ctx, [-X, Y, z], [X, Y, z], style);
    }
  }

  function drawSideWall(ctx, side, rearZ, shift, energy, alpha) {
    const { cell, halfWidth: X, halfHeight: Y, near } = geometry;
    const style = colour(energy, alpha);
    const yCells = Math.round((Y * 2) / cell);
    const steps = depthSteps(rearZ);
    const x = side * (X + shift);

    for (let iy = 0; iy <= yCells; iy++) {
      const y = -Y + iy * cell;
      line(ctx, [x, y, near], [x, y, rearZ], style);
    }
    for (let iz = 0; iz <= steps; iz++) {
      const z = near + iz * cell;
      line(ctx, [x, -Y, z], [x, Y, z], style);
    }
  }

  function drawScene(ctx, s, alpha) {
    const rearZ = rearDepth(s);
    const shift = geometry.wallShiftCells * geometry.cell * s.wallOpen;

    drawRearWall(ctx, rearZ, s.energy, alpha * 1.2);
    drawFloor(ctx, rearZ, s.energy, alpha);
    drawCeiling(ctx, rearZ, s.energy, alpha);
    drawSideWall(ctx, -1, rearZ, shift, s.energy, alpha);
    drawSideWall(ctx, 1, rearZ, shift, s.energy, alpha);
  }

  function draw(now = performance.now()) {
    raf = 0;
    if (!enabled || !W) return;

    b.clearRect(0, 0, W, H);
    g.clearRect(0, 0, W, H);

    const s = state(now);
    drawScene(b, s, 0.34);

    if (s.energy > 0) {
      g.globalCompositeOperation = 'lighter';
      drawScene(g, s, 0.085 * s.energy);
      g.globalCompositeOperation = 'source-over';
    }

    if (!s.done) requestDraw();
  }

  function requestDraw() {
    if (enabled && !raf) raf = requestAnimationFrame(draw);
  }

  function restart() {
    startedAt = performance.now();
    requestDraw();
  }

  function set(on, persist = true) {
    enabled = on;
    root.classList.toggle('layered-chamber-mode', on);
    const button = toggle();
    if (button) {
      button.setAttribute('aria-pressed', String(on));
      button.textContent = on ? 'Restart Chamber' : 'Chamber Off';
    }
    if (persist) localStorage.setItem(KEY, on ? 'on' : 'off');

    if (on) {
      ensure();
      resize();
      restart();
    } else {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      b?.clearRect(0, 0, W, H);
      g?.clearRect(0, 0, W, H);
    }
  }

  function init() {
    ensure();
    toggle()?.addEventListener('click', () => enabled ? restart() : set(true));
    addEventListener('resize', resize, { passive: true });
    set(localStorage.getItem(KEY) === 'on', false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  return {
    enable: () => set(true),
    disable: () => set(false),
    restart,
    isEnabled: () => enabled,
    refresh: requestDraw
  };
})();