/* Optional chamber subsystem with explicit lifecycle, modes, optical energy, and live feed projection. */
window.LayeredChamber = (() => {
  const STORAGE_KEY = 'ncn-layered-chamber';
  const ROOT_ID = 'layered-chamber-system';
  const MODES = Object.freeze({ OFF: 'off', BACKGROUND: 'background', LAB: 'lab' });

  const geometry = {
    cell: 0.5,
    near: 2.5,
    initialDepthCells: 2,
    finalDepthCells: 12,
    infinityDepthCells: 1000,
    focal: 0.84,
    halfWidth: 3,
    halfHeight: 2.5,
    wallShiftCells: 2,
    articleDepthStep: 0.72
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
    operating: 0.64,
    bootPeak: 1,
    rearLockPulse: 0.24,
    wallLockPulse: 0.14
  };

  const lab = {
    scroll: 0,
    targetScroll: 0,
    maxScroll: 0,
    dragging: false,
    lastTouchY: 0,
    diagnostics: false,
    articlePitch: 1.16,
    articleHeight: 0.86
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
  let feedObserver = null;

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
  const snapCells = value => Math.max(geometry.cell, Math.round(value / geometry.cell) * geometry.cell);

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

  function observeFeed() {
    const feed = document.querySelector('#feed');
    if (!feed || feedObserver) return;
    feedObserver = new MutationObserver(() => {
      updateScrollRange();
      requestDraw();
    });
    feedObserver.observe(feed, { childList: true, subtree: true, characterData: true, attributes: true });
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
    observeFeed();
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
    feedObserver?.disconnect();
    feedObserver = null;
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
    updateScrollRange();
    requestDraw();
  }

  function project(x, y, z) {
    const focal = focalLength();
    return { x: W / 2 + x * focal / z, y: centreY() - y * focal / z };
  }

  function palette(value, alpha) {
    const stops = [[38,2,6],[104,5,12],[176,10,18],[244,24,24],[255,66,32]];
    const scaled = clamp01(value) * (stops.length - 1);
    const index = Math.min(stops.length - 2, Math.floor(scaled));
    const local = scaled - index;
    const a = stops[index];
    const c = stops[index + 1];
    return `rgba(${Math.round(mix(a[0],c[0],local))},${Math.round(mix(a[1],c[1],local))},${Math.round(mix(a[2],c[2],local))},${clamp01(alpha)})`;
  }

  function bootEnergy(t) {
    if (t < timing.igniteStart) return 0;
    if (t < timing.ignitePeak) return mix(0.08, energy.bootPeak, easeOut((t - timing.igniteStart) / (timing.ignitePeak - timing.igniteStart)));
    if (t < timing.igniteSettle) return mix(energy.bootPeak, energy.operating, easeInOut((t - timing.ignitePeak) / (timing.igniteSettle - timing.ignitePeak)));
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

  function finalHalfWidth() {
    return geometry.halfWidth + geometry.wallShiftCells * geometry.cell;
  }

  function visibleHalfWidth(s) {
    return geometry.halfWidth + geometry.wallShiftCells * geometry.cell * s.wallOpen;
  }

  function apertureAt(z, halfWidth) {
    const tl = project(-halfWidth, geometry.halfHeight, z);
    const br = project(halfWidth, -geometry.halfHeight, z);
    return { left: tl.x, top: tl.y, right: br.x, bottom: br.y, width: br.x - tl.x, height: br.y - tl.y };
  }

  function opticalProfile(z, energyLevel, alpha = 1) {
    const zRatio = geometry.near / Math.max(geometry.near, z);
    const apparentCell = geometry.cell * focalLength() / z;
    const resolve = clamp01((apparentCell - 0.32) / 2.4);
    const contrast = clamp(Math.pow(zRatio, 0.42), 0.012, 1);
    return {
      resolve,
      brightness: clamp01(energyLevel * (0.22 + contrast * 0.78)),
      opacity: clamp01(alpha * Math.pow(contrast, 1.28) * (0.22 + resolve * 0.78)),
      width: clamp(0.2 + 1.25 * Math.pow(contrast, 0.72), 0.2, 1.45)
    };
  }

  function resolutionStride(z) {
    const apparentCell = geometry.cell * focalLength() / z;
    if (apparentCell >= 5) return 1;
    if (apparentCell >= 2.5) return 2;
    if (apparentCell >= 1.25) return 4;
    if (apparentCell >= 0.62) return 8;
    if (apparentCell >= 0.31) return 16;
    return Infinity;
  }

  function opticalLine(ctx, a, c, energyLevel, alpha, widthScale = 1) {
    const midpointZ = (a[2] + c[2]) * 0.5;
    const p = opticalProfile(midpointZ, energyLevel, alpha);
    if (p.opacity < 0.006) return;
    const A = project(a[0], a[1], a[2]);
    const C = project(c[0], c[1], c[2]);
    ctx.strokeStyle = palette(p.brightness, p.opacity);
    ctx.lineWidth = p.width * widthScale;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(C.x, C.y);
    ctx.stroke();
  }

  function opticalDepthLine(ctx, x, y, nearZ, farZ, energyLevel, alpha, widthScale = 1) {
    for (let z = nearZ; z < farZ - 0.0001; z += geometry.cell) {
      opticalLine(ctx, [x, y, z], [x, y, Math.min(farZ, z + geometry.cell)], energyLevel, alpha, widthScale);
    }
  }

  function drawRearWall(ctx, z, visibleX, systemEnergy, alpha) {
    const { cell, halfHeight: Y } = geometry;
    const fullX = finalHalfWidth();
    const xCells = Math.round((fullX * 2) / cell);
    const yCells = Math.round((Y * 2) / cell);
    const profile = opticalProfile(z, systemEnergy, alpha);
    const stride = resolutionStride(z);
    if (Number.isFinite(stride)) {
      for (let ix = 0; ix <= xCells; ix += stride) {
        const x = -fullX + ix * cell;
        if (Math.abs(x) <= visibleX + 0.0001) opticalLine(ctx, [x,-Y,z], [x,Y,z], systemEnergy, alpha, 1.04);
      }
      for (let iy = 0; iy <= yCells; iy += stride) {
        const y = -Y + iy * cell;
        opticalLine(ctx, [-visibleX,y,z], [visibleX,y,z], systemEnergy, alpha, 1.04);
      }
    }
    const ap = apertureAt(z, visibleX);
    if (!Number.isFinite(stride) || ap.width < 8 || profile.resolve < 0.12) {
      const unresolved = clamp01(1 - profile.resolve);
      const radius = clamp(0.7 + unresolved * 2.8 + systemEnergy * 0.8, 0.7, 4.2);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = palette(clamp01(systemEnergy + 0.22), clamp01(alpha * (0.18 + unresolved * 0.62)));
      ctx.beginPath();
      ctx.arc(W / 2, centreY(), radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawHorizontalPlane(ctx, y, rearZ, visibleX, systemEnergy, alpha) {
    const { cell, near } = geometry;
    const fullX = finalHalfWidth();
    const xCells = Math.round((fullX * 2) / cell);
    for (let ix = 0; ix <= xCells; ix++) {
      const x = -fullX + ix * cell;
      if (Math.abs(x) <= visibleX + 0.0001) opticalDepthLine(ctx, x, y, near, rearZ, systemEnergy, alpha, 0.92);
    }
    for (let z = near, index = 0; z <= rearZ + 0.0001; z += cell, index++) {
      const stride = resolutionStride(z);
      if (!Number.isFinite(stride) || index % stride !== 0) continue;
      opticalLine(ctx, [-visibleX,y,z], [visibleX,y,z], systemEnergy, alpha, 0.9);
    }
  }

  function drawSideWall(ctx, side, rearZ, visibleX, systemEnergy, alpha) {
    const { cell, halfHeight: Y, near } = geometry;
    const yCells = Math.round((Y * 2) / cell);
    const x = side * visibleX;
    for (let iy = 0; iy <= yCells; iy++) opticalDepthLine(ctx, x, -Y + iy * cell, near, rearZ, systemEnergy, alpha, 0.92);
    for (let z = near, index = 0; z <= rearZ + 0.0001; z += cell, index++) {
      const stride = resolutionStride(z);
      if (!Number.isFinite(stride) || index % stride !== 0) continue;
      opticalLine(ctx, [x,-Y,z], [x,Y,z], systemEnergy, alpha, 0.9);
    }
  }

  function drawChamber(ctx, s, alpha) {
    const rearZ = rearDepth(s);
    const visibleX = visibleHalfWidth(s);
    drawRearWall(ctx, rearZ, visibleX, s.energy, alpha * 1.2);
    drawHorizontalPlane(ctx, -geometry.halfHeight, rearZ, visibleX, s.energy, alpha);
    drawHorizontalPlane(ctx, geometry.halfHeight, rearZ, visibleX, s.energy, alpha * 0.92);
    drawSideWall(ctx, -1, rearZ, visibleX, s.energy, alpha * 0.96);
    drawSideWall(ctx, 1, rearZ, visibleX, s.energy, alpha * 0.96);
  }

  function textOf(node, selector) {
    return node.querySelector(selector)?.textContent?.trim().replace(/\s+/g, ' ') || '';
  }

  function liveArticles() {
    return [...document.querySelectorAll('#feed .entry:not(.panel)')]
      .filter(node => getComputedStyle(node).display !== 'none')
      .map((node, index) => ({
        id: node.dataset.entryId || `entry-${index}`,
        headline: textOf(node, '.headline'),
        meta: textOf(node, '.meta'),
        tags: textOf(node, '.tags'),
        body: textOf(node, '.body'),
        priority: Number((node.querySelector('.priority')?.className.match(/priority-(\d+)/) || [])[1]) || 1,
        expanded: node.classList.contains('expanded')
      }))
      .filter(article => article.headline || article.meta || article.body);
  }

  function wrapText(ctx, text, maxWidth, maxLines) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth || !line) line = test;
      else {
        lines.push(line);
        line = word;
        if (lines.length >= maxLines) break;
      }
    }
    if (lines.length < maxLines && line) lines.push(line);
    if (lines.length === maxLines && words.length && ctx.measureText(lines[lines.length - 1]).width > maxWidth * 0.92) {
      lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, -1)}…`;
    }
    return lines;
  }

  function drawArticle(ctx, article, index, z, halfWidth, worldY, alpha) {
    const inset = geometry.cell * 1.05;
    const heightWorld = article.expanded ? lab.articleHeight * 1.55 : lab.articleHeight;
    const tl = project(-halfWidth + inset, worldY, z);
    const br = project(halfWidth - inset, worldY - heightWorld, z);
    const width = br.x - tl.x;
    const height = br.y - tl.y;
    if (br.y < -60 || tl.y > H + 60 || width < 24 || height < 12) return;

    const p = opticalProfile(z, 0.88, alpha);
    const priorityStrength = clamp01(0.42 + article.priority * 0.1);
    ctx.fillStyle = `rgba(8,0,2,${0.58 * p.opacity})`;
    ctx.fillRect(tl.x, tl.y, width, height);
    ctx.strokeStyle = palette(0.68, 0.78 * p.opacity);
    ctx.lineWidth = Math.max(0.6, p.width * 0.82);
    ctx.strokeRect(tl.x, tl.y, width, height);

    const railWidth = Math.max(2, width * 0.012);
    ctx.fillStyle = palette(priorityStrength, 0.95 * p.opacity);
    ctx.fillRect(tl.x, tl.y, railWidth, height);

    const padX = Math.max(8, width * 0.035);
    const contentX = tl.x + railWidth + padX;
    const contentWidth = width - railWidth - padX * 2;
    const metaSize = clamp(height * 0.095, 7, 11);
    const headlineSize = clamp(height * 0.17, 10, 22);
    const bodySize = clamp(height * 0.105, 8, 13);

    ctx.textBaseline = 'top';
    ctx.font = `${metaSize}px monospace`;
    ctx.fillStyle = palette(0.72, 0.7 * p.opacity);
    ctx.fillText(article.meta, contentX, tl.y + height * 0.10, contentWidth);

    ctx.font = `600 ${headlineSize}px sans-serif`;
    ctx.fillStyle = palette(0.95, 0.96 * p.opacity);
    const headlineLines = wrapText(ctx, article.headline, contentWidth, article.expanded ? 3 : 2);
    let cursorY = tl.y + height * 0.26;
    for (const line of headlineLines) {
      ctx.fillText(line, contentX, cursorY, contentWidth);
      cursorY += headlineSize * 1.08;
    }

    ctx.font = `${bodySize}px sans-serif`;
    ctx.fillStyle = palette(0.76, 0.65 * p.opacity);
    const bodyLines = wrapText(ctx, article.body, contentWidth, article.expanded ? 4 : 2);
    cursorY += bodySize * 0.45;
    for (const line of bodyLines) {
      if (cursorY > br.y - bodySize * 2) break;
      ctx.fillText(line, contentX, cursorY, contentWidth);
      cursorY += bodySize * 1.2;
    }

    ctx.font = `${Math.max(7, bodySize * 0.82)}px monospace`;
    ctx.fillStyle = palette(0.62, 0.5 * p.opacity);
    ctx.fillText(article.tags, contentX, br.y - Math.max(12, height * 0.12), contentWidth);

    if (lab.diagnostics) {
      ctx.font = '9px monospace';
      ctx.fillStyle = `rgba(255,120,98,${0.55 * p.opacity})`;
      ctx.fillText(`Z ${z.toFixed(2)} · ${article.id}`, tl.x + 5, tl.y + 4);
    }
  }

  function updateScrollRange() {
    const count = liveArticles().length;
    lab.maxScroll = Math.max(0, count * lab.articlePitch - geometry.halfHeight * 1.35);
    lab.targetScroll = clamp(lab.targetScroll, 0, lab.maxScroll);
    lab.scroll = clamp(lab.scroll, 0, lab.maxScroll);
  }

  function drawLiveFeed(ctx, s) {
    if (mode !== MODES.LAB || s.lab <= 0) return;
    const articles = liveArticles();
    const halfWidth = visibleHalfWidth(s);
    const contentTop = geometry.halfHeight - geometry.cell * 1.2 + lab.scroll;

    for (let index = articles.length - 1; index >= 0; index--) {
      const z = geometry.near + geometry.cell * 1.25 + index * geometry.articleDepthStep;
      const worldY = contentTop - index * lab.articlePitch;
      drawArticle(ctx, articles[index], index, z, halfWidth, worldY, s.lab);
    }

    if (!articles.length) {
      ctx.fillStyle = `rgba(255,100,78,${0.58 * s.lab})`;
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('NO LIVE FEED ENTRIES', W / 2, H / 2);
      ctx.textAlign = 'start';
    }
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
      drawChamber(b, s, 0.035 + 0.08 * s.energy);
      b.restore();
    }
    drawLiveFeed(g, s);
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
    updateScrollRange();
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