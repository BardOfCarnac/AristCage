/*==================================================
  REDWIRE WEATHER CARD OCCLUSION

  Integration-owned completed-frame compositor. Weather behind Optical plates
  is removed from the department canvases, then the exact current-frame puffs
  nearer than each plate's real chamber depth are replayed above the article.

  This intentionally permits mist and smoke to obstruct RedWire articles. Poor
  terminal visibility is presentation, not a UI error; permanent shell controls
  remain outside the article-region compositor.
==================================================*/
(() => {
  "use strict";

  const PLATE_SELECTOR = [
    ".optical-mode .optical-semantic-item[data-optical-role='plate']",
    ".optical-plate-surface"
  ].join(" ");
  const WEATHER_CANVAS_SELECTOR = "canvas.ncn-department-weather-canvas";
  const FOREGROUND_CLASS = "ncn-redwire-weather-foreground";
  const DEFAULT_PLATE_DEPTH = 5.45;
  const FOREGROUND_Z_INDEX = 24;
  const EDGE_FEATHER = 6;

  let releaseWeather = null;
  let weatherService = null;
  let foregroundCanvas = null;
  let foregroundContext = null;
  let maskCanvas = null;
  let maskContext = null;
  let foregroundWidth = 0;
  let foregroundHeight = 0;
  let foregroundDpr = 1;
  let renderedFrames = 0;
  let lastPlateCount = 0;
  let lastCanvasCount = 0;
  let lastForegroundPuffs = 0;
  let lastForegroundRegions = 0;
  let lastForegroundThreshold = DEFAULT_PLATE_DEPTH;
  let lastForegroundDepthRange = null;
  let foregroundGeneration = 0;

  function activeApplication() {
    return window.NCNApplications?.current?.()
      || (typeof NCN_STATE !== "undefined" ? NCN_STATE.activeApp : null)
      || "redwire";
  }

  function weatherSnapshot() {
    try { return weatherService?.snapshot?.() || null; }
    catch (error) { console.error(error); return null; }
  }

  function visibleRect(node) {
    if (!node) return null;
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return null;
    const rect = node.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return Object.freeze({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height
    });
  }

  function plateDepth(surface) {
    const plane = surface.closest?.(".optical-plane")
      || surface.closest?.("[data-chamber-depth]")
      || null;
    const depth = Number(plane?.dataset?.chamberDepth);
    return Number.isFinite(depth) ? depth : DEFAULT_PLATE_DEPTH;
  }

  function visiblePlates() {
    if (activeApplication() !== "redwire") return [];

    return [...document.querySelectorAll(PLATE_SELECTOR)]
      .map(surface => {
        const item = surface.closest?.(".optical-semantic-item");
        if (item?.classList?.contains("optical-absent")) return null;
        const rect = visibleRect(surface);
        if (!rect) return null;
        return Object.freeze({
          ...rect,
          chamberZ: plateDepth(surface)
        });
      })
      .filter(Boolean)
      .sort((a, b) => a.top - b.top || a.left - b.left);
  }

  function visibleWeatherCanvases() {
    return [...document.querySelectorAll(WEATHER_CANVAS_SELECTOR)]
      .filter(canvas => !canvas.hidden && getComputedStyle(canvas).visibility !== "hidden");
  }

  function plateRect(plate) {
    if (!plate) return null;
    const rect = plate.rect || plate;
    if (![rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite)) return null;
    return rect;
  }

  function eraseWeatherUnderPlates(plates = visiblePlates(), canvases = visibleWeatherCanvases()) {
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

      plates.forEach(plate => {
        const rect = plateRect(plate);
        if (!rect) return;
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

  function createCanvas() {
    const canvas = document.createElement?.("canvas") || null;
    if (canvas) canvas.setAttribute?.("aria-hidden", "true");
    return canvas;
  }

  function ensureForegroundCanvas() {
    if (foregroundCanvas?.isConnected && foregroundContext && maskCanvas && maskContext) return foregroundCanvas;
    if (!document.body?.append) return null;

    foregroundCanvas = createCanvas();
    maskCanvas = createCanvas();
    if (!foregroundCanvas || !maskCanvas) return null;

    foregroundCanvas.className = FOREGROUND_CLASS;
    foregroundCanvas.hidden = true;
    Object.assign(foregroundCanvas.style || {}, {
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      zIndex: String(FOREGROUND_Z_INDEX),
      pointerEvents: "none",
      background: "transparent",
      contain: "strict",
      isolation: "isolate"
    });
    document.body.append(foregroundCanvas);
    foregroundContext = foregroundCanvas.getContext?.("2d", { alpha: true }) || null;
    maskContext = maskCanvas.getContext?.("2d", { alpha: true }) || null;
    foregroundGeneration += 1;
    return foregroundContext && maskContext ? foregroundCanvas : null;
  }

  function foregroundViewport() {
    if (!ensureForegroundCanvas() || !foregroundContext || !maskContext) return null;
    const width = Math.max(1, Number(globalThis.innerWidth) || Number(document.documentElement?.clientWidth) || 1);
    const height = Math.max(1, Number(globalThis.innerHeight) || Number(document.documentElement?.clientHeight) || 1);
    const dpr = Math.min(1.5, Math.max(1, Number(globalThis.devicePixelRatio) || 1));

    if (width !== foregroundWidth || height !== foregroundHeight || dpr !== foregroundDpr) {
      foregroundWidth = width;
      foregroundHeight = height;
      foregroundDpr = dpr;
      [foregroundCanvas, maskCanvas].forEach(canvas => {
        canvas.width = Math.max(1, Math.round(width * dpr));
        canvas.height = Math.max(1, Math.round(height * dpr));
      });
      foregroundCanvas.style.width = `${width}px`;
      foregroundCanvas.style.height = `${height}px`;
      foregroundContext.setTransform?.(dpr, 0, 0, dpr, 0, 0);
      maskContext.setTransform?.(dpr, 0, 0, dpr, 0, 0);
    }

    return Object.freeze({ left: 0, top: 0, right: width, bottom: height, width, height });
  }

  function clearForeground(hide = true) {
    if (foregroundContext && foregroundWidth > 0 && foregroundHeight > 0) {
      foregroundContext.clearRect?.(0, 0, foregroundWidth, foregroundHeight);
    }
    if (maskContext && foregroundWidth > 0 && foregroundHeight > 0) {
      maskContext.clearRect?.(0, 0, foregroundWidth, foregroundHeight);
    }
    if (foregroundCanvas && hide) foregroundCanvas.hidden = true;
    lastForegroundPuffs = 0;
    lastForegroundRegions = 0;
    lastForegroundDepthRange = null;
  }

  function foregroundRegions(plates) {
    const regions = plates.map(plate => {
      const rect = plateRect(plate);
      const nearerThan = Number(plate?.chamberZ);
      return Object.freeze({
        nearerThan: Number.isFinite(nearerThan) ? nearerThan : DEFAULT_PLATE_DEPTH,
        polygons: Object.freeze([Object.freeze([
          Object.freeze({ x: rect.left, y: rect.top }),
          Object.freeze({ x: rect.right, y: rect.top }),
          Object.freeze({ x: rect.right, y: rect.bottom }),
          Object.freeze({ x: rect.left, y: rect.bottom })
        ])])
      });
    });

    const depths = regions.map(region => region.nearerThan);
    if (depths.length) {
      lastForegroundThreshold = Math.max(...depths);
      lastForegroundDepthRange = Object.freeze({
        nearestSurface: Math.min(...depths),
        farthestSurface: Math.max(...depths)
      });
    }
    return regions;
  }

  function drawFeatherMask(plates, viewport) {
    if (!maskContext || !maskCanvas) return false;
    maskContext.clearRect?.(0, 0, viewport.width, viewport.height);
    maskContext.save?.();
    maskContext.filter = `blur(${EDGE_FEATHER}px)`;
    maskContext.fillStyle = "rgba(255,255,255,1)";
    plates.forEach(plate => {
      const rect = plateRect(plate);
      if (!rect) return;
      const inset = EDGE_FEATHER * 0.65;
      const left = rect.left + inset;
      const top = rect.top + inset;
      const width = Math.max(0, rect.width - inset * 2);
      const height = Math.max(0, rect.height - inset * 2);
      if (width <= 0 || height <= 0) return;
      maskContext.beginPath?.();
      if (typeof maskContext.roundRect === "function") {
        maskContext.roundRect(left, top, width, height, Math.min(16, height * 0.08));
        maskContext.fill?.();
      } else {
        maskContext.fillRect?.(left, top, width, height);
      }
    });
    maskContext.restore?.();
    return true;
  }

  function applyFeatherMask(plates, viewport) {
    if (!foregroundContext || !drawFeatherMask(plates, viewport)) return false;
    foregroundContext.save?.();
    foregroundContext.globalCompositeOperation = "destination-in";
    foregroundContext.drawImage?.(maskCanvas, 0, 0, viewport.width, viewport.height);
    foregroundContext.restore?.();
    return true;
  }

  function renderWeatherForeground(payload, plates, snapshot) {
    const depthFrame = payload?.depthFrame
      || weatherService?.getDepthFrame?.(payload?.token ?? payload?.runtimeToken)
      || null;
    if (!plates.length || !snapshot?.enabled || typeof depthFrame?.renderForeground !== "function") {
      clearForeground();
      return 0;
    }

    const viewport = foregroundViewport();
    if (!viewport || !foregroundContext) return 0;
    const regions = foregroundRegions(plates);
    foregroundContext.clearRect?.(0, 0, viewport.width, viewport.height);
    let rendered = 0;
    try {
      rendered = Number(depthFrame.renderForeground(foregroundContext, {
        viewport,
        regions,
        includeAttenuation: false
      })) || 0;
    } catch (error) {
      console.error("[NCN Integration] Weather foreground render failed", error);
      clearForeground();
      return 0;
    }

    if (rendered > 0) applyFeatherMask(plates, viewport);
    lastForegroundPuffs = rendered;
    lastForegroundRegions = regions.length;
    foregroundCanvas.hidden = rendered <= 0;
    return rendered;
  }

  function onWeatherFrame(payload) {
    if (payload?.type !== "render") return 0;
    if (activeApplication() !== "redwire") {
      clearForeground();
      return 0;
    }

    const plates = visiblePlates();
    const canvases = visibleWeatherCanvases();
    const snapshot = weatherSnapshot();
    const erased = eraseWeatherUnderPlates(plates, canvases);
    const foreground = renderWeatherForeground(payload, plates, snapshot);
    renderedFrames += 1;
    return erased + foreground;
  }

  function ensureSubscription() {
    if (activeApplication() !== "redwire") return false;
    const candidate = window.NCNIntegration?.getService?.("weather") || null;
    if (!candidate || typeof candidate.subscribeAfterRender !== "function") return false;

    if (candidate === weatherService && releaseWeather?.active?.()) return true;

    try { releaseWeather?.("weather-service-replaced"); } catch (error) { console.error(error); }
    weatherService = candidate;
    releaseWeather = candidate.subscribeAfterRender(onWeatherFrame);
    return Boolean(releaseWeather);
  }

  function release(reason = "redwire-weather-card-occlusion-release") {
    try { releaseWeather?.(reason); } catch (error) { console.error(error); }
    releaseWeather = null;
    weatherService = null;
    clearForeground();
    foregroundCanvas?.remove?.();
    foregroundCanvas = null;
    foregroundContext = null;
    maskCanvas = null;
    maskContext = null;
    foregroundWidth = 0;
    foregroundHeight = 0;
    foregroundDpr = 1;
    return true;
  }

  function onApplicationEnvironmentChange(event) {
    const detail = event?.detail || {};
    if (detail.phase === "active" && detail.next === "redwire") {
      queueMicrotask(ensureSubscription);
      return;
    }
    if (detail.next && detail.next !== "redwire") {
      release(`application-switch:${detail.next}`);
    }
  }

  async function start() {
    await window.NCNIntegratedDepartments?.ready?.();
    if (activeApplication() === "redwire") ensureSubscription();
  }

  window.addEventListener("ncn:application-environment-phase", onApplicationEnvironmentChange);
  window.addEventListener("pagehide", () => release("pagehide"), { once: true });

  window.NCNRedWireWeatherCardOcclusion = Object.freeze({
    apply: eraseWeatherUnderPlates,
    compose: onWeatherFrame,
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
      lastForegroundThreshold,
      lastForegroundDepthRange,
      foregroundDepth: DEFAULT_PLATE_DEPTH,
      foregroundDepthMode: "optical-plate",
      foregroundPresetPolicy: "all-enabled-atmosphere",
      foregroundZIndex: FOREGROUND_Z_INDEX,
      foregroundGeneration,
      foregroundConnected: Boolean(foregroundCanvas?.isConnected),
      weatherPolicyMutation: false
    })
  });

  void start().catch(error => {
    console.error("[NCN Integration] RedWire Weather card occlusion failed to start", error);
  });
})();
