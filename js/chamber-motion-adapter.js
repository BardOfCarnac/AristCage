/*==================================================
  NCN CHAMBER MOVEMENT · PRODUCTION ADAPTER

  Supplies virtual chamber wall-cell handles to the accepted movement department
  and renders only temporary moving prisms on the terminal-owned motion surface.
  The protected LayeredChamber canvases and application roots remain untouched.
==================================================*/
(() => {
  "use strict";

  const REAR_DEPTH_CELLS = 16;
  const FACE_INDEXES = Object.freeze([
    Object.freeze([0, 1, 2, 3]),
    Object.freeze([4, 5, 6, 7]),
    Object.freeze([0, 4, 7, 3]),
    Object.freeze([1, 5, 6, 2]),
    Object.freeze([0, 1, 5, 4]),
    Object.freeze([3, 2, 6, 7])
  ]);

  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const scale = (vector, amount) => [vector[0] * amount, vector[1] * amount, vector[2] * amount];
  const average = values => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const enqueue = typeof queueMicrotask === "function"
    ? queueMicrotask
    : callback => Promise.resolve().then(callback);

  function pointFor(center, basis, u, v, n) {
    return add(add(add(center, scale(basis.u, u)), scale(basis.v, v)), scale(basis.n, n));
  }

  function cornersForPose(pose) {
    const halfSize = Math.max(0.001, Number(pose.size) || 0.5) * 0.5;
    const halfThickness = Math.max(0, Number(pose.thickness) || 0) * 0.5;
    const center = pose.centre || pose.center;
    const basis = pose.basis;
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

  function createAdapter(context) {
    const surface = context?.layers?.chamberMotion;
    if (!(surface instanceof Element)) {
      throw new TypeError("The production chamber-motion surface is unavailable.");
    }

    const canvas = document.createElement("canvas");
    canvas.className = "ncn-chamber-motion-canvas";
    canvas.dataset.ncnChamberMotionCanvas = "production";
    canvas.dataset.effectTargetKind = "chamber-block";
    canvas.setAttribute("aria-hidden", "true");
    canvas.hidden = true;
    surface.append(canvas);

    const drawing = canvas.getContext("2d");
    const activePoses = new Map();
    const capturedHandles = new Set();
    const geometryListeners = new Set();
    const catalogs = new Map();

    let destroyed = false;
    let suspended = false;
    let drawPending = false;
    let drawCount = 0;
    let geometryVersion = 0;
    let dpr = 1;
    let camera = null;
    let catalogRefreshPending = false;
    let pendingGeometryDetail = null;
    let catalogRefreshQueued = false;

    function currentCamera() {
      return context.chamber?.getCameraSnapshot?.()
        || window.NCNChamberCamera?.snapshot?.()
        || null;
    }

    function sizeCanvas(nextCamera) {
      if (!nextCamera || !drawing) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(nextCamera.width));
      const height = Math.max(1, Math.round(nextCamera.height));
      const pixelWidth = Math.round(width * dpr);
      const pixelHeight = Math.round(height * dpr);
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      drawing.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function scheduleDraw() {
      if (destroyed || drawPending) return;
      drawPending = true;
      enqueue(() => {
        drawPending = false;
        draw();
      });
    }

    function movementActive() {
      return capturedHandles.size > 0 || activePoses.size > 0;
    }

    function notifyGeometryChange(detail) {
      geometryListeners.forEach(listener => {
        try { listener(detail || camera); } catch (error) { console.error(error); }
      });
    }

    function flushDeferredGeometryChange() {
      catalogRefreshQueued = false;
      if (destroyed || movementActive() || !catalogRefreshPending) return;
      const detail = pendingGeometryDetail;
      catalogRefreshPending = false;
      pendingGeometryDetail = null;
      rebuildCatalogs();
      notifyGeometryChange(detail || camera);
    }

    function queueDeferredGeometryChange() {
      if (destroyed || movementActive() || !catalogRefreshPending || catalogRefreshQueued) return;
      catalogRefreshQueued = true;
      enqueue(flushDeferredGeometryChange);
    }

    function applyStoredPose(id, pose) {
      if (pose) activePoses.set(id, pose);
      else activePoses.delete(id);
      scheduleDraw();
      queueDeferredGeometryChange();
    }

    function makeHandle(id, region, u, v, geometry) {
      return Object.freeze({
        id,
        region,
        u,
        v,
        getGeometry: () => Object.freeze({
          center: Object.freeze([...geometry.center]),
          basis: Object.freeze({
            u: Object.freeze([...geometry.basis.u]),
            v: Object.freeze([...geometry.basis.v]),
            n: Object.freeze([...geometry.basis.n])
          }),
          size: geometry.size
        }),
        capture() {
          capturedHandles.add(id);
          return Object.freeze({ pose: activePoses.get(id) || null });
        },
        applyPose: pose => applyStoredPose(id, pose),
        restore: snapshot => applyStoredPose(id, snapshot?.pose || null),
        clearPose() {
          capturedHandles.delete(id);
          applyStoredPose(id, null);
        }
      });
    }

    function rebuildCatalogs() {
      camera = currentCamera();
      if (!camera) throw new Error("The shared chamber camera is unavailable.");
      sizeCanvas(camera);

      const cell = Number(camera.cell) || 0.5;
      const near = Number(camera.near) || 2.5;
      const halfWidth = Number(camera.finalHalfWidth) || Number(camera.halfWidth) || 3;
      const halfHeight = Number(camera.halfHeight) || 2.5;
      const rearDepth = near + REAR_DEPTH_CELLS * cell;
      const rows = Math.max(4, Math.round((halfHeight * 2) / cell));
      const rearColumns = Math.max(6, Math.round((halfWidth * 2) / cell));

      const left = [];
      const right = [];
      const rear = [];

      for (let v = 0; v < rows; v += 1) {
        const y = -halfHeight + (v + 0.5) * cell;
        for (let u = 0; u < REAR_DEPTH_CELLS; u += 1) {
          left.push(makeHandle(`left-${u}-${v}`, "left-wall", u, v, {
            center: [-halfWidth, y, near + (u + 0.5) * cell],
            basis: { u: [0, 0, 1], v: [0, 1, 0], n: [1, 0, 0] },
            size: cell
          }));
          right.push(makeHandle(`right-${u}-${v}`, "right-wall", u, v, {
            center: [halfWidth, y, rearDepth - (u + 0.5) * cell],
            basis: { u: [0, 0, -1], v: [0, 1, 0], n: [-1, 0, 0] },
            size: cell
          }));
        }
        for (let u = 0; u < rearColumns; u += 1) {
          rear.push(makeHandle(`rear-${u}-${v}`, "rear-wall", u, v, {
            center: [-halfWidth + (u + 0.5) * cell, y, rearDepth],
            basis: { u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, -1] },
            size: cell
          }));
        }
      }

      catalogs.set("left-wall", Object.freeze(left));
      catalogs.set("right-wall", Object.freeze(right));
      catalogs.set("rear-wall", Object.freeze(rear));
      geometryVersion += 1;
      scheduleDraw();
      return snapshot();
    }

    function projectedFaces() {
      if (!camera) camera = currentCamera();
      if (!camera?.project) return [];
      const faces = [];
      for (const [blockId, pose] of activePoses) {
        const corners = cornersForPose(pose);
        const projected = corners.map(point => camera.project(point[0], point[1], point[2]));
        FACE_INDEXES.forEach(indexes => {
          const world = indexes.map(index => corners[index]);
          const screen = indexes.map(index => projected[index]);
          faces.push({
            blockId,
            phase: pose.phase || null,
            depth: average(world.map(point => point[2])),
            screen
          });
        });
      }
      return faces.sort((first, second) => second.depth - first.depth);
    }

    function drawFace(face) {
      if (!drawing || face.screen.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return;
      drawing.beginPath();
      drawing.moveTo(face.screen[0].x, face.screen[0].y);
      for (let index = 1; index < face.screen.length; index += 1) {
        drawing.lineTo(face.screen[index].x, face.screen[index].y);
      }
      drawing.closePath();
      drawing.fillStyle = "rgba(5,0,2,0.965)";
      drawing.strokeStyle = "rgba(255,62,40,0.46)";
      drawing.lineWidth = 0.82;
      drawing.fill();
      drawing.stroke();
    }

    function draw() {
      if (destroyed || !drawing) return;
      camera = currentCamera() || camera;
      if (!camera) return;
      sizeCanvas(camera);
      drawing.clearRect(0, 0, camera.width, camera.height);

      const visible = !suspended && activePoses.size > 0;
      canvas.hidden = !visible;
      if (!visible) return;

      drawing.save();
      drawing.globalCompositeOperation = "source-over";
      projectedFaces().forEach(drawFace);
      drawing.restore();
      drawCount += 1;
    }

    function activeBounds() {
      if (!camera?.project || !activePoses.size) {
        return Object.freeze({ left: 0, top: 0, width: camera?.width || 0, height: camera?.height || 0 });
      }
      const points = [...activePoses.values()].flatMap(pose => (
        cornersForPose(pose).map(point => camera.project(point[0], point[1], point[2]))
      ));
      const xs = points.map(point => point.x).filter(Number.isFinite);
      const ys = points.map(point => point.y).filter(Number.isFinite);
      if (!xs.length || !ys.length) return canvas.getBoundingClientRect();
      const padding = 14;
      const left = Math.max(0, Math.min(...xs) - padding);
      const top = Math.max(0, Math.min(...ys) - padding);
      const right = Math.min(camera.width, Math.max(...xs) + padding);
      const bottom = Math.min(camera.height, Math.max(...ys) + padding);
      return Object.freeze({ left, top, right, bottom, width: right - left, height: bottom - top });
    }

    function announceGeometryChange(event) {
      if (destroyed) return;
      const nextCamera = currentCamera() || event?.detail || camera;
      if (nextCamera) {
        camera = nextCamera;
        sizeCanvas(camera);
      }
      scheduleDraw();

      if (movementActive()) {
        catalogRefreshPending = true;
        pendingGeometryDetail = event?.detail || camera;
        return;
      }

      rebuildCatalogs();
      notifyGeometryChange(event?.detail || camera);
    }

    function clear() {
      activePoses.clear();
      capturedHandles.clear();
      scheduleDraw();
      queueDeferredGeometryChange();
    }

    function setSuspended(next) {
      suspended = Boolean(next);
      scheduleDraw();
      return snapshot();
    }

    function snapshot() {
      return Object.freeze({
        type: "production-chamber-motion-adapter",
        destroyed,
        suspended,
        geometryVersion,
        drawCount,
        activePoseCount: activePoses.size,
        capturedHandleCount: capturedHandles.size,
        deferredGeometryRefresh: catalogRefreshPending,
        canvasConnected: canvas.isConnected,
        canvasVisible: canvas.isConnected && canvas.hidden !== true,
        catalogs: Object.freeze(Object.fromEntries(
          [...catalogs.entries()].map(([name, blocks]) => [name, blocks.length])
        ))
      });
    }

    function destroy() {
      if (destroyed) return false;
      destroyed = true;
      window.removeEventListener("ncn:chamber-camera-change", announceGeometryChange);
      geometryListeners.clear();
      catalogs.clear();
      activePoses.clear();
      capturedHandles.clear();
      catalogRefreshPending = false;
      pendingGeometryDetail = null;
      catalogRefreshQueued = false;
      canvas.remove();
      return true;
    }

    window.addEventListener("ncn:chamber-camera-change", announceGeometryChange);
    rebuildCatalogs();

    return Object.freeze({
      getBlocks: region => catalogs.get(String(region)) || Object.freeze([]),
      subscribeGeometryChange(listener) {
        if (typeof listener !== "function") throw new TypeError("A geometry listener is required.");
        geometryListeners.add(listener);
        return () => geometryListeners.delete(listener);
      },
      getEffectTarget: descriptor => Object.freeze({
        kind: "chamber-block",
        id: descriptor?.sequenceId || "chamber-motion",
        getElement: () => canvas,
        getBounds: activeBounds,
        isValid: () => !destroyed && canvas.isConnected
      }),
      setSuspended,
      clear,
      snapshot,
      destroy
    });
  }

  function createPublicationInstance(context, publication, options = {}) {
    if (!publication?.create) throw new Error("The accepted chamber-motion publication is unavailable.");
    const chamber = createAdapter(context);
    const core = publication.create(context, {
      chamber,
      seed: options.seed || "ncn-production-chamber-motion",
      logger: options.logger
    });
    let destroyed = false;
    let api = null;

    api = Object.freeze({
      version: core.version,
      async init() {
        try {
          await core.init();
          return api;
        } catch (error) {
          chamber.destroy();
          throw error;
        }
      },
      applyProfile: (...args) => core.applyProfile(...args),
      suspend(reason) {
        const result = core.suspend(reason);
        chamber.setSuspended(true);
        return result;
      },
      resume(reason) {
        const result = core.resume(reason);
        chamber.setSuspended(false);
        return result;
      },
      reset(options) {
        const result = core.reset(options);
        chamber.clear();
        return result;
      },
      async destroy(reason) {
        if (destroyed) return false;
        destroyed = true;
        try {
          return await core.destroy(reason);
        } finally {
          window.NCNChamberMotionController?.unbind?.(api);
          chamber.destroy();
        }
      },
      trigger: (...args) => core.trigger(...args),
      cancel: (...args) => core.cancel(...args),
      settle: (...args) => core.settle(...args),
      getActiveGeometry: (...args) => core.getActiveGeometry(...args),
      addEventListener: (...args) => core.addEventListener(...args),
      removeEventListener: (...args) => core.removeEventListener(...args),
      snapshot() {
        return Object.freeze({
          ...core.snapshot(),
          adapter: chamber.snapshot()
        });
      }
    });

    return api;
  }

  const controller = (() => {
    let service = null;
    let listening = false;
    let triggerSerial = 0;
    let lastTrigger = null;
    let lastResult = null;
    let proof = null;

    function currentApplication() {
      return window.NCNApplications?.current?.()
        || (typeof NCN_STATE !== "undefined" ? NCN_STATE.activeApp : "redwire")
        || "redwire";
    }

    function currentPanel() {
      return typeof NCN_STATE !== "undefined" ? NCN_STATE.activePanel : null;
    }

    function requestMovement(options = {}, reason = "panel") {
      if (!service?.trigger || currentApplication() !== "redwire") return false;
      const snapshot = service.snapshot?.();
      if (snapshot?.enabled === false || snapshot?.suspended === true) return false;
      if (snapshot?.activeSequenceCount > 0 && options.allowConcurrent !== true) return false;

      const request = Object.freeze({
        id: ++triggerSerial,
        reason,
        requestedAt: performance.now(),
        options: Object.freeze({ ...options })
      });
      lastTrigger = request;
      const result = service.trigger({
        pattern: "extract-rotate-settle",
        region: options.region || "side-walls",
        targetRegion: "rear-wall",
        clusterSize: options.clusterSize || [2, 5],
        intensity: Number.isFinite(options.intensity) ? options.intensity : 0.62,
        duration: options.duration,
        seed: options.seed
      });
      Promise.resolve(result).then(value => {
        lastResult = Object.freeze({ requestId: request.id, value, completedAt: performance.now() });
      }).catch(error => {
        lastResult = Object.freeze({ requestId: request.id, error: String(error?.message || error), completedAt: performance.now() });
      });
      return result;
    }

    function handlePanelChange(event) {
      const detail = event.detail || {};
      const open = detail.open === true
        && detail.app === "redwire"
        && ["filter", "submit"].includes(detail.name);
      if (open) {
        requestMovement({
          clusterSize: detail.name === "submit" ? [3, 6] : [2, 5],
          intensity: detail.name === "submit" ? 0.68 : 0.58
        }, `panel:${detail.name}`);
        return;
      }

      const eligiblePanelStillOpen = currentApplication() === "redwire"
        && ["filter", "submit"].includes(currentPanel());
      const explicitClose = detail.open === false || detail.name == null;
      if (explicitClose && !eligiblePanelStillOpen && service?.snapshot?.().activeSequenceCount) {
        void service.settle?.({ reason: "panel-closed", duration: 420 });
      }
    }

    function handleApplicationChange(event) {
      const next = event.detail?.name || currentApplication();
      if (next !== "redwire") {
        service?.cancel?.({ reason: `application:${next}` });
        return;
      }
      const panel = currentPanel();
      if (["filter", "submit"].includes(panel)) {
        requestMovement({ clusterSize: [2, 5], intensity: 0.6 }, `application:${next}:${panel}`);
      }
    }

    function attach() {
      if (listening) return;
      window.addEventListener("ncn:panel-change", handlePanelChange);
      window.addEventListener("ncn:application-change", handleApplicationChange);
      listening = true;
    }

    function detach() {
      if (!listening) return;
      window.removeEventListener("ncn:panel-change", handlePanelChange);
      window.removeEventListener("ncn:application-change", handleApplicationChange);
      listening = false;
    }

    function bind(nextService) {
      if (!nextService?.trigger || !nextService?.snapshot) {
        throw new TypeError("A chamber-motion service is required.");
      }
      service = nextService;
      attach();
      const panel = currentPanel();
      if (currentApplication() === "redwire" && ["filter", "submit"].includes(panel)) {
        requestMovement({ clusterSize: [2, 5], intensity: 0.6 }, `bind:${panel}`);
      }
      return snapshot();
    }

    function unbind(expected = null) {
      if (expected && service !== expected) return false;
      detach();
      service = null;
      return true;
    }

    function prove(mode = "large") {
      if (!service || currentApplication() !== "redwire") {
        proof = Object.freeze({ mode, started: false, reason: "redwire-service-unavailable" });
        return proof;
      }
      const selected = String(mode || "large").toLowerCase();
      const profile = Object.freeze({
        enabled: true,
        intensity: 0.82,
        quality: "full",
        maxActive: 1,
        clusterSize: selected === "single" ? [1, 1] : [4, 7],
        durationRange: [6800, 6800],
        maxFps: 30,
        effects: Object.freeze({})
      });
      void service.applyProfile?.(profile, { application: "redwire", reason: "chamber-motion-mobile-proof" });
      const movement = requestMovement({
        region: selected === "right" ? "right-wall" : selected === "left" ? "left-wall" : "side-walls",
        clusterSize: profile.clusterSize,
        intensity: profile.intensity,
        duration: 6800,
        allowConcurrent: false
      }, `proof:${selected}`);
      document.documentElement.dataset.chamberMotionTest = selected;
      proof = Object.freeze({ mode: selected, started: Boolean(movement), profile });
      return proof;
    }

    function snapshot() {
      return Object.freeze({
        bound: Boolean(service),
        listening,
        currentApplication: currentApplication(),
        currentPanel: currentPanel(),
        lastTrigger,
        lastResult,
        proof,
        service: service?.snapshot?.() || null
      });
    }

    return Object.freeze({ bind, unbind, prove, requestMovement, snapshot });
  })();

  window.NCNChamberMotionAdapter = Object.freeze({
    create: createAdapter,
    createPublicationInstance
  });
  window.NCNChamberMotionController = controller;
})();
