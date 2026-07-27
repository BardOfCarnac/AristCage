/*==================================================
  NCN CHAMBER MOVEMENT · HOST ACTIVITY COORDINATOR

  Keeps the accepted trigger-only movement publication active while a clear
  RedWire service panel is open. Scheduling remains host-owned and uses the
  shared viewer runtime; the movement department still owns every route and pose.
==================================================*/
(() => {
  "use strict";

  const TARGET_ACTIVE = 3;
  const MAX_ACTIVE = 4;
  const RETRY_DELAY = 1400;
  const runtime = window.NCNViewerRuntime;

  let service = null;
  let runtimeHandle = null;
  let attachedService = null;
  let nextAttemptAt = 0;
  let wakeCount = 0;
  let requestCount = 0;
  let lastWake = null;
  let lastFill = null;
  let lastOutcome = null;
  let serviceListeners = [];

  function currentApplication() {
    return window.NCNApplications?.current?.()
      || (typeof NCN_STATE !== "undefined" ? NCN_STATE.activeApp : "redwire")
      || "redwire";
  }

  function currentPanel() {
    return typeof NCN_STATE !== "undefined" ? NCN_STATE.activePanel : null;
  }

  function panelActivityRequested() {
    return currentApplication() === "redwire"
      && ["filter", "submit"].includes(currentPanel());
  }

  function proofModeRequested() {
    return new URLSearchParams(window.location.search).has("motionTest");
  }

  function resolveService() {
    return window.NCNIntegration?.getService?.("chamber-motion")
      || window.NCNModules?.get?.("chamber-motion")
      || null;
  }

  function detachServiceListeners() {
    serviceListeners.forEach(unsubscribe => {
      try { unsubscribe?.(); } catch (error) { console.error(error); }
    });
    serviceListeners = [];
    attachedService = null;
  }

  function listenToService(type, listener) {
    const target = service;
    if (!target?.addEventListener) return;
    target.addEventListener(type, listener);
    serviceListeners.push(() => target.removeEventListener?.(type, listener));
  }

  function attachServiceListeners() {
    if (!service || service === attachedService) return;
    detachServiceListeners();
    attachedService = service;
    const refill = event => wake(`sequence:${event.type}`);
    ["blockmove:complete", "blockmove:cancel", "blockmove:error"].forEach(type => {
      listenToService(type, refill);
    });
  }

  async function applyHostPolicy(reason = "ready") {
    service = resolveService();
    if (!service?.applyProfile) return null;
    attachServiceListeners();

    if (currentApplication() !== "redwire") return service.snapshot?.() || null;

    const patch = {
      maxActive: MAX_ACTIVE,
      clusterSize: [2, 7],
      reducedMotionPolicy: "deny"
    };
    if (proofModeRequested()) patch.reducedMotion = false;

    return service.applyProfile(patch, {
      application: "redwire",
      reason: `host-activity:${reason}`
    });
  }

  function desiredTarget(snapshot) {
    if (!panelActivityRequested()) return 0;
    const permitted = Math.max(1, Number(snapshot?.profile?.maxActive) || MAX_ACTIVE);
    return Math.min(TARGET_ACTIVE, permitted);
  }

  function updateActivityMarker(snapshot, state = null) {
    const root = document.documentElement;
    if (state) {
      root.dataset.chamberMotionActivity = state;
      return;
    }
    if (snapshot?.reducedMotion && !proofModeRequested()) {
      root.dataset.chamberMotionActivity = "reduced-motion";
    } else if (panelActivityRequested()) {
      root.dataset.chamberMotionActivity = "panel-active";
    } else {
      root.dataset.chamberMotionActivity = "idle";
    }
  }

  function requestFill(reason, clock = performance.now()) {
    service = resolveService();
    if (!service?.snapshot || !window.NCNChamberMotionController?.requestMovement) {
      updateActivityMarker(null, "service-unavailable");
      return false;
    }
    attachServiceListeners();

    const snapshot = service.snapshot();
    const target = desiredTarget(snapshot);
    const inFlight = Number(snapshot.activeSequenceCount || 0)
      + Number(snapshot.pendingApprovalCount || 0);
    const missing = Math.max(0, target - inFlight);

    if (!target || snapshot.enabled === false || snapshot.suspended === true) {
      updateActivityMarker(snapshot);
      lastFill = Object.freeze({ reason, target, inFlight, missing: 0, requested: 0, timestamp: clock });
      return false;
    }

    if (snapshot.reducedMotion && !proofModeRequested()) {
      updateActivityMarker(snapshot, "reduced-motion");
      lastFill = Object.freeze({ reason, target, inFlight, missing, requested: 0, suppressed: "reduced-motion", timestamp: clock });
      return false;
    }

    let requested = 0;
    const panel = currentPanel();
    for (let index = 0; index < missing; index += 1) {
      const movement = window.NCNChamberMotionController.requestMovement({
        allowConcurrent: true,
        clusterSize: panel === "submit" ? [3, 7] : [2, 6],
        intensity: panel === "submit" ? 0.72 : 0.64,
        duration: panel === "submit" ? 7600 : 6800,
        seed: `panel-activity:${panel}:${requestCount + 1}`
      }, `activity:${reason}:${index + 1}`);
      if (!movement) continue;
      requestCount += 1;
      const requestId = requestCount;
      requested += 1;
      Promise.resolve(movement).then(value => {
        lastOutcome = Object.freeze({ request: requestId, value, timestamp: performance.now() });
      }).catch(error => {
        lastOutcome = Object.freeze({ request: requestId, error: String(error?.message || error), timestamp: performance.now() });
      });
    }

    nextAttemptAt = clock + RETRY_DELAY;
    updateActivityMarker(snapshot, requested ? "requesting" : "panel-active");
    lastFill = Object.freeze({ reason, target, inFlight, missing, requested, timestamp: clock });
    return requested > 0;
  }

  function activityTick(frame) {
    if (!panelActivityRequested()) {
      updateActivityMarker(service?.snapshot?.() || null);
      return false;
    }
    const clock = Number(frame?.now) || performance.now();
    const snapshot = resolveService()?.snapshot?.() || null;
    const target = desiredTarget(snapshot);
    const inFlight = Number(snapshot?.activeSequenceCount || 0)
      + Number(snapshot?.pendingApprovalCount || 0);
    if (target > 0 && inFlight >= target) {
      updateActivityMarker(snapshot, "sustained");
      return false;
    }
    if (clock < nextAttemptAt) return true;
    requestFill("runtime", clock);
    return panelActivityRequested();
  }

  function ensureRuntimeTask() {
    if (runtimeHandle || !runtime?.register) return runtimeHandle;
    runtimeHandle = runtime.register("chamber-motion:panel-activity", activityTick, {
      group: "chamber",
      priority: 28,
      maxFps: 1,
      enabled: false
    });
    return runtimeHandle;
  }

  function wake(reason = "host") {
    wakeCount += 1;
    lastWake = Object.freeze({ reason, timestamp: performance.now() });
    const handle = ensureRuntimeTask();
    if (!handle || !panelActivityRequested()) {
      handle?.disable?.();
      updateActivityMarker(service?.snapshot?.() || null);
      return false;
    }
    nextAttemptAt = 0;
    const task = handle.snapshot?.();
    if (task?.enabled) handle.wake?.(`chamber-motion:${reason}`);
    else handle.enable?.(`chamber-motion:${reason}`);
    return true;
  }

  function handlePanelChange(event) {
    const detail = event.detail || {};
    const eligibleOpen = detail.open === true
      && detail.app === "redwire"
      && ["filter", "submit"].includes(detail.name);
    if (eligibleOpen) {
      void applyHostPolicy(`panel:${detail.name}`).then(() => wake(`panel:${detail.name}`));
      return;
    }
    if (!panelActivityRequested()) {
      runtimeHandle?.disable?.();
      updateActivityMarker(service?.snapshot?.() || null);
    }
  }

  function handleApplicationChange(event) {
    const next = event.detail?.name || currentApplication();
    if (next !== "redwire") {
      runtimeHandle?.disable?.();
      updateActivityMarker(null, "idle");
      return;
    }
    void applyHostPolicy(`application:${next}`).then(() => {
      if (panelActivityRequested()) wake(`application:${next}`);
    });
  }

  async function init() {
    try {
      await window.NCNIntegratedDepartments?.ready?.();
      service = resolveService();
      attachServiceListeners();
      ensureRuntimeTask();
      await applyHostPolicy("ready");
      if (panelActivityRequested()) wake("ready-panel");
      else updateActivityMarker(service?.snapshot?.() || null);
      return snapshot();
    } catch (error) {
      updateActivityMarker(null, "error");
      console.error("[NCN chamber motion] host activity coordinator failed", error);
      return null;
    }
  }

  function snapshot() {
    return Object.freeze({
      ready: Boolean(service),
      application: currentApplication(),
      panel: currentPanel(),
      panelActivityRequested: panelActivityRequested(),
      targetActive: TARGET_ACTIVE,
      maxActive: MAX_ACTIVE,
      wakeCount,
      requestCount,
      lastWake,
      lastFill,
      lastOutcome,
      runtimeTask: runtimeHandle?.snapshot?.() || null,
      service: service?.snapshot?.() || null
    });
  }

  window.addEventListener("ncn:panel-change", handlePanelChange);
  window.addEventListener("ncn:application-change", handleApplicationChange);
  window.NCNChamberMotionActivity = Object.freeze({ init, wake, snapshot });
  void init();
})();
