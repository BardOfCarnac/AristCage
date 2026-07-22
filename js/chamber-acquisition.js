/* Optical acquisition choreography layered over the native chamber boot. */
window.NCNChamberAcquisition = (() => {
  const CANVAS_ID = 'layered-chamber-acquisition';
  const FINAL_DEPTH_CELLS = 16;
  const INITIAL_DEPTH_CELLS = 2;
  const INFINITY_DEPTH_CELLS = 1000;

  const T = Object.freeze({
    igniteStart: 0.16,
    travelStart: 0.88,
    travelEnd: 2.36,
    returnStart: 2.52,
    returnEnd: 3.00,
    wallEnd: 4.02,
    structuralDone: 4.44,
    articleStart: 4.56,
    articleEnd: 5.61,
    crossfadeStartLab: 5.27,
    crossfadeStartBackground: 4.30,
    endLab: 5.74,
    endBackground: 4.72
  });

  let canvas = null;
  let ctx = null;
  let raf = 0;
  let startedAt = 0;
  let active = false;
  let currentMode = 'off';
  let dpr = 1;
  let width = 0;
  let height = 0;
  let backgroundCanvas = null;
  let foregroundCanvas = null;
  let stateObserver = null;
  let resizeFrame = 0;
  let wrappedRestart = null;

  const clamp01 = value => Math.max(0, Math.min(1, value));
  const mix = (a, b, t) => a + (b - a) * clamp01(t);
  const easeOut = value => 1 - Math.pow(1 - clamp01(value), 3);
  const easeIn = value => Math.pow(clamp01(value), 3);
  const easeInOut = value => {
    const t = clamp01(value);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };
  const pulse = (value, centre, widthValue) => {
    const distance = Math.abs(value - centre) / Math.max(0.001, widthValue);
    if (distance >= 1) return 0;
    const envelope = 1 - distance;
    return envelope * envelope;
  };

  function chamberMode() {
    return document.documentElement.dataset.chamberMode || 'off';
  }

  function chamberRoot() {
    return document.querySelector('#layered-chamber-system');
  }

  function captureNativeCanvases() {
    backgroundCanvas = document.querySelector('#layered-chamber-bg');
    foregroundCanvas = document.querySelector('#layered-chamber-fg');
  }

  function setNativeOpacity(value) {
    const opacity = String(clamp01(value));
    for (const nativeCanvas of [backgroundCanvas, foregroundCanvas]) {
      if (!nativeCanvas) continue;
      nativeCanvas.style.opacity = opacity;
    }
  }

  function restoreNativeCanvases() {
    for (const nativeCanvas of [backgroundCanvas, foregroundCanvas]) {
      if (!nativeCanvas) continue;
      nativeCanvas.style.removeProperty('opacity');
    }
  }

  function ensureCanvas() {
    const root = chamberRoot();
    if (!root) return null;
    if (canvas?.isConnected && canvas.parentElement === root) return canvas;

    canvas?.remove();
    canvas = document.createElement('canvas');
    canvas.id = CANVAS_ID;
    canvas.className = 'layered-chamber-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.zIndex = '2';
    canvas.style.pointerEvents = 'none';
    root.append(canvas);
    ctx = canvas.getContext('2d');
    resizeCanvas();
    return canvas;
  }

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function palette(value, alpha) {
    const stops = [[38,2,6],[104,5,12],[176,10,18],[244,24,24],[255,66,32]];
    const scaled = clamp01(value) * (stops.length - 1);
    const index = Math.min(stops.length - 2, Math.floor(scaled));
    const local = scaled - index;
    const a = stops[index];
    const b = stops[index + 1];
    return `rgba(${Math.round(mix(a[0], b[0], local))},${Math.round(mix(a[1], b[1], local))},${Math.round(mix(a[2], b[2], local))},${clamp01(alpha)})`;
  }

  function profile(camera, z, energy, alpha) {
    const contrast = Math.max(0.012, Math.min(1, Math.pow(camera.near / Math.max(camera.near, z), 0.42)));
    return {
      brightness: clamp01(energy * (0.22 + contrast * 0.78)),
      opacity: clamp01(alpha * Math.pow(contrast, 1.28)),
      width: Math.max(0.2, Math.min(1.45, 0.2 + 1.25 * Math.pow(contrast, 0.72)))
    };
  }

  function line(camera, a, b, energy, alpha, widthScale = 1) {
    const midpointZ = (a[2] + b[2]) * 0.5;
    const optical = profile(camera, midpointZ, energy, alpha);
    if (optical.opacity < 0.004) return;
    const A = camera.project(a[0], a[1], a[2]);
    const B = camera.project(b[0], b[1], b[2]);
    ctx.strokeStyle = palette(optical.brightness, optical.opacity);
    ctx.lineWidth = optical.width * widthScale;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.stroke();
  }

  function depthLine(camera, x, y, nearZ, farZ, energy, alpha, widthScale = 1) {
    for (let z = nearZ; z < farZ - 0.0001; z += camera.cell) {
      line(camera, [x, y, z], [x, y, Math.min(farZ, z + camera.cell)], energy, alpha, widthScale);
    }
  }

  function resolutionStride(camera, z) {
    const apparentCell = camera.cell * camera.focalLength / z;
    if (apparentCell >= 5) return 1;
    if (apparentCell >= 2.5) return 2;
    if (apparentCell >= 1.25) return 4;
    if (apparentCell >= 0.62) return 8;
    if (apparentCell >= 0.31) return 16;
    return Infinity;
  }

  function stateAt(t, camera) {
    const travelLinear = clamp01((t - T.travelStart) / (T.travelEnd - T.travelStart));
    const returnLinear = clamp01((t - T.returnStart) / (T.returnEnd - T.returnStart));
    const wallOpen = easeInOut((t - T.returnEnd) / (T.wallEnd - T.returnEnd));
    const railReveal = easeOut((t - T.returnEnd) / 0.42);
    const rightRailReveal = easeOut((t - T.returnEnd - 0.07) / 0.44);
    const latticeReveal = easeInOut((t - T.returnEnd - 0.14) / 0.88);
    const focusLinear = clamp01((t - T.returnEnd) / 0.62);
    const focusCorrection = clamp01(
      easeOut(focusLinear)
      + Math.sin(focusLinear * Math.PI * 2.25) * (1 - focusLinear) * 0.055
    );
    const rearVertical = easeOut((t - T.igniteStart) / 0.24);
    const rearHorizontal = easeOut((t - T.igniteStart - 0.15) / 0.34);
    const scanPosition = clamp01((t - T.igniteStart) / 0.64);
    const energy = t < T.igniteStart
      ? 0.08
      : t < 0.72
        ? mix(0.08, 1, easeOut((t - T.igniteStart) / (0.72 - T.igniteStart)))
        : mix(1, 0.64, easeInOut((t - 0.72) / 0.30));

    const initial = camera.near + INITIAL_DEPTH_CELLS * camera.cell;
    const final = camera.near + FINAL_DEPTH_CELLS * camera.cell;
    const overshoot = final - camera.cell * 0.5;
    const infinity = camera.near + INFINITY_DEPTH_CELLS * camera.cell;
    let rearZ = initial;
    if (t >= T.returnEnd) rearZ = mix(overshoot, final, focusCorrection);
    else if (t >= T.returnStart) rearZ = mix(infinity, overshoot, easeOut(returnLinear));
    else if (t >= T.travelStart) rearZ = mix(initial, infinity, easeIn(travelLinear));

    return {
      t,
      travelLinear,
      returnLinear,
      wallOpen,
      railReveal,
      rightRailReveal,
      latticeReveal,
      rearVertical,
      rearHorizontal,
      scanPosition,
      energy: clamp01(energy),
      rearZ,
      visibleX: mix(camera.halfWidth, camera.finalHalfWidth, wallOpen),
      article: easeOut((t - T.articleStart) / (T.articleEnd - T.articleStart))
    };
  }

  function drawColdGlass(s) {
    const fade = clamp01(1 - s.t / (T.travelStart + 0.18));
    if (fade <= 0) return;
    const cx = width * 0.5;
    const cy = height * 0.5;
    const acquire = easeOut((s.t - T.igniteStart) / Math.max(0.1, T.travelStart - T.igniteStart));
    const breathe = 0.58 + Math.sin(s.t * Math.PI * 4.5) * 0.12;
    const arm = mix(4, 17, acquire);
    const pulseWidth = mix(8, Math.min(width * 0.23, 105), s.scanPosition);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = palette(0.42 + s.energy * 0.28, fade * breathe * 0.48);
    ctx.lineWidth = 0.72;
    ctx.beginPath();
    ctx.moveTo(cx - arm, cy);
    ctx.lineTo(cx + arm, cy);
    ctx.moveTo(cx, cy - arm);
    ctx.lineTo(cx, cy + arm);
    ctx.stroke();

    ctx.strokeStyle = palette(0.68, fade * (0.18 + acquire * 0.32));
    ctx.beginPath();
    ctx.moveTo(cx - pulseWidth, cy + 0.5);
    ctx.lineTo(cx + pulseWidth, cy + 0.5);
    ctx.stroke();

    ctx.fillStyle = palette(0.88, fade * (0.38 + s.energy * 0.36));
    ctx.beginPath();
    ctx.arc(cx, cy, 1.1 + acquire * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawGhostFrame(camera, z, X, energy, alpha) {
    if (alpha <= 0.001) return;
    const Y = camera.halfHeight;
    line(camera, [-X,-Y,z], [X,-Y,z], energy, alpha, 0.8);
    line(camera, [X,-Y,z], [X,Y,z], energy, alpha, 0.8);
    line(camera, [X,Y,z], [-X,Y,z], energy, alpha, 0.8);
    line(camera, [-X,Y,z], [-X,-Y,z], energy, alpha, 0.8);
    line(camera, [0,-Y,z], [0,Y,z], energy, alpha * 0.62, 0.72);
    line(camera, [-X,0,z], [X,0,z], energy, alpha * 0.62, 0.72);
  }

  function drawPersistence(camera, s) {
    const initial = camera.near + INITIAL_DEPTH_CELLS * camera.cell;
    const final = camera.near + FINAL_DEPTH_CELLS * camera.cell;
    const overshoot = final - camera.cell * 0.5;
    const infinity = camera.near + INFINITY_DEPTH_CELLS * camera.cell;
    let phase = 0;
    let strength = 0;
    let returning = false;

    if (s.t >= T.travelStart && s.t < T.returnStart) {
      phase = s.travelLinear;
      strength = Math.sin(Math.PI * phase);
    } else if (s.t >= T.returnStart && s.t < T.returnEnd) {
      phase = s.returnLinear;
      strength = Math.sin(Math.PI * phase);
      returning = true;
    }
    if (strength <= 0.002) return;

    for (let index = 1; index <= 3; index++) {
      const lag = returning ? 0.075 : 0.055;
      const ghostPhase = clamp01(phase - index * lag);
      const ghostZ = returning
        ? mix(infinity, overshoot, easeOut(ghostPhase))
        : mix(initial, infinity, easeIn(ghostPhase));
      drawGhostFrame(camera, ghostZ, s.visibleX, s.energy, strength * (0.15 / index));
    }
  }

  function drawRearWall(camera, s) {
    const X = s.visibleX;
    const Y = camera.halfHeight;
    const cell = camera.cell;
    const xCells = Math.round((X * 2) / cell);
    const yCells = Math.round((Y * 2) / cell);
    const stride = resolutionStride(camera, s.rearZ);
    const misregister = s.t < T.travelStart
      ? Math.sin(s.t * 47) * cell * 0.018 * (1 - s.rearHorizontal)
      : 0;

    if (Number.isFinite(stride)) {
      for (let ix = 0; ix <= xCells; ix += stride) {
        const x = -X + ix * cell;
        line(camera, [x,-Y,s.rearZ], [x,Y,s.rearZ], s.energy, 0.42 * s.rearVertical, 1.04);
      }
      for (let iy = 0; iy <= yCells; iy += stride) {
        const y = -Y + iy * cell + misregister;
        line(camera, [-X,y,s.rearZ], [X,y,s.rearZ], s.energy, 0.42 * s.rearHorizontal, 1.04);
      }
    }

    const aperture = camera.apertureAt(s.rearZ, X);
    if (s.scanPosition > 0 && s.scanPosition < 1 && aperture.width > 9) {
      const scanY = mix(aperture.top, aperture.bottom, s.scanPosition);
      const gradient = ctx.createLinearGradient(aperture.left, scanY, aperture.right, scanY);
      gradient.addColorStop(0, palette(0.72, 0));
      gradient.addColorStop(0.5, palette(0.96, 0.68));
      gradient.addColorStop(1, palette(0.72, 0));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(aperture.left, scanY);
      ctx.lineTo(aperture.right, scanY);
      ctx.stroke();
      ctx.restore();
    }

    if (!Number.isFinite(stride) || aperture.width < 8) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = palette(0.88, 0.34);
      ctx.beginPath();
      ctx.arc(width * 0.5, height * 0.5, 1.4 + s.energy * 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function railPhase(position, extent, cell) {
    const absolute = Math.abs(position);
    if (Math.abs(absolute - extent) < cell * 0.25) return 0;
    if (absolute < cell * 0.25) return 0.12;
    return 0.22 + 0.14 * (1 - absolute / Math.max(cell, extent));
  }

  function drawHorizontalPlane(camera, y, s, alpha, railReveal, latticeReveal) {
    const X = s.visibleX;
    const cell = camera.cell;
    const xCells = Math.round((X * 2) / cell);
    for (let ix = 0; ix <= xCells; ix++) {
      const x = -X + ix * cell;
      const phase = railPhase(x, X, cell);
      const reveal = easeOut((railReveal - phase) / Math.max(0.001, 1 - phase));
      if (reveal <= 0.002) continue;
      const startZ = mix(s.rearZ, camera.near, reveal);
      depthLine(camera, x, y, startZ, s.rearZ, s.energy, alpha * reveal, 0.92);
    }

    const span = Math.max(cell, s.rearZ - camera.near);
    for (let z = camera.near, index = 0; z <= s.rearZ + 0.0001; z += cell, index++) {
      const stride = resolutionStride(camera, z);
      if (!Number.isFinite(stride) || index % stride !== 0) continue;
      const order = clamp01((s.rearZ - z) / span);
      const reveal = clamp01((latticeReveal - order) * 8);
      if (reveal <= 0.002) continue;
      line(camera, [-X,y,z], [X,y,z], s.energy, alpha * reveal, 0.9);
    }
  }

  function drawSideWall(camera, side, s, alpha, railReveal, latticeReveal) {
    const X = side * s.visibleX;
    const Y = camera.halfHeight;
    const cell = camera.cell;
    const yCells = Math.round((Y * 2) / cell);
    for (let iy = 0; iy <= yCells; iy++) {
      const y = -Y + iy * cell;
      const phase = railPhase(y, Y, cell);
      const reveal = easeOut((railReveal - phase) / Math.max(0.001, 1 - phase));
      if (reveal <= 0.002) continue;
      const startZ = mix(s.rearZ, camera.near, reveal);
      depthLine(camera, X, y, startZ, s.rearZ, s.energy, alpha * reveal, 0.92);
    }

    const span = Math.max(cell, s.rearZ - camera.near);
    for (let z = camera.near, index = 0; z <= s.rearZ + 0.0001; z += cell, index++) {
      const stride = resolutionStride(camera, z);
      if (!Number.isFinite(stride) || index % stride !== 0) continue;
      const order = clamp01((s.rearZ - z) / span);
      const reveal = clamp01((latticeReveal - order) * 8);
      if (reveal <= 0.002) continue;
      line(camera, [X,-Y,z], [X,Y,z], s.energy, alpha * reveal, 0.9);
    }
  }

  function drawStructuralRails(camera, s) {
    if (s.railReveal <= 0.002) return;
    const X = s.visibleX;
    const Y = camera.halfHeight;
    const startZ = mix(s.rearZ, camera.near, s.railReveal);
    for (const x of [-X, X]) {
      for (const y of [-Y, Y]) {
        depthLine(camera, x, y, startZ, s.rearZ, s.energy, 0.48 * s.railReveal, 1.16);
      }
    }
    const centreReveal = easeOut((s.railReveal - 0.12) / 0.88);
    if (centreReveal > 0.002) {
      const centreStart = mix(s.rearZ, camera.near, centreReveal);
      depthLine(camera, 0, -Y, centreStart, s.rearZ, s.energy, 0.39 * centreReveal, 1.04);
      depthLine(camera, 0, Y, centreStart, s.rearZ, s.energy, 0.36 * centreReveal, 1.0);
    }
  }

  function liveArticles() {
    return [...document.querySelectorAll('#feed .entry:not(.panel)')]
      .filter(node => getComputedStyle(node).display !== 'none')
      .map((node, index) => ({
        headline: node.querySelector('.headline')?.textContent?.trim().replace(/\s+/g, ' ') || '',
        meta: node.querySelector('.meta')?.textContent?.trim().replace(/\s+/g, ' ') || '',
        tags: node.querySelector('.tags')?.textContent?.trim().replace(/\s+/g, ' ') || '',
        body: node.querySelector('.body')?.textContent?.trim().replace(/\s+/g, ' ') || '',
        priority: Number((node.querySelector('.priority')?.className.match(/priority-(\d+)/) || [])[1]) || 1,
        expanded: node.classList.contains('expanded'),
        index
      }))
      .filter(article => article.headline || article.meta || article.body);
  }

  function wrapText(text, maxWidth, maxLines) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth || !current) current = test;
      else {
        lines.push(current);
        current = word;
        if (lines.length >= maxLines) break;
      }
    }
    if (lines.length < maxLines && current) lines.push(current);
    return lines;
  }

  function drawArticle(camera, article, progress) {
    const index = article.index;
    const delay = Math.min(0.58, index * 0.072);
    const resolve = easeOut((progress - delay) / Math.max(0.01, 1 - delay));
    if (resolve <= 0.001) return;

    const z = camera.near + camera.cell * 1.25 + index * 0.72;
    const worldY = camera.halfHeight - camera.cell * 1.2 - index * 1.16;
    const articleHeight = article.expanded ? 0.86 * 1.55 : 0.86;
    const inset = camera.cell * 1.05;
    const tl = camera.project(-camera.finalHalfWidth + inset, worldY, z);
    const br = camera.project(camera.finalHalfWidth - inset, worldY - articleHeight, z);
    const cardWidth = br.x - tl.x;
    const cardHeight = br.y - tl.y;
    if (br.y < -60 || tl.y > height + 60 || cardWidth < 24 || cardHeight < 12) return;

    const plate = easeOut(resolve / 0.28);
    const priority = easeOut((resolve - 0.10) / 0.34);
    const meta = easeOut((resolve - 0.24) / 0.38);
    const headline = easeOut((resolve - 0.36) / 0.42);
    const body = easeOut((resolve - 0.58) / 0.40);
    const flash = pulse(resolve, 0.48, 0.22);
    const depthOpacity = Math.pow(camera.near / Math.max(camera.near, z), 0.54);

    ctx.fillStyle = `rgba(8,0,2,${0.54 * plate * depthOpacity})`;
    ctx.fillRect(tl.x, tl.y, cardWidth, cardHeight);
    ctx.strokeStyle = palette(0.68 + flash * 0.12, 0.72 * plate * depthOpacity);
    ctx.lineWidth = Math.max(0.6, 1.05 * depthOpacity);
    ctx.strokeRect(tl.x, tl.y, cardWidth, cardHeight);

    const railWidth = Math.max(2, cardWidth * 0.012);
    ctx.fillStyle = palette(clamp01(0.42 + article.priority * 0.1 + flash * 0.2), 0.92 * priority * depthOpacity);
    ctx.fillRect(tl.x, tl.y, railWidth, cardHeight);

    const padX = Math.max(8, cardWidth * 0.035);
    const contentX = tl.x + railWidth + padX;
    const contentWidth = cardWidth - railWidth - padX * 2;
    const metaSize = Math.max(7, Math.min(11, cardHeight * 0.095));
    const headlineSize = Math.max(10, Math.min(22, cardHeight * 0.17));
    const bodySize = Math.max(8, Math.min(13, cardHeight * 0.105));

    ctx.textBaseline = 'top';
    ctx.font = `${metaSize}px monospace`;
    ctx.fillStyle = palette(0.72, 0.68 * meta * depthOpacity);
    ctx.fillText(article.meta, contentX, tl.y + cardHeight * 0.10, contentWidth);

    ctx.font = `600 ${headlineSize}px sans-serif`;
    ctx.fillStyle = palette(0.95, 0.94 * headline * depthOpacity);
    const headlineLines = wrapText(article.headline, contentWidth, article.expanded ? 3 : 2);
    let cursorY = tl.y + cardHeight * 0.26;
    for (const textLine of headlineLines) {
      ctx.fillText(textLine, contentX, cursorY, contentWidth);
      cursorY += headlineSize * 1.08;
    }

    ctx.font = `${bodySize}px sans-serif`;
    ctx.fillStyle = palette(0.76, 0.62 * body * depthOpacity);
    const bodyLines = wrapText(article.body, contentWidth, article.expanded ? 4 : 2);
    cursorY += bodySize * 0.45;
    for (const textLine of bodyLines) {
      if (cursorY > br.y - bodySize * 2) break;
      ctx.fillText(textLine, contentX, cursorY, contentWidth);
      cursorY += bodySize * 1.2;
    }

    ctx.font = `${Math.max(7, bodySize * 0.82)}px monospace`;
    ctx.fillStyle = palette(0.62, 0.48 * meta * depthOpacity);
    ctx.fillText(article.tags, contentX, br.y - Math.max(12, cardHeight * 0.12), contentWidth);
  }

  function drawArticles(camera, progress) {
    const articles = liveArticles();
    for (let index = articles.length - 1; index >= 0; index--) {
      drawArticle(camera, articles[index], progress);
    }
  }

  function drawFrame(now) {
    raf = 0;
    if (!active || !ctx || !canvas) return;
    const camera = window.NCNChamberCamera?.snapshot?.();
    if (!camera) {
      raf = requestAnimationFrame(drawFrame);
      return;
    }

    const elapsed = (now - startedAt) / 1000;
    const isLab = currentMode === 'lab';
    const end = isLab ? T.endLab : T.endBackground;
    const crossfadeStart = isLab ? T.crossfadeStartLab : T.crossfadeStartBackground;
    const crossfade = easeInOut((elapsed - crossfadeStart) / Math.max(0.1, end - crossfadeStart));
    const s = stateAt(elapsed, camera);

    ctx.clearRect(0, 0, width, height);
    canvas.style.opacity = String(1 - crossfade);
    setNativeOpacity(crossfade);

    drawColdGlass(s);
    drawPersistence(camera, s);
    drawRearWall(camera, s);

    if (s.railReveal > 0.001) {
      drawHorizontalPlane(camera, -camera.halfHeight, s, 0.34, s.railReveal, s.latticeReveal);
      drawHorizontalPlane(
        camera,
        camera.halfHeight,
        s,
        0.31,
        easeOut((s.railReveal - 0.04) / 0.96),
        easeInOut((s.latticeReveal - 0.04) / 0.96)
      );
      drawSideWall(camera, -1, s, 0.33, s.railReveal, s.latticeReveal);
      drawSideWall(
        camera,
        1,
        s,
        0.33,
        s.rightRailReveal,
        easeInOut((s.latticeReveal - 0.06) / 0.94)
      );
      drawStructuralRails(camera, s);
    }

    if (isLab && s.article > 0.001) drawArticles(camera, s.article);

    window.LayeredChamber?.refresh?.();
    if (elapsed < end) raf = requestAnimationFrame(drawFrame);
    else finish();
  }

  function start(mode = chamberMode()) {
    if (mode === 'off') {
      cancel();
      return;
    }
    currentMode = mode;
    if (!ensureCanvas()) return;
    captureNativeCanvases();
    if (!backgroundCanvas || !foregroundCanvas) {
      requestAnimationFrame(() => start(mode));
      return;
    }
    if (raf) cancelAnimationFrame(raf);
    active = true;
    startedAt = performance.now();
    resizeCanvas();
    canvas.style.display = 'block';
    canvas.style.opacity = '1';
    setNativeOpacity(0);
    raf = requestAnimationFrame(drawFrame);
  }

  function finish() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    active = false;
    restoreNativeCanvases();
    if (canvas) {
      canvas.style.display = 'none';
      canvas.style.opacity = '1';
      ctx?.clearRect(0, 0, width, height);
    }
    window.LayeredChamber?.refresh?.();
  }

  function cancel() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    active = false;
    restoreNativeCanvases();
    if (canvas) {
      canvas.style.display = 'none';
      canvas.style.opacity = '1';
      ctx?.clearRect(0, 0, width, height);
    }
  }

  function syncMode() {
    const mode = chamberMode();
    if (mode === 'off') cancel();
    else start(mode);
  }

  function handleResize() {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      resizeCanvas();
    });
  }

  function wrapPublicRestart() {
    const chamber = window.LayeredChamber;
    if (!chamber || wrappedRestart) return;
    wrappedRestart = chamber.restart.bind(chamber);
    chamber.restart = (...args) => {
      const result = wrappedRestart(...args);
      queueMicrotask(syncMode);
      return result;
    };
  }

  function init() {
    wrapPublicRestart();
    document.querySelector('#layered-chamber-toggle')?.addEventListener('click', event => {
      if (event.shiftKey) queueMicrotask(syncMode);
    });

    stateObserver = new MutationObserver(syncMode);
    stateObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-chamber-mode']
    });
    window.addEventListener('resize', handleResize, { passive: true });

    if (chamberMode() !== 'off') requestAnimationFrame(syncMode);
  }

  function destroy() {
    cancel();
    stateObserver?.disconnect();
    stateObserver = null;
    window.removeEventListener('resize', handleResize);
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = 0;
    canvas?.remove();
    canvas = null;
    ctx = null;
    if (wrappedRestart && window.LayeredChamber) window.LayeredChamber.restart = wrappedRestart;
    wrappedRestart = null;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  return { start, restart: syncMode, cancel, destroy, isActive: () => active };
})();
