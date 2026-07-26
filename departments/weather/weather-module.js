/*==================================================
  NCN WEATHER DEPARTMENT · PR-86 PUBLICATION

  Publication-only factory for the replaceable weather slot. Construction is inert:
  canvases, dependency handles and recurring work begin only in init(). The module
  renders only into the four supplied weather layers and owns no private loop.
==================================================*/
window.NCNWeatherDepartment = (() => {
  "use strict";

  const PRESETS = window.NCNWeatherPresets || Object.freeze({ clear: Object.freeze({}) });
  const LAYER_KEYS = Object.freeze(["far", "rear", "middle", "near"]);
  const PARTICLE_TYPES = Object.freeze(["mist", "dust", "rain"]);
  const QUALITY = Object.freeze({
    reduced: Object.freeze({ mist: 10, dust: 8, rain: 0, fps: 8, dpr: 1 }),
    low: Object.freeze({ mist: 18, dust: 24, rain: 48, fps: 12, dpr: 1 }),
    medium: Object.freeze({ mist: 32, dust: 40, rain: 96, fps: 20, dpr: 1.2 }),
    high: Object.freeze({ mist: 48, dust: 64, rain: 144, fps: 30, dpr: 1.5 })
  });
  const NUMERIC_PRESET_KEYS = Object.freeze([
    "mist", "dust", "rain", "haze", "moisture", "turbulence",
    "drift", "fallSpeed", "depthFlow", "electrical"
  ]);
  const ACCEPTED_EFFECTS = Object.freeze({
    "electrical-disturbance": Object.freeze({ channel: "fault", purpose: "ambient", layer: "near" }),
    "light-flash": Object.freeze({ channel: "environment", purpose: "ambient", layer: "rear" })
  });

  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const clamp01 = value => clamp(value, 0, 1);
  const mix = (a, b, amount) => a + (b - a) * amount;
  const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;

  function hashSeed(value) {
    const text = String(value ?? 2045);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
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

  function clonePreset(source = PRESETS.clear) {
    const result = {};
    NUMERIC_PRESET_KEYS.forEach(key => { result[key] = Number(source?.[key]) || 0; });
    return result;
  }

  function blendPreset(from, to, amount) {
    const result = {};
    NUMERIC_PRESET_KEYS.forEach(key => { result[key] = mix(from[key], to[key], amount); });
    return result;
  }

  function smoothStep(value) {
    const amount = clamp01(value);
    return amount * amount * (3 - 2 * amount);
  }

  function normaliseRect(value) {
    const rect = value?.rect || value;
    if (!rect) return null;
    const left = Number(rect.left);
    const top = Number(rect.top);
    const width = Number(rect.width ?? (Number(rect.right) - left));
    const height = Number(rect.height ?? (Number(rect.bottom) - top));
    if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
    return Object.freeze({
      left,
      top,
      width,
      height,
      right: Number.isFinite(Number(rect.right)) ? Number(rect.right) : left + width,
      bottom: Number.isFinite(Number(rect.bottom)) ? Number(rect.bottom) : top + height
    });
  }

  function createWeather(context) {
    if (!context || typeof context !== "object") {
      throw new TypeError("Weather requires a PR-86 department context.");
    }

    const moduleId = String(context.owner || "weather").trim().replace(/[^a-z0-9:_-]+/gi, "-") || "weather";
    const state = {
      moduleId,
      initialised: false,
      enabled: false,
      suspended: false,
      destroyed: false,
      preset: "clear",
      targetPreset: "clear",
      seed: 2045,
      qualityOverride: null,
      resolvedQuality: null,
      currentIntensity: 0,
      targetIntensity: 0,
      wind: { x: 0.18, y: 0, z: 0 },
      readingAttenuation: 0.84,
      controlAttenuation: 0.68,
      transitionAttenuation: 1,
      transition: null,
      config: clonePreset(PRESETS.clear),
      spawnSerial: 0,
      frameCount: 0,
      lastDelta: 0,
      lastEnvelope: null,
      effectRequests: 0,
      lastZones: { reading: false, controls: 0 },
      geometry: { frames: 0, cameraReads: 0, layerMeasurements: 0, zoneReads: 0 },
      qualityChanges: 0,
      fpsUpdates: 0
    };

    let random = seededRandom(state.seed);
    let effects = null;
    let runtimeHandle = null;
    const canvases = new Map();
    const contexts = new Map();
    const layerRects = new Map();
    let particles = { mist: [], dust: [], rain: [] };
    let mistSprites = [];
    const activeEffectHandles = new Set();
    let resumeGuard = true;

    function ensureAlive() {
      if (state.destroyed) throw new Error("Destroyed weather module cannot be used.");
    }

    function presetByName(name) {
      const key = String(name || "clear");
      const selected = PRESETS[key];
      if (!selected) throw new RangeError(`Unknown weather preset: ${key}`);
      return { key, values: clonePreset(selected) };
    }

    function hostQuality(frame = null) {
      return String(frame?.quality || context.runtime?.getQuality?.() || context.settings?.quality || "full");
    }

    function effectiveQuality(frame = null) {
      if (state.qualityOverride) return state.qualityOverride;
      const runtimeQuality = hostQuality(frame);
      if (frame?.reducedMotion || context.settings?.reducedMotion || runtimeQuality === "reduced") return "reduced";
      const cores = Number(globalThis.navigator?.hardwareConcurrency) || 4;
      return cores <= 4 ? "low" : cores <= 8 ? "medium" : "high";
    }

    function suppliedLayers() {
      const weatherLayers = context.layers?.weather || {};
      const result = {};
      LAYER_KEYS.forEach(key => {
        const layer = weatherLayers[key];
        if (!layer) throw new Error(`Weather layer is unavailable: weather:${key}`);
        result[key] = layer;
      });
      return result;
    }

    function setCanvasStyle(canvas, key) {
      canvas.className = `ncn-department-weather-canvas ncn-department-weather-${key}`;
      canvas.setAttribute?.("aria-hidden", "true");
      Object.assign(canvas.style || {}, {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        pointerEvents: "none"
      });
    }

    function setCanvasVisibility(visible) {
      canvases.forEach(canvas => {
        canvas.hidden = !visible;
        if (canvas.style) canvas.style.visibility = visible ? "visible" : "hidden";
      });
    }

    function mountCanvases() {
      const layers = suppliedLayers();
      LAYER_KEYS.forEach(key => {
        const canvas = document.createElement("canvas");
        setCanvasStyle(canvas, key);
        layers[key].append?.(canvas);
        const drawingContext = canvas.getContext?.("2d", { alpha: true });
        if (!drawingContext) throw new Error(`Canvas 2D context unavailable for weather:${key}`);
        canvases.set(key, canvas);
        contexts.set(key, drawingContext);
      });
      setCanvasVisibility(false);
    }

    function measureLayer(key) {
      const canvas = canvases.get(key);
      const parent = canvas?.parentElement || canvas?.parentNode;
      const rect = parent?.getBoundingClientRect?.() || canvas?.getBoundingClientRect?.();
      state.geometry.layerMeasurements += 1;
      return {
        left: Number(rect?.left) || 0,
        top: Number(rect?.top) || 0,
        width: Math.max(1, Number(rect?.width) || Number(globalThis.innerWidth) || 1),
        height: Math.max(1, Number(rect?.height) || Number(globalThis.innerHeight) || 1)
      };
    }

    function resizeAndCollectLayers(profile, force = false) {
      const frameRects = new Map();
      LAYER_KEYS.forEach(key => {
        const canvas = canvases.get(key);
        const drawingContext = contexts.get(key);
        if (!canvas || !drawingContext) return;
        const rect = measureLayer(key);
        const previous = layerRects.get(key);
        const changed = force || !previous
          || Math.abs(previous.width - rect.width) > 0.5
          || Math.abs(previous.height - rect.height) > 0.5
          || previous.dpr !== profile.dpr;
        if (changed) {
          canvas.width = Math.max(1, Math.round(rect.width * profile.dpr));
          canvas.height = Math.max(1, Math.round(rect.height * profile.dpr));
          canvas.style.width = `${rect.width}px`;
          canvas.style.height = `${rect.height}px`;
          drawingContext.setTransform?.(profile.dpr, 0, 0, profile.dpr, 0, 0);
        }
        const saved = { ...rect, dpr: profile.dpr };
        layerRects.set(key, saved);
        frameRects.set(key, saved);
      });
      return frameRects;
    }

    function cameraAndBounds() {
      state.geometry.cameraReads += 1;
      const camera = context.chamber?.getCameraSnapshot?.() || null;
      return {
        camera,
        bounds: Object.freeze({
          halfWidth: Number(camera?.finalHalfWidth || camera?.halfWidth) || 4.5,
          halfHeight: Number(camera?.halfHeight) || 3.2,
          near: Number(camera?.near) || 2.5,
          far: Number(camera?.far) || 10.5
        })
      };
    }

    function readingDescriptor() {
      state.geometry.zoneReads += 1;
      const rect = normaliseRect(context.views?.getReadingZone?.());
      return rect ? { rect, attenuation: state.readingAttenuation } : null;
    }

    function controlDescriptors() {
      state.geometry.zoneReads += 1;
      const zones = context.views?.getControlZones?.() || [];
      return Array.from(zones).map(zone => {
        const rect = normaliseRect(zone);
        return rect ? { rect, attenuation: state.controlAttenuation } : null;
      }).filter(Boolean);
    }

    function collectFrameScene(profile, force = false) {
      const rects = resizeAndCollectLayers(profile, force);
      const { camera, bounds } = cameraAndBounds();
      const reading = readingDescriptor();
      const controls = controlDescriptors();
      state.geometry.frames += 1;
      state.lastZones = { reading: Boolean(reading), controls: controls.length };
      return Object.freeze({ quality: profile, rects, camera, bounds, reading, controls });
    }

    function makePool(type, count) {
      const pool = particles[type];
      while (pool.length < count) pool.push({ active: false, type });
      if (pool.length > count) {
        pool.slice(count).forEach(particle => { particle.active = false; });
        pool.length = count;
      }
    }

    function clearMistSprites() {
      mistSprites.forEach(sprite => sprite.remove?.());
      mistSprites = [];
    }

    function buildMistSprites() {
      clearMistSprites();
      const variants = 4;
      for (let variant = 0; variant < variants; variant += 1) {
        const sprite = document.createElement("canvas");
        sprite.width = 48;
        sprite.height = 28;
        const spriteContext = sprite.getContext?.("2d", { alpha: true });
        if (!spriteContext) continue;
        const spriteRandom = seededRandom(`${state.seed}:mist-sprite:${variant}`);
        const blobs = Array.from({ length: 4 + Math.floor(spriteRandom() * 3) }, () => ({
          x: mix(0.12, 0.88, spriteRandom()),
          y: mix(0.38, 0.84, spriteRandom()),
          rx: mix(0.12, 0.34, spriteRandom()),
          ry: mix(0.14, 0.30, spriteRandom()),
          gain: mix(0.6, 1.15, spriteRandom())
        }));
        for (let y = 0; y < sprite.height; y += 1) {
          for (let x = 0; x < sprite.width; x += 1) {
            const nx = x / (sprite.width - 1);
            const ny = y / (sprite.height - 1);
            let field = 0;
            for (const blob of blobs) {
              const dx = (nx - blob.x) / blob.rx;
              const dy = (ny - blob.y) / blob.ry;
              field += Math.exp(-(dx * dx + dy * dy) * 2.4) * blob.gain;
            }
            const baseLift = clamp01((ny - 0.18) / 0.72);
            field *= mix(0.4, 1.2, baseLift);
            const threshold = 0.42;
            if (field <= threshold) continue;
            const alpha = Math.pow(clamp01((field - threshold) / 1.2), 1.05) * 0.86;
            const warm = 0.4 + baseLift * 0.6;
            const red = Math.round(mix(145, 255, warm));
            const green = Math.round(mix(10, 70, warm));
            const blue = Math.round(mix(12, 34, warm));
            spriteContext.fillStyle = `rgba(${red},${green},${blue},${alpha})`;
            spriteContext.fillRect(x, y, 1, 1);
          }
        }
        mistSprites.push(sprite);
      }
    }

    function applyQuality(frame = null, force = false, notifyRuntime = true) {
      const resolved = effectiveQuality(frame);
      const changed = force || state.resolvedQuality !== resolved;
      const profile = QUALITY[resolved] || QUALITY.medium;
      if (!changed) return { resolved, profile, changed: false };

      state.resolvedQuality = resolved;
      state.qualityChanges += 1;
      makePool("mist", profile.mist);
      makePool("dust", profile.dust);
      makePool("rain", profile.rain);
      if (notifyRuntime && runtimeHandle) {
        runtimeHandle.setMaxFps?.(profile.fps);
        state.fpsUpdates += 1;
      }
      return { resolved, profile, changed: true };
    }

    function depthLayer(z, limits) {
      const amount = clamp01((z - limits.near) / Math.max(0.001, limits.far - limits.near));
      if (amount >= 0.75) return "far";
      if (amount >= 0.5) return "rear";
      if (amount >= 0.25) return "middle";
      return "near";
    }

    function randomBetween(min, max) {
      return mix(min, max, random());
    }

    function activateParticle(particle, type, limits) {
      state.spawnSerial += 1;
      particle.active = true;
      particle.age = 0;
      particle.life = type === "mist" ? randomBetween(7.5, 15.5)
        : type === "dust" ? randomBetween(2.8, 7)
          : randomBetween(0.9, 2.2);
      particle.x = randomBetween(-limits.halfWidth * 1.16, limits.halfWidth * 1.16);
      particle.y = type === "rain"
        ? randomBetween(-limits.halfHeight * 0.2, limits.halfHeight * 1.15)
        : type === "mist"
          ? randomBetween(-limits.halfHeight * 1.02, -limits.halfHeight * 0.28)
          : randomBetween(-limits.halfHeight * 0.95, limits.halfHeight * 0.85);
      particle.z = randomBetween(limits.near + 0.15, limits.far);
      particle.size = type === "mist" ? randomBetween(1.1, 2.4)
        : type === "dust" ? randomBetween(0.8, 2.2)
          : randomBetween(5, 14);
      particle.alpha = randomBetween(0.45, 1);
      particle.phase = randomBetween(0, Math.PI * 2);
      particle.velocity = randomBetween(0.72, 1.24);
      particle.floorBand = type === "mist" ? randomBetween(-limits.halfHeight * 1.0, -limits.halfHeight * 0.34) : particle.y;
      particle.heightBias = type === "mist" ? randomBetween(0.42, 0.86) : 1;
      particle.variant = type === "mist" ? Math.floor(randomBetween(0, Math.max(1, mistSprites.length))) : 0;
      particle.layer = depthLayer(particle.z, limits);
    }

    function activeCount(type) {
      return particles[type].reduce((sum, particle) => sum + (particle.active ? 1 : 0), 0);
    }

    function deactivateAllParticles(resetSequence = false) {
      PARTICLE_TYPES.forEach(type => particles[type].forEach(particle => { particle.active = false; }));
      if (resetSequence) {
        state.spawnSerial = 0;
        random = seededRandom(state.seed);
      }
    }

    function deactivateSurplus(type, target) {
      let count = activeCount(type);
      if (count <= target) return;
      for (let index = particles[type].length - 1; index >= 0 && count > target; index -= 1) {
        const particle = particles[type][index];
        if (!particle.active) continue;
        particle.life = Math.min(particle.life, particle.age + 0.28);
        count -= 1;
      }
    }

    function spawnToward(type, target, maximumPerStep, limits) {
      let required = Math.min(Math.max(0, target - activeCount(type)), maximumPerStep);
      for (const particle of particles[type]) {
        if (!required) break;
        if (particle.active) continue;
        activateParticle(particle, type, limits);
        required -= 1;
      }
    }

    function targetCounts(intensity, profile) {
      return {
        mist: Math.round(profile.mist * clamp01(state.config.mist * intensity)),
        dust: Math.round(profile.dust * clamp01(state.config.dust * intensity)),
        rain: Math.round(profile.rain * clamp01(state.config.rain * intensity))
      };
    }

    function updateTransition(delta) {
      if (!state.transition) return;
      state.transition.elapsed += delta;
      const amount = smoothStep(state.transition.elapsed / state.transition.duration);
      state.config = blendPreset(state.transition.from, state.transition.to, amount);
      if (amount >= 1) {
        state.config = clonePreset(state.transition.to);
        state.preset = state.transition.name;
        state.transition = null;
      }
    }

    function updateParticle(particle, deltaSeconds, limits) {
      if (!particle.active) return;
      particle.age += deltaSeconds;
      if (particle.age >= particle.life) {
        particle.active = false;
        return;
      }
      const wind = state.wind;
      const turbulence = state.config.turbulence;
      const wave = Math.sin(particle.phase + particle.age * (0.6 + turbulence * 1.8));
      if (particle.type === "rain") {
        particle.y -= (0.65 + state.config.fallSpeed * 1.55) * particle.velocity * deltaSeconds;
        particle.x += wind.x * 0.34 * deltaSeconds;
        particle.z += (wind.z + state.config.depthFlow) * 0.26 * deltaSeconds;
        if (particle.y < -limits.halfHeight * 1.2) particle.active = false;
      } else if (particle.type === "dust") {
        particle.x += (wind.x * 0.44 + wave * turbulence * 0.08) * particle.velocity * deltaSeconds;
        particle.y += (wind.y * 0.24 + Math.cos(particle.phase + particle.age) * 0.025) * deltaSeconds;
        particle.z += (wind.z + state.config.depthFlow) * 0.20 * deltaSeconds;
      } else {
        particle.x += (wind.x * (0.18 + state.config.drift * 0.6) + wave * turbulence * 0.026) * particle.velocity * deltaSeconds;
        particle.y = mix(
          particle.y,
          particle.floorBand + Math.cos(particle.phase + particle.age * 0.42) * 0.045,
          Math.min(1, deltaSeconds * 1.5)
        );
        particle.z += (wind.z + state.config.depthFlow) * 0.10 * deltaSeconds;
      }
      if (particle.x > limits.halfWidth * 1.25) particle.x = -limits.halfWidth * 1.25;
      if (particle.x < -limits.halfWidth * 1.25) particle.x = limits.halfWidth * 1.25;
      particle.z = limits.near + mod(particle.z - limits.near, limits.far - limits.near);
      particle.layer = depthLayer(particle.z, limits);
    }

    function project(particle, key, scene) {
      const rect = scene.rects.get(key);
      const point = scene.camera?.project?.(particle.x, particle.y, particle.z)
        || context.chamber?.project?.(particle.x, particle.y, particle.z);
      if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
        return { x: point.x - rect.left, y: point.y - rect.top };
      }
      return {
        x: ((particle.x / (scene.bounds.halfWidth * 2)) + 0.5) * rect.width,
        y: (0.5 - particle.y / (scene.bounds.halfHeight * 2)) * rect.height
      };
    }

    function cutout(ctx, rect, attenuation, layer) {
      if (!ctx || !rect || attenuation <= 0 || !layer) return;
      const padding = 12;
      const left = rect.left - layer.left - padding;
      const top = rect.top - layer.top - padding;
      const width = rect.width + padding * 2;
      const height = rect.height + padding * 2;
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = `rgba(0,0,0,${clamp01(attenuation)})`;
      if (typeof ctx.roundRect === "function") {
        ctx.beginPath();
        ctx.roundRect(left, top, width, height, 16);
        ctx.fill();
      } else {
        ctx.fillRect(left, top, width, height);
      }
      ctx.restore();
    }

    function renderHaze(key, ctx, intensity, scene) {
      const layer = scene.rects.get(key);
      if (!layer || !ctx || intensity <= 0) return;
      const depthScale = { far: 1, rear: 0.72, middle: 0.46, near: 0.22 }[key];
      const alpha = state.config.haze * intensity * depthScale * 0.09;
      if (alpha <= 0.001) return;
      const gradient = ctx.createLinearGradient?.(0, 0, 0, layer.height);
      if (!gradient) return;
      gradient.addColorStop?.(0, "rgba(150,12,14,0)");
      gradient.addColorStop?.(0.46, `rgba(224,34,26,${alpha * 0.42})`);
      gradient.addColorStop?.(1, `rgba(255,86,48,${alpha})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, layer.width, layer.height);
    }

    function particleOpacity(particle) {
      const life = clamp01(particle.age / Math.max(0.001, particle.life));
      return particle.alpha * Math.max(0, Math.min(1, life * 5, (1 - life) * 5));
    }

    function drawMistBank(ctx, particle, intensity, scene) {
      const point = project(particle, particle.layer, scene);
      const opacity = particleOpacity(particle) * intensity;
      if (opacity <= 0.002) return;
      const sprite = mistSprites[particle.variant % Math.max(1, mistSprites.length)] || null;
      if (!sprite || typeof ctx.drawImage !== "function") return;
      const width = (160 + state.config.moisture * 120) * particle.size / Math.max(1.9, particle.z * 0.54);
      const height = width * mix(0.28, 0.42, particle.heightBias);
      ctx.save();
      const previousSmoothing = ctx.imageSmoothingEnabled;
      if ("imageSmoothingEnabled" in ctx) ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = opacity * 0.92;
      ctx.drawImage(sprite, point.x - width * 0.5, point.y - height * 0.72, width, height);
      if ("imageSmoothingEnabled" in ctx) ctx.imageSmoothingEnabled = previousSmoothing;
      ctx.restore();
    }

    function drawParticle(ctx, particle, intensity, scene) {
      if (particle.type === "mist") return drawMistBank(ctx, particle, intensity, scene);
      const point = project(particle, particle.layer, scene);
      const opacity = particleOpacity(particle) * intensity;
      if (opacity <= 0.002) return;
      if (particle.type === "rain") {
        ctx.strokeStyle = `rgba(255,126,88,${opacity * 0.42})`;
        ctx.lineWidth = Math.max(0.6, particle.size * 0.08);
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(point.x - state.wind.x * particle.size * 0.16, point.y + particle.size);
        ctx.stroke();
        return;
      }
      ctx.fillStyle = `rgba(255,112,70,${opacity * 0.56})`;
      ctx.fillRect(point.x, point.y, particle.size, particle.size);
    }

    function clearCanvases() {
      LAYER_KEYS.forEach(key => {
        const ctx = contexts.get(key);
        const rect = layerRects.get(key);
        if (ctx && rect) ctx.clearRect(0, 0, rect.width, rect.height);
      });
    }

    function render(intensity, scene) {
      clearCanvases();
      LAYER_KEYS.forEach(key => renderHaze(key, contexts.get(key), intensity, scene));
      PARTICLE_TYPES.forEach(type => {
        particles[type].forEach(particle => {
          if (particle.active) drawParticle(contexts.get(particle.layer), particle, intensity, scene);
        });
      });
      LAYER_KEYS.forEach(key => {
        const ctx = contexts.get(key);
        const layer = scene.rects.get(key);
        if (scene.reading) cutout(ctx, scene.reading.rect, scene.reading.attenuation, layer);
        scene.controls.forEach(zone => cutout(ctx, zone.rect, zone.attenuation, layer));
      });
    }

    function effectDefinition(name) {
      const key = String(name || "");
      const definition = ACCEPTED_EFFECTS[key];
      if (!definition) throw new RangeError(`Weather cannot request undeclared effect: ${key}`);
      return { key, definition };
    }

    function requestEffect(name, layerKey = null, options = {}) {
      ensureAlive();
      if (!effects || !state.enabled || state.suspended) return false;
      const { key, definition } = effectDefinition(name);
      const selectedLayer = layerKey || definition.layer;
      const layer = context.layers?.weather?.[selectedLayer] || null;
      if (!layer) throw new Error(`Weather effect layer is unavailable: weather:${selectedLayer}`);
      if (typeof effects.play !== "function") throw new Error("The accepted Effects dependency does not expose play().");

      const requestedIntensity = clamp01(options.intensity ?? 0.25);
      const envelope = context.director?.envelope?.(definition.channel, { intensity: requestedIntensity });
      if (envelope && envelope.allowed === false) return false;
      const safeOptions = { ...options };
      delete safeOptions.channel;
      delete safeOptions.purpose;
      const result = effects.play(key, layer, {
        ...safeOptions,
        channel: definition.channel,
        purpose: definition.purpose,
        seed: Number.isFinite(Number(options.seed))
          ? Number(options.seed)
          : hashSeed(`${state.seed}:${key}:${state.effectRequests + 1}`),
        intensity: Math.min(requestedIntensity, envelope?.intensity ?? 1)
      });
      state.effectRequests += 1;
      if (result && typeof result === "object" && typeof result.cancel === "function") {
        activeEffectHandles.add(result);
        result.finished?.finally?.(() => activeEffectHandles.delete(result));
      }
      return result ?? true;
    }

    function releaseEffects(reason = "weather-cleanup") {
      activeEffectHandles.forEach(handle => {
        try { handle.cancel?.(reason); } catch (error) { console.error(error); }
      });
      activeEffectHandles.clear();
    }

    function runtimeStep(frame) {
      if (!state.initialised || state.destroyed || state.suspended || !state.enabled) return false;
      const quality = applyQuality(frame);
      const scene = collectFrameScene(quality.profile, quality.changed);
      const rawDelta = resumeGuard ? 0 : Number(frame?.delta) || 0;
      resumeGuard = false;
      const delta = clamp(rawDelta, 0, 64);
      const deltaSeconds = delta / 1000;
      state.lastDelta = delta;
      state.frameCount += 1;
      updateTransition(delta);
      state.currentIntensity = mix(state.currentIntensity, state.targetIntensity, Math.min(1, delta / 260));

      const requested = state.currentIntensity * state.transitionAttenuation;
      const envelope = context.director?.envelope?.("environment", { intensity: requested })
        || { allowed: true, intensity: requested, mode: "ambient", reducedMotion: false };
      state.lastEnvelope = envelope;
      const readingScale = scene.reading || context.views?.isReading?.() ? 0.58 : 1;
      const intensity = envelope.allowed ? clamp01(envelope.intensity * readingScale) : 0;
      const counts = targetCounts(intensity, quality.profile);

      if (intensity > 0.002) {
        spawnToward("mist", counts.mist, 3, scene.bounds);
        spawnToward("dust", counts.dust, 4, scene.bounds);
        spawnToward("rain", counts.rain, 8, scene.bounds);
      }
      deactivateSurplus("mist", counts.mist);
      deactivateSurplus("dust", counts.dust);
      deactivateSurplus("rain", counts.rain);
      PARTICLE_TYPES.forEach(type => {
        particles[type].forEach(particle => updateParticle(particle, deltaSeconds, scene.bounds));
      });
      render(intensity, scene);

      const active = activeCount("mist") + activeCount("dust") + activeCount("rain");
      const settling = Boolean(state.transition) || Math.abs(state.currentIntensity - state.targetIntensity) > 0.002;
      return active > 0 || settling || state.targetIntensity > 0.002;
    }

    async function init() {
      ensureAlive();
      if (state.initialised) return snapshot();
      effects = context.integration?.requireService?.("effects") || null;
      mountCanvases();
      buildMistSprites();
      const quality = applyQuality(null, true, false);
      collectFrameScene(quality.profile, true);
      clearCanvases();
      runtimeHandle = context.runtime?.register?.("render", runtimeStep, {
        group: "environment",
        priority: 20,
        maxFps: quality.profile.fps,
        enabled: false,
        wake: false
      });
      if (!runtimeHandle) throw new Error("Shared runtime registration failed for weather.");
      state.initialised = true;
      if (state.enabled && !state.suspended) {
        setCanvasVisibility(true);
        runtimeHandle.enable?.("weather:init");
      }
      return snapshot();
    }

    function setPreset(name) {
      ensureAlive();
      const selected = presetByName(name);
      state.preset = selected.key;
      state.targetPreset = selected.key;
      state.config = selected.values;
      state.transition = null;
      if (state.initialised && state.enabled && !state.suspended) runtimeHandle?.wake?.("weather:preset");
      return snapshot();
    }

    function setIntensity(value) {
      ensureAlive();
      state.targetIntensity = clamp01(value);
      if (state.initialised && state.enabled && !state.suspended) runtimeHandle?.wake?.("weather:intensity");
      return state.targetIntensity;
    }

    function clearDisabledState(reason = "weather-disabled") {
      state.preset = "clear";
      state.targetPreset = "clear";
      state.config = clonePreset(PRESETS.clear);
      state.transition = null;
      state.currentIntensity = 0;
      state.targetIntensity = 0;
      state.lastEnvelope = null;
      state.lastZones = { reading: false, controls: 0 };
      deactivateAllParticles(true);
      releaseEffects(reason);
      clearCanvases();
      setCanvasVisibility(false);
    }

    function setEnabled(enabled) {
      ensureAlive();
      const next = Boolean(enabled);
      state.enabled = next;
      if (!state.initialised) {
        if (!next) clearDisabledState();
        return state.enabled;
      }
      if (next && !state.suspended) {
        setCanvasVisibility(true);
        resumeGuard = true;
        runtimeHandle?.enable?.("weather:enabled");
      } else {
        runtimeHandle?.disable?.();
        if (!next) clearDisabledState();
      }
      return state.enabled;
    }

    function transitionTo(name, options = {}) {
      ensureAlive();
      const selected = presetByName(name);
      const duration = Math.max(0, Number(options.duration) || 0);
      state.targetPreset = selected.key;
      if (!duration) return setPreset(selected.key);
      state.transition = {
        name: selected.key,
        from: clonePreset(state.config),
        to: selected.values,
        duration,
        elapsed: 0
      };
      if (options.effect === true && state.enabled && !state.suspended) {
        const effectName = selected.key === "electrical-weather" ? "electrical-disturbance" : "light-flash";
        requestEffect(effectName, null, {
          intensity: clamp01(options.effectIntensity ?? 0.22),
          duration: Math.min(duration, 900)
        });
      }
      if (state.initialised && state.enabled && !state.suspended) runtimeHandle?.wake?.("weather:transition");
      return snapshot();
    }

    function setWind(value = {}) {
      ensureAlive();
      if (Number.isFinite(Number(value))) {
        state.wind.x = clamp(Number(value), -1, 1);
      } else {
        state.wind.x = clamp(value.x, -1, 1);
        state.wind.y = clamp(value.y, -1, 1);
        state.wind.z = clamp(value.z, -1, 1);
      }
      if (state.enabled && !state.suspended) runtimeHandle?.wake?.("weather:wind");
      return Object.freeze({ ...state.wind });
    }

    function setQuality(value = "auto") {
      ensureAlive();
      const key = String(value || "auto").toLowerCase();
      if (!["auto", "reduced", "low", "medium", "high"].includes(key)) {
        throw new RangeError(`Unknown weather quality: ${value}`);
      }
      const override = key === "auto" ? null : key;
      const changed = state.qualityOverride !== override;
      state.qualityOverride = override;
      if (state.initialised && changed) {
        const quality = applyQuality(null, true, true);
        collectFrameScene(quality.profile, true);
        if (state.enabled && !state.suspended) runtimeHandle?.wake?.("weather:quality");
      } else if (!state.initialised) {
        state.resolvedQuality = effectiveQuality();
      }
      return key;
    }

    function setSeed(value) {
      ensureAlive();
      state.seed = hashSeed(value);
      random = seededRandom(state.seed);
      state.spawnSerial = 0;
      buildMistSprites();
      deactivateAllParticles(false);
      if (state.enabled && !state.suspended) runtimeHandle?.wake?.("weather:seed");
      return state.seed;
    }

    function applyProfile(profile = {}, meta = {}) {
      ensureAlive();
      const enabled = profile.enabled !== false;
      const legacyMist = Number(profile.mist);
      const preset = profile.preset
        || (!enabled ? "clear" : Number.isFinite(legacyMist) && legacyMist > 0 ? "mist" : state.targetPreset || "clear");
      const intensity = Number.isFinite(Number(profile.intensity))
        ? Number(profile.intensity)
        : Number.isFinite(legacyMist) ? legacyMist : enabled ? state.targetIntensity : 0;

      if (profile.seed !== undefined || meta.seed !== undefined) setSeed(profile.seed ?? meta.seed);
      if (profile.quality !== undefined) setQuality(profile.quality);
      if (profile.wind !== undefined) {
        setWind(typeof profile.wind === "number" ? { x: profile.wind, y: 0, z: 0 } : profile.wind);
      }
      if (Number.isFinite(Number(profile.readingAttenuation))) state.readingAttenuation = clamp01(profile.readingAttenuation);
      if (Number.isFinite(Number(profile.controlAttenuation))) state.controlAttenuation = clamp01(profile.controlAttenuation);
      if (Number.isFinite(Number(profile.transitionAttenuation))) state.transitionAttenuation = clamp01(profile.transitionAttenuation);

      if (!enabled) {
        setEnabled(false);
        return snapshot();
      }

      const duration = Number(profile.transition?.duration ?? profile.duration ?? 0);
      if (duration > 0) transitionTo(preset, {
        duration,
        effect: false,
        effectIntensity: meta.effectIntensity
      });
      else setPreset(preset);
      setIntensity(intensity);
      setEnabled(true);

      if (meta.requestEffect === true && duration > 0) {
        const effectName = preset === "electrical-weather" ? "electrical-disturbance" : "light-flash";
        requestEffect(effectName, null, {
          intensity: clamp01(meta.effectIntensity ?? 0.22),
          duration: Math.min(duration, 900)
        });
      }
      if (meta.effect?.name) {
        requestEffect(meta.effect.name, meta.effect.layer || null, meta.effect.options || {});
      }
      return snapshot();
    }

    function suspend() {
      if (!state.initialised || state.destroyed || state.suspended) return false;
      state.suspended = true;
      runtimeHandle?.suspend?.();
      clearCanvases();
      setCanvasVisibility(false);
      return true;
    }

    function resume() {
      if (!state.initialised || state.destroyed || !state.suspended) return false;
      state.suspended = false;
      resumeGuard = true;
      if (state.enabled) {
        setCanvasVisibility(true);
        const profile = QUALITY[state.resolvedQuality] || QUALITY.medium;
        collectFrameScene(profile, true);
        clearCanvases();
        runtimeHandle?.resume?.("weather:resume");
      }
      return true;
    }

    function reset() {
      if (state.destroyed) return false;
      state.enabled = false;
      state.suspended = false;
      state.transitionAttenuation = 1;
      state.frameCount = 0;
      state.lastDelta = 0;
      clearDisabledState("weather-reset");
      runtimeHandle?.disable?.();
      return true;
    }

    function destroy(reason = "weather-destroy") {
      if (state.destroyed) return false;
      reset();
      releaseEffects(reason);
      runtimeHandle?.unregister?.();
      runtimeHandle = null;
      canvases.forEach(canvas => canvas.remove?.());
      canvases.clear();
      contexts.clear();
      layerRects.clear();
      clearMistSprites();
      particles = { mist: [], dust: [], rain: [] };
      effects = null;
      state.initialised = false;
      state.destroyed = true;
      state.suspended = true;
      return true;
    }

    function particleFingerprint() {
      let hash = 2166136261;
      PARTICLE_TYPES.forEach(type => {
        particles[type].forEach(particle => {
          if (!particle.active) return;
          const token = `${type}:${particle.x.toFixed(4)}:${particle.y.toFixed(4)}:${particle.z.toFixed(4)}:${particle.age.toFixed(4)}`;
          for (let index = 0; index < token.length; index += 1) {
            hash ^= token.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
          }
        });
      });
      return hash >>> 0;
    }

    function snapshot() {
      return Object.freeze({
        moduleId: state.moduleId,
        initialised: state.initialised,
        enabled: state.enabled,
        suspended: state.suspended,
        destroyed: state.destroyed,
        preset: state.preset,
        targetPreset: state.targetPreset,
        intensity: state.currentIntensity,
        targetIntensity: state.targetIntensity,
        wind: Object.freeze({ ...state.wind }),
        quality: state.resolvedQuality || effectiveQuality(),
        qualityOverride: state.qualityOverride || "auto",
        seed: state.seed,
        transition: state.transition ? Object.freeze({
          name: state.transition.name,
          duration: state.transition.duration,
          elapsed: state.transition.elapsed
        }) : null,
        particles: Object.freeze({
          mist: activeCount("mist"),
          dust: activeCount("dust"),
          rain: activeCount("rain"),
          capacities: Object.freeze({
            mist: particles.mist.length,
            dust: particles.dust.length,
            rain: particles.rain.length
          }),
          spawned: state.spawnSerial,
          fingerprint: particleFingerprint()
        }),
        zones: Object.freeze({ ...state.lastZones }),
        resources: Object.freeze({
          canvases: canvases.size,
          visibleCanvases: [...canvases.values()].filter(canvas => !canvas.hidden && canvas.style?.visibility !== "hidden").length,
          runtimeTask: Boolean(runtimeHandle),
          effectHandles: activeEffectHandles.size
        }),
        geometry: Object.freeze({ ...state.geometry }),
        director: state.lastEnvelope ? Object.freeze({
          mode: state.lastEnvelope.mode,
          allowed: state.lastEnvelope.allowed,
          intensity: state.lastEnvelope.intensity
        }) : null,
        diagnostics: Object.freeze({
          qualityChanges: state.qualityChanges,
          fpsUpdates: state.fpsUpdates
        }),
        lastDelta: state.lastDelta,
        frameCount: state.frameCount,
        effectRequests: state.effectRequests,
        acceptedEffects: Object.freeze(Object.keys(ACCEPTED_EFFECTS)),
        privateAnimationLoop: false,
        animationLoop: "shared-runtime"
      });
    }

    return Object.freeze({
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
      setSeed,
      requestAtmosphericEffect: requestEffect
    });
  }

  const publication = Object.freeze({
    manifest: window.NCNWeatherDepartmentManifest || null,
    presets: PRESETS,
    createWeather
  });
  window.createWeather = createWeather;
  window.createNCNWeatherDepartment = createWeather;
  return publication;
})();
