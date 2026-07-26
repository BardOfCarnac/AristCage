"use strict";

const fs = require("node:fs");

const adapterPath = "js/chamber-motion-adapter.js";
let source = fs.readFileSync(adapterPath, "utf8");

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Could not find ${label}.`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Found more than one ${label}.`);
  }
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
`    const activePoses = new Map();
    const geometryListeners = new Set();`,
`    const activePoses = new Map();
    const capturedHandles = new Set();
    const geometryListeners = new Set();`,
"active-pose declarations"
);

replaceOnce(
`    let dpr = 1;
    let camera = null;`,
`    let dpr = 1;
    let camera = null;
    let catalogRefreshPending = false;
    let pendingGeometryDetail = null;
    let catalogRefreshQueued = false;`,
"camera state"
);

replaceOnce(
`    function applyStoredPose(id, pose) {
      if (pose) activePoses.set(id, pose);
      else activePoses.delete(id);
      scheduleDraw();
    }

    function makeHandle(id, region, u, v, geometry) {`,
`    function movementActive() {
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

    function makeHandle(id, region, u, v, geometry) {`,
"pose storage function"
);

replaceOnce(
`        capture: () => Object.freeze({ pose: activePoses.get(id) || null }),
        applyPose: pose => applyStoredPose(id, pose),
        restore: snapshot => applyStoredPose(id, snapshot?.pose || null),
        clearPose: () => applyStoredPose(id, null)`,
`        capture() {
          capturedHandles.add(id);
          return Object.freeze({ pose: activePoses.get(id) || null });
        },
        applyPose: pose => applyStoredPose(id, pose),
        restore: snapshot => applyStoredPose(id, snapshot?.pose || null),
        clearPose() {
          capturedHandles.delete(id);
          applyStoredPose(id, null);
        }`,
"movement handle methods"
);

replaceOnce(
`    function announceGeometryChange(event) {
      if (destroyed) return;
      rebuildCatalogs();
      geometryListeners.forEach(listener => {
        try { listener(event?.detail || camera); } catch (error) { console.error(error); }
      });
    }

    function clear() {
      activePoses.clear();
      scheduleDraw();
    }`,
`    function announceGeometryChange(event) {
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
    }`,
"geometry-change handler"
);

replaceOnce(
`        drawCount,
        activePoseCount: activePoses.size,
        canvasConnected: canvas.isConnected,`,
`        drawCount,
        activePoseCount: activePoses.size,
        capturedHandleCount: capturedHandles.size,
        deferredGeometryRefresh: catalogRefreshPending,
        canvasConnected: canvas.isConnected,`,
"adapter snapshot fields"
);

replaceOnce(
`      catalogs.clear();
      activePoses.clear();
      canvas.remove();`,
`      catalogs.clear();
      activePoses.clear();
      capturedHandles.clear();
      catalogRefreshPending = false;
      pendingGeometryDetail = null;
      catalogRefreshQueued = false;
      canvas.remove();`,
"adapter destruction cleanup"
);

replaceOnce(
`    function handlePanelChange(event) {
      const detail = event.detail || {};
      const open = detail.open === true
        && detail.app === "redwire"
        && ["filter", "submit"].includes(detail.name);
      if (open) {
        requestMovement({
          clusterSize: detail.name === "submit" ? [3, 6] : [2, 5],
          intensity: detail.name === "submit" ? 0.68 : 0.58
        }, \`panel:\${detail.name}\`);
      } else if (service?.snapshot?.().activeSequenceCount) {
        void service.settle?.({ reason: "panel-closed", duration: 420 });
      }
    }`,
`    function handlePanelChange(event) {
      const detail = event.detail || {};
      const open = detail.open === true
        && detail.app === "redwire"
        && ["filter", "submit"].includes(detail.name);
      if (open) {
        requestMovement({
          clusterSize: detail.name === "submit" ? [3, 6] : [2, 5],
          intensity: detail.name === "submit" ? 0.68 : 0.58
        }, \`panel:\${detail.name}\`);
        return;
      }

      const eligiblePanelStillOpen = currentApplication() === "redwire"
        && ["filter", "submit"].includes(currentPanel());
      const explicitClose = detail.open === false || detail.name == null;
      if (explicitClose && !eligiblePanelStillOpen && service?.snapshot?.().activeSequenceCount) {
        void service.settle?.({ reason: "panel-closed", duration: 420 });
      }
    }`,
"panel-change controller"
);

fs.writeFileSync(adapterPath, source);
console.log("Applied chamber-motion camera refresh correction.");
