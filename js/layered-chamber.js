/* Optional exact-lattice layered chamber mode. */
window.LayeredChamber = (() => {
  const KEY = 'ncn-layered-chamber';
  const root = document.documentElement;
  const geometry = {
    cell: 0.5,
    halfWidth: 3,
    halfHeight: 2.5,
    near: 2.5,
    far: 8.5,
    focal: 0.84
  };
  const layerDepths = {
    headline: 2.75,
    meta: 3.25,
    tags: 3.25,
    priority: 3.75,
    corners: 4.25,
    frame: 4.75
  };

  let enabled = false;
  let bg, fg, b, g;
  let W = 0, H = 0, DPR = 1, raf = 0;
  let viewerX = 0, viewerY = 0;

  const feed = () => document.querySelector('#feed');
  const toggle = () => document.querySelector('#layered-chamber-toggle');
  const entries = () => [...(feed()?.querySelectorAll('.entry:not(.panel)') || [])];

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
      canvas.width = W * DPR;
      canvas.height = H * DPR;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      canvas.getContext('2d').setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    requestDraw();
  }

  function project(x, y, z) {
    const focal = Math.min(W, H) * geometry.focal;
    return {
      x: W / 2 + (x - viewerX) * focal / z,
      y: H * 0.53 - (y - viewerY) * focal / z
    };
  }

  function opening(z) {
    const tl = project(-geometry.halfWidth, geometry.halfHeight, z);
    const br = project(geometry.halfWidth, -geometry.halfHeight, z);
    return { left: tl.x, top: tl.y, right: br.x, bottom: br.y };
  }

  function stroke(ctx, a, c, alpha = 0.24, width = 1) {
    const A = project(...a);
    const C = project(...c);
    ctx.strokeStyle = `rgba(214,38,48,${alpha})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(C.x, C.y);
    ctx.stroke();
  }

  function drawExactLattice(ctx, z0, z1, alpha) {
    const { cell, halfWidth: X, halfHeight: Y } = geometry;
    const xCells = Math.round((X * 2) / cell);
    const yCells = Math.round((Y * 2) / cell);
    const zCells = Math.round((z1 - z0) / cell);

    // Longitudinal lines: every edge belongs to one complete row of square cells.
    for (let ix = 0; ix <= xCells; ix++) {
      const x = -X + ix * cell;
      stroke(ctx, [x, -Y, z0], [x, -Y, z1], alpha);
      stroke(ctx, [x,  Y, z0], [x,  Y, z1], alpha);
    }
    for (let iy = 0; iy <= yCells; iy++) {
      const y = -Y + iy * cell;
      stroke(ctx, [-X, y, z0], [-X, y, z1], alpha);
      stroke(ctx, [ X, y, z0], [ X, y, z1], alpha);
    }

    // Cross-rings: integer z steps only; no stretched remainder at the rear.
    for (let iz = 0; iz <= zCells; iz++) {
      const z = z0 + iz * cell;
      stroke(ctx, [-X, -Y, z], [ X, -Y, z], alpha);
      stroke(ctx, [ X, -Y, z], [ X,  Y, z], alpha);
      stroke(ctx, [ X,  Y, z], [-X,  Y, z], alpha);
      stroke(ctx, [-X,  Y, z], [-X, -Y, z], alpha);
    }

    // Rear panel: same cell size and exact integer dimensions as every other surface.
    const z = z1;
    for (let ix = 0; ix <= xCells; ix++) {
      const x = -X + ix * cell;
      stroke(ctx, [x, -Y, z], [x, Y, z], alpha * 1.35);
    }
    for (let iy = 0; iy <= yCells; iy++) {
      const y = -Y + iy * cell;
      stroke(ctx, [-X, y, z], [X, y, z], alpha * 1.35);
    }
  }

  function clipPart(part, z) {
    const aperture = opening(z);
    const rect = part.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const top = Math.max(0, aperture.top - rect.top);
    const right = Math.max(0, rect.right - aperture.right);
    const bottom = Math.max(0, rect.bottom - aperture.bottom);
    const left = Math.max(0, aperture.left - rect.left);

    part.style.setProperty('--lc-clip', `inset(${top.toFixed(2)}px ${right.toFixed(2)}px ${bottom.toFixed(2)}px ${left.toFixed(2)}px)`);

    const reference = layerDepths.headline;
    const relativeScale = reference / z;
    const dx = viewerX * Math.min(W, H) * geometry.focal * (1 / reference - 1 / z);
    const dy = -viewerY * Math.min(W, H) * geometry.focal * (1 / reference - 1 / z);
    part.style.setProperty('--lc-scale', relativeScale.toFixed(4));
    part.style.setProperty('--lc-x', `${dx.toFixed(2)}px`);
    part.style.setProperty('--lc-y', `${dy.toFixed(2)}px`);
  }

  function applyLayerGeometry() {
    for (const entry of entries()) {
      for (const [name, z] of Object.entries(layerDepths)) {
        const part = entry.querySelector(`.${name}`);
        if (part) clipPart(part, z);
      }
    }
  }

  function clearLayerGeometry() {
    for (const entry of entries()) {
      entry.querySelectorAll('.frame,.corners,.priority,.meta,.tags,.headline').forEach(part => {
        part.style.removeProperty('--lc-clip');
        part.style.removeProperty('--lc-scale');
        part.style.removeProperty('--lc-x');
        part.style.removeProperty('--lc-y');
      });
    }
  }

  function draw() {
    raf = 0;
    if (!enabled || !W) return;
    b.clearRect(0, 0, W, H);
    g.clearRect(0, 0, W, H);

    // Rear chamber and deeper walls.
    drawExactLattice(b, 4.5, geometry.far, 0.18);

    // Near wall section. Its ceiling/floor/side lines sit in front of deeper article planes.
    drawExactLattice(g, geometry.near, 4.5, 0.34);

    applyLayerGeometry();
  }

  function requestDraw() {
    if (enabled && !raf) raf = requestAnimationFrame(draw);
  }

  function set(on, persist = true) {
    enabled = on;
    root.classList.toggle('layered-chamber-mode', on);
    const button = toggle();
    if (button) {
      button.setAttribute('aria-pressed', String(on));
      button.textContent = on ? 'Chamber On' : 'Chamber Off';
    }
    if (persist) localStorage.setItem(KEY, on ? 'on' : 'off');
    if (on) {
      ensure();
      resize();
    } else {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      clearLayerGeometry();
      b?.clearRect(0, 0, W, H);
      g?.clearRect(0, 0, W, H);
    }
  }

  function pointer(event) {
    if (!enabled) return;
    viewerX = ((event.clientX / W) - 0.5) * 0.5;
    viewerY = ((event.clientY / H) - 0.5) * 0.36;
    requestDraw();
  }

  function init() {
    ensure();
    toggle()?.addEventListener('click', () => set(!enabled));
    addEventListener('resize', resize, { passive: true });
    addEventListener('scroll', requestDraw, { passive: true });
    addEventListener('pointermove', pointer, { passive: true });
    new MutationObserver(requestDraw).observe(feed(), {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
    set(localStorage.getItem(KEY) === 'on', false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  return { enable: () => set(true), disable: () => set(false), isEnabled: () => enabled, refresh: requestDraw };
})();