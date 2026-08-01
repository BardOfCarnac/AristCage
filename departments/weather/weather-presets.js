/* Weather preset data and the preset-owned depth-flow policy installed before
   the accepted Weather factory is consumed. Haze remains a compatibility field
   but is intentionally zero in every profile. Ordinary mist retains the approved
   renderer baseline; heavy mist adds a deliberate forward chamber flow. */
window.NCNWeatherPresets = (() => {
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
    if (String(name || "clear") !== "heavy-mist") return 0;
    return clamp((Number(presets["heavy-mist"].depthFlow) || 0)
      - (Number(presets.mist.depthFlow) || 0));
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

      const internalWind = () => freezeWind({
        x: publicWind.x,
        y: publicWind.y,
        z: publicWind.z + presetOffset
      });

      const applyInternalWind = () => weather.setWind(internalWind());

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
              internalWindZ: internalWind().z
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
      snapshot: () => Object.freeze({
        ordinaryDepthFlow: presets.mist.depthFlow,
        heavyDepthFlow: presets["heavy-mist"].depthFlow,
        heavyOffset: presetDepthOffset("heavy-mist")
      })
    });
    return true;
  }

  installFactoryPolicy();
  return presets;
})();
