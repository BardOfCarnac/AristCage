/*==================================================
  NCN CHAMBER MOVEMENT · WALL-MATCHED DEPTH PRESENTATION

  Host-owned presentation bridge:
  - moving cells use the settled LayeredChamber optical treatment;
  - rear Weather remains behind the opaque chamber cells by native layer order;
  - the Weather near layer is restored and clipped against the live block pose;
  - exact-depth foreground mist is redrawn over each moving solid;
  - composition runs synchronously after every Weather render.
==================================================*/
(() => {
  "use strict";

  const OPERATING_ENERGY = 0.61;
  const BASE_ALPHA = 0.34;
  const GLOW_ALPHA = 0.03 + 0.072 * OPERATING_ENERGY;
  const WALL_WIDTH_SCALE = 0.92;
  const CONTACT_EPSILON = 0.0125;
  const PALETTE_STOPS = Object.freeze([
    Object.freeze([30, 1, 4]),
    Object.freeze([88, 3, 9]),
    Object.freeze([160, 7, 14]),
    Object.freeze([238, 20, 18]),
    Object.freeze([255, 82, 34])
  ]);
  const FACE_DEFINITIONS = Object.freeze([
    Object.freeze({ indexes: Object.freeze([0, 1, 2, 3]), direction: "rear" }),
    Object.freeze({ indexes: Object.freeze([4, 5, 6, 7]), direction: "front" }),
    Object.freeze({ indexes: Object.freeze([0, 4, 7, 3]), direction: "left", neighbour: Object.freeze([-1, 0]) }),
    Object.freeze({ indexes: Object.freeze([1, 5, 6, 2]), direction: "right", neighbour: Object.freeze([1, 0]) }),
    Object.freeze({ indexes: Object.freeze([0, 1, 5, 4]), direction: "down", neighbour: Object.freeze([0, -1]) }),
    Object.freeze({ indexes: Object.freeze([3, 2, 6, 7]), direction: "up", neighbour: Object.freeze([0, 1]) })
  ]);

  const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, Number(value) || 0));
  const mix = (a, b, amount) => a + (b - a) * amount;
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const scale = (vector, amount) => [vector[0] * amount, vector[1] * amount, vector[2] * amount];

  let service = null;
  let weather = null;
  let runtime = null;
  let surface = null;
  let wallCanvas = null;
  let wallDrawing = null;
  let foregroundCanvas = null;
  let foregroundDrawing = null;
  let nearCanvas = null;
  let nearDrawing = null;
  let nearBackup = null;
  let nearBackupDrawing = null;
  let originalCanvas = null;
  let originalVisibility = "";
  let presentationTask = null;
  let weatherUnsubscribe = null;
  let destroyed = false;
  let initialised = false;
  let initPromise = null;
  let dpr = 1;
  let lastGeometryCount = 0;
  let renderedFaceCount = 0;
  let drawPasses = 0;
  let occlusionPasses = 0;
  let maskedCanvasCount = 0;
  let foregroundPuffPasses = 0;
  let foregroundPuffCount = 0;
  let weatherFrameCount = 0;
  let lastDepthFrameToken = null;
  let lastCamera = null;
  let hasNearBackup = false;
  const unsubscribers = [];

  function cameraSnapshot() {
    return window.NCNChamberCamera?.snapshot?.()
      || window.LayeredChamber?.getCameraSnapshot?.()
      || null;
  }

  function activeGeometry() {
    const items = service?.getActiveGeometry?.();
    return Array.isArray(items) ? items.filter(item => item?.pose) : [];
  }

  function pointFor(center, basis, u, v, n) {
    return add(add(add(center, scale(basis.u, u)), scale(basis.v, v)), scale(basis.n, n));
  }

  function cornersForPose(pose) {
    const halfSize = Math.max(0.001, Number(pose.size) || 0.5) * 0.5;
    const halfThickness = Math.max(0, Number(pose.thickness) || 0) * 0.5;
    const center = pose.centre || pose.center;
    const basis = pose.basis;
    if (!Array.isArray(center) || !basis?.u || !basis?.v || !basis?.n) return [];
    return [
      pointFor(center, basis, -halfSize, -halfSize, -halfThickness),
      pointFor(center, basis, halfSize, -halfSize, -halfThickness),
      pointFor(center, basis, halfSize, halfSize, -halfThickness),
      pointFor(center, basis, -halfSize, halfSize, -halfThickness),
      pointFor(center, basis, -halfSize, -halfSize, halfThickness),
      pointFor(center, basis, halfSize, -halfSize, halfThickness),
      pointFor(center, basis, halfSize, halfSize, halfThickness),
      pointFor(center, basis, -halfSize, halfSize, halfThickness)
    ];
  }

  function averageDepth(points) {
    return points.reduce((sum, point) => sum + point[2], 0) / Math.max(1, points.length);
  }

  function palette(value, alpha) {
    const scaled = clamp01(value) * (PALETTE_STOPS.length - 1);
    const index = Math.min(PALETTE_STOPS.length - 2, Math.floor(scaled));
    const local = scaled - index;
    const first = PALETTE_STOPS[index];
    const second = PALETTE_STOPS[index + 1];
    return `rgba(${Math.round(mix(first[0], second[0], local))},${Math.round(mix(first[1], second[1], local))},${Math.round(mix(first[2], second[2], local))},${clamp01(alpha)})`;
  }

  function opticalProfile(camera, z, energy, alpha) {
    const safeZ = Math.max(Number(camera?.near) || 2.5, Number(z) || 2.5);
    const near = Number(camera?.near) || 2.5;
    const cell = Number(camera?.cell) || 0.5;
    const focalLength = Number(camera?.focalLength) || Math.min(camera?.width || 1, camera?.height || 1) * 0.84;
    const zRatio = near / safeZ;
    const apparentCell = cell * focalLength / safeZ;
    const resolve = clamp01((apparentCell - 0.32) / 2.4);
    const contrast = clamp(Math.pow(zRatio, 0.42), 0.012, 1);
    const depthBrightness = 1 + Math.sin(safeZ * 4.93 + 0.7) * 0.012;
    const depthOpacity = 1 + Math.sin(safeZ * 3.17 + 1.2) * 0.008;
    return Object.freeze({
      brightness: clamp01(energy * (0.22 + contrast * 0.78) * depthBrightness),
      opacity: clamp01(alpha * Math.pow(contrast, 1.28) * (0.22 + resolve * 0.78) * depthOpacity),
      width: clamp(0.2 + 1.25 * Math.pow(contrast, 0.72), 0.2, 1.45)
    });
  }

  function clusterOccupancy(pose) {
    return new Set(Array.from(pose.clusterCells || []).map(cell => `${cell[0]}:${cell[1]}`));
  }

  function faceVisible(definition, pose, occupied) {
    if (!definition.neighbour) return definition.direction === "front" || Number(pose.thickness) > 0.0001;
    if (Number(pose.thickness) <= 0.0001) return false;
    const cell = pose.localCell;
    if (!Array.isArray(cell)) return true;
    return !occupied.has(`${cell[0] + definition.neighbour[0]}:${cell[1] + definition.neighbour[1]}`);
  }

  function cross(origin, first, second) {
    return (first.x - origin.x) * (second.y - origin.y) - (first.y - origin.y) * (second.x - origin.x);
  }

  function convexHull(points) {
    const unique = [...new Map(points
      .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
      .map(point => [`${point.x.toFixed(4)}:${point.y.toFixed(4)}`, point])).values()]
      .sort((first, second) => first.x - second.x || first.y - second.y);
    if (unique.length <= 3) return unique;
    const lower = [];
    for (const point of unique) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
      lower.push(point);
    }
    const upper = [];
    for (let index = unique.length - 1; index >= 0; index -= 1) {
      const point = unique[index];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
      upper.push(point);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  function padHull(points, padding = 1.25) {
    if (!points.length) return points;
    const centre = {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length
    };
    return points.map(point => {
      const dx = point.x - centre.x;
      const dy = point.y - centre.y;
      const length = Math.hypot(dx, dy) || 1;
      return { x: point.x + dx / length * padding, y: point.y + dy / length * padding };
    });
  }

  function projectedGeometry(geometry, camera) {
    const faces = [];
    const solids = [];
    geometry.forEach(item => {
      const pose = item.pose;
      const corners = cornersForPose(pose);
      if (corners.length !== 8) return;
      const projected = corners.map(point => camera.project(point[0], point[1], point[2]));
      if (projected.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return;
      const occupied = clusterOccupancy(pose);
      FACE_DEFINITIONS.forEach(definition => {
        if (!faceVisible(definition, pose, occupied)) return;
        const world = definition.indexes.map(index => corners[index]);
        faces.push(Object.freeze({
          sequenceId: item.sequenceId,
          blockId: item.blockId,
          phase: item.phase,
          depth: averageDepth(world),
          screen: definition.indexes.map(index => projected[index])
        }));
      });
      solids.push(Object.freeze({
        sequenceId: item.sequenceId,
        blockId: item.blockId,
        hull: Object.freeze(padHull(convexHull(projected)).map(point => Object.freeze(point))),
        nearerThan: Math.min(...corners.map(point => point[2])) + CONTACT_EPSILON
      }));
    });
    faces.sort((first, second) => second.depth - first.depth);
    return Object.freeze({ faces: Object.freeze(faces), solids: Object.freeze(solids) });
  }

  function sizePresentationCanvases(camera) {
    if (!camera || !wallCanvas || !foregroundCanvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(Number(camera.width) || window.innerWidth || 1));
    const height = Math.max(1, Math.round(Number(camera.height) || window.innerHeight || 1));
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    for (const [target, context] of [[wallCanvas, wallDrawing], [foregroundCanvas, foregroundDrawing]]) {
      if (target.width !== pixelWidth) target.width = pixelWidth;
      if (target.height !== pixelHeight) target.height = pixelHeight;
      target.style.width = `${width}px`;
      target.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  function tracePolygon(context, points, offset = null) {
    if (!points?.length) return false;
    const left = Number(offset?.left) || 0;
    const top = Number(offset?.top) || 0;
    context.beginPath();
    context.moveTo(points[0].x - left, points[0].y - top);
    for (let index = 1; index < points.length; index += 1) {
      context.lineTo(points[index].x - left, points[index].y - top);
    }
    context.closePath();
    return true;
  }

  function drawFace(face, camera) {
    if (!tracePolygon(wallDrawing, face.screen)) return;
    const base = opticalProfile(camera, face.depth, OPERATING_ENERGY, BASE_ALPHA);
    wallDrawing.fillStyle = "rgba(0,0,0,1)";
    wallDrawing.fill();
    wallDrawing.strokeStyle = palette(base.brightness, base.opacity);
    wallDrawing.lineWidth = base.width * WALL_WIDTH_SCALE;
    wallDrawing.stroke();

    const glow = opticalProfile(camera, face.depth, OPERATING_ENERGY, GLOW_ALPHA);
    wallDrawing.save();
    wallDrawing.globalCompositeOperation = "lighter";
    wallDrawing.strokeStyle = palette(glow.brightness, glow.opacity);
    wallDrawing.lineWidth = glow.width * WALL_WIDTH_SCALE;
    wallDrawing.stroke();
    wallDrawing.restore();
  }

  function suppressOriginalCanvas() {
    const next = document.querySelector?.("canvas[data-ncn-chamber-motion-canvas='production']") || null;
    if (!next) return false;
    if (originalCanvas !== next) {
      if (originalCanvas) originalCanvas.style.visibility = originalVisibility;
      originalCanvas = next;
      originalVisibility = originalCanvas.style.visibility || "";
    }
    originalCanvas.style.visibility = "hidden";
    return true;
  }

  function resolveNearCanvas() {
    const next = document.querySelector?.(".ncn-department-weather-near") || null;
    if (next !== nearCanvas) {
      nearCanvas = next;
      nearDrawing = nearCanvas?.getContext?.("2d") || null;
      hasNearBackup = false;
    }
    return nearCanvas;
  }

  function ensureNearBackup() {
    if (!resolveNearCanvas() || !nearDrawing) return false;
    if (!nearBackup) {
      nearBackup = document.createElement("canvas");
      nearBackupDrawing = nearBackup.getContext("2d", { alpha: true });
    }
    if (!nearBackupDrawing) return false;
    if (nearBackup.width !== nearCanvas.width) nearBackup.width = nearCanvas.width;
    if (nearBackup.height !== nearCanvas.height) nearBackup.height = nearCanvas.height;
    return true;
  }

  function captureNearFrame() {
    if (!ensureNearBackup()) return false;
    nearBackupDrawing.save();
    nearBackupDrawing.setTransform(1, 0, 0, 1, 0, 0);
    nearBackupDrawing.clearRect(0, 0, nearBackup.width, nearBackup.height);
    nearBackupDrawing.drawImage(nearCanvas, 0, 0);
    nearBackupDrawing.restore();
    hasNearBackup = true;
    return true;
  }

  function restoreNearFrame() {
    if (!hasNearBackup || !resolveNearCanvas() || !nearDrawing) return false;
    nearDrawing.save();
    nearDrawing.setTransform(1, 0, 0, 1, 0, 0);
    nearDrawing.clearRect(0, 0, nearCanvas.width, nearCanvas.height);
    nearDrawing.drawImage(nearBackup, 0, 0);
    nearDrawing.restore();
    return true;
  }

  function maskNearWeather(solids) {
    if (!solids.length || !restoreNearFrame()) {
      maskedCanvasCount = 0;
      return false;
    }
    const ownerRect = nearCanvas.parentElement?.getBoundingClientRect?.()
      || nearCanvas.getBoundingClientRect?.()
      || { left: 0, top: 0 };
    nearDrawing.save();
    nearDrawing.globalCompositeOperation = "destination-out";
    nearDrawing.fillStyle = "rgba(0,0,0,1)";
    solids.forEach(solid => {
      if (tracePolygon(nearDrawing, solid.hull, ownerRect)) nearDrawing.fill();
    });
    nearDrawing.restore();
    maskedCanvasCount = 1;
    occlusionPasses += 1;
    return true;
  }

  function clearForeground(camera = lastCamera) {
    if (!foregroundDrawing || !camera) return;
    foregroundDrawing.clearRect(0, 0, camera.width, camera.height);
    if (foregroundCanvas) foregroundCanvas.hidden = true;
    foregroundPuffCount = 0;
  }

  function renderForegroundMist(depthFrame, solids, camera) {
    clearForeground(camera);
    if (!depthFrame?.renderForeground || !solids.length || !foregroundDrawing || !foregroundCanvas) return 0;
    const viewport = Object.freeze({ left: 0, top: 0, width: camera.width, height: camera.height });
    let rendered = 0;
    foregroundCanvas.hidden = false;
    solids.forEach(solid => {
      foregroundDrawing.save();
      if (tracePolygon(foregroundDrawing, solid.hull)) foregroundDrawing.clip();
      rendered += depthFrame.renderForeground(foregroundDrawing, {
        nearerThan: solid.nearerThan,
        viewport,
        includeAttenuation: true
      });
      foregroundDrawing.restore();
    });
    foregroundPuffCount = rendered;
    if (rendered > 0) foregroundPuffPasses += 1;
    if (rendered === 0) foregroundCanvas.hidden = true;
    return rendered;
  }

  function drawPresentation(geometry, camera, projected) {
    suppressOriginalCanvas();
    sizePresentationCanvases(camera);
    wallDrawing.clearRect(0, 0, camera.width, camera.height);
    lastGeometryCount = geometry.length;
    wallCanvas.hidden = destroyed || geometry.length === 0;
    if (wallCanvas.hidden) {
      renderedFaceCount = 0;
      return false;
    }
    wallDrawing.save();
    wallDrawing.globalCompositeOperation = "source-over";
    projected.faces.forEach(face => drawFace(face, camera));
    wallDrawing.restore();
    renderedFaceCount = projected.faces.length;
    drawPasses += 1;
    return true;
  }

  function composeCurrentFrame(depthFrame = weather?.getDepthFrame?.() || null) {
    const camera = cameraSnapshot();
    lastCamera = camera;
    if (!camera || !wallDrawing || !foregroundDrawing) return false;
    const geometry = activeGeometry();
    const projected = projectedGeometry(geometry, camera);
    drawPresentation(geometry, camera, projected);
    if (!geometry.length) {
      restoreNearFrame();
      clearForeground(camera);
      maskedCanvasCount = 0;
      return false;
    }
    maskNearWeather(projected.solids);
    renderForegroundMist(depthFrame, projected.solids, camera);
    return true;
  }

  function presentationStep() {
    return composeCurrentFrame();
  }

  function afterWeatherRender(payload = {}) {
    if (destroyed || !initialised) return;
    weatherFrameCount += 1;
    lastDepthFrameToken = payload.depthFrame?.token || null;
    captureNearFrame();
    composeCurrentFrame(payload.depthFrame || weather?.getDepthFrame?.() || null);
  }

  function wake(reason = "host") {
    presentationTask?.wake?.(`chamber-presentation:${reason}`);
  }

  function attachServiceEvents() {
    if (!service?.addEventListener) return;
    [
      "blockmove:start",
      "blockmove:extract",
      "blockmove:settle",
      "blockmove:complete",
      "blockmove:cancel",
      "blockmove:error",
      "blockmove:reset"
    ].forEach(type => {
      const listener = () => wake(type);
      service.addEventListener(type, listener);
      unsubscribers.push(() => service?.removeEventListener?.(type, listener));
    });
  }

  function attachWindowEvent(type, listener) {
    window.addEventListener(type, listener);
    unsubscribers.push(() => window.removeEventListener(type, listener));
  }

  function mountCanvases() {
    surface = document.querySelector?.(".ncn-environment-layer--chamber-motion") || null;
    if (!(surface instanceof Element)) throw new Error("The chamber-motion presentation layer is unavailable.");

    wallCanvas = document.createElement("canvas");
    wallCanvas.className = "ncn-chamber-motion-canvas ncn-chamber-motion-wall-matched";
    wallCanvas.dataset.ncnChamberMotionCanvas = "wall-matched";
    wallCanvas.setAttribute("aria-hidden", "true");
    wallCanvas.hidden = true;

    foregroundCanvas = document.createElement("canvas");
    foregroundCanvas.className = "ncn-chamber-motion-canvas ncn-chamber-motion-foreground-mist";
    foregroundCanvas.dataset.ncnChamberMotionCanvas = "foreground-mist";
    foregroundCanvas.setAttribute("aria-hidden", "true");
    foregroundCanvas.hidden = true;

    [wallCanvas, foregroundCanvas].forEach(target => Object.assign(target.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none"
    }));

    surface.append(wallCanvas);
    surface.append(foregroundCanvas);
    wallDrawing = wallCanvas.getContext("2d", { alpha: true });
    foregroundDrawing = foregroundCanvas.getContext("2d", { alpha: true });
    if (!wallDrawing || !foregroundDrawing) throw new Error("Canvas 2D context is unavailable for chamber presentation.");
    suppressOriginalCanvas();
  }

  async function init() {
    if (initialised) return snapshot();
    if (destroyed) return snapshot();
    await window.NCNIntegratedDepartments?.ready?.();
    if (destroyed) return snapshot();

    service = window.NCNIntegration?.getService?.("chamber-motion") || null;
    weather = window.NCNIntegration?.getService?.("weather") || null;
    runtime = window.NCNViewerRuntime || null;
    if (!service?.getActiveGeometry) throw new Error("The accepted chamber-motion geometry service is unavailable.");
    if (!weather?.getDepthFrame || !weather?.subscribeAfterRender) throw new Error("The synchronized Weather frame contract is unavailable.");
    if (!runtime?.register) throw new Error("The shared viewer runtime is unavailable.");

    mountCanvases();
    if (destroyed) return snapshot();
    presentationTask = runtime.register("chamber-motion:wall-matched-presentation", presentationStep, {
      group: "chamber",
      priority: 29,
      maxFps: 30,
      enabled: true,
      wake: false
    });
    weatherUnsubscribe = weather.subscribeAfterRender(afterWeatherRender);
    attachServiceEvents();
    attachWindowEvent("ncn:chamber-camera-change", () => wake("camera"));
    attachWindowEvent("ncn:application-change", () => wake("application"));
    attachWindowEvent("ncn:runtime-quality", () => wake("quality"));
    initialised = true;
    wake("init");
    return snapshot();
  }

  function clear() {
    restoreNearFrame();
    if (wallDrawing && lastCamera) wallDrawing.clearRect(0, 0, lastCamera.width, lastCamera.height);
    clearForeground(lastCamera);
    if (wallCanvas) wallCanvas.hidden = true;
    lastGeometryCount = 0;
    renderedFaceCount = 0;
    maskedCanvasCount = 0;
    return snapshot();
  }

  function destroy(reason = "host-destroy") {
    if (destroyed) return false;
    destroyed = true;
    weatherUnsubscribe?.();
    weatherUnsubscribe = null;
    unsubscribers.splice(0).reverse().forEach(unsubscribe => {
      try { unsubscribe?.(); } catch (error) { console.error(error); }
    });
    presentationTask?.unregister?.();
    presentationTask = null;
    clear();
    wallCanvas?.remove?.();
    foregroundCanvas?.remove?.();
    if (originalCanvas) originalCanvas.style.visibility = originalVisibility;
    wallCanvas = null;
    wallDrawing = null;
    foregroundCanvas = null;
    foregroundDrawing = null;
    nearCanvas = null;
    nearDrawing = null;
    nearBackup = null;
    nearBackupDrawing = null;
    surface = null;
    service = null;
    weather = null;
    runtime = null;
    initialised = false;
    document.documentElement.dataset.chamberPresentationDestroyed = String(reason || "true");
    return true;
  }

  function snapshot() {
    return Object.freeze({
      initialised,
      destroyed,
      style: "layered-chamber-settled-optical",
      occlusionMode: "native-rear-exact-near-depth",
      weatherSynchronized: Boolean(weatherUnsubscribe),
      noPrivateAnimationLoop: true,
      lastGeometryCount,
      renderedFaceCount,
      drawPasses,
      occlusionPasses,
      maskedCanvasCount,
      foregroundPuffPasses,
      foregroundPuffCount,
      weatherFrameCount,
      lastDepthFrameToken,
      canvasConnected: Boolean(wallCanvas?.isConnected),
      canvasVisible: Boolean(wallCanvas?.isConnected && wallCanvas.hidden !== true),
      foregroundCanvasVisible: Boolean(foregroundCanvas?.isConnected && foregroundCanvas.hidden !== true),
      originalCanvasSuppressed: Boolean(originalCanvas && originalCanvas.style.visibility === "hidden"),
      presentationTask: presentationTask?.snapshot?.() || null
    });
  }

  const API = Object.freeze({
    init,
    ready: () => initPromise || (initPromise = init()),
    wake,
    clear,
    snapshot,
    destroy
  });

  window.NCNChamberPresentation = API;
  initPromise = init().catch(error => {
    document.documentElement.dataset.chamberPresentationError = String(error?.message || error);
    console.error("[NCN chamber presentation] synchronized depth presentation failed", error);
    return null;
  });
})();
