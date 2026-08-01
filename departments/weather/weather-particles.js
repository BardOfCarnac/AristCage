/*==================================================
  NCN WEATHER · DEPTH PARTICLE FIELD

  Weather-owned particle decorator. Adds deterministic chamber-depth motes,
  dark ash silhouettes, embers, electrical flecks and restrained near flares
  without changing the accepted mist renderer or creating a private frame loop.
==================================================*/
(() => {
  "use strict";

  const LAYERS = Object.freeze(["far", "rear", "middle", "near"]);
  const CLASS_NAME = "ncn-department-weather-particle-canvas";
  const PRESETS = window.NCNWeatherPresets || Object.freeze({ clear: Object.freeze({}) });
  const QUALITY = Object.freeze({
    reduced: Object.freeze({ count: 18, fps: 8, dpr: 1 }),
    low: Object.freeze({ count: 36, fps: 12, dpr: 1 }),
    medium: Object.freeze({ count: 64, fps: 24, dpr: 1.2 }),
    high: Object.freeze({ count: 96, fps: 30, dpr: 1.5 })
  });

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, Number(value) || 0));
  const clamp01 = value => clamp(value, 0, 1);
  const mix = (a, b, amount) => a + (b - a) * amount;

  function hashSeed(value) {
    let hash = 2166136261;
    for (const character of String(value ?? "ncn-weather-particles")) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    let state = hashSeed(seed) || 0x6d2b79f5;
    return () => {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function styleFor(snapshot = {}) {
    const presetName = String(snapshot.targetPreset || snapshot.preset || "clear");
    const preset = PRESETS[presetName] || PRESETS.clear || {};
    const mist = clamp01(preset.mist);
    const smoke = clamp01(preset.smoke);
    const dust = clamp01(preset.dust);
    const electrical = clamp01(preset.electrical);
    return Object.freeze({
      preset: presetName,
      density: clamp01(Math.max(mist * 0.22, smoke * 0.76, dust * 0.92, electrical * 0.88)),
      mist,
      smoke,
      dust,
      electrical,
      drift: clamp(preset.drift, -1, 1),
      depthFlow: clamp(preset.depthFlow, -1, 1),
      turbulence: clamp01(preset.turbulence),
      glow: clamp01(0.26 + mist * 0.18 + smoke * 0.50 + electrical * 0.62),
      silhouette: clamp01(0.20 + dust * 0.68 + smoke * 0.48),
      flareChance: clamp01(mist * 0.035 + smoke * 0.025 + electrical * 0.28),
      buoyancy: clamp01(smoke * 0.64 + electrical * 0.16)
    });
  }

  function wrapService(weather, context) {
    if (!weather || typeof weather !== "object" || weather.__ncnDepthParticles === true) return weather;

    const state = {
      initialised: false,
      enabled: false,
      suspended: false,
      destroyed: false,
      seed: Number(weather.snapshot?.()?.seed) || 2045,
      quality: null,
      elapsed: 0,
      frames: 0,
      drawn: 0,
      flares: 0,
      lightCaught: 0,
      mistBloomed: 0,
      smokeSuppressed: 0,
      kinds: { mote: 0, ash: 0, ember: 0, electrical: 0 },
      layerCounts: { far: 0, rear: 0, middle: 0, near: 0 }
    };

    let random = seededRandom(`${state.seed}:depth-particles`);
    let pool = [];
    let task = null;
    let resumeGuard = true;
    const canvases = new Map();
    const contexts = new Map();
    const rects = new Map();

    function snapshotBase() {
      return weather.snapshot?.() || {};
    }

    function boundsAndCamera() {
      const camera = context.chamber?.getCameraSnapshot?.() || null;
      return {
        camera,
        bounds: {
          halfWidth: Number(camera?.finalHalfWidth || camera?.halfWidth) || 4.2,
          halfHeight: Number(camera?.halfHeight) || 2.55,
          near: Number(camera?.near) || 2.5,
          far: Number(camera?.far) || 10.5,
          cell: Number(camera?.cell) || 0.5
        }
      };
    }

    function qualityFor(frame, base) {
      const requested = String(base.qualityOverride || base.quality || frame?.quality || "medium");
      if (frame?.reducedMotion || context.settings?.reducedMotion || requested === "reduced") return "reduced";
      if (QUALITY[requested]) return requested;
      const cores = Number(globalThis.navigator?.hardwareConcurrency) || 4;
      return cores <= 4 ? "low" : cores <= 8 ? "medium" : "high";
    }

    function mount() {
      for (const key of LAYERS) {
        const owner = context.layers?.weather?.[key];
        if (!owner) throw new Error(`Weather particle layer unavailable: weather:${key}`);
        const canvas = document.createElement("canvas");
        canvas.className = `ncn-department-weather-canvas ${CLASS_NAME} ${CLASS_NAME}-${key}`;
        canvas.setAttribute?.("aria-hidden", "true");
        Object.assign(canvas.style || {}, {
          position: "absolute",
          inset: "0",
          width: "100%",
          height: "100%",
          pointerEvents: "none"
        });
        owner.append?.(canvas);
        const drawing = canvas.getContext?.("2d", { alpha: true });
        if (!drawing) throw new Error(`2D context unavailable for Weather particles:${key}`);
        canvases.set(key, canvas);
        contexts.set(key, drawing);
      }
      setVisible(false);
    }

    function setVisible(visible) {
      canvases.forEach(canvas => {
        canvas.hidden = !visible;
        canvas.style.visibility = visible ? "visible" : "hidden";
      });
    }

    function resize(profile, force = false) {
      for (const key of LAYERS) {
        const canvas = canvases.get(key);
        const owner = canvas?.parentElement || canvas?.parentNode;
        const source = owner?.getBoundingClientRect?.() || canvas?.getBoundingClientRect?.() || {};
        const rect = {
          left: Number(source.left) || 0,
          top: Number(source.top) || 0,
          width: Math.max(1, Number(source.width) || Number(globalThis.innerWidth) || 1),
          height: Math.max(1, Number(source.height) || Number(globalThis.innerHeight) || 1),
          dpr: profile.dpr
        };
        const previous = rects.get(key);
        if (force || !previous || previous.width !== rect.width || previous.height !== rect.height || previous.dpr !== rect.dpr) {
          canvas.width = Math.max(1, Math.round(rect.width * profile.dpr));
          canvas.height = Math.max(1, Math.round(rect.height * profile.dpr));
          canvas.style.width = `${rect.width}px`;
          canvas.style.height = `${rect.height}px`;
          contexts.get(key).setTransform?.(profile.dpr, 0, 0, profile.dpr, 0, 0);
        }
        rects.set(key, rect);
      }
    }

    function layerFor(z, bounds) {
      const amount = clamp01((z - bounds.near) / Math.max(0.001, bounds.far - bounds.near));
      return amount >= 0.75 ? "far" : amount >= 0.5 ? "rear" : amount >= 0.25 ? "middle" : "near";
    }

    function chooseKind(style) {
      const weights = [
        ["electrical", style.electrical * 0.78],
        ["ember", style.smoke * 0.48 + style.electrical * 0.12],
        ["ash", style.dust * 1.05 + style.smoke * 0.54],
        ["mote", Math.max(0.10, style.mist * 0.36)]
      ];
      let roll = random() * (weights.reduce((sum, item) => sum + item[1], 0) || 1);
      for (const [kind, weight] of weights) {
        roll -= weight;
        if (roll <= 0) return kind;
      }
      return "mote";
    }

    function resetParticle(particle, bounds, style, initial = false) {
      particle.active = true;
      particle.kind = chooseKind(style);
      particle.x = mix(-bounds.halfWidth, bounds.halfWidth, random());
      particle.y = mix(-bounds.halfHeight, bounds.halfHeight, random());
      particle.z = mix(bounds.near + 0.12, bounds.far, random());
      particle.age = initial ? random() * 8 : 0;
      particle.life = mix(5, 15, random());
      particle.size = mix(0.045, 0.18, random());
      particle.alpha = mix(0.42, 1, random());
      particle.phase = random() * Math.PI * 2;
      particle.speed = mix(0.65, 1.25, random());
      particle.flare = random() < style.flareChance;
      particle.layer = layerFor(particle.z, bounds);
    }

    function ensurePool(count, bounds, style) {
      while (pool.length < count) {
        const particle = { active: false };
        resetParticle(particle, bounds, style, true);
        pool.push(particle);
      }
      pool.slice(count).forEach(particle => { particle.active = false; });
      pool.length = count;
    }

    function activeCount() {
      return pool.reduce((sum, particle) => sum + (particle.active ? 1 : 0), 0);
    }

    function targetActive(target, bounds, style) {
      let required = Math.max(0, target - activeCount());
      for (const particle of pool) {
        if (!required) break;
        if (particle.active) continue;
        resetParticle(particle, bounds, style);
        required -= 1;
      }
      let count = activeCount();
      for (let index = pool.length - 1; index >= 0 && count > target; index -= 1) {
        if (!pool[index].active) continue;
        pool[index].active = false;
        count -= 1;
      }
    }

    function update(particle, delta, bounds, style) {
      if (!particle.active) return;
      particle.age += delta;
      if (particle.age >= particle.life) {
        resetParticle(particle, bounds, style);
        return;
      }
      const wave = Math.sin(particle.phase + particle.age * (0.55 + style.turbulence * 1.8));
      particle.x += (style.drift * 0.22 + wave * style.turbulence * 0.08) * particle.speed * delta;
      particle.y += ((particle.kind === "ember" ? style.buoyancy * 0.18 : 0) + Math.cos(particle.phase + particle.age) * 0.025) * delta;
      particle.z += style.depthFlow * 0.18 * particle.speed * delta;
      if (particle.x > bounds.halfWidth) particle.x = -bounds.halfWidth;
      if (particle.x < -bounds.halfWidth) particle.x = bounds.halfWidth;
      if (particle.y > bounds.halfHeight) particle.y = -bounds.halfHeight;
      if (particle.y < -bounds.halfHeight) particle.y = bounds.halfHeight;
      if (particle.z > bounds.far) particle.z = bounds.near;
      if (particle.z < bounds.near) particle.z = bounds.far;
      particle.layer = layerFor(particle.z, bounds);
    }

    function project(particle, camera, bounds) {
      const layer = rects.get(particle.layer);
      const point = camera?.project?.(particle.x, particle.y, particle.z)
        || context.chamber?.project?.(particle.x, particle.y, particle.z);
      if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
        return { x: point.x - layer.left, y: point.y - layer.top };
      }
      return {
        x: ((particle.x / (bounds.halfWidth * 2)) + 0.5) * layer.width,
        y: (0.5 - particle.y / (bounds.halfHeight * 2)) * layer.height
      };
    }

    function lightCatch(particle, bounds) {
      const cell = Math.max(0.1, bounds.cell);
      const nearest = value => Math.abs(value / cell - Math.round(value / cell));
      const gridDistance = Math.min(nearest(particle.x), nearest(particle.y), nearest(particle.z - bounds.near));
      const grid = clamp01(1 - gridDistance / 0.18);
      const sweep = 0.5 + 0.5 * Math.sin(state.elapsed * 0.0011 + particle.z * 0.72 + particle.phase);
      return clamp01(grid * 0.72 + sweep * 0.28);
    }

    function clipToAperture(target, particle, camera, layer) {
      const aperture = camera?.apertureAt?.(particle.z);
      if (!aperture) return false;
      target.beginPath?.();
      target.rect?.(aperture.left - layer.left, aperture.top - layer.top, aperture.width, aperture.height);
      target.clip?.();
      return true;
    }

    function particleOpacity(particle) {
      const progress = clamp01(particle.age / Math.max(0.001, particle.life));
      return particle.alpha * Math.min(1, progress * 5, (1 - progress) * 5);
    }

    function drawParticle(particle, camera, bounds, style, intensity) {
      const target = contexts.get(particle.layer);
      const layer = rects.get(particle.layer);
      if (!target || !layer) return false;
      const point = project(particle, camera, bounds);
      const caught = lightCatch(particle, bounds);
      const yNormal = clamp01((particle.y + bounds.halfHeight) / (bounds.halfHeight * 2));
      const mistBloom = style.mist * clamp01(1 - yNormal * 1.8);
      const smokeCover = style.smoke * clamp01(0.25 + yNormal * 0.75);
      const base = particleOpacity(particle) * intensity;
      const silhouetteAlpha = base * style.silhouette * caught;
      const glowAlpha = base * (0.25 + caught * 0.75) * (1 - smokeCover * 0.62);
      if (mistBloom > 0.08) state.mistBloomed += 1;
      if (smokeCover > 0.12) state.smokeSuppressed += 1;
      if (caught > 0.58) state.lightCaught += 1;
      if (Math.max(silhouetteAlpha, glowAlpha) <= 0.004) return false;

      const depthScale = clamp(bounds.near / particle.z, 0.22, 1);
      const radius = clamp((1.4 + particle.size * 18) * depthScale, 0.8, 6.5);
      target.save?.();
      clipToAperture(target, particle, camera, layer);

      if (particle.kind === "ash") {
        target.fillStyle = `rgba(2,1,2,${silhouetteAlpha * 0.88})`;
        target.beginPath?.();
        target.ellipse?.(point.x, point.y, radius * 1.18, radius * 0.62, particle.phase, 0, Math.PI * 2);
        target.fill?.();
      } else {
        const electrical = particle.kind === "electrical";
        const ember = particle.kind === "ember";
        const red = electrical ? 255 : ember ? 255 : 242;
        const green = electrical ? 184 : ember ? 74 : 148;
        const blue = electrical ? 132 : ember ? 36 : 112;
        const halo = radius * (2.0 + style.glow * 2.0 + mistBloom * 1.6);
        const gradient = target.createRadialGradient?.(point.x, point.y, 0, point.x, point.y, halo);
        if (gradient) {
          gradient.addColorStop?.(0, `rgba(255,246,234,${glowAlpha * 0.92})`);
          gradient.addColorStop?.(0.18, `rgba(${red},${green},${blue},${glowAlpha * 0.72})`);
          gradient.addColorStop?.(1, `rgba(${red},${Math.round(green * 0.4)},${Math.round(blue * 0.35)},0)`);
          target.fillStyle = gradient;
          target.beginPath?.();
          target.arc?.(point.x, point.y, halo, 0, Math.PI * 2);
          target.fill?.();
        }
        target.fillStyle = `rgba(255,242,228,${glowAlpha})`;
        target.fillRect?.(point.x - radius * 0.34, point.y - radius * 0.34, radius * 0.68, radius * 0.68);
        if (particle.flare && particle.layer === "near" && caught > 0.66) {
          state.flares += 1;
          target.strokeStyle = `rgba(255,166,138,${glowAlpha * 0.22})`;
          target.lineWidth = 1;
          target.beginPath?.();
          target.arc?.(point.x, point.y, halo * 0.78, 0, Math.PI * 2);
          target.moveTo?.(point.x - halo, point.y);
          target.lineTo?.(point.x + halo, point.y);
          target.stroke?.();
        }
      }

      target.restore?.();
      state.kinds[particle.kind] += 1;
      state.layerCounts[particle.layer] += 1;
      return true;
    }

    function cutout(target, rect, attenuation, layer) {
      if (!target || !rect || !layer || attenuation <= 0) return;
      target.save?.();
      target.globalCompositeOperation = "destination-out";
      target.fillStyle = `rgba(0,0,0,${clamp01(attenuation)})`;
      target.fillRect?.(rect.left - layer.left - 12, rect.top - layer.top - 12, rect.width + 24, rect.height + 24);
      target.restore?.();
    }

    function render(camera, bounds, style, intensity) {
      state.drawn = 0;
      state.flares = 0;
      state.lightCaught = 0;
      state.mistBloomed = 0;
      state.smokeSuppressed = 0;
      state.kinds = { mote: 0, ash: 0, ember: 0, electrical: 0 };
      state.layerCounts = { far: 0, rear: 0, middle: 0, near: 0 };
      for (const key of LAYERS) {
        const target = contexts.get(key);
        const layer = rects.get(key);
        target?.clearRect?.(0, 0, layer?.width || 1, layer?.height || 1);
      }
      pool.filter(particle => particle.active).sort((a, b) => b.z - a.z).forEach(particle => {
        if (drawParticle(particle, camera, bounds, style, intensity)) state.drawn += 1;
      });
      const reading = context.views?.getReadingZone?.();
      const controls = Array.from(context.views?.getControlZones?.() || []);
      for (const key of LAYERS) {
        const target = contexts.get(key);
        const layer = rects.get(key);
        if (reading) cutout(target, reading.rect || reading, 0.84, layer);
        controls.forEach(zone => cutout(target, zone.rect || zone, 0.68, layer));
      }
    }

    function runtimeStep(frame) {
      const base = snapshotBase();
      state.enabled = Boolean(base.enabled);
      state.suspended = Boolean(base.suspended);
      if (!state.initialised || state.destroyed || state.suspended || !state.enabled) return false;
      const qualityName = qualityFor(frame, base);
      const profile = QUALITY[qualityName];
      const { camera, bounds } = boundsAndCamera();
      resize(profile, state.quality !== qualityName);
      if (state.quality !== qualityName) {
        state.quality = qualityName;
        ensurePool(profile.count, bounds, styleFor(base));
        task?.setMaxFps?.(profile.fps);
      }
      const deltaMs = resumeGuard ? 0 : clamp(frame?.delta, 0, 64);
      resumeGuard = false;
      const delta = deltaMs / 1000;
      state.elapsed += deltaMs;
      state.frames += 1;
      const style = styleFor(base);
      const intensity = clamp01(base.intensity) * style.density;
      const target = Math.round(profile.count * intensity);
      targetActive(target, bounds, style);
      pool.forEach(particle => update(particle, delta, bounds, style));
      render(camera, bounds, style, intensity);
      return activeCount() > 0 || Number(base.targetIntensity) > 0.002;
    }

    function sync(reason, result) {
      const base = snapshotBase();
      state.enabled = Boolean(base.enabled);
      state.suspended = Boolean(base.suspended);
      if (state.initialised && state.enabled && !state.suspended) {
        setVisible(true);
        task?.enable?.(reason);
      } else if (state.initialised) {
        task?.disable?.();
        setVisible(false);
      }
      return result;
    }

    async function init(...args) {
      const result = await weather.init(...args);
      if (state.initialised) return snapshot();
      mount();
      const base = snapshotBase();
      const { bounds } = boundsAndCamera();
      const qualityName = qualityFor(null, base);
      const profile = QUALITY[qualityName];
      state.quality = qualityName;
      resize(profile, true);
      ensurePool(profile.count, bounds, styleFor(base));
      task = context.runtime?.register?.("particles", runtimeStep, {
        group: "environment",
        priority: 22,
        maxFps: profile.fps,
        enabled: false,
        wake: false
      });
      if (!task) throw new Error("Shared runtime registration failed for Weather particles.");
      state.initialised = true;
      return sync("weather:particles:init", result);
    }

    const decorateMutation = (name, reason) => (...args) => sync(reason, weather[name](...args));
    const applyProfile = decorateMutation("applyProfile", "weather:particles:profile");
    const setPreset = decorateMutation("setPreset", "weather:particles:preset");
    const setIntensity = decorateMutation("setIntensity", "weather:particles:intensity");
    const transitionTo = decorateMutation("transitionTo", "weather:particles:transition");
    const setWind = decorateMutation("setWind", "weather:particles:wind");
    const setQuality = decorateMutation("setQuality", "weather:particles:quality");
    const setEnabled = decorateMutation("setEnabled", "weather:particles:enabled");

    function setSeed(...args) {
      const result = weather.setSeed(...args);
      state.seed = Number(snapshotBase().seed) || state.seed;
      random = seededRandom(`${state.seed}:depth-particles`);
      pool.forEach(particle => { particle.active = false; });
      return sync("weather:particles:seed", result);
    }

    function suspend(...args) {
      const result = weather.suspend(...args);
      state.suspended = true;
      task?.suspend?.();
      setVisible(false);
      return result;
    }

    function resume(...args) {
      const result = weather.resume(...args);
      state.suspended = false;
      resumeGuard = true;
      return sync("weather:particles:resume", result);
    }

    function reset(...args) {
      const result = weather.reset(...args);
      state.enabled = false;
      state.frames = 0;
      state.elapsed = 0;
      pool.forEach(particle => { particle.active = false; });
      task?.disable?.();
      setVisible(false);
      return result;
    }

    function destroy(...args) {
      if (state.destroyed) return false;
      task?.unregister?.();
      task = null;
      canvases.forEach(canvas => canvas.remove?.());
      canvases.clear();
      contexts.clear();
      rects.clear();
      pool = [];
      state.destroyed = true;
      return weather.destroy(...args);
    }

    function fingerprint() {
      let hash = 2166136261;
      for (const particle of pool) {
        if (!particle.active) continue;
        const token = `${particle.kind}:${particle.x.toFixed(3)}:${particle.y.toFixed(3)}:${particle.z.toFixed(3)}:${particle.age.toFixed(3)}`;
        for (const character of token) {
          hash ^= character.charCodeAt(0);
          hash = Math.imul(hash, 16777619);
        }
      }
      return hash >>> 0;
    }

    function snapshot() {
      const base = snapshotBase();
      return Object.freeze({
        ...base,
        particles: Object.freeze({
          ...(base.particles || {}),
          depthField: Object.freeze({
            active: activeCount(),
            capacity: pool.length,
            drawn: state.drawn,
            flares: state.flares,
            lightCaught: state.lightCaught,
            mistBloomed: state.mistBloomed,
            smokeSuppressed: state.smokeSuppressed,
            kinds: Object.freeze({ ...state.kinds }),
            layers: Object.freeze({ ...state.layerCounts }),
            fingerprint: fingerprint()
          })
        }),
        resources: Object.freeze({
          ...(base.resources || {}),
          particleCanvases: canvases.size,
          visibleParticleCanvases: [...canvases.values()].filter(canvas => !canvas.hidden).length,
          particleRuntimeTask: Boolean(task)
        }),
        diagnostics: Object.freeze({
          ...(base.diagnostics || {}),
          particleRenderer: Object.freeze({
            id: "depth-light-particle-field-1",
            sharedRuntime: true,
            runtimePriority: 22,
            privateAnimationLoop: false,
            quality: state.quality,
            frameCount: state.frames,
            opticalPolicy: "existing-weather-compositor"
          })
        })
      });
    }

    const decorated = {
      ...weather,
      init,
      applyProfile,
      suspend,
      resume,
      reset,
      destroy,
      setPreset,
      setIntensity,
      transitionTo,
      snapshot,
      setEnabled,
      setWind,
      setQuality,
      setSeed
    };
    Object.defineProperty(decorated, "__ncnDepthParticles", { value: true, enumerable: false });
    return Object.freeze(decorated);
  }

  function wrapFactory(factory) {
    if (typeof factory !== "function" || factory.__ncnDepthParticleField === true) return factory;
    const wrapped = context => wrapService(factory(context), context);
    Object.defineProperty(wrapped, "__ncnDepthParticleField", { value: true, enumerable: false });
    Object.defineProperty(wrapped, "__ncnPresetDepthFlowPolicy", {
      value: factory.__ncnPresetDepthFlowPolicy === true,
      enumerable: false
    });
    return wrapped;
  }

  const wrappedFactory = wrapFactory(window.createNCNWeatherDepartment);
  if (typeof wrappedFactory === "function") {
    window.createNCNWeatherDepartment = wrappedFactory;
    window.createWeather = wrappedFactory;
    if (window.NCNWeatherDepartment && typeof window.NCNWeatherDepartment === "object") {
      window.NCNWeatherDepartment = Object.freeze({ ...window.NCNWeatherDepartment, createWeather: wrappedFactory });
    }
  }

  window.NCNWeatherParticleField = Object.freeze({
    className: CLASS_NAME,
    quality: QUALITY,
    styleFor,
    wrapFactory,
    installed: () => window.createNCNWeatherDepartment?.__ncnDepthParticleField === true
  });
})();
