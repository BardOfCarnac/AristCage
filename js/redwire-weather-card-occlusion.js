/*==================================================
  REDWIRE WEATHER CARD OCCLUSION

  Integration-owned bridge. Weather publishes a completed frame; this bridge
  removes rear Weather pixels beneath the rendered Optical plates, then restores
  only the nearest heavy-mist puffs above those plates. It does not simulate a
  second weather field or create a private animation loop.
==================================================*/
(() => {
  "use strict";

  const PLATE_SELECTOR = [
    ".optical-mode .optical-semantic-item[data-optical-role='plate']",
    ".optical-plate-surface"
  ].join(" ");
  const WEATHER_CANVAS_SELECTOR = "canvas.ncn-department-weather-canvas";
  const FOREGROUND_CLASS = "ncn-redwire-weather-foreground";
  const HEAVY_MIST_PRESET = "heavy-mist";
  const HEAVY_FRONT_DEPTH = 3.35;
  const HEAVY_FORWARD_WIND = -0.72;
  const FOREGROUND_ALPHA = 0.86;

  let releaseWeather = null;
  let weatherService = null;
  let foregroundCanvas = null;
  let foregroundContext = null;
  let foregroundWidth = 0;
  let foregroundHeight = 0;
  let foregroundDpr = 1;
  let renderedFrames = 0;
  let lastPlateCount = 0;
  let lastCanvasCount = 0;
  let lastForegroundPuffs = 0;
  let lastForegroundRegions = 0;
  let automaticDepthWind = false;
  let previousDepthWind = 0;
  let injectedDepthWind = null;

  function activeApplication() {
    return window.NCNApplications?.current?.()
      || (typeof NCN_STATE !== "undefined" ? NCN_STATE.activeApp : null)
      || "redwire";
  }

  function weatherSnapshot() {
    try { return weatherService?.snapshot?.() || null; }
    catch (error) { console.error(error); return null; }
  }

  function isHeavyMist(snapshot = weatherSnapshot()) {
    return Boolean(
      snapshot?.enabled
      && (snapshot.targetPreset === HEAVY_MIST_PRESET || snapshot.preset === HEAVY_MIST_PRESET)
    );
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

  function visibleWeatherCanvases() {
    return [...document.querySelectorAll(WEATHER_CANVAS_SELECTOR)]
      .filter(canvas => !canvas.hidden && getComputedStyle(canvas).visibility !== "hidden");
  }

  function eraseWeatherUnderPlates(plates = visiblePlateRects(), canvases = visibleWeatherCanvases()) {
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

    return erased;
  }

  function ensureForegroundCanvas() {
    if (foregroundCanvas?.isConnected) return foregroundCanvas;
    if (!document.createElement || !document.body?.append) return null;

    foregroundCanvas = document.createElement("canvas");
    foregroundCanvas.className = FOREGROUND_CLASS;
    foregroundCanvas.setAttribute?.("aria-hidden", "true");
    foregroundCanvas.hidden = true;
    Object.assign(foregroundCanvas.style || {}, {
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      zIndex: "16",
      pointerEvents: "none",
      background: "transparent",
      contain: "strict"
    });
    document.body.append(foregroundCanvas);
    foregroundContext = foregroundCanvas.getContext?.("2d", { alpha: true }) || null;
    return foregroundContext ? foregroundCanvas : null;
  }

  function foregroundViewport() {
    if (!ensureForegroundCanvas() || !foregroundContext) return null;
    const width = Math.max(1, Number(globalThis.innerWidth) || Number(document.documentElement?.clientWidth) || 1);
    const height = Math.max(1, Number(globalThis.innerHeight) || Number(document.documentElement?.clientHeight) || 1);
    const dpr = Math.min(1.5, Math.max(1, Number(globalThis.devicePixelRatio) || 1));

    if (width !== foregroundWidth || height !== foregroundHeight || dpr !== foregroundDpr) {
      foregroundWidth = width;
      foregroundHeight = height;
      foregroundDpr = dpr;
      foregroundCanvas.width = Math.max(1, Math.round(width * dpr));
      foregroundCanvas.height = Math.max(1, Math.round(height * dpr));
      foregroundCanvas.style.width = `${width}px`;
      foregroundCanvas.style.height = `${height}px`;
      foregroundContext.setTransform?.(dpr, 0, 0, dpr, 0, 0);
    }

    return Object.freeze({ left: 0, top: 0, right: width, bottom: height, width, height });
  }

  function clearForeground(hide = true) {
    if (foregroundContext && foregroundWidth > 0 && foregroundHeight > 0) {
      foregroundContext.clearRect?.(0, 0, foregroundWidth, foregroundHeight);
    }
    if (foregroundCanvas && hide) foregroundCanvas.hidden = true;
    lastForegroundPuffs = 0;
    lastForegroundRegions = 0;
  }

  function foregroundRegions(plates) {
    return plates.map(rect => Object.freeze({
      nearerThan: HEAVY_FRONT_DEPTH,
      polygons: Object.freeze([Object.freeze([
        Object.freeze({ x: rect.left, y: rect.top }),
        Object.freeze({ x: rect.right, y: rect.top }),
        Object.freeze({ x: rect.right, y: rect.bottom }),
        Object.freeze({ x: rect.left, y: rect.bottom })
      ])])
    }));
  }

  function renderHeavyMistForeground(payload, plates, snapshot) {
    const depthFrame = payload?.depthFrame || weatherService?.getDepthFrame?.() || null;
    if (!plates.length || !isHeavyMist(snapshot) || typeof depthFrame?.renderForeground !== "function") {
      clearForeground();
      return 0;
    }

    const viewport = foregroundViewport();
    if (!viewport || !foregroundContext) return 0;
    const regions = foregroundRegions(plates);
    foregroundCanvas.hidden = false;
    foregroundContext.clearRect?.(0, 0, viewport.width, viewport.height);
    foregroundContext.save?.();
    foregroundContext.globalAlpha = FOREGROUND_ALPHA;
    let rendered = 0;
    try {
      rendered = Number(depthFrame.renderForeground(foregroundContext, {
        viewport,
        regions,
        includeAttenuation: false
      })) || 0;
    } finally {
      foregroundContext.restore?.();
    }

    lastForegroundPuffs = rendered;
    lastForegroundRegions = regions.length;
    if (!rendered) foregroundCanvas.hidden = true;
    return rendered;
  }

  function syncHeavyMistDepthWind(snapshot = weatherSnapshot()) {
    if (!weatherService || typeof weatherService.setWind !== "function" || !snapshot) return false;
    const heavy = isHeavyMist(snapshot);
    const current = snapshot.wind || { x: 0, y: 0, z: 0 };

    if (heavy && !automaticDepthWind) {
      previousDepthWind = Number(current.z) || 0;
      injectedDepthWind = Math.min(previousDepthWind, HEAVY_FORWARD_WIND);
      automaticDepthWind = true;
      if (Math.abs(previousDepthWind - injectedDepthWind) > 0.001) {
        weatherService.setWind({
          x: Number(current.x) || 0,
          y: Number(current.y) || 0,
          z: injectedDepthWind
        });
      }
      return true;
    }

    if (!heavy && automaticDepthWind) {
      const currentDepthWind = Number(current.z) || 0;
      if (injectedDepthWind !== null && Math.abs(currentDepthWind - injectedDepthWind) <= 0.001) {
        weatherService.setWind({
          x: Number(current.x) || 0,
          y: Number(current.y) || 0,
          z: previousDepthWind
        });
      }
      automaticDepthWind = false;
      previousDepthWind = 0;
      injectedDepthWind = null;
      return true;
    }

    return false;
  }

  function onWeatherFrame(payload) {
    if (payload?.type !== "render") return 0;
    if (activeApplication() !== "redwire") {
      clearForeground();
      return 0;
    }

    const plates = visiblePlateRects();
    const canvases = visibleWeatherCanvases();
    const snapshot = weatherSnapshot();
    const erased = eraseWeatherUnderPlates(plates, canvases);
    const foreground = renderHeavyMistForeground(payload, plates, snapshot);
    renderedFrames += 1;

    /* setWind invalidates the just-published depth frame, so apply the automatic
       heavy-mist push only after this completed frame has been composited. */
    queueMicrotask(() => syncHeavyMistDepthWind(weatherSnapshot()));
    return erased + foreground;
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
    const snapshot = weatherSnapshot();
    if (automaticDepthWind && snapshot) {
      const current = snapshot.wind || { x: 0, y: 0, z: 0 };
      if (injectedDepthWind !== null && Math.abs((Number(current.z) || 0) - injectedDepthWind) <= 0.001) {
        try {
          weatherService?.setWind?.({
            x: Number(current.x) || 0,
            y: Number(current.y) || 0,
            z: previousDepthWind
          });
        } catch (error) { console.error(error); }
      }
    }
    automaticDepthWind = false;
    previousDepthWind = 0;
    injectedDepthWind = null;
    try { releaseWeather?.(reason); } catch (error) { console.error(error); }
    releaseWeather = null;
    weatherService = null;
    clearForeground();
    foregroundCanvas?.remove?.();
    foregroundCanvas = null;
    foregroundContext = null;
    foregroundWidth = 0;
    foregroundHeight = 0;
  }

  function resubscribeAfterEnvironmentChange(event) {
    const detail = event?.detail || {};
    if (detail.phase === "active" && detail.next === "redwire") {
      queueMicrotask(ensureSubscription);
      return;
    }
    if (detail.next && detail.next !== "redwire") clearForeground();
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
      lastCanvasCount,
      lastForegroundPuffs,
      lastForegroundRegions,
      foregroundDepth: HEAVY_FRONT_DEPTH,
      automaticDepthWind,
      injectedDepthWind
    })
  });

  void start().catch(error => {
    console.error("[NCN Integration] RedWire Weather card occlusion failed to start", error);
  });
})();
