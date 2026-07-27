/*==================================================
  ARTICLE DESCENT THROUGH THE PERSISTENT MIST FIELD

  Integration coordinates opaque Optical descent sessions with Weather's
  immutable current depth frame. It owns one transient canvas and one shared-
  runtime task. It neither snapshots articles nor simulates Weather.
==================================================*/

window.NCNArticleMistDescent = (() => {
  const TASK_NAME = "article-mist-descent";
  const sessions = new Map();
  const unsubscribers = [];

  let serial = 0;
  let canvas = null;
  let context = null;
  let runtimeHandle = null;
  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let destroyed = false;

  function runtime() {
    return window.NCNViewerRuntime || null;
  }

  function weather() {
    return window.NCNIntegration?.getService?.("weather") || null;
  }

  function currentApplication() {
    return window.NCNApplications?.current?.()
      || (typeof NCN_STATE !== "undefined" ? NCN_STATE.activeApp : "redwire")
      || "redwire";
  }

  function isRedWire() {
    return currentApplication() === "redwire";
  }

  function qualityPixelRatio() {
    const reduced = runtime()?.snapshot?.().quality === "reduced";
    return reduced ? 1 : Math.min(1.5, Math.max(1, window.devicePixelRatio || 1));
  }

  function ensureCanvas() {
    if (canvas?.isConnected) return canvas;
    canvas = document.createElement("canvas");
    canvas.className = "ncn-article-mist-compositor";
    canvas.setAttribute("aria-hidden", "true");
    canvas.hidden = true;
    document.body.append(canvas);
    context = canvas.getContext("2d", { alpha: true });
    resizeCanvas(true);
    return canvas;
  }

  function resizeCanvas(force = false) {
    if (!canvas || !context) return false;
    const nextWidth = Math.max(1, Math.round(window.innerWidth));
    const nextHeight = Math.max(1, Math.round(window.innerHeight));
    const nextRatio = qualityPixelRatio();
    if (!force && nextWidth === width && nextHeight === height && nextRatio === pixelRatio) return false;

    width = nextWidth;
    height = nextHeight;
    pixelRatio = nextRatio;
    canvas.width = Math.max(1, Math.round(width * pixelRatio));
    canvas.height = Math.max(1, Math.round(height * pixelRatio));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    return true;
  }

  function clearCanvas() {
    if (!context) return;
    context.save();
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.restore();
  }

  function finishEntry(id, entry, reason, cancelled = false) {
    if (!sessions.has(id)) return false;
    sessions.delete(id);
    try {
      if (cancelled) entry.session.cancel(reason);
      else entry.session.finish(reason);
    } catch (error) {
      console.error("[NCN article mist descent] session cleanup failed", error);
    }
    return true;
  }

  function cancelAll(reason = "article-mist-cancelled") {
    [...sessions.entries()].forEach(([id, entry]) => finishEntry(id, entry, reason, true));
    clearCanvas();
    if (canvas) canvas.hidden = true;
    runtimeHandle?.disable?.();
    return true;
  }

  function currentDepthFrame(frame) {
    const service = weather();
    if (!service?.getDepthFrame) return null;
    return service.getDepthFrame(frame?.frame) || service.getDepthFrame();
  }

  function renderSurface(depthFrame, surface, viewport) {
    if (!depthFrame || !surface || !Number.isFinite(Number(surface.chamberZ))) return 0;
    context.save();
    try {
      if (typeof surface.clip === "function") {
        surface.clip(context, viewport);
      } else if (surface.projectedBounds) {
        const bounds = surface.projectedBounds;
        context.beginPath();
        context.rect(bounds.left, bounds.top, bounds.width, bounds.height);
        context.clip();
      }
      return depthFrame.renderForeground(context, {
        nearerThan: Number(surface.chamberZ),
        viewport
      });
    } finally {
      context.restore();
    }
  }

  function step(frame) {
    if (destroyed || !sessions.size) return false;
    if (!isRedWire()) {
      cancelAll("application-left-redwire");
      return false;
    }

    ensureCanvas();
    resizeCanvas();
    clearCanvas();
    canvas.hidden = false;

    const depthFrame = currentDepthFrame(frame);
    const viewport = Object.freeze({ left: 0, top: 0, width, height });
    const now = Number(frame?.now) || performance.now();

    for (const [id, entry] of [...sessions.entries()]) {
      if (entry.startedAt === null) entry.startedAt = now;
      const duration = Math.max(1, Number(entry.session.duration) || 760);
      const progress = Math.max(0, Math.min(1, (now - entry.startedAt) / duration));
      let sample = null;

      try {
        sample = entry.session.sample(progress, frame);
      } catch (error) {
        console.error("[NCN article mist descent] Optical sample failed", error);
        finishEntry(id, entry, "optical-sample-error", true);
        continue;
      }

      renderSurface(depthFrame, sample?.surface || null, viewport);
      if (sample?.complete || progress >= 1) finishEntry(id, entry, "article-submerged", false);
    }

    if (!sessions.size) {
      clearCanvas();
      canvas.hidden = true;
      return false;
    }
    return true;
  }

  function ensureRuntimeTask() {
    if (runtimeHandle) return runtimeHandle;
    const sharedRuntime = runtime();
    if (!sharedRuntime?.register) return null;
    runtimeHandle = sharedRuntime.register(TASK_NAME, step, {
      group: "article",
      priority: 5,
      maxFps: 30,
      enabled: false,
      wake: false
    });
    return runtimeHandle;
  }

  function begin(session) {
    if (destroyed || !isRedWire() || !session
      || typeof session.sample !== "function"
      || typeof session.finish !== "function"
      || typeof session.cancel !== "function") return false;

    const task = ensureRuntimeTask();
    if (!task) return false;
    ensureCanvas();

    const id = ++serial;
    sessions.set(id, { session, startedAt: null });
    canvas.hidden = false;
    task.enable?.("article-mist-descent-start");
    task.wake?.("article-mist-descent-start");
    return true;
  }

  function destroy(reason = "article-mist-destroy") {
    if (destroyed) return false;
    cancelAll(reason);
    runtimeHandle?.unregister?.();
    runtimeHandle = null;
    unsubscribers.splice(0).forEach(unsubscribe => unsubscribe?.());
    canvas?.remove?.();
    canvas = null;
    context = null;
    destroyed = true;
    return true;
  }

  window.addEventListener("resize", () => resizeCanvas(true), { passive: true });
  window.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelAll("document-hidden");
  });
  window.addEventListener("ncn:application-change", event => {
    if (event.detail?.name !== "redwire") cancelAll("application-change");
  });
  const opticalUnsubscribe = window.NCNEvents?.on?.("optical:deactivated", () => {
    cancelAll("optical-deactivated");
  });
  if (opticalUnsubscribe) unsubscribers.push(opticalUnsubscribe);

  return Object.freeze({
    begin,
    cancelAll,
    destroy,
    snapshot: () => Object.freeze({
      active: sessions.size,
      canvas: Boolean(canvas?.isConnected),
      canvasVisible: Boolean(canvas && !canvas.hidden),
      runtimeTask: Boolean(runtimeHandle),
      pixelRatio,
      privateAnimationLoop: false,
      weatherSimulation: "read-only-current-depth-frame"
    })
  });
})();
