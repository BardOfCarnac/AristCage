/* Geometry-only boot chamber. Article cards remain hidden while this mode is active. */
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
    greyHold: 700,
    ignite: 520,
    infinity: 1450,
    snapHold: 380,
    walls: 1200
  };

  let enabled = false;
  let bg, fg, b, g;
  let W = 0, H = 0, DPR = 1, raf = 0;
  let startedAt = 0;

  const toggle = () => document.querySelector('#layered-chamber-toggle');

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

  const clamp01 = value => Math.max(0, Math.min(1, value));
  const mix = (a, c, t) => a + (c - a) * t;
  const ease = t => 1 - Math.pow(1 - clamp01(t), 3);

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

  function colour(redness, alpha) {
    const r = Math.round(mix(122, 255, redness));
    const green = Math.round(mix(130, 28, redness));
    const blue = Math.round(mix(137, 38, redness));
    return `rgba(${r},${green},${blue},${alpha})`;
  }

  function drawRearPanel(ctx, far, halfWidth, redness, alpha) {
    const { cell, halfHeight: Y } = geometry;
    const xCells = Math.round((halfWidth * 2) / cell);
    const yCells = Math.round((Y * 2) / cell);
    const style = colour(redness, alpha);

    for (let ix = 0; ix <= xCells; ix++) {
      const x = -halfWidth + ix * cell;
      line(ctx, [x, -Y, far], [x, Y, far], style, 1.05);
    }
    for (let iy = 0; iy <= yCells; iy++) {
      const y = -Y + iy * cell;
      line(ctx, [-halfWidth, y, far], [halfWidth, y, far], style, 1.05);
    }
  }

  function drawTunnel(ctx, near, far, nearHalfWidth, farHalfWidth, redness, alpha, drawRear) {
    const { cell, halfHeight: Y } = geometry;
    const zCells = Math.max(1, Math.round((far - near) / cell));
    const yCells = Math.round((Y * 2) / cell);
    const style = colour(redness, alpha);

    // Depth rails on floor and ceiling. Width changes only by revealing exact columns.
    const maxHalfWidth = Math.max(nearHalfWidth, farHalfWidth);
    const xCells = Math.round((maxHalfWidth * 2) / cell);
    for (let ix = 0; ix <= xCells; ix++) {
      const x = -maxHalfWidth + ix * cell;
      if (Math.abs(x) <= nearHalfWidth + 0.0001 && Math.abs(x) <= farHalfWidth + 0.0001) {
        line(ctx, [x, -Y, near], [x, -Y, far], style);
        line(ctx, [x, Y, near], [x, Y, far], style);
      }
    }

    // Side-wall horizontal rails.
    for (let iy = 0; iy <= yCells; iy++) {
      const y = -Y + iy * cell;
      line(ctx, [-nearHalfWidth, y, near], [-farHalfWidth, y, far], style);
      line(ctx, [nearHalfWidth, y, near], [farHalfWidth, y, far], style);
    }

    // Integer depth rings. There is never a stretched remainder cell.
    for (let iz = 0; iz <= zCells; iz++) {
      const z = near + iz * cell;
      const t = zCells ? iz / zCells : 0;
      const X = mix(nearHalfWidth, farHalfWidth, t);
      line(ctx, [-X, -Y, z], [X, -Y, z], style);
      line(ctx, [X, -Y, z], [X, Y, z], style);
      line(ctx, [X, Y, z], [-X, Y, z], style);
      line(ctx, [-X, Y, z], [-X, -Y, z], style);
    }

    if (drawRear) drawRearPanel(ctx, far, farHalfWidth, redness, alpha * 1.35);
  }

  function phase(now) {
    const t = now - startedAt;
    const a = timing.greyHold;
    const b0 = a + timing.ignite;
    const c = b0 + timing.infinity;
    const d = c + timing.snapHold;
    const e = d + timing.walls;

    if (t < a) return { name: 'grey', p: t / timing.greyHold };
    if (t < b0) return { name: 'ignite', p: (t - a) / timing.ignite };
    if (t < c) return { name: 'infinity', p: (t - b0) / timing.infinity };
    if (t < d) return { name: 'snap', p: (t - c) / timing.snapHold };
    if (t < e) return { name: 'walls', p: (t - d) / timing.walls };
    return { name: 'done', p: 1 };
  }

  function draw(now = performance.now()) {
    raf = 0;
    if (!enabled || !W) return;

    b.clearRect(0, 0, W, H);
    g.clearRect(0, 0, W, H);

    const state = phase(now);
    const initialFar = geometry.near + geometry.initialDepthCells * geometry.cell;
    const finalFar = geometry.near + geometry.finalDepthCells * geometry.cell;
    const infinityFar = geometry.near + geometry.infinityDepthCells * geometry.cell;
    const finalHalfWidth = geometry.halfWidth + geometry.wallShiftCells * geometry.cell;

    let far = initialFar;
    let redness = 0;
    let nearHalfWidth = geometry.halfWidth;
    let farHalfWidth = geometry.halfWidth;
    let drawRear = true;

    if (state.name === 'ignite') {
      redness = ease(state.p);
    } else if (state.name === 'infinity') {
      redness = 1;
      far = mix(initialFar, infinityFar, ease(state.p));
      drawRear = false;
    } else if (state.name === 'snap') {
      redness = 1;
      far = finalFar;
    } else if (state.name === 'walls' || state.name === 'done') {
      redness = 1;
      far = finalFar;
      const shift = state.name === 'done' ? 1 : ease(state.p);
      nearHalfWidth = mix(geometry.halfWidth, finalHalfWidth, shift);
      farHalfWidth = mix(geometry.halfWidth, finalHalfWidth, shift);
    }

    drawTunnel(b, geometry.near, far, nearHalfWidth, farHalfWidth, redness, 0.34, drawRear);

    if (redness > 0) {
      g.globalCompositeOperation = 'lighter';
      drawTunnel(g, geometry.near, far, nearHalfWidth, farHalfWidth, redness, 0.09 * redness, false);
      g.globalCompositeOperation = 'source-over';
    }

    if (state.name !== 'done') requestDraw();
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