/*==================================================
  NCN WEATHER RENDERER

  Optional camera-aware floor atmosphere. Disabled profiles consume no frames.
  Active weather is capped below interaction frame rate by the shared runtime.
==================================================*/

window.NCNWeatherRenderer = (() => {
  const runtime = window.NCNViewerRuntime;
  const lifecycle = window.NCNViewerLifecycle;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const state = {
    enabled: false,
    mist: 0,
    targetMist: 0,
    wind: 0,
    phase: 0
  };

  let canvas = null;
  let context = null;
  let width = 0;
  let height = 0;
  let dpr = 1;

  const clamp01 = value => Math.max(0, Math.min(1, value));
  const lerp = (a, b, t) => a + (b - a) * t;

  function ensureCanvas() {
    if (canvas?.isConnected) return canvas;
    canvas = document.createElement("canvas");
    canvas.className = "ncn-floor-mist";
    canvas.setAttribute("aria-hidden", "true");
    context = canvas.getContext("2d");
    window.NCNEnvironmentHost.root().append(canvas);
    resize();
    return canvas;
  }

  function camera() {
    return window.LayeredChamber?.getCameraSnapshot?.()
      || window.NCNChamberCamera?.snapshot?.()
      || null;
  }

  function floorBand(cameraSnapshot) {
    if (!cameraSnapshot) {
      return { top: height * 0.64, bottom: height, vanishingX: width * 0.5 };
    }
    const nearLeft = cameraSnapshot.project(
      -cameraSnapshot.finalHalfWidth,
      -cameraSnapshot.halfHeight,
      cameraSnapshot.near
    );
    const nearRight = cameraSnapshot.project(
      cameraSnapshot.finalHalfWidth,
      -cameraSnapshot.halfHeight,
      cameraSnapshot.near
    );
    const far = cameraSnapshot.project(0, -cameraSnapshot.halfHeight, 10.5);
    return {
      top: Math.max(height * 0.48, far.y - 16),
      bottom: Math.min(height, Math.max(nearLeft.y, nearRight.y)),
      vanishingX: far.x
    };
  }

  function resize() {
    if (!canvas || !context) return;
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    runtimeHandle?.wake?.("weather-resize");
  }

  function clear() {
    if (context && width && height) context.clearRect(0, 0, width, height);
  }

  function draw(frame) {
    if (!state.enabled || !context || !width || !height) return false;
    const ambientAllowed = lifecycle?.allows?.("ambient") ?? true;
    state.mist = lerp(state.mist, state.targetMist, Math.min(1, frame.delta / 520));
    if (ambientAllowed) state.phase += frame.delta * (0.00005 + state.wind * 0.00007);

    clear();
    if (state.mist < 0.008) return Math.abs(state.targetMist - state.mist) > 0.003;

    const band = floorBand(camera());
    const bandHeight = Math.max(80, band.bottom - band.top);
    const layers = frame.quality === "reduced" ? 2 : 5;

    context.save();
    context.globalCompositeOperation = "screen";

    for (let layer = 0; layer < layers; layer += 1) {
      const depth = layer / Math.max(1, layers - 1);
      const y = band.top + bandHeight * (0.2 + depth * 0.66);
      const amplitude = bandHeight * (0.035 + depth * 0.045);
      const frequency = 0.007 + layer * 0.0018;
      const speed = state.phase * (22 + layer * 8);
      const alpha = state.mist * (0.018 + depth * 0.026);
      const gradient = context.createLinearGradient(0, band.top, 0, band.bottom);
      gradient.addColorStop(0, "rgba(255,70,42,0)");
      gradient.addColorStop(0.42, `rgba(255,78,50,${alpha * 0.38})`);
      gradient.addColorStop(1, `rgba(255,102,66,${alpha})`);
      context.fillStyle = gradient;
      context.beginPath();
      context.moveTo(0, band.bottom + 10);

      for (let x = 0; x <= width + 24; x += 24) {
        const perspective = 0.45
          + Math.abs(x - band.vanishingX) / Math.max(width, 1) * 0.65;
        const wave = Math.sin(x * frequency + speed + layer * 1.7)
          + Math.sin(x * frequency * 0.43 - speed * 0.72 + layer) * 0.48;
        context.lineTo(x, y + wave * amplitude * perspective);
      }

      context.lineTo(width, band.bottom + 10);
      context.closePath();
      context.fill();
    }

    context.restore();
    const settling = Math.abs(state.targetMist - state.mist) > 0.003;
    return settling || (ambientAllowed && state.enabled && state.mist > 0.01);
  }

  const runtimeHandle = runtime?.register?.("weather-mist", draw, {
    priority: 20,
    maxFps: 15,
    enabled: false,
    wake: false
  });

  function configure(profile = {}) {
    const enabled = Boolean(profile.enabled) && !reduceMotion.matches;
    state.enabled = enabled;
    state.targetMist = enabled ? clamp01(Number(profile.mist) || 0) : 0;
    state.wind = Number.isFinite(profile.wind) ? Math.max(-1, Math.min(1, profile.wind)) : 0;

    ensureCanvas();
    canvas.classList.toggle("is-enabled", enabled);

    if (enabled) {
      state.mist = Math.min(state.mist, state.targetMist);
      runtimeHandle?.enable?.("weather-profile");
    } else {
      state.mist = 0;
      clear();
      runtimeHandle?.disable?.();
    }
  }

  function setWeather(next = {}) {
    configure({
      enabled: next.enabled ?? state.enabled,
      mist: Number.isFinite(next.mist) ? next.mist : state.targetMist,
      wind: Number.isFinite(next.wind) ? next.wind : state.wind
    });
  }

  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("ncn:chamber-camera-change", () => runtimeHandle?.wake?.("weather-camera"));
  window.addEventListener("ncn:lifecycle-change", event => {
    if (state.enabled && event.detail?.next === lifecycle?.STATES?.READY) {
      runtimeHandle?.wake?.("weather-ready");
    }
  });
  reduceMotion.addEventListener?.("change", event => {
    if (event.matches) configure({ enabled: false });
  });

  return Object.freeze({
    configure,
    setWeather,
    disable: () => configure({ enabled: false }),
    snapshot: () => Object.freeze({ ...state })
  });
})();
