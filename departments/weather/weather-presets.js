/* Weather preset data and preset-owned heavy-mist motion installed before the
   accepted Weather factory is consumed. Ordinary mist retains the approved floor
   bank behaviour. Heavy mist adds both forward depth flow and a slowly pulsing
   near-plate surge, published through Weather's existing depth-frame contract. */
window.NCNWeatherPresets = (() => {
  const HEAVY_MIST = "heavy-mist";
  const FOREGROUND_SURGE_DEPTH = 5.35;
  const SURGE_PERIOD_MS = 11000;
  const SURGE_ACTIVE_MS = 4200;

  const preset = values => Object.freeze({
    mist: 0,
    smoke: 0,
    dust: 0,
    rain: 0,
    haze: 0,
    moisture: 0,
    turbulence: 0.08,
    drift: 0.18,
    fallSpeed: 0.55,
    depthFlow: 0,
    verticalFill: 0,
    bankScale: 1,
    bankMultiplier: 1,
    electrical: 0,
    ...values,
    haze: 0
  });

  const presets = Object.freeze({
    clear: preset({}),
    dust: preset({
      dust: 0.48,
      turbulence: 0.32,
      drift: 0.34,
      depthFlow: -0.025
    }),
    mist: preset({
      mist: 0.54,
      moisture: 0.48,
      turbulence: 0.17,
      drift: 0.20,
      depthFlow: -0.018,
      verticalFill: 0.04,
      bankScale: 1.52,
      bankMultiplier: 1.58
    }),
    "heavy-mist": preset({
      mist: 0.98,
      moisture: 0.92,
      turbulence: 0.28,
      drift: 0.12,
      depthFlow: -0.72,
      verticalFill: 0.82,
      bankScale: 1.08,
      bankMultiplier: 1.85
    }),
    smoke: preset({
      mist: 0.58,
      smoke: 1,
      moisture: 0.28,
      turbulence: 0.34,
      drift: 0.12,
      depthFlow: -0.060
    }),
    "light-rain": preset({
      mist: 0.18,
      rain: 0.38,
      moisture: 0.58,
      turbulence: 0.20,
      drift: 0.16,
      fallSpeed: 0.72,
      depthFlow: -0.012
    }),
    rain: preset({
      mist: 0.24,
      rain: 0.78,
      moisture: 0.82,
      turbulence: 0.28,
      drift: 0.20,
      fallSpeed: 0.92,
      depthFlow: -0.018
    }),
    "electrical-weather": preset({
      mist: 0.54,
      dust: 0.08,
      rain: 0.20,
      moisture: 0.64,
      turbulence: 0.46,
      drift: 0.30,
      fallSpeed: 0.78,
      depthFlow: -0.035,
      electrical: 0.82
    })
  });

  const clamp = value => Math.max(-1, Math.min(1, Number(value) || 0));
  const freezeWind = value => Object.freeze({
    x: clamp(value?.x),
    y: clamp(value?.y),
    z: clamp(value?.z)
  });

  function normaliseWind(value, fallback = { x: 0, y: 0, z: 0 }) {
    if (Number.isFinite(Number(value))) return freezeWind({ x: Number(value), y: 0, z: 0 });
    if (!value || typeof value !== "object") return freezeWind(fallback);
    return freezeWind({
      x: Number.isFinite(Number(value.x)) ? value.x : fallback.x,
      y: Number.isFinite(Number(value.y)) ? value.y : fallback.y,
      z: Number.isFinite(Number(value.z)) ? value.z : fallback.z
    });
  }

  function presetDepthOffset(name) {
    if (String(name || "clear") !== HEAVY_MIST) return 0;
    return clamp((Number(presets[HEAVY_MIST].depthFlow) || 0)
      - (Number(presets.mist.depthFlow) || 0));
  }

  function regionBounds(region) {
    const points = Array.from(region?.polygons || []).flatMap(polygon => Array.from(polygon || []));
    if (!points.length) return null;
    const xs = points.map(point => Number(point?.x)).filter(Number.isFinite);
    const ys = points.map(point => Number(point?.y)).filter(Number.isFinite);
    if (!xs.length || !ys.length) return null;
    return Object.freeze({
      left: Math.min(...xs),
      top: Math.min(...ys),
      right: Math.max(...xs),
      bottom: Math.max(...ys),
      width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
      height: Math.max(1, Math.max(...ys) - Math.min(...ys))
    });
  }

  function traceRegion(targetContext, region, originX, originY) {
    const polygons = Array.from(region?.polygons || []);
    if (!polygons.length) return false;
    targetContext.beginPath?.();
    let traced = false;
    polygons.forEach(polygon => {
      const points = Array.from(polygon || []);
      if (points.length < 3) return;
      targetContext.moveTo?.(Number(points[0].x) - originX, Number(points[0].y) - originY);
      for (let index = 1; index < points.length; index += 1) {
        targetContext.lineTo?.(Number(points[index].x) - originX, Number(points[index].y) - originY);
      }
      targetContext.closePath?.();
      traced = true;
    });
    return traced;
  }

  function renderHeavyMistSurge(targetContext, options, elapsedMs) {
    const regions = Array.from(options?.regions || [])
      .filter(region => Number(region?.nearerThan) > FOREGROUND_SURGE_DEPTH)
      .map(region => ({ region, bounds: regionBounds(region) }))
      .filter(item => item.bounds);
    if (!regions.length) return 0;

    const cycle = ((Math.max(0, Number(elapsedMs) || 0) % SURGE_PERIOD_MS) + SURGE_PERIOD_MS) % SURGE_PERIOD_MS;
    if (cycle > SURGE_ACTIVE_MS) return 0;

    const progress = cycle / SURGE_ACTIVE_MS;
    const pulse = 0.42 + Math.sin(progress * Math.PI) * 0.58;
    const viewport = options?.viewport || { left: 0, top: 0 };
    const originX = Number(viewport.left) || 0;
    const originY = Number(viewport.top) || 0;
    let rendered = 0;

    regions.forEach(({ region, bounds }, regionIndex) => {
      targetContext.save?.();
      if (typeof targetContext.clip === "function" && traceRegion(targetContext, region, originX, originY)) {
        targetContext.clip();
      }

      const localLeft = bounds.left - originX;
      const localTop = bounds.top - originY;
      const travel = (progress * 1.5 - 0.25 + regionIndex * 0.17) % 1.5;
      const centreX = localLeft + bounds.width * travel;
      const centreY = localTop + bounds.height * (0.46 + Math.sin(progress * Math.PI * 2 + regionIndex) * 0.12);
      const radius = Math.max(bounds.width, bounds.height) * 0.86;
      const gradient = targetContext.createRadialGradient?.(
        centreX,
        centreY,
        radius * 0.04,
        centreX,
        centreY,
        radius
      );

      if (gradient) {
        gradient.addColorStop?.(0, `rgba(238,30,45,${(0.24 * pulse).toFixed(4)})`);
        gradient.addColorStop?.(0.38, `rgba(208,16,34,${(0.16 * pulse).toFixed(4)})`);
        gradient.addColorStop?.(0.72, `rgba(146,6,24,${(0.07 * pulse).toFixed(4)})`);
        gradient.addColorStop?.(1, "rgba(90,0,15,0)");
        targetContext.fillStyle = gradient;
        targetContext.fillRect?.(
          localLeft - bounds.width * 0.2,
          localTop - bounds.height * 0.35,
          bounds.width * 1.4,
          bounds.height * 1.7
        );
      }

      targetContext.restore?.();
      rendered += 1;
    });

    return rendered;
  }

  function wrapFactory(factory) {
    if (typeof factory !== "function" || factory.__ncnPresetDepthFlowPolicy === true) return factory;

    const wrappedFactory = context => {
      const weather = factory(context);
      if (!weather || typeof weather !== "object" || typeof weather.setWind !== "function") return weather;

      const initial = weather.snapshot?.() || {};
      let publicWind = normaliseWind(initial.wind);
      let selectedPreset = String(initial.targetPreset || initial.preset || "clear");
      let presetOffset = presetDepthOffset(selectedPreset);
      const decoratedFrames = new WeakMap();

      const internalWind = () => freezeWind({
        x: publicWind.x,
        y: publicWind.y,
        z: publicWind.z + presetOffset
      });

      const applyInternalWind = () => weather.setWind(internalWind());

      function decorateDepthFrame(frame) {
        if (!frame || typeof frame !== "object" || typeof frame.renderForeground !== "function") return frame;
        if (decoratedFrames.has(frame)) return decoratedFrames.get(frame);

        const decorated = Object.freeze({
          ...frame,
          presetSurgeDepth: FOREGROUND_SURGE_DEPTH,
          renderForeground(targetContext, options = {}) {
            let rendered = Number(frame.renderForeground(targetContext, options)) || 0;
            if (selectedPreset === HEAVY_MIST) {
              rendered += renderHeavyMistSurge(targetContext, options, frame.elapsedMs);
            }
            return rendered;
          }
        });
        decoratedFrames.set(frame, decorated);
        return decorated;
      }

      function snapshot() {
        const current = weather.snapshot?.() || {};
        return Object.freeze({
          ...current,
          wind: publicWind,
          diagnostics: Object.freeze({
            ...(current.diagnostics || {}),
            presetDepthFlow: Object.freeze({
              preset: selectedPreset,
              configured: Number(presets[selectedPreset]?.depthFlow) || 0,
              offset: presetOffset,
              publicWindZ: publicWind.z,
              internalWindZ: internalWind().z,
              foregroundSurgeDepth: FOREGROUND_SURGE_DEPTH,
              foregroundSurgeActive: selectedPreset === HEAVY_MIST
            })
          })
        });
      }

      async function init(...args) {
        await weather.init(...args);
        applyInternalWind();
        return snapshot();
      }

      function setWind(value = {}) {
        publicWind = normaliseWind(value, publicWind);
        applyInternalWind();
        return publicWind;
      }

      function setPreset(name) {
        selectedPreset = String(name || "clear");
        presetOffset = presetDepthOffset(selectedPreset);
        weather.setPreset(selectedPreset);
        applyInternalWind();
        return snapshot();
      }

      function transitionTo(name, options = {}) {
        selectedPreset = String(name || "clear");
        presetOffset = presetDepthOffset(selectedPreset);
        weather.transitionTo(selectedPreset, options);
        applyInternalWind();
        return snapshot();
      }

      function applyProfile(profile = {}, meta = {}) {
        const enabled = profile.enabled !== false;
        const legacyMist = Number(profile.mist);
        selectedPreset = String(
          profile.preset
          || (!enabled
            ? "clear"
            : Number.isFinite(legacyMist) && legacyMist > 0
              ? "mist"
              : selectedPreset || "clear")
        );
        presetOffset = enabled ? presetDepthOffset(selectedPreset) : 0;
        if (profile.wind !== undefined) publicWind = normaliseWind(profile.wind, publicWind);
        weather.applyProfile({
          ...profile,
          wind: internalWind()
        }, meta);
        return snapshot();
      }

      function setEnabled(value) {
        const enabled = Boolean(value);
        if (!enabled) {
          selectedPreset = "clear";
          presetOffset = 0;
        }
        const result = weather.setEnabled(enabled);
        if (enabled) applyInternalWind();
        return result;
      }

      function reset(...args) {
        publicWind = freezeWind({ x: 0, y: 0, z: 0 });
        selectedPreset = "clear";
        presetOffset = 0;
        return weather.reset(...args);
      }

      function destroy(...args) {
        publicWind = freezeWind({ x: 0, y: 0, z: 0 });
        selectedPreset = "clear";
        presetOffset = 0;
        return weather.destroy(...args);
      }

      function getDepthFrame(...args) {
        return decorateDepthFrame(weather.getDepthFrame?.(...args));
      }

      function subscribeAfterRender(listener) {
        if (typeof listener !== "function" || typeof weather.subscribeAfterRender !== "function") {
          return weather.subscribeAfterRender?.(listener);
        }
        return weather.subscribeAfterRender(payload => {
          if (payload?.type !== "render" || !payload.depthFrame) return listener(payload);
          return listener(Object.freeze({
            ...payload,
            depthFrame: decorateDepthFrame(payload.depthFrame)
          }));
        });
      }

      return Object.freeze({
        ...weather,
        init,
        applyProfile,
        setPreset,
        transitionTo,
        setWind,
        setEnabled,
        reset,
        destroy,
        getDepthFrame,
        subscribeAfterRender,
        snapshot
      });
    };

    Object.defineProperty(wrappedFactory, "__ncnPresetDepthFlowPolicy", {
      value: true,
      enumerable: false
    });
    return wrappedFactory;
  }

  function installFactoryPolicy() {
    const descriptor = Object.getOwnPropertyDescriptor(window, "createNCNWeatherDepartment");
    if (descriptor && descriptor.configurable === false) return false;

    let assignedFactory = wrapFactory(window.createNCNWeatherDepartment);
    Object.defineProperty(window, "createNCNWeatherDepartment", {
      configurable: true,
      enumerable: true,
      get: () => assignedFactory,
      set: value => { assignedFactory = wrapFactory(value); }
    });

    window.NCNWeatherPresetDepthFlowPolicy = Object.freeze({
      presetDepthOffset,
      wrapFactory,
      renderHeavyMistSurge,
      snapshot: () => Object.freeze({
        ordinaryDepthFlow: presets.mist.depthFlow,
        heavyDepthFlow: presets[HEAVY_MIST].depthFlow,
        heavyOffset: presetDepthOffset(HEAVY_MIST),
        foregroundSurgeDepth: FOREGROUND_SURGE_DEPTH,
        surgePeriodMs: SURGE_PERIOD_MS,
        surgeActiveMs: SURGE_ACTIVE_MS
      })
    });
    return true;
  }

  installFactoryPolicy();
  return presets;
})();
