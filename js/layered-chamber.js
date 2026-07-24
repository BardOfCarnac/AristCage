/*==================================================
  PERMANENT CHAMBER RUNTIME

  One camera, one timer/RAF scheduler and two deliberately coarse compositor
  bands: rear chamber/far atmosphere and near atmosphere/glass effects.
  Optical DOM sits between them. Chamber-cell transfers persist in topology.
==================================================*/
window.LayeredChamber = (() => {
  'use strict';

  const TERMINAL_KEY = 'ncn-terminal-environment-number';
  const DEFAULT_TERMINAL = 'NCN-2045-001';
  const ROOT_CLASS = 'viewer-spatial-runtime';
  const COMPOSITOR_SPLIT_Z = 4.45;
  const INTERACTION_GRACE_MS = 5000;
  const MAX_PERSISTENT_TRANSFERS = 8;

  const geometry = {
    cell: 0.5,
    near: 2.5,
    finalDepthCells: 16,
    focal: 0.84,
    halfWidth: 3,
    halfHeight: 2.5,
    wallShiftCells: 2
  };

  const QUALITY_LEVELS = Object.freeze([
    Object.freeze({ name: 'LOW', dpr: 1, banks: 10, ambientFps: 12, eventFps: 24 }),
    Object.freeze({ name: 'STANDARD', dpr: 1.2, banks: 16, ambientFps: 18, eventFps: 30 }),
    Object.freeze({ name: 'HIGH', dpr: 1.45, banks: 22, ambientFps: 22, eventFps: 36 })
  ]);

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const clamp01 = value => clamp(value, 0, 1);
  const mix = (a, b, amount) => a + (b - a) * amount;
  const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;
  const easeInOut = value => {
    const t = clamp01(value);
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

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
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function initialQualityIndex() {
    const cores = navigator.hardwareConcurrency || 4;
    const memory = navigator.deviceMemory || 4;
    if (cores <= 4 || memory <= 3) return 0;
    if (cores <= 8 || memory <= 6) return 1;
    return 2;
  }

  function terminalProfile(number) {
    const value = key => rng(hash(`ncn-spatial-v2:${number}:${key}`))();
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

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
  const terminalNumber = storageGet(TERMINAL_KEY) || DEFAULT_TERMINAL;
  const profile = terminalProfile(terminalNumber);
  const random = rng(hash(`${terminalNumber}:${Date.now()}:${performance.now()}`));

  let qualityIndex = initialQualityIndex();
  let quality = QUALITY_LEVELS[qualityIndex];

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
  let rafId = 0;
  let timerId = 0;
  let scheduledAt = Infinity;
  let dirty = true;
  let hidden = document.hidden;
  let lastInteractionAt = performance.now();
  let renderCostAverage = 0;
  let overBudgetFrames = 0;
  let downgradePending = false;

  let blockEvent = null;
  let faultEvent = null;
  let nextBlockAt = Infinity;
  let nextFaultAt = Infinity;

  const topology = {
    vacancies: {
      left: new Map(),
      right: new Map()
    },
    rearBlocks: new Map(),
    history: []
  };

  function currentAmbientFps() {
    return reducedMotion
      ? Math.max(4, Math.round(quality.ambientFps * 0.45))
      : quality.ambientFps;
  }

  function focalLength() {
    return Math.min(width, height) * geometry.focal;
  }

  function snapCells(value) {
    return Math.max(
      geometry.cell,
      Math.round(value / geometry.cell) * geometry.cell
    );
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

    return {
      root,
      canvas,
      context: canvas.getContext('2d', { alpha: true })
    };
  }

  function makeMistSprite(kind) {
    const sprite = document.createElement('canvas');
    sprite.width = 160;
    sprite.height = 80;
    const context = sprite.getContext('2d');
    const gradient = context.createRadialGradient(80, 43, 2, 80, 43, 73);
    const cool = kind === 2;
    const hot = kind === 1;

    gradient.addColorStop(
      0,
      cool
        ? 'rgba(205,235,255,.62)'
        : hot
          ? 'rgba(255,135,78,.58)'
          : 'rgba(255,54,42,.5)'
    );
    gradient.addColorStop(
      0.35,
      cool ? 'rgba(92,164,255,.3)' : 'rgba(202,18,31,.28)'
    );
    gradient.addColorStop(0.72, 'rgba(96,4,18,.1)');
    gradient.addColorStop(1, 'rgba(20,0,5,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, sprite.width, sprite.height);
    return sprite;
  }

  function buildAtmosphere() {
    if (!sprites.length) {
      sprites = [makeMistSprite(0), makeMistSprite(1), makeMistSprite(2)];
    }

    const layout = rng(hash(`ncn-spatial-v2:${terminalNumber}:mist-layout`));
    const count = Math.max(
      8,
      Math.round(quality.banks * (0.56 + profile.density * 0.44))
    );

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

  function opticalLine(context, a, b, energy = 0.62, alpha = 0.34, widthScale = 1) {
    const A = project(a[0], a[1], a[2]);
    const B = project(b[0], b[1], b[2]);
    const z = (a[2] + b[2]) * 0.5;
    const contrast = clamp(
      Math.pow(geometry.near / Math.max(geometry.near, z), 0.42),
      0.05,
      1
    );

    context.strokeStyle = palette(
      energy * (0.3 + contrast * 0.7),
      alpha * Math.pow(contrast, 0.82)
    );
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

  function drawCube(context, center, rotation, alpha, persistent = false) {
    const points = cubeCorners(
      center,
      geometry.cell * (persistent ? 0.96 : 0.92),
      rotation
    ).map(point => project(...point));
    const edges = [[0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]];

    context.save();
    context.globalCompositeOperation = 'lighter';
    context.strokeStyle = palette(persistent ? 0.78 : 0.95, alpha);
    context.lineWidth = persistent ? 1 : 1.25;
    context.shadowColor = 'rgba(255,70,42,.65)';
    context.shadowBlur = persistent ? 5 : 8;
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
    const world = side
      ? [
          [point.x, point.y - half, point.z - half],
          [point.x, point.y + half, point.z - half],
          [point.x, point.y + half, point.z + half],
          [point.x, point.y - half, point.z + half]
        ]
      : [
          [point.x - half, point.y - half, point.z],
          [point.x - half, point.y + half, point.z],
          [point.x + half, point.y + half, point.z],
          [point.x + half, point.y - half, point.z]
        ];

    const points = world.map(value => project(...value));
    context.save();
    context.fillStyle = `rgba(0,0,0,${0.9 * alpha})`;
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

  function sideCellPoint(cell) {
    return {
      x: cell.side * finalHalfWidth(),
      y: cell.yIndex * geometry.cell,
      z: geometry.near + cell.zIndex * geometry.cell
    };
  }

  function rearCellPoint(cell) {
    return {
      x: cell.xIndex * geometry.cell,
      y: cell.yIndex * geometry.cell,
      z: rearDepth()
    };
  }

  function drawPersistentTopology(context) {
    topology.vacancies.left.forEach(cell => {
      drawCavity(context, sideCellPoint(cell), -1, 1);
    });
    topology.vacancies.right.forEach(cell => {
      drawCavity(context, sideCellPoint(cell), 1, 1);
    });

    topology.rearBlocks.forEach(cell => {
      const point = rearCellPoint(cell);
      drawCavity(context, point, 0, 1);
      drawCube(
        context,
        { x: point.x, y: point.y, z: point.z - geometry.cell * 0.46 },
        0,
        0.48,
        true
      );
    });
  }

  function rebuildCache() {
    if (!chamberCacheContext) return;
    drawSettledChamber(chamberCacheContext);
    drawPersistentTopology(chamberCacheContext);
  }

  function resizeCache() {
    chamberCache = document.createElement('canvas');
    chamberCache.width = Math.round(width * dpr);
    chamberCache.height = Math.round(height * dpr);
    chamberCacheContext = chamberCache.getContext('2d', { alpha: true });
    chamberCacheContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    rebuildCache();
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
    document.documentElement.dataset.viewerQuality = quality.name.toLowerCase();
    invalidate();
    dispatchEvent(new CustomEvent('ncn:chamber-camera-change', {
      detail: getCameraSnapshot()
    }));
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
    const faultBoost = faultEvent?.type === 'environment'
      ? faultEvent.level
      : 0;

    context.save();
    context.globalCompositeOperation = 'lighter';

    for (const bank of mistBanks) {
      const z = clamp(
        bank.z
          + Math.sin(elapsed * 0.09 + bank.phase) * profile.turbulence * 0.35
          + elapsed * bank.depthSpeed,
        geometry.near + 0.14,
        rearDepth() - 0.18
      );

      if ((z < COMPOSITOR_SPLIT_Z) !== nearLayer) continue;

      const xRange = X * 2.45;
      const x = -X * 1.22
        + mod(bank.x + elapsed * bank.speed + X * 1.22, xRange);
      const ceiling = profile.weatherType === 'ceilingSmoke';
      const baseY = ceiling ? Y - bank.lift : -Y + bank.lift;
      const y = baseY
        + Math.sin(elapsed * 0.33 + bank.phase) * profile.turbulence * 0.12;
      const point = project(x, y, z);
      const sprite = sprites[bank.sprite];
      const drawWidth = bank.width * focalLength() / z * 1.2;
      const drawHeight = drawWidth * 0.5;

      context.globalAlpha = profile.opacity
        * bank.alpha
        * (0.42 + profile.density * 0.46)
        * (nearLayer ? 0.62 : 0.48)
        * (1 + faultBoost * 0.2);

      context.drawImage(
        sprite,
        point.x - drawWidth * 0.5,
        point.y - drawHeight * (ceiling ? 0.25 : 0.75),
        drawWidth,
        drawHeight
      );
    }

    context.restore();
  }

  function markInteraction() {
    lastInteractionAt = performance.now();
  }

  function projectionTransitionBusy() {
    try {
      return typeof NCN_PROJECTION_TRANSITIONING !== 'undefined'
        && NCN_PROJECTION_TRANSITIONING;
    } catch {
      return false;
    }
  }

  function selectorTransitionBusy() {
    try {
      return typeof NCN_SELECTOR_TRANSITIONING !== 'undefined'
        && NCN_SELECTOR_TRANSITIONING;
    } catch {
      return false;
    }
  }

  function interactionBusy(now = performance.now()) {
    const active = document.activeElement;
    const editing = active?.matches?.(
      'input, textarea, select, button, [contenteditable="true"], .ncn-select-option'
    );

    return (
      now - lastInteractionAt < INTERACTION_GRACE_MS
      || projectionTransitionBusy()
      || selectorTransitionBusy()
      || Boolean(document.querySelector(
        '.entry.panel, .ncn-select.is-open, dialog[open], [aria-modal="true"], .panel-form:focus-within'
      ))
      || Boolean(editing)
    );
  }

  window.ViewerActivity = Object.freeze({
    markInteraction,
    isBusy: interactionBusy,
    isPanelActive: () => Boolean(document.querySelector('.entry.panel')),
    isEditing: () => Boolean(document.activeElement?.matches?.(
      'input, textarea, select, [contenteditable="true"]'
    ))
  });

  function scheduleBlock(now, initial = false) {
    if (reducedMotion) {
      nextBlockAt = Infinity;
      return;
    }
    nextBlockAt = now + (
      initial
        ? 18000
        : mix(70000, 150000, random())
    );
  }

  function scheduleFault(now, initial = false) {
    nextFaultAt = now + (
      initial
        ? 32000
        : mix(95000, 260000, random())
    );
  }

  function sideCellKey(yIndex, zIndex) {
    return `${yIndex}:${zIndex}`;
  }

  function rearCellKey(xIndex, yIndex) {
    return `${xIndex}:${yIndex}`;
  }

  function chooseTransfer() {
    const cell = geometry.cell;

    for (let attempt = 0; attempt < 48; attempt += 1) {
      const surface = random() < 0.5 ? 'left' : 'right';
      const side = surface === 'left' ? -1 : 1;
      const yIndex = Math.round(mix(
        -geometry.halfHeight / cell + 1,
        geometry.halfHeight / cell - 1,
        random()
      ));
      const zIndex = Math.round(mix(3, geometry.finalDepthCells - 2, random()));
      const sourceKey = sideCellKey(yIndex, zIndex);

      if (topology.vacancies[surface].has(sourceKey)) continue;

      const xIndex = Math.round(mix(
        -finalHalfWidth() / cell + 1,
        finalHalfWidth() / cell - 1,
        random()
      ));
      const targetYIndex = Math.round(mix(
        -geometry.halfHeight / cell + 1,
        geometry.halfHeight / cell - 1,
        random()
      ));
      const targetKey = rearCellKey(xIndex, targetYIndex);

      if (topology.rearBlocks.has(targetKey)) continue;

      const sourceCell = { surface, side, yIndex, zIndex };
      const targetCell = { xIndex, yIndex: targetYIndex };

      return {
        surface,
        side,
        sourceKey,
        targetKey,
        sourceCell,
        targetCell,
        from: sideCellPoint(sourceCell),
        to: rearCellPoint(targetCell)
      };
    }

    return null;
  }

  function startBlockReconfiguration() {
    const now = performance.now();
    if (
      blockEvent
      || hidden
      || reducedMotion
      || interactionBusy(now)
    ) {
      return false;
    }

    const transfer = chooseTransfer();
    if (!transfer) return false;

    blockEvent = {
      ...transfer,
      startedAt: now,
      duration: mix(1800, 2700, random()),
      rotation: mix(Math.PI * 0.5, Math.PI * 1.5, random())
    };

    document.documentElement.classList.add('viewer-block-active');
    invalidate();
    return true;
  }

  function startFault(type = null) {
    const now = performance.now();
    if (faultEvent || hidden || interactionBusy(now)) return false;

    const choices = ['power', 'optical', 'signal', 'geometry', 'environment'];
    const selected = choices.includes(type)
      ? type
      : choices[Math.floor(random() * choices.length)];

    faultEvent = {
      type: selected,
      startedAt: now,
      duration: mix(650, 1450, random()),
      level: 0
    };

    document.documentElement.classList.add('viewer-fault-active');
    invalidate();
    return true;
  }

  function finalizeBlockEvent(event, now) {
    topology.vacancies[event.surface].set(event.sourceKey, event.sourceCell);
    topology.rearBlocks.set(event.targetKey, event.targetCell);
    topology.history.push({
      surface: event.surface,
      sourceKey: event.sourceKey,
      targetKey: event.targetKey
    });

    while (topology.history.length > MAX_PERSISTENT_TRANSFERS) {
      const oldest = topology.history.shift();
      topology.vacancies[oldest.surface].delete(oldest.sourceKey);
      topology.rearBlocks.delete(oldest.targetKey);
    }

    blockEvent = null;
    document.documentElement.classList.remove('viewer-block-active');
    scheduleBlock(now);
    rebuildCache();
    dirty = true;
  }

  function blockFrame(now) {
    if (!blockEvent) return null;

    const progress = clamp01(
      (now - blockEvent.startedAt) / blockEvent.duration
    );

    if (progress >= 1) {
      finalizeBlockEvent(blockEvent, now);
      return null;
    }

    const travel = easeInOut(progress);
    const arc = Math.sin(progress * Math.PI) * 0.75;

    return {
      event: blockEvent,
      progress,
      center: {
        x: mix(blockEvent.from.x, blockEvent.to.x, travel),
        y: mix(blockEvent.from.y, blockEvent.to.y, travel) + arc,
        z: mix(blockEvent.from.z, blockEvent.to.z, travel)
      },
      rotation: blockEvent.rotation * travel,
      alpha: 0.45 + Math.sin(progress * Math.PI) * 0.5
    };
  }

  function contextForDepth(z) {
    return z < COMPOSITOR_SPLIT_Z ? frontContext : rearContext;
  }

  function drawBlockFrame(frame) {
    if (!frame) return false;
    const { event, progress, center, rotation, alpha } = frame;

    drawCavity(
      contextForDepth(event.from.z),
      event.from,
      event.side,
      clamp01(1 - progress * 0.25)
    );

    if (progress > 0.6) {
      drawCavity(
        rearContext,
        event.to,
        0,
        clamp01((progress - 0.6) / 0.4)
      );
    }

    drawCube(contextForDepth(center.z), center, rotation, alpha);
    return true;
  }

  function updateFault(now) {
    if (!faultEvent) {
      document.documentElement.style.setProperty('--viewer-power', '1');
      document.documentElement.style.setProperty('--viewer-registration-x', '0px');
      document.documentElement.style.setProperty('--viewer-registration-y', '0px');
      return false;
    }

    const progress = clamp01(
      (now - faultEvent.startedAt) / faultEvent.duration
    );
    const envelope = Math.sin(progress * Math.PI);
    faultEvent.level = envelope;

    let power = 1;
    let shiftX = 0;
    let shiftY = 0;

    if (faultEvent.type === 'power') {
      power = 1 - envelope * 0.42;
    }

    if (faultEvent.type === 'optical') {
      shiftX = Math.sin(progress * Math.PI * 10) * envelope * 2.4;
    }

    if (faultEvent.type === 'signal') {
      shiftY = Math.sin(progress * Math.PI * 15) * envelope * 1.2;
    }

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
      if (!startBlockReconfiguration()) {
        nextBlockAt = now + 12000;
      }
    }

    if (!faultEvent && now >= nextFaultAt) {
      if (!startFault()) {
        nextFaultAt = now + 12000;
      }
    }
  }

  function frameInterval(now) {
    const booting = now - bootStartedAt < 2800;
    const eventActive = Boolean(blockEvent || faultEvent);
    const fps = eventActive || booting
      ? quality.eventFps
      : currentAmbientFps();
    return 1000 / Math.max(1, fps);
  }

  function ambientActive() {
    return profile.density > 0 && !reducedMotion;
  }

  function nextEventWake() {
    return Math.min(nextBlockAt, nextFaultAt);
  }

  function clearSchedule() {
    if (rafId) cancelAnimationFrame(rafId);
    if (timerId) clearTimeout(timerId);
    rafId = 0;
    timerId = 0;
    scheduledAt = Infinity;
  }

  function scheduleNext(immediate = false) {
    if (!mounted || hidden) return;

    const now = performance.now();
    const booting = now - bootStartedAt < 2800;
    const active = Boolean(blockEvent || faultEvent);
    let target = Infinity;

    if (immediate || dirty) {
      target = now;
    } else if (booting || active || ambientActive()) {
      target = lastRenderedAt + frameInterval(now);
    }

    target = Math.min(target, nextEventWake());
    if (!Number.isFinite(target)) return;

    if (scheduledAt <= target + 1) return;
    clearSchedule();
    scheduledAt = target;

    const delay = Math.max(0, target - now);
    const enterRaf = () => {
      timerId = 0;
      scheduledAt = performance.now();
      if (!rafId) rafId = requestAnimationFrame(draw);
    };

    if (delay <= 4) {
      enterRaf();
    } else {
      timerId = setTimeout(enterRaf, delay);
    }
  }

  function invalidate() {
    dirty = true;
    scheduleNext(true);
  }

  function considerQualityDowngrade(renderCost, interval) {
    renderCostAverage = renderCostAverage
      ? renderCostAverage * 0.9 + renderCost * 0.1
      : renderCost;

    if (renderCost > interval * 0.62) overBudgetFrames += 1;
    else overBudgetFrames = Math.max(0, overBudgetFrames - 1);

    if (
      qualityIndex > 0
      && overBudgetFrames >= 18
      && !downgradePending
    ) {
      downgradePending = true;
      setTimeout(() => {
        qualityIndex -= 1;
        quality = QUALITY_LEVELS[qualityIndex];
        overBudgetFrames = 0;
        downgradePending = false;
        resize();
      }, 0);
    }
  }

  function draw(now = performance.now()) {
    rafId = 0;
    scheduledAt = Infinity;
    if (!mounted || hidden || !width || !height) return;

    dueEvents(now);
    const started = performance.now();
    const booting = now - bootStartedAt < 2800;
    dirty = false;

    rearContext.clearRect(0, 0, width, height);
    frontContext.clearRect(0, 0, width, height);

    if (booting) {
      drawBootChamber(rearContext, now);
    } else {
      rearContext.drawImage(chamberCache, 0, 0, width, height);
    }

    drawMist(rearContext, now, false);
    const movingBlock = drawBlockFrame(blockFrame(now));
    drawMist(frontContext, now, true);
    const activeFault = updateFault(now);
    drawFaultForeground(frontContext);

    lastRenderedAt = now;

    const renderCost = performance.now() - started;
    considerQualityDowngrade(renderCost, frameInterval(now));

    scheduleNext();
  }

  function onVisibilityChange() {
    hidden = document.hidden;
    clearSchedule();

    if (!hidden) {
      lastRenderedAt = 0;
      dirty = true;
      scheduleNext(true);
    }
  }

  function mount() {
    if (mounted) return;

    const rear = makeLayer(
      'layered-chamber-rear',
      'layered-chamber-layer layered-chamber-rear'
    );
    const front = makeLayer(
      'layered-chamber-front',
      'layered-chamber-layer layered-chamber-front'
    );

    rearRoot = rear.root;
    rearCanvas = rear.canvas;
    rearContext = rear.context;
    frontRoot = front.root;
    frontCanvas = front.canvas;
    frontContext = front.context;
    mounted = true;

    document.documentElement.classList.add(
      ROOT_CLASS,
      'layered-chamber-mode',
      'optical-mode'
    );

    addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('pointerdown', markInteraction, { passive: true });
    document.addEventListener('keydown', markInteraction, { passive: true });
    document.addEventListener('input', markInteraction, { passive: true });
    document.addEventListener('focusin', markInteraction, { passive: true });
    document.addEventListener('submit', markInteraction, { passive: true });

    bootStartedAt = performance.now();
    resize();
    scheduleBlock(bootStartedAt, true);
    scheduleFault(bootStartedAt, true);
    invalidate();
  }

  function restart() {
    bootStartedAt = performance.now();
    blockEvent = null;
    faultEvent = null;
    document.documentElement.classList.remove(
      'viewer-block-active',
      'viewer-fault-active'
    );
    scheduleBlock(bootStartedAt, true);
    scheduleFault(bootStartedAt, true);
    invalidate();
  }

  function refresh() {
    invalidate();
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
      return {
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top
      };
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
      scaleAt: z => geometry.near / Math.max(
        0.0001,
        Number(z) || geometry.near
      ),
      aperturePointsAt,
      apertureAt: (z, requestedHalfWidth) => rectangleForPoints(
        aperturePointsAt(z, requestedHalfWidth)
      )
    };
  }

  function getRuntimeSnapshot() {
    return Object.freeze({
      mounted,
      quality: quality.name,
      dpr,
      ambientFps: currentAmbientFps(),
      eventFps: quality.eventFps,
      renderCostAverage: Number(renderCostAverage.toFixed(2)),
      terminal: terminalNumber,
      weather: profile.weatherType,
      mistBanks: mistBanks.length,
      blockActive: Boolean(blockEvent),
      faultActive: faultEvent?.type || null,
      persistentVacancies:
        topology.vacancies.left.size + topology.vacancies.right.size,
      persistentRearBlocks: topology.rearBlocks.size,
      timerScheduled: Boolean(timerId),
      rafScheduled: Boolean(rafId),
      interactionBusy: interactionBusy()
    });
  }

  function destroy() {
    if (!mounted) return;
    clearSchedule();
    removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    document.removeEventListener('pointerdown', markInteraction);
    document.removeEventListener('keydown', markInteraction);
    document.removeEventListener('input', markInteraction);
    document.removeEventListener('focusin', markInteraction);
    document.removeEventListener('submit', markInteraction);
    rearRoot?.remove();
    frontRoot?.remove();
    mounted = false;
  }

  function init() {
    mount();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  return {
    MODES: Object.freeze({ BACKGROUND: 'background' }),
    mount,
    restart,
    refresh,
    destroy,
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
