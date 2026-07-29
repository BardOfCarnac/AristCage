/*==================================================
  REDWIRE WEATHER CARD OCCLUSION

  Integration-owned bridge. Weather publishes a completed frame; this bridge
  removes Weather pixels beneath the actual rendered Optical plate rectangles.
  It does not alter Weather simulation, Optical geometry or application state.
==================================================*/
(() => {
  "use strict";

  const PLATE_SELECTOR = [
    ".optical-mode .optical-semantic-item[data-optical-role='plate']",
    ".optical-plate-surface"
  ].join(" ");
  const WEATHER_CANVAS_SELECTOR = "canvas.ncn-department-weather-canvas";

  let releaseWeather = null;
  let weatherService = null;
  let renderedFrames = 0;
  let lastPlateCount = 0;
  let lastCanvasCount = 0;

  function activeApplication() {
    return window.NCNApplications?.current?.()
      || (typeof NCN_STATE !== "undefined" ? NCN_STATE.activeApp : null)
      || "redwire";
  }

  function visiblePlateRects() {
    if (activeApplication() !== "redwire") return [];

    return [...document.querySelectorAll(PLATE_SELECTOR)]
      .filter(surface => {
        const item = surface.closest?.(".optical-semantic-item");
        if (item?.classList?.contains("optical-absent")) return false;
        const style = getComputedStyle(surface);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
        const rect = surface.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map(surface => {
        const rect = surface.getBoundingClientRect();
        return Object.freeze({
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height
        });
      });
  }

  function eraseWeatherUnderPlates() {
    const plates = visiblePlateRects();
    const canvases = [...document.querySelectorAll(WEATHER_CANVAS_SELECTOR)]
      .filter(canvas => !canvas.hidden && getComputedStyle(canvas).visibility !== "hidden");

    lastPlateCount = plates.length;
    lastCanvasCount = canvases.length;
    if (!plates.length || !canvases.length) return 0;

    let erased = 0;
    canvases.forEach(canvas => {
      const canvasRect = canvas.getBoundingClientRect();
      const context = canvas.getContext?.("2d");
      if (!context || canvasRect.width <= 0 || canvasRect.height <= 0) return;

      context.save?.();
      context.globalCompositeOperation = "destination-out";
      context.fillStyle = "rgba(0,0,0,1)";

      plates.forEach(rect => {
        const left = Math.max(rect.left, canvasRect.left);
        const top = Math.max(rect.top, canvasRect.top);
        const right = Math.min(rect.right, canvasRect.right);
        const bottom = Math.min(rect.bottom, canvasRect.bottom);
        if (right <= left || bottom <= top) return;
        context.fillRect?.(
          left - canvasRect.left,
          top - canvasRect.top,
          right - left,
          bottom - top
        );
        erased += 1;
      });

      context.restore?.();
    });

    renderedFrames += 1;
    return erased;
  }

  function onWeatherFrame(payload) {
    if (payload?.type !== "render") return 0;
    return eraseWeatherUnderPlates();
  }

  function ensureSubscription() {
    const candidate = window.NCNIntegration?.getService?.("weather") || null;
    if (!candidate || typeof candidate.subscribeAfterRender !== "function") return false;

    if (candidate === weatherService && releaseWeather?.active?.()) return true;

    try { releaseWeather?.(); } catch (error) { console.error(error); }
    weatherService = candidate;
    releaseWeather = candidate.subscribeAfterRender(onWeatherFrame);
    return Boolean(releaseWeather);
  }

  function release(reason = "redwire-weather-card-occlusion-release") {
    try { releaseWeather?.(reason); } catch (error) { console.error(error); }
    releaseWeather = null;
    weatherService = null;
  }

  function resubscribeAfterEnvironmentChange(event) {
    const detail = event?.detail || {};
    if (detail.phase !== "active" || detail.next !== "redwire") return;
    queueMicrotask(ensureSubscription);
  }

  async function start() {
    await window.NCNIntegratedDepartments?.ready?.();
    ensureSubscription();
  }

  window.addEventListener("ncn:application-environment-phase", resubscribeAfterEnvironmentChange);
  window.addEventListener("pagehide", () => release("pagehide"), { once: true });

  window.NCNRedWireWeatherCardOcclusion = Object.freeze({
    apply: eraseWeatherUnderPlates,
    ensureSubscription,
    release,
    snapshot: () => Object.freeze({
      active: Boolean(releaseWeather?.active?.()),
      application: activeApplication(),
      renderedFrames,
      lastPlateCount,
      lastCanvasCount
    })
  });

  void start().catch(error => {
    console.error("[NCN Integration] RedWire Weather card occlusion failed to start", error);
  });
})();
