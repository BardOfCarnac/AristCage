/*==================================================
  PERMANENT CHAMBER RUNTIME

  One camera, one scheduler and two compositing canvases. The rear canvas
  contains the chamber and far atmosphere. The front canvas contains near
  atmosphere, faults and chamber-cell reconfiguration. Optical DOM planes
  sit between them.
==================================================*/
window.LayeredChamber = (() => {
  'use strict';

  const TERMINAL_KEY = 'ncn-terminal-environment-number';
  const DEFAULT_TERMINAL = 'NCN-2045-001';
  const ROOT_CLASS = 'viewer-spatial-runtime';

  const geometry = {
    cell: 0.5,
    near: 2.5,
    finalDepthCells: 16,
    focal: 0.84,
    halfWidth: 3,
    halfHeight: 2.5,
    wallShiftCells: 2
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const clamp01 = value => clamp(value, 0, 1);
  const mix = (a, b, amount) => a + (b - a) * amount;
  const easeInOut = value => {
    const t = clamp01(value);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };
  const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;

  function hash(value) {
    let result = 2166136261;
    for (const character of String(value)) {
      result ^= character.charCodeAt(0);
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  }

  function rng(seed) {
    let state = seed >>> 0;
    return () => {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function storageGet(key) {
    try { return localStorage.getItem(key); }
    catch { return null; }
  }

  function qualityProfile() {
    const cores = navigator.hardwareConcurrency || 4;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
    if (cores <= 4) return { name: 'LOW', dpr: 1, banks: 10, ambientFps: reduced ? 6 : 12, eventFps: 24, reduced };
    if (cores <= 8) return { name: 'STANDARD', dpr: 1.2, banks: 16, ambientFps: reduced ? 8 : 18, eventFps: 30, reduced };
    return { name: 'HIGH', dpr: 1.45, banks: 22, ambientFps: reduced ? 10 : 22, eventFps: 36, reduced };
  }

  function terminalProfile(number) {
    const value = key => rng(hash(`ncn-spatial-v1:${number}:${key}`))();
    const moisture = value('moisture');
    const agitation = value('agitation');
    const charge = value('charge');
    return Object.freeze({
      number,
      weatherType: value('weather') < 0.76 ? 'floorMist' : 'ceilingSmoke',
      density: clamp(0.18 + moisture * 0.64, 0.16, 0.82),
      height: clamp(0.12 + moisture * 0.42 + agitation * 0.12, 0.1, 0.7),
      opacity: clamp(0.28 + moisture * 0.42, 0.24, 0.72),
      drift: mix(-0.2, 0.2, value('drift')),
      depthFlow: mix(-0.08, 0.08, value('depth-flow')),
      turbulence: clamp(0.08 + agitation * 0.46, 0.06, 0.56),
      charge
    });
  }

  const quality = qualityProfile();
  const terminalNumber = storageGet(TERMINAL_KEY) || DEFAULT_TERMINAL;
  const profile = terminalProfile(terminalNumber);
  const random = rng(hash(`${terminalNumber}:${Date.now()}:${performance.now()}`));

  let mounted = false;
  let rearRoot = null;
  let frontRoot = null;
  let rearCanvas = null;
  let frontCanvas = null;
  let rearContext = null;
  let frontContext = null;
  let chamberCache = null;
  let chamberCacheContext = null;
  let sprites = [];
  let mistBanks = [];

  let width = 0;
  let height = 0;
  let dpr = 1;
  let bootStartedAt = 0;
  let lastRenderedAt = 0;
  let animationFrame = 0;
  let dirty = true;
  let hidden = document.hidden;

  let blockEvent = null;
  let faultEvent = null;
  let nextBlockAt = Infinity;
  let nextFaultAt = Infinity;

  function focalLength() {
    return Math.min(width, height) * geometry.focal;
  }

  function snapCells(value) {
    return Math.max(geometry.cell, Math.round(value / geometry.cell) * geometry.cell);
  }

  function fitGeometryToViewport() {
    const focal = focalLength();
    geometry.halfWidth = snapCells((width * 0.5) * geometry.near / focal);
    geometry.halfHeight = snapCells((height * 0.5) * geometry.near / focal);
  }

  function finalHalfWidth() {
    return geometry.halfWidth + geometry.wallShiftCells * geometry.cell;
  }

  function rearDepth() {
    return geometry.near + geometry.finalDepthCells * geometry.cell;
  }

  function project(x, y, z) {
    const safeZ = Math.max(0.001, z);
    const focal = focalLength();
    return {
      x: width * 0.5 + x * focal / safeZ,
      y: height * 0.5 - y * focal / safeZ,
      scale: geometry.near / safeZ
    };
  }

  function palette(level, alpha) {
    const stops = [[30,1,4],[88,3,9],[160,7,14],[238,20,18],[255,82,34]];
    const scaled = clamp01(level) * (stops.length - 1);
    const index = Math.min(stops.length - 2, Math.floor(scaled));
    const local = scaled - index;
    const a = stops[index];
    const b = stops[index + 1];
    return `rgba(${Math.round(mix(a[0], b[0], local))},${Math.round(mix(a[1], b[1], local))},${Math.round(mix(a[2], b[2], local))},${clamp01(alpha)})`;
  }

  function makeLayer(id, className) {
    const root = document.createElement('div');
    root.id = id;
    root.className = className;
    root.setAttribute('aria-hidden', 'true');
    const canvas = document.createElement('canvas');
    canvas.className = 'layered-chamber-canvas';
    root.append(canvas);
    document.body.prepend(root);
    return { root, canvas, context: canvas.getContext('2d') };
  }

  function makeMistSprite(kind) {
    const sprite = document.createElement('canvas');
    sprite.width = 160;
    sprite.height = 80;
    const context = sprite.getContext('2d');
    const gradient = context.createRadialGradient(80, 43, 2, 80, 43, 73);
    const cool = kind === 2;
    const hot = kind === 1;
    gradient.addColorStop(0, cool ? 'rgba(205,235,255,.62)' : hot ? 'rgba(255,135,78,.58)' : 'rgba(255,54,42,.5)');
    gradient.addColorStop(0.35, cool ? 'rgba(92,164,255,.3)' : 'rgba(202,18,31,.28)');
    gradient.addColorStop(0.72, 'rgba(96,4,18,.1)');
    gradient.addColorStop(1, 'rgba(20,0,5,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, sprite.width, sprite.height);
    return sprite;
  }

  function buildAtmosphere() {
    if (!sprites.length) sprites = [makeMistSprite(0), makeMistSprite(1), makeMistSprite(2)];
    const layout = rng(hash(`ncn-spatial-v1:${terminalNumber}:mist-layout`));
    const count = Math.max(8, Math.round(quality.banks * (0.56 + profile.density * 0.44)));
    mistBanks = Array.from({ length: count }, (_, index) => ({
      sprite: index % sprites.length,
      x: mix(-1.2, 1.2, layout()),
      z: mix(2.9, rearDepth() - 0.35, layout()),
      width: mix(0.7, 2.05, layout()),
      lift: mix(0.04, profile.height, layout()),
      alpha: mix(0.32, 1, layout()),
      speed: mix(0.018, 0.07, layout()) * (profile.drift < 0 ? -1 : 1),
      depthSpeed: profile.depthFlow * mix(0.18, 0.42, layout()),
      phase: layout() * Math.PI * 2
    }));
  }

  function resizeCanvas(canvas, context) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function resizeCache() {
    chamberCache = document.createElement('canvas');
    chamberCache.width = Math.round(width * dpr);
    chamberCache.height = Math.round(height * dpr);
    chamberCacheContext = chamberCache.getContext('2d');
    chamberCacheContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSettledChamber(chamberCacheContext);
  }

  function resize() {
    if (!mounted) return;
    width = innerWidth;
    height = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, quality.dpr);
    fitGeometryToViewport();
    resizeCanvas(rearCanvas, rearContext);
    resizeCanvas(frontCanvas, frontContext);
    resizeCache();
    buildAtmosphere();
    dirty = true;
    requestDraw();
    dispatchEvent(new CustomEvent('ncn:chamber-camera-change', { detail: getCameraSnapshot() }));
  }

  function opticalLine(context, a, b, energy = 0.62, alpha = 0.34, widthScale = 1) {
    const A = project(a[0], a[1], a[2]);
    const B = project(b[0], b[1], b[2]);
    const z = (a[2] + b[2]) * 0.5;
    const contrast = clamp(Math.pow(geometry.near / Math.max(geometry.near, z), 0.42), 0.05, 1);
    context.strokeStyle = palette(energy * (0.3 + contrast * 0.7), alpha * Math.pow(contrast, 0.82));
    context.lineWidth = clamp(0.35 + contrast * 1.15, 0.35, 1.5) * widthScale;
    context.beginPath();
    context.moveTo(A.x, A.y);
    context.lineTo(B.x, B.y);
    context.stroke();
  }

  function drawSettledChamber(context) {
    context.clearRect(0, 0, width, height);
    const X = finalHalfWidth();
    const Y = geometry.halfHeight;
    const near = geometry.near;
    const far = rearDepth();
    const cell = geometry.cell;

    for (let x = -X; x <= X + 0.001; x += cell) {
      opticalLine(context, [x, -Y, near], [x, -Y, far], 0.63, 0.34, 0.92);
      opticalLine(context, [x, Y, near], [x, Y, far], 0.59, 0.29, 0.86);
    }
    for (let y = -Y; y <= Y + 0.001; y += cell) {
      opticalLine(context, [-X, y, near], [-X, y, far], 0.61, 0.32, 0.9);
      opticalLine(context, [X, y, near], [X, y, far], 0.61, 0.32, 0.9);
    }
    for (let z = near; z <= far + 0.001; z += cell) {
      opticalLine(context, [-X, -Y, z], [X, -Y, z], 0.58, 0.31, 0.88);
      opticalLine(context, [-X, Y, z], [X, Y, z], 0.55, 0.25, 0.82);
      opticalLine(context, [-X, -Y, z], [-X, Y, z], 0.57, 0.28, 0.86);
      opticalLine(context, [X, -Y, z], [X, Y, z], 0.57, 0.28, 0.86);
    }
    for (let x = -X; x <= X + 0.001; x += cell) {
      opticalLine(context, [x, -Y, far], [x, Y, far], 0.65, 0.46, 1.02);
    }
    for (let y = -Y; y <= Y + 0.001; y += cell) {
      opticalLine(context, [-X, y, far], [X, y, far], 0.65, 0.46, 1.02);
    }
  }

  function drawBootChamber(context, now) {
    const progress = easeInOut((now - bootStartedAt) / 2800);
    const initialFar = geometry.near + geometry.cell * 2;
    const far = mix(initialFar, rearDepth(), progress);
    const X = mix(geometry.halfWidth, finalHalfWidth(), progress);
    const Y = geometry.halfHeight;
    const cell = geometry.cell;
    const energy = mix(0.2, 0.68, Math.min(1, progress * 1.8));

    context.clearRect(0, 0, width, height);
    for (let z = geometry.near; z <= far + 0.001; z += cell) {
      opticalLine(context, [-X, -Y, z], [X, -Y, z], energy, 0.34);
      opticalLine(context, [-X, Y, z], [X, Y, z], energy, 0.28);
      opticalLine(context, [-X, -Y, z], [-X, Y, z], energy, 0.3);
      opticalLine(context, [X, -Y, z], [X, Y, z], energy, 0.3);
    }
    for (let x = -X; x <= X + 0.001; x += cell) {
      opticalLine(context, [x, -Y, geometry.near], [x, -Y, far], energy, 0.34);
      opticalLine(context, [x, Y, geometry.near], [x, Y, far], energy, 0.26);
      opticalLine(context, [x, -Y, far], [x, Y, far], energy, 0.42);
    }
    for (let y = -Y; y <= Y + 0.001; y += cell) {
      opticalLine(context, [-X, y, geometry.near], [-X, y, far], energy, 0.3);
      opticalLine(context, [X, y, geometry.near], [X, y, far], energy, 0.3);
      opticalLine(context, [-X, y, far], [X, y, far], energy, 0.42);
    }
    return progress < 1;
  }

  function drawMist(context, now, nearLayer) {
    if (!mistBanks.length || profile.density <= 0) return;
    const elapsed = now * 0.001;
    const X = finalHalfWidth();
    const Y = geometry.halfHeight;
    const threshold = 4.45;
    const faultBoost = faultEvent?.type === 'environment' ? faultEvent.level : 0;

    context.save();
    context.globalCompositeOperation = 'lighter';
    for (const bank of mistBanks) {
      const z = clamp(
        bank.z + Math.sin(elapsed * 0.09 + bank.phase) * profile.turbulence * 0.35
          + elapsed * bank.depthSpeed,
        geometry.near + 0.14,
        rearDepth() - 0.18
      );
      if ((z < threshold) !== nearLayer) continue;
      const xRange = X * 2.45;
      const x = -X * 1.22 + mod((bank.x + elapsed * bank.speed + X * 1.22), xRange);
      const ceiling = profile.weatherType === 'ceilingSmoke';
      const baseY = ceiling ? Y - bank.lift : -Y + bank.lift;
      const y = baseY + Math.sin(elapsed * 0.33 + bank.phase) * profile.turbulence * 0.12;
      const point = project(x, y, z);
      const scale = point.scale * (1 + faultBoost * 0.32);
      const sprite = sprites[bank.sprite];
      const drawWidth = bank.width * focalLength() / z * 1.2;
      const drawHeight = drawWidth * 0.5;
      context.globalAlpha = profile.opacity * bank.alpha * (0.42 + profile.density * 0.46) * (nearLayer ? 0.62 : 0.48);
      context.drawImage(
        sprite,
        point.x - drawWidth * 0.5,
        point.y - drawHeight * (ceiling ? 0.25 : 0.75),
        drawWidth * scale / Math.max(point.scale, 0.001),
        drawHeight * scale / Math.max(point.scale, 0.001)
      );
    }
    context.restore();
  }

  function panelOpen() {
    return Boolean(document.querySelector('.panel.open, .panel.is-open, dialog[open], [aria-modal="true"]'));
  }

  function scheduleBlock(now, initial = false) {
    if (quality.reduced) {
      nextBlockAt = Infinity;
      return;
    }
    nextBlockAt = now + (initial ? 18000 : mix(70000, 150000, random()));
  }

  function scheduleFault(now, initial = false) {
    nextFaultAt = now + (initial ? 32000 : mix(95000, 260000, random()));
  }

  function startBlockReconfiguration() {
    if (blockEvent || panelOpen() || hidden || quality.reduced) return false;
    const side = random() < 0.5 ? -1 : 1;
    const cell = geometry.cell;
    const yIndex = Math.round(mix(-geometry.halfHeight / cell + 1, geometry.halfHeight / cell - 1, random()));
    const zIndex = Math.round(mix(3, geometry.finalDepthCells - 2, random()));
    const targetXIndex = Math.round(mix(-finalHalfWidth() / cell + 1, finalHalfWidth() / cell - 1, random()));
    blockEvent = {
      startedAt: performance.now(),
      duration: mix(1800, 2700, random()),
      side,
      from: { x: side * finalHalfWidth(), y: yIndex * cell, z: geometry.near + zIndex * cell },
      to: { x: targetXIndex * cell, y: yIndex * cell, z: rearDepth() },
      rotation: mix(Math.PI * 0.5, Math.PI * 1.5, random())
    };
    document.documentElement.classList.add('viewer-block-active');
    requestDraw();
    return true;
  }

  function startFault(type = null) {
    if (faultEvent || panelOpen() || hidden) return false;
    const choices = ['power', 'optical', 'signal', 'geometry', 'environment'];
    const selected = choices.includes(type) ? type : choices[Math.floor(random() * choices.length)];
    faultEvent = {
      type: selected,
      startedAt: performance.now(),
      duration: mix(650, 1450, random()),
      level: 0
    };
    document.documentElement.classList.add('viewer-fault-active');
    requestDraw();
    return true;
  }

  function cubeCorners(center, size, rotation) {
    const half = size * 0.5;
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    const points = [];
    for (const dx of [-half, half]) {
      for (const dy of [-half, half]) {
        for (const dz of [-half, half]) {
          const rx = dx * cosine - dz * sine;
          const rz = dx * sine + dz * cosine;
          points.push([center.x + rx, center.y + dy, center.z + rz]);
        }
      }
    }
    return points;
  }

  function drawCube(context, center, rotation, alpha) {
    const points = cubeCorners(center, geometry.cell * 0.92, rotation).map(point => project(...point));
    const edges = [[0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]];
    context.save();
    context.globalCompositeOperation = 'lighter';
    context.strokeStyle = palette(0.95, alpha);
    context.lineWidth = 1.25;
    context.shadowColor = 'rgba(255,70,42,.65)';
    context.shadowBlur = 8;
    context.beginPath();
    for (const [a, b] of edges) {
      context.moveTo(points[a].x, points[a].y);
      context.lineTo(points[b].x, points[b].y);
    }
    context.stroke();
    context.restore();
  }

  function drawCavity(context, point, side, alpha) {
    const half = geometry.cell * 0.48;
    let world;
    if (side) {
      world = [
        [point.x, point.y - half, point.z - half],
        [point.x, point.y + half, point.z - half],
        [point.x, point.y + half, point.z + half],
        [point.x, point.y - half, point.z + half]
      ];
    } else {
      world = [
        [point.x - half, point.y - half, point.z],
        [point.x - half, point.y + half, point.z],
        [point.x + half, point.y + half, point.z],
        [point.x + half, point.y - half, point.z]
      ];
    }
    const points = world.map(value => project(...value));
    context.save();
    context.fillStyle = `rgba(0,0,0,${0.88 * alpha})`;
    context.strokeStyle = palette(0.76, 0.65 * alpha);
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach(value => context.lineTo(value.x, value.y));
    context.closePath();
    context.fill();
    context.stroke();
    context.restore();
  }

  function drawBlockEvent(context, now) {
    if (!blockEvent) return false;
    const age = now - blockEvent.startedAt;
    const progress = clamp01(age / blockEvent.duration);
    const travel = easeInOut(progress);
    const arc = Math.sin(progress * Math.PI) * 0.75;
    const center = {
      x: mix(blockEvent.from.x, blockEvent.to.x, travel),
      y: mix(blockEvent.from.y, blockEvent.to.y, travel) + arc,
      z: mix(blockEvent.from.z, blockEvent.to.z, travel)
    };
    drawCavity(context, blockEvent.from, blockEvent.side, clamp01(1 - progress * 0.25));
    if (progress > 0.6) drawCavity(context, blockEvent.to, 0, clamp01((progress - 0.6) / 0.4));
    drawCube(context, center, blockEvent.rotation * travel, 0.45 + Math.sin(progress * Math.PI) * 0.5);
    if (progress >= 1) {
      blockEvent = null;
      document.documentElement.classList.remove('viewer-block-active');
      scheduleBlock(now);
      dirty = true;
      return false;
    }
    return true;
  }

  function updateFault(now) {
    if (!faultEvent) {
      document.documentElement.style.setProperty('--viewer-power', '1');
      document.documentElement.style.setProperty('--viewer-registration-x', '0px');
      document.documentElement.style.setProperty('--viewer-registration-y', '0px');
      return false;
    }
    const progress = clamp01((now - faultEvent.startedAt) / faultEvent.duration);
    const envelope = Math.sin(progress * Math.PI);
    faultEvent.level = envelope;
    let power = 1;
    let shiftX = 0;
    let shiftY = 0;
    if (faultEvent.type === 'power') power = 1 - envelope * 0.42;
    if (faultEvent.type === 'optical') shiftX = Math.sin(progress * Math.PI * 10) * envelope * 2.4;
    if (faultEvent.type === 'signal') shiftY = Math.sin(progress * Math.PI * 15) * envelope * 1.2;
    if (faultEvent.type === 'geometry') {
      shiftX = Math.sin(progress * Math.PI * 6) * envelope * 1.4;
      shiftY = Math.cos(progress * Math.PI * 7) * envelope * 0.8;
    }
    document.documentElement.style.setProperty('--viewer-power', power.toFixed(3));
    document.documentElement.style.setProperty('--viewer-registration-x', `${shiftX.toFixed(2)}px`);
    document.documentElement.style.setProperty('--viewer-registration-y', `${shiftY.toFixed(2)}px`);
    if (progress >= 1) {
      faultEvent = null;
      document.documentElement.classList.remove('viewer-fault-active');
      scheduleFault(now);
      return false;
    }
    return true;
  }

  function drawFaultForeground(context) {
    if (!faultEvent || faultEvent.level <= 0) return;
    const level = faultEvent.level;
    if (faultEvent.type === 'geometry') {
      const y = height * mix(0.22, 0.78, random());
      context.fillStyle = `rgba(255,54,36,${0.035 * level})`;
      context.fillRect(0, y, width, 2 + level * 3);
    }
    if (faultEvent.type === 'optical' || faultEvent.type === 'power') {
      context.save();
      context.globalCompositeOperation = 'lighter';
      context.fillStyle = `rgba(255,62,38,${0.025 * level})`;
      context.fillRect(0, 0, width, height);
      context.restore();
    }
    if (faultEvent.type === 'signal' && random() > 0.55) {
      context.strokeStyle = `rgba(255,112,78,${0.35 * level})`;
      context.lineWidth = 1;
      context.beginPath();
      const y = height * random();
      context.moveTo(0, y);
      context.lineTo(width, y + mix(-5, 5, random()));
      context.stroke();
    }
  }

  function dueEvents(now) {
    if (!blockEvent && now >= nextBlockAt) {
      if (!startBlockReconfiguration()) scheduleBlock(now);
    }
    if (!faultEvent && now >= nextFaultAt) {
      if (!startFault()) scheduleFault(now);
    }
  }

  function draw(now = performance.now()) {
    animationFrame = 0;
    if (!mounted || hidden || !width || !height) return;

    dueEvents(now);
    const booting = now - bootStartedAt < 2800;
    const eventActive = Boolean(blockEvent || faultEvent);
    const fps = eventActive || booting ? quality.eventFps : quality.ambientFps;
    const interval = 1000 / Math.max(1, fps);
    if (!dirty && now - lastRenderedAt < interval) {
      requestDraw();
      return;
    }
    lastRenderedAt = now;

    rearContext.clearRect(0, 0, width, height);
    frontContext.clearRect(0, 0, width, height);

    if (booting) drawBootChamber(rearContext, now);
    else rearContext.drawImage(chamberCache, 0, 0, width, height);

    drawMist(rearContext, now, false);
    drawMist(frontContext, now, true);
    const movingBlock = drawBlockEvent(frontContext, now);
    const activeFault = updateFault(now);
    drawFaultForeground(frontContext);

    dirty = false;
    const ambient = profile.density > 0 && !quality.reduced;
    if (booting || movingBlock || activeFault || ambient) requestDraw();
  }

  function requestDraw() {
    if (mounted && !hidden && !animationFrame) animationFrame = requestAnimationFrame(draw);
  }

  function onVisibilityChange() {
    hidden = document.hidden;
    if (hidden && animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    }
    if (!hidden) {
      lastRenderedAt = 0;
      dirty = true;
      requestDraw();
    }
  }

  function mount() {
    if (mounted) return;
    const rear = makeLayer('layered-chamber-rear', 'layered-chamber-layer layered-chamber-rear');
    const front = makeLayer('layered-chamber-front', 'layered-chamber-layer layered-chamber-front');
    rearRoot = rear.root;
    rearCanvas = rear.canvas;
    rearContext = rear.context;
    frontRoot = front.root;
    frontCanvas = front.canvas;
    frontContext = front.context;
    mounted = true;
    document.documentElement.classList.add(ROOT_CLASS, 'layered-chamber-mode', 'optical-mode');
    document.documentElement.dataset.viewerQuality = quality.name.toLowerCase();
    addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    bootStartedAt = performance.now();
    resize();
    scheduleBlock(bootStartedAt, true);
    scheduleFault(bootStartedAt, true);
    requestDraw();
  }

  function restart() {
    bootStartedAt = performance.now();
    blockEvent = null;
    faultEvent = null;
    document.documentElement.classList.remove('viewer-block-active', 'viewer-fault-active');
    dirty = true;
    scheduleBlock(bootStartedAt, true);
    scheduleFault(bootStartedAt, true);
    requestDraw();
  }

  function refresh() {
    dirty = true;
    requestDraw();
  }

  function getCameraSnapshot() {
    const focal = focalLength();
    const centreX = width * 0.5;
    const centreY = height * 0.5;
    const X = finalHalfWidth();
    const rectangleForPoints = points => {
      const xs = points.map(point => point.x);
      const ys = points.map(point => point.y);
      const left = Math.min(...xs);
      const top = Math.min(...ys);
      const right = Math.max(...xs);
      const bottom = Math.max(...ys);
      return { left, top, right, bottom, width: right - left, height: bottom - top };
    };
    const aperturePointsAt = (z, requestedHalfWidth = X) => [
      project(-requestedHalfWidth, geometry.halfHeight, z),
      project(requestedHalfWidth, geometry.halfHeight, z),
      project(requestedHalfWidth, -geometry.halfHeight, z),
      project(-requestedHalfWidth, -geometry.halfHeight, z)
    ];
    return {
      width,
      height,
      centreX,
      centreY,
      near: geometry.near,
      cell: geometry.cell,
      focalRatio: geometry.focal,
      focalLength: focal,
      halfWidth: geometry.halfWidth,
      halfHeight: geometry.halfHeight,
      wallShiftCells: geometry.wallShiftCells,
      finalHalfWidth: X,
      project,
      scaleAt: z => geometry.near / Math.max(0.0001, Number(z) || geometry.near),
      aperturePointsAt,
      apertureAt: (z, requestedHalfWidth) => rectangleForPoints(aperturePointsAt(z, requestedHalfWidth))
    };
  }

  function getRuntimeSnapshot() {
    return Object.freeze({
      mounted,
      quality: quality.name,
      dpr,
      ambientFps: quality.ambientFps,
      eventFps: quality.eventFps,
      terminal: terminalNumber,
      weather: profile.weatherType,
      mistBanks: mistBanks.length,
      blockActive: Boolean(blockEvent),
      faultActive: faultEvent?.type || null
    });
  }

  function init() {
    mount();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  return {
    MODES: Object.freeze({ BACKGROUND: 'background' }),
    mount,
    restart,
    refresh,
    injectEnergy: () => startFault('power'),
    reconfigureBlock: startBlockReconfiguration,
    triggerFault: startFault,
    getCameraSnapshot,
    getGeometryConfig: () => ({ ...geometry }),
    getRuntimeSnapshot,
    getMode: () => 'background',
    isMounted: () => mounted,
    isEnabled: () => true,
    setMode: () => refresh(),
    enable: mount,
    disable: () => {}
  };
})();
