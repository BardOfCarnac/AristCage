/* Geometry-only boot chamber built from five persistent planes. */
window.LayeredChamber = (() => {
  const KEY = 'ncn-layered-chamber';
  const root = document.documentElement;

  const geometry = {
    cell: 0.5,
    near: 2.5,
    initialDepthCells: 2,
    finalDepthCells: 12,
    infinityDepthCells: 120,
    focal: 0.84,
    halfWidth: 3,
    halfHeight: 2.5,
    wallShiftCells: 4
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
  const snapCells = value => Math.max(geometry.cell, Math.round(value / geometry.cell) * geometry.cell);

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

  function fitGeometryToViewport() {
    const focal = Math.min(W, H) * geometry.focal;
    const centreY = H * 0.53;

    // Fit the NEAR rim to the viewport. The rear wall is therefore inset by
    // two full cells of depth and all four surrounding planes remain visible.
    const targetNearHalfWidthPx = Math.max(1, W * 0.485);
    const targetNearHalfHeightPx = Math.max(
      1,
      Math.min(centreY - 12, H - centreY - 12)
    );

    geometry.halfWidth = snapCells(targetNearHalfWidthPx * geometry.near / focal);
    geometry.halfHeight = snapCells(targetNearHalfHeightPx * geometry.near / focal);

    // Keep the translated side walls just inside the screen at their NEAR
    // edge. This prevents them disappearing while still opening the room wide.
    const targetOpenNearHalfWidth = snapCells((W * 0.455) * geometry.near / focal);
    geometry.wallShiftCells = Math.max(
      1,
      Math.round((targetOpenNearHalfWidth - geometry.halfWidth) / geometry.cell)
    );
  }

  function resize() {
    ensure();
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
    return {
      t,
      energy: easeOut((t - timing.igniteStart) / timing.igniteDuration),
      travel: easeInOut((t - timing.travelStart) / timing.travelDuration),
      returning: easeOut((t - timing.returnStart) / timing.returnDuration),
      wallOpen: easeInOut((t - timing.wallOpenStart) / timing.wallOpenDuration),
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
    return Math.max(0, Math.floor((rearZ - geometry.near) / geometry.cell + 0.00001));
  }

  function drawRearWall(ctx, z, openedColumns, energy, alpha) {
    const { cell, halfWidth: X, halfHeight: Y } = geometry;
    const expandedX = X + openedColumns * cell;
    const xCells = Math.round((expandedX * 2) / cell);
    const yCells = Math.round((Y * 2) / cell);
    const style = colour(energy, alpha);

    // The original panel remains the centre of a wider, continuous back wall.
    // Every revealed section is a complete square column.
    for (let ix = 0; ix <= xCells; ix++) {
      const x = -expandedX + ix * cell;
      line(ctx, [x, -Y, z], [x, Y, z], style, 1.05);
    }
    for (let iy = 0; iy <= yCells; iy++) {
      const y = -Y + iy * cell;
      line(ctx, [-expandedX, y, z], [expandedX, y, z], style, 1.05);
    }
  }

  function drawHorizontalPlane(ctx, y, rearZ, openedColumns, energy, alpha) {
    const { cell, halfWidth: X, near } = geometry;
    const style = colour(energy, alpha);
    const expandedX = X + openedColumns * cell;
    const xCells = Math.round((expandedX * 2) / cell);
    const steps = depthSteps(rearZ);

    for (let ix = 0; ix <= xCells; ix++) {
      const x = -expandedX + ix * cell;
      line(ctx, [x, y, near], [x, y, rearZ], style);
    }
    for (let iz = 0; iz <= steps; iz++) {
      const z = near + iz * cell;
      line(ctx, [-expandedX, y, z], [expandedX, y, z], style);
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
    const totalShift = geometry.wallShiftCells * geometry.cell;
    const shift = totalShift * s.wallOpen;
    const openedColumns = Math.min(
      geometry.wallShiftCells,
      Math.floor(geometry.wallShiftCells * s.wallOpen + 0.00001)
    );

    drawRearWall(ctx, rearZ, openedColumns, s.energy, alpha * 1.2);
    drawHorizontalPlane(ctx, -geometry.halfHeight, rearZ, openedColumns, s.energy, alpha);
    drawHorizontalPlane(ctx, geometry.halfHeight, rearZ, openedColumns, s.energy, alpha);
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