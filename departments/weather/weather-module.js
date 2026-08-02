/*==================================================
  NCN WEATHER DEPARTMENT · PR-86 PUBLICATION

  The accepted Weather Department contract with the approved Floor Mist / Chamber
  Test 01 bank renderer ported into the shared host. The continuous floor veil,
  generic red haze and front-energy line from the experiment are deliberately absent.
==================================================*/
window.NCNWeatherDepartment = (() => {
  "use strict";

  const PRESETS = window.NCNWeatherPresets || Object.freeze({ clear: Object.freeze({}) });
  const LAYER_KEYS = Object.freeze(["far", "rear", "middle", "near"]);
  const TYPES = Object.freeze(["mist", "dust", "rain"]);
  const APPROVED_MIST = Object.freeze({
    density: 0.62,
    height: 0.34,
    opacity: 0.58,
    drift: 0.18,
    depthFlow: -0.12,
    turbulence: 0.42,
    softness: 0.66,
    baselineIntensity: 0.42,
    bankCount: 36,
    seed: 2045
  });
  const QUALITY = Object.freeze({
    reduced: Object.freeze({ mist: 20, dust: 8, rain: 0, fps: 8, dpr: 1 }),
    low: Object.freeze({ mist: 48, dust: 24, rain: 48, fps: 12, dpr: 1 }),
    medium: Object.freeze({ mist: 96, dust: 40, rain: 96, fps: 30, dpr: 1.2 }),
    high: Object.freeze({ mist: 128, dust: 64, rain: 144, fps: 30, dpr: 1.5 })
  });
  const PRESET_KEYS = Object.freeze([
    "mist", "smoke", "dust", "rain", "haze", "moisture", "turbulence",
    "drift", "fallSpeed", "depthFlow", "verticalFill", "bankScale", "bankMultiplier", "electrical"
  ]);
  const ACCEPTED_EFFECTS = Object.freeze({
    "electrical-disturbance": Object.freeze({ channel: "fault", purpose: "ambient", layer: "near" }),
    "light-flash": Object.freeze({ channel: "environment", purpose: "ambient", layer: "rear" })
  });
  const DEPTH_CONVENTION = "smaller-positive-z-is-nearer";
  const HEAVY_MIST_PRESET = "heavy-mist";
  const HEAVY_MIST_FOREGROUND_DEPTH = 5.45;
  const MIST_PRESET_DEPTH_BASELINE = Number(PRESETS.mist?.depthFlow) || 0;

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, Number(value) || 0));
  const clamp01 = value => clamp(value, 0, 1);
  const mix = (a, b, amount) => a + (b - a) * amount;

  function hashSeed(value) {
    let hash = 2166136261;
    for (const character of String(value ?? APPROVED_MIST.seed)) {
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

  function clonePreset(source = PRESETS.clear) {
    const result = {};
    PRESET_KEYS.forEach(key => { result[key] = Number(source?.[key]) || 0; });
    return result;
  }

  function blendPreset(from, to, amount) {
    const result = {};
    PRESET_KEYS.forEach(key => { result[key] = mix(from[key], to[key], amount); });
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
    if (!context || typeof context !== "object") throw new TypeError("Weather requires a PR-86 department context.");

    const state = {
      moduleId: String(context.owner || "weather").trim().replace(/[^a-z0-9:_-]+/gi, "-") || "weather",
      initialised: false,
      enabled: false,
      suspended: false,
      destroyed: false,
      preset: "clear",
      targetPreset: "clear",
      seed: APPROVED_MIST.seed,
      qualityOverride: null,
      resolvedQuality: null,
      currentIntensity: 0,
      targetIntensity: 0,
      wind: { x: 0, y: 0, z: 0 },
      readingAttenuation: 0.84,
      controlAttenuation: 0.68,
      transitionAttenuation: 1,
      transition: null,
      config: clonePreset(PRESETS.clear),
      spawnSerial: 0,
      elapsedMs: 0,
      frameCount: 0,
      lastDelta: 0,
      lastEnvelope: null,
      effectRequests: 0,
      lastZones: { reading: false, controls: 0 },
      geometry: { frames: 0, cameraReads: 0, layerMeasurements: 0, zoneReads: 0 },
      qualityChanges: 0,
      fpsUpdates: 0,
      depthFrameSerial: 0,
      heavyMistPrimePending: false,
      heavyMistPrimeCount: 0,
      mistRecycleCount: 0,
      mistVisibleBanks: 0,
      mistMinimumVisibleBanks: null
    };

    let random = seededRandom(state.seed);
    let effects = null;
    let runtimeHandle = null;
    let resumeGuard = true;
    let particles = { mist: [], dust: [], rain: [] };
    let currentDepthFrame = null;
    let depthFrameEpoch = 0;
    const canvases = new Map();
    const contexts = new Map();
    const layerRects = new Map();
    const activeEffectHandles = new Set();
    const afterRenderSubscriptions = new Set();
    let afterRenderGeneration = 0;

    function ensureAlive() {
      if (state.destroyed) throw new Error("Destroyed weather module cannot be used.");
    }

    function invalidateDepthFrame(reason = "weather-frame-invalidated") {
      const previous = currentDepthFrame;
      depthFrameEpoch += 1;
      currentDepthFrame = null;
      if (previous) {
        const payload = Object.freeze({
          type: "invalidate",
          reason,
          token: previous.token,
          runtimeToken: previous.runtimeToken,
          frameNumber: previous.frameNumber,
          generation: afterRenderGeneration
        });
        [...afterRenderSubscriptions].forEach(record => {
          if (!record.active) return;
          try { record.listener(payload); } catch (error) { console.error("[NCN Weather] frame invalidation listener failed", error); }
        });
      }
    }

    function clearAfterRenderSubscriptions(reason = "weather-frame-invalidated") {
      afterRenderGeneration += 1;
      afterRenderSubscriptions.forEach(record => {
        record.active = false;
        record.reason = reason;
      });
      afterRenderSubscriptions.clear();
    }

    function subscribeAfterRender(listener) {
      ensureAlive();
      if (typeof listener !== "function") throw new TypeError("Weather after-render subscribers must be functions.");
      const record = { listener, active: true, generation: afterRenderGeneration, reason: null };
      afterRenderSubscriptions.add(record);
      const unsubscribe = () => {
        if (!record.active) return false;
        record.active = false;
        record.reason = "subscriber-release";
        return afterRenderSubscriptions.delete(record);
      };
      unsubscribe.active = () => record.active && afterRenderSubscriptions.has(record);
      unsubscribe.generation = () => record.generation;
      return unsubscribe;
    }

    function notifyAfterRender(runtimeFrame, depthFrame) {
      if (!depthFrame || state.destroyed || state.suspended || !state.enabled) return 0;
      const payload = Object.freeze({
        type: "render",
        frame: runtimeFrame || null,
        depthFrame,
        token: depthFrame.token,
        runtimeToken: depthFrame.runtimeToken,
        frameNumber: depthFrame.frameNumber,
        generation: afterRenderGeneration
      });
      let delivered = 0;
      [...afterRenderSubscriptions].forEach(record => {
        if (!record.active) return;
        try {
          record.listener(payload);
          delivered += 1;
        } catch (error) {
          console.error("[NCN Weather] after-render listener failed", error);
        }
      });
      return delivered;
    }

    function primitiveFrameToken(frame) {
      const candidate = frame?.frameToken ?? frame?.token ?? frame?.frameId ?? frame?.frame ?? frame?.id;
      return ["string", "number", "bigint"].includes(typeof candidate) ? candidate : null;
    }

    function presetByName(name) {
      const key = String(name || "clear");
      if (!PRESETS[key]) throw new RangeError(`Unknown weather preset: ${key}`);
      return { key, values: clonePreset(PRESETS[key]) };
    }

    function hostQuality(frame = null) {
      return String(frame?.quality || context.runtime?.getQuality?.() || context.settings?.quality || "full");
    }

    function effectiveQuality(frame = null) {
      if (state.qualityOverride) return state.qualityOverride;
      const quality = hostQuality(frame);
      if (frame?.reducedMotion || context.settings?.reducedMotion || quality === "reduced") return "reduced";
      const cores = Number(globalThis.navigator?.hardwareConcurrency) || 4;
      return cores <= 4 ? "low" : cores <= 8 ? "medium" : "high";
    }

    function setCanvasVisibility(visible) {
      canvases.forEach(canvas => {
        canvas.hidden = !visible;
        if (canvas.style) canvas.style.visibility = visible ? "visible" : "hidden";
      });
    }

    function mountCanvases() {
      const layers = context.layers?.weather || {};
      LAYER_KEYS.forEach(key => {
        const layer = layers[key];
        if (!layer) throw new Error(`Weather layer is unavailable: weather:${key}`);
        const canvas = document.createElement("canvas");
        canvas.className = `ncn-department-weather-canvas ncn-department-weather-${key}`;
        canvas.setAttribute?.("aria-hidden", "true");
        Object.assign(canvas.style || {}, {
          position: "absolute",
          inset: "0",
          width: "100%",
          height: "100%",
          pointerEvents: "none"
        });
        layer.append?.(canvas);
        const drawingContext = canvas.getContext?.("2d", { alpha: true });
        if (!drawingContext) throw new Error(`Canvas 2D context unavailable for weather:${key}`);
        canvases.set(key, canvas);
        contexts.set(key, drawingContext);
      });
      setCanvasVisibility(false);
    }

    function measureLayer(key) {
      const canvas = canvases.get(key);
      const owner = canvas?.parentElement || canvas?.parentNode;
      const rect = owner?.getBoundingClientRect?.() || canvas?.getBoundingClientRect?.();
      state.geometry.layerMeasurements += 1;
      return {
        left: Number(rect?.left) || 0,
        top: Number(rect?.top) || 0,
        width: Math.max(1, Number(rect?.width) || Number(globalThis.innerWidth) || 1),
        height: Math.max(1, Number(rect?.height) || Number(globalThis.innerHeight) || 1)
      };
    }

    function collectLayerRects(profile, force = false) {
      const result = new Map();
      LAYER_KEYS.forEach(key => {
        const canvas = canvases.get(key);
        const drawingContext = contexts.get(key);
        const rect = measureLayer(key);
        const previous = layerRects.get(key);
        const changed = force || !previous || previous.width !== rect.width || previous.height !== rect.height || previous.dpr !== profile.dpr;
        if (changed) {
          canvas.width = Math.max(1, Math.round(rect.width * profile.dpr));
          canvas.height = Math.max(1, Math.round(rect.height * profile.dpr));
          canvas.style.width = `${rect.width}px`;
          canvas.style.height = `${rect.height}px`;
          drawingContext.setTransform?.(profile.dpr, 0, 0, profile.dpr, 0, 0);
        }
        const saved = { ...rect, dpr: profile.dpr };
        layerRects.set(key, saved);
        result.set(key, saved);
      });
      return result;
    }

    function cameraAndBounds() {
      state.geometry.cameraReads += 1;
      const camera = context.chamber?.getCameraSnapshot?.() || null;
      return {
        camera,
        bounds: Object.freeze({
          halfWidth: Number(camera?.finalHalfWidth || camera?.halfWidth) || 4.2,
          halfHeight: Number(camera?.halfHeight) || 2.55,
          near: Number(camera?.near) || 2.5,
          far: Number(camera?.far) || 10.5
        })
      };
    }

    function collectScene(profile, force = false) {
      const rects = collectLayerRects(profile, force);
      const { camera, bounds } = cameraAndBounds();
      state.geometry.zoneReads += 1;
      const readingRect = normaliseRect(context.views?.getReadingZone?.());
      state.geometry.zoneReads += 1;
      const controls = Array.from(context.views?.getControlZones?.() || []).map(zone => normaliseRect(zone)).filter(Boolean);
      state.geometry.frames += 1;
      state.lastZones = { reading: Boolean(readingRect), controls: controls.length };
      return Object.freeze({
        rects,
        camera,
        bounds,
        reading: readingRect ? { rect: readingRect, attenuation: state.readingAttenuation } : null,
        controls: controls.map(rect => ({ rect, attenuation: state.controlAttenuation }))
      });
    }

    function randomBetween(minimum, maximum) {
      return mix(minimum, maximum, random());
    }

    function effectiveMistDepthFlow() {
      const configured = Number(state.config.depthFlow) || 0;
      const presetAdjustment = state.config.mist > 0
        ? configured - MIST_PRESET_DEPTH_BASELINE
        : configured;
      return APPROVED_MIST.depthFlow + presetAdjustment + state.wind.z;
    }

    function effectiveParticleDepthFlow() {
      return (Number(state.config.depthFlow) || 0) + state.wind.z;
    }

    function resetMistBank(bank, bounds, initial = false) {
      bank.x = randomBetween(-bounds.halfWidth * 1.25, bounds.halfWidth * 1.25);
      bank.z = randomBetween(bounds.near + 0.2, bounds.far - 0.25);
      bank.width = randomBetween(0.62, 1.58);
      bank.depth = randomBetween(0.38, 1.15);
      bank.lift = randomBetween(0.02, 0.28);
      bank.verticalSeed = random();
      bank.scaleSeed = randomBetween(0.88, 1.12);
      bank.alpha = randomBetween(0.55, 1.0);
      bank.phase = randomBetween(0, Math.PI * 2);
      bank.phase2 = randomBetween(0, Math.PI * 2);
      bank.speed = randomBetween(0.72, 1.28);
      bank.puffs = Math.round(randomBetween(3, 5));
      bank.bias = randomBetween(-0.4, 0.4);
      bank.age = 0;
    }

    function makePool(type, count, bounds = null) {
      const pool = particles[type];
      while (pool.length < count) {
        const particle = { active: false, type, slot: pool.length };
        if (type === "mist" && bounds) resetMistBank(particle, bounds, true);
        pool.push(particle);
      }
      pool.slice(count).forEach(item => { item.active = false; });
      pool.length = count;
    }

    function applyQuality(frame = null, force = false, notifyRuntime = true, bounds = null) {
      const resolved = effectiveQuality(frame);
      const changed = force || state.resolvedQuality !== resolved;
      const profile = QUALITY[resolved] || QUALITY.medium;
      if (!changed) return { resolved, profile, changed: false };
      state.resolvedQuality = resolved;
      state.qualityChanges += 1;
      makePool("mist", profile.mist, bounds || { halfWidth: 4.2, halfHeight: 2.55, near: 2.5, far: 10.5 });
      makePool("dust", profile.dust);
      makePool("rain", profile.rain);
      if (notifyRuntime && runtimeHandle) {
        runtimeHandle.setMaxFps?.(profile.fps);
        state.fpsUpdates += 1;
      }
      return { resolved, profile, changed: true };
    }

    function mistLayer(z) {
      if (z >= 8.5) return "far";
      if (z >= 6.5) return "rear";
      if (z >= 4.35) return "middle";
      return "near";
    }

    function particleLayer(z, bounds) {
      const amount = clamp01((z - bounds.near) / Math.max(0.001, bounds.far - bounds.near));
      if (amount >= 0.75) return "far";
      if (amount >= 0.5) return "rear";
      if (amount >= 0.25) return "middle";
      return "near";
    }

    function activeCount(type) {
      return particles[type].reduce((sum, particle) => sum + (particle.active ? 1 : 0), 0);
    }

    function activateParticle(particle, type, bounds) {
      state.spawnSerial += 1;
      particle.active = true;
      particle.age = 0;
      if (type === "mist") return;
      particle.life = type === "dust" ? randomBetween(2.8, 7) : randomBetween(0.9, 2.2);
      particle.x = randomBetween(-bounds.halfWidth * 1.16, bounds.halfWidth * 1.16);
      particle.y = type === "rain"
        ? randomBetween(-bounds.halfHeight * 0.2, bounds.halfHeight * 1.15)
        : randomBetween(-bounds.halfHeight * 0.95, bounds.halfHeight * 0.85);
      particle.z = randomBetween(bounds.near + 0.15, bounds.far);
      particle.size = type === "dust" ? randomBetween(0.8, 2.2) : randomBetween(5, 14);
      particle.alpha = randomBetween(0.45, 1);
      particle.phase = randomBetween(0, Math.PI * 2);
      particle.velocity = randomBetween(0.72, 1.24);
      particle.layer = particleLayer(particle.z, bounds);
    }

    function spawnToward(type, target, maximumPerStep, bounds) {
      let required = Math.min(Math.max(0, target - activeCount(type)), maximumPerStep);
      for (const particle of particles[type]) {
        if (!required) break;
        if (particle.active) continue;
        activateParticle(particle, type, bounds);
        required -= 1;
      }
    }

    function deactivateSurplus(type, target) {
      let count = activeCount(type);
      if (count <= target) return;
      for (let index = particles[type].length - 1; index >= 0 && count > target; index -= 1) {
        const particle = particles[type][index];
        if (!particle.active) continue;
        particle.active = false;
        count -= 1;
      }
    }

    function deactivateAll(resetSequence = false) {
      TYPES.forEach(type => particles[type].forEach(particle => { particle.active = false; particle.age = 0; }));
      state.mistVisibleBanks = 0;
      state.mistMinimumVisibleBanks = null;
      if (resetSequence) {
        state.spawnSerial = 0;
        state.elapsedMs = 0;
        state.mistRecycleCount = 0;
        random = seededRandom(state.seed);
      }
    }

    function mistSettings(intensity) {
      const presetBaseline = Number(PRESETS.mist?.mist) || 0.48;
      const presetRatio = presetBaseline > 0 ? clamp(state.config.mist / presetBaseline, 0, 2) : 0;
      const intensityRatio = clamp(intensity / APPROVED_MIST.baselineIntensity, 0, 1.5);
      const verticalFill = clamp01(state.config.verticalFill);
      return Object.freeze({
        density: clamp(APPROVED_MIST.density * presetRatio, 0, 1),
        height: APPROVED_MIST.height * mix(1, 3.6, verticalFill),
        opacity: clamp(APPROVED_MIST.opacity * intensityRatio, 0, 1),
        drift: APPROVED_MIST.drift + state.wind.x,
        depthFlow: effectiveMistDepthFlow(),
        turbulence: APPROVED_MIST.turbulence,
        softness: APPROVED_MIST.softness,
        verticalFill,
        bankScale: clamp(state.config.bankScale || 1, 0.7, 1.8),
        bankMultiplier: clamp(state.config.bankMultiplier || 1, 1, 1.8)
      });
    }

    function targetCounts(intensity, profile) {
      const settings = mistSettings(intensity);
      const originalCount = Math.round((18 + settings.density * 58) * settings.bankMultiplier);
      return {
        mist: intensity > 0.002 && settings.density > 0.03 ? Math.min(profile.mist, originalCount) : 0,
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

    function mistBankVisible(bank, bounds) {
      if (!bank.active) return false;
      const halfVisibleWidth = bank.width * 0.58;
      const halfVisibleDepth = bank.depth * 0.30;
      return bank.x + halfVisibleWidth >= -bounds.halfWidth
        && bank.x - halfVisibleWidth <= bounds.halfWidth
        && bank.z + halfVisibleDepth >= bounds.near
        && bank.z - halfVisibleDepth <= bounds.far;
    }

    function updateMistCoverage(bounds, target) {
      const visible = particles.mist.reduce((count, bank) => count + (mistBankVisible(bank, bounds) ? 1 : 0), 0);
      state.mistVisibleBanks = visible;
      if (target > 0) {
        state.mistMinimumVisibleBanks = state.mistMinimumVisibleBanks === null
          ? visible
          : Math.min(state.mistMinimumVisibleBanks, visible);
      } else state.mistMinimumVisibleBanks = null;
      return visible;
    }

    function recycleMistBank(bank, bounds, crossedX, crossedZ) {
      const previousX = bank.x;
      const previousZ = bank.z;
      const xLimit = bounds.halfWidth + bank.width * 1.4;
      const nearLimit = bounds.near + 0.08;
      const farLimit = bounds.far + 0.2;
      resetMistBank(bank, bounds, true);

      if (crossedX) {
        bank.x = previousX > xLimit
          ? -bounds.halfWidth + bank.width * 0.18
          : bounds.halfWidth - bank.width * 0.18;
      } else bank.x = clamp(previousX, -bounds.halfWidth, bounds.halfWidth);

      if (crossedZ) {
        bank.z = previousZ < nearLimit
          ? bounds.far - bank.depth * 0.18
          : bounds.near + 0.12 + bank.depth * 0.18;
      } else bank.z = clamp(previousZ, bounds.near + 0.08, bounds.far - 0.08);

      state.mistRecycleCount += 1;
    }

    function updateMistBank(bank, deltaSeconds, bounds, settings) {
      if (!bank.active) return;
      bank.age += deltaSeconds;
      const wave = Math.sin(state.elapsedMs * 0.00034 * bank.speed + bank.phase);
      const wave2 = Math.sin(state.elapsedMs * 0.00021 + bank.phase2);
      const sideSpeed = settings.drift * 0.22;
      const depthSpeed = settings.depthFlow * 0.28;
      bank.x += (sideSpeed * bank.speed + wave * 0.035 * settings.turbulence + bank.bias * 0.006) * deltaSeconds;
      bank.z += (depthSpeed * bank.speed + wave2 * 0.025 * settings.turbulence) * deltaSeconds;
      const xLimit = bounds.halfWidth + bank.width * 1.4;
      const crossedX = bank.x > xLimit || bank.x < -xLimit;
      const crossedZ = bank.z < bounds.near + 0.08 || bank.z > bounds.far + 0.2;
      if (crossedX || crossedZ) recycleMistBank(bank, bounds, crossedX, crossedZ);
    }

    function primeHeavyMistBank(bounds) {
      if (!state.heavyMistPrimePending || state.targetPreset !== HEAVY_MIST_PRESET) return 0;
      const bank = particles.mist.find(item => item.active);
      if (!bank) return 0;
      resetMistBank(bank, bounds, true);
      bank.x = 0;
      bank.z = clamp(HEAVY_MIST_FOREGROUND_DEPTH - 0.22, bounds.near + 0.18, bounds.far - 0.25);
      bank.width = 1.72;
      bank.depth = 0.82;
      bank.lift = 0.18;
      bank.verticalSeed = 0.72;
      bank.scaleSeed = 1;
      bank.alpha = 0.95;
      bank.puffs = 4;
      bank.bias = 0.04;
      bank.speed = 0.92;
      state.heavyMistPrimePending = false;
      state.heavyMistPrimeCount += 1;
      return 1;
    }

    function updateParticle(particle, deltaSeconds, bounds) {
      if (!particle.active) return;
      particle.age += deltaSeconds;
      if (particle.age >= particle.life) { particle.active = false; return; }
      const wave = Math.sin(particle.phase + particle.age * (0.6 + state.config.turbulence * 1.8));
      if (particle.type === "rain") {
        particle.y -= (0.65 + state.config.fallSpeed * 1.55) * particle.velocity * deltaSeconds;
        particle.x += state.wind.x * 0.34 * deltaSeconds;
        particle.z += effectiveParticleDepthFlow() * 0.26 * deltaSeconds;
        if (particle.y < -bounds.halfHeight * 1.2) particle.active = false;
      } else {
        particle.x += (state.wind.x * 0.44 + wave * state.config.turbulence * 0.08) * particle.velocity * deltaSeconds;
        particle.y += (state.wind.y * 0.24 + Math.cos(particle.phase + particle.age) * 0.025) * deltaSeconds;
        particle.z += effectiveParticleDepthFlow() * 0.20 * deltaSeconds;
      }
      if (particle.x > bounds.halfWidth * 1.25) particle.x = -bounds.halfWidth * 1.25;
      if (particle.x < -bounds.halfWidth * 1.25) particle.x = bounds.halfWidth * 1.25;
      if (particle.z < bounds.near) particle.z = bounds.far;
      if (particle.z > bounds.far) particle.z = bounds.near;
      particle.layer = particleLayer(particle.z, bounds);
    }

    function project(x, y, z, layerKey, scene) {
      const rect = scene.rects.get(layerKey);
      const point = scene.camera?.project?.(x, y, z) || context.chamber?.project?.(x, y, z);
      if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
        return { x: point.x - rect.left, y: point.y - rect.top };
      }
      return {
        x: ((x / (scene.bounds.halfWidth * 2)) + 0.5) * rect.width,
        y: (0.5 - y / (scene.bounds.halfHeight * 2)) * rect.height
      };
    }

    function energyColour(red, green, blue, alpha) {
      return `rgba(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)}, ${alpha})`;
    }

    function mistPalette() {
      const smoke = clamp01(state.config.smoke);
      const heat = clamp01(state.config.electrical);
      const baseRed = mix(214, 92, smoke);
      const baseGreen = mix(18, 2, smoke);
      const baseBlue = mix(30, 12, smoke);
      const glowRed = mix(255, 166, smoke);
      const glowGreen = mix(38, 8, smoke);
      const glowBlue = mix(35, 18, smoke);
      return Object.freeze({
        body: Object.freeze([
          mix(baseRed, 255, heat),
          mix(baseGreen, 104, heat),
          mix(baseBlue, 52, heat)
        ]),
        glow: Object.freeze([
          mix(glowRed, 255, heat),
          mix(glowGreen, 126, heat),
          mix(glowBlue, 70, heat)
        ])
      });
    }

    function passColour(alpha, channels = mistPalette().body) {
      return energyColour(channels[0], channels[1], channels[2], alpha);
    }

    function redColour(alpha, channels = mistPalette().glow) {
      return energyColour(channels[0], channels[1], channels[2], alpha);
    }

    function buildMistPuffs(settings, scene) {
      const puffs = [];
      const palette = mistPalette();
      const sortedBanks = particles.mist.filter(bank => bank.active).sort((a, b) => b.z - a.z);

      sortedBanks.forEach(bank => {
        const floorY = -scene.bounds.halfHeight;
        const baseAlpha = settings.opacity * settings.density * bank.alpha;
        if (baseAlpha < 0.002) return;
        const depthVisibility = clamp(scene.bounds.near / bank.z, 0.20, 1);
        const pulse = 0.80 + Math.sin(state.elapsedMs * 0.00027 * bank.speed + bank.phase) * 0.16;
        const localAlpha = baseAlpha * pulse * mix(0.52, 1.0, depthVisibility);

        for (let index = 0; index < bank.puffs; index += 1) {
          const normal = bank.puffs === 1 ? 0.5 : index / (bank.puffs - 1);
          const wobble = Math.sin(state.elapsedMs * 0.00033 * bank.speed + bank.phase + index * 1.7);
          const seededScale = mix(1, bank.scaleSeed || 1, settings.verticalFill);
          const bankScale = settings.bankScale * seededScale;
          const bankWidth = bank.width * bankScale;
          const bankDepth = bank.depth * bankScale;
          const x = bank.x + (normal - 0.5) * bankWidth * 1.35 + wobble * bankWidth * 0.12 * settings.turbulence;
          const z = clamp(
            bank.z + Math.sin(bank.phase2 + index * 2.1) * bankDepth * 0.28,
            scene.bounds.near + 0.05,
            scene.bounds.far - 0.05
          );
          const pass = mistLayer(z);
          const layerRect = scene.rects.get(pass);
          const chamberClip = normaliseRect(scene.camera?.apertureAt?.(z, scene.bounds.halfWidth))
            || Object.freeze({
              left: layerRect.left,
              top: layerRect.top,
              right: layerRect.left + layerRect.width,
              bottom: layerRect.top + layerRect.height,
              width: layerRect.width,
              height: layerRect.height
            });
          const verticalRange = scene.bounds.halfHeight * 1.72 * settings.verticalFill;
          const lift = bank.lift
            + (bank.verticalSeed || 0) * verticalRange
            + settings.height * (0.18 + 0.26 * Math.sin(bank.phase + index * 1.3) ** 2);
          const centre = project(x, floorY + lift, z, pass, scene);
          const left = project(x - bankWidth * (0.30 + 0.09 * index), floorY + lift, z, pass, scene);
          const right = project(x + bankWidth * (0.30 + 0.09 * index), floorY + lift, z, pass, scene);
          const upper = project(x, floorY + lift + settings.height * (0.40 + 0.25 * bank.alpha), z, pass, scene);
          const depthA = project(x, floorY + lift * 0.6, clamp(z - bankDepth * 0.32, scene.bounds.near + 0.05, scene.bounds.far), pass, scene);
          const depthB = project(x, floorY + lift * 0.6, clamp(z + bankDepth * 0.32, scene.bounds.near + 0.05, scene.bounds.far), pass, scene);
          const radiusX = Math.max(4, Math.abs(right.x - left.x) * 0.60);
          const verticalHeight = Math.abs(upper.y - centre.y);
          const floorDepthHeight = Math.abs(depthA.y - depthB.y) * 0.42;
          const radiusY = Math.max(2.5, verticalHeight + floorDepthHeight);
          const alpha = localAlpha * (0.22 + 0.14 * Math.sin(index * 2.4 + bank.phase) ** 2);
          puffs.push(Object.freeze({
            z,
            layer: pass,
            localX: centre.x,
            localY: centre.y,
            pageX: centre.x + layerRect.left,
            pageY: centre.y + layerRect.top,
            chamberClip,
            radiusX,
            radiusY,
            alpha,
            softMid: mix(0.30, 0.54, settings.softness),
            softEdge: mix(0.62, 0.88, settings.softness),
            illuminated: index === 0,
            bodyColour: palette.body,
            glowColour: palette.glow
          }));
        }
      });

      puffs.sort((a, b) => b.z - a.z);
      return Object.freeze(puffs);
    }

    function shiftedClipRect(rect, originX = 0, originY = 0) {
      if (!rect) return null;
      return {
        left: rect.left - originX,
        top: rect.top - originY,
        width: rect.width,
        height: rect.height
      };
    }

    function drawMistPuff(targetContext, puff, x = puff.localX, y = puff.localY, clipRect = null) {
      targetContext.save?.();
      if (clipRect && typeof targetContext.rect === "function" && typeof targetContext.clip === "function") {
        targetContext.beginPath?.();
        targetContext.rect(clipRect.left, clipRect.top, clipRect.width, clipRect.height);
        targetContext.clip();
      }
      targetContext.translate?.(x, y);
      targetContext.scale?.(puff.radiusX, puff.radiusY);
      const gradient = targetContext.createRadialGradient?.(0, 0, 0.08, 0, 0, 1);
      if (gradient) {
        gradient.addColorStop?.(0, passColour(puff.alpha, puff.bodyColour));
        gradient.addColorStop?.(puff.softMid, passColour(puff.alpha * 0.72, puff.bodyColour));
        gradient.addColorStop?.(puff.softEdge, passColour(puff.alpha * 0.22, puff.bodyColour));
        gradient.addColorStop?.(1, passColour(0, puff.bodyColour));
        targetContext.fillStyle = gradient;
        targetContext.beginPath?.();
        targetContext.arc?.(0, 0, 1, 0, Math.PI * 2);
        targetContext.fill?.();
      }

      if (puff.illuminated) {
        targetContext.globalCompositeOperation = "lighter";
        const red = targetContext.createRadialGradient?.(0, 0.38, 0.05, 0, 0.38, 1);
        if (red) {
          red.addColorStop?.(0, redColour(puff.alpha * 0.18, puff.glowColour));
          red.addColorStop?.(0.50, redColour(puff.alpha * 0.07, puff.glowColour));
          red.addColorStop?.(1, redColour(0, puff.glowColour));
          targetContext.fillStyle = red;
          targetContext.beginPath?.();
          targetContext.arc?.(0, 0.38, 1, 0, Math.PI * 2);
          targetContext.fill?.();
        }
      }
      targetContext.restore?.();
    }

    function depthViewport(value) {
      if (!value) return null;
      const rect = normaliseRect(value);
      if (!rect) throw new TypeError("Weather depth-frame viewport must provide finite left, top, width and height values.");
      return rect;
    }

    function puffIntersectsViewport(puff, viewport) {
      if (!viewport) return true;
      return puff.pageX + puff.radiusX >= viewport.left
        && puff.pageX - puff.radiusX <= viewport.right
        && puff.pageY + puff.radiusY >= viewport.top
        && puff.pageY - puff.radiusY <= viewport.bottom;
    }

    function cutoutPage(targetContext, descriptor, viewport) {
      if (!descriptor?.rect || descriptor.attenuation <= 0) return;
      const padding = 12;
      const originX = viewport?.left || 0;
      const originY = viewport?.top || 0;
      const left = descriptor.rect.left - originX - padding;
      const top = descriptor.rect.top - originY - padding;
      const width = descriptor.rect.width + padding * 2;
      const height = descriptor.rect.height + padding * 2;
      targetContext.save?.();
      targetContext.globalCompositeOperation = "destination-out";
      targetContext.fillStyle = `rgba(0,0,0,${clamp01(descriptor.attenuation)})`;
      if (typeof targetContext.roundRect === "function") {
        targetContext.beginPath?.();
        targetContext.roundRect(left, top, width, height, 16);
        targetContext.fill?.();
      } else targetContext.fillRect?.(left, top, width, height);
      targetContext.restore?.();
    }

    function publishDepthFrame(runtimeFrame, scene, puffs) {
      const epoch = depthFrameEpoch;
      const serial = ++state.depthFrameSerial;
      const runtimeToken = primitiveFrameToken(runtimeFrame);
      const token = `${state.moduleId}:depth:${epoch}:${serial}`;
      const reading = scene.reading ? Object.freeze({ rect: scene.reading.rect, attenuation: scene.reading.attenuation }) : null;
      const controls = Object.freeze(scene.controls.map(item => Object.freeze({ rect: item.rect, attenuation: item.attenuation })));
      const depths = puffs.map(puff => puff.z);
      const depthRange = Object.freeze({
        nearest: depths.length ? Math.min(...depths) : null,
        farthest: depths.length ? Math.max(...depths) : null
      });
      let handle = null;

      const renderForeground = (targetContext, options = {}) => {
        if (!targetContext || typeof targetContext !== "object") throw new TypeError("Weather depth-frame rendering requires a 2D context.");
        if (state.destroyed || state.suspended || !state.enabled || depthFrameEpoch !== epoch || currentDepthFrame !== handle) return 0;
        const viewport = depthViewport(options.viewport);
        const originX = viewport?.left || 0;
        const originY = viewport?.top || 0;
        const rawRegions = Array.isArray(options.regions) ? options.regions : null;
        const nearerThan = Number(options.nearerThan);
        if (!rawRegions && !Number.isFinite(nearerThan)) throw new TypeError("Weather depth-frame rendering requires a finite nearerThan chamber depth or regions.");

        const regions = rawRegions ? rawRegions.map((region, index) => {
          const threshold = Number(region?.nearerThan);
          if (!Number.isFinite(threshold)) throw new TypeError(`Weather foreground region ${index} requires a finite nearerThan depth.`);
          const polygons = Array.from(region?.polygons || []).map((polygon, polygonIndex) => {
            const points = Array.from(polygon || []).map(point => ({ x: Number(point?.x), y: Number(point?.y) }));
            if (points.length < 3 || points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
              throw new TypeError(`Weather foreground region ${index} polygon ${polygonIndex} is invalid.`);
            }
            const xs = points.map(point => point.x);
            const ys = points.map(point => point.y);
            return {
              points,
              bounds: { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) }
            };
          });
          if (!polygons.length) throw new TypeError(`Weather foreground region ${index} requires at least one polygon.`);
          return { nearerThan: threshold, polygons };
        }) : null;

        const tracePolygons = polygons => {
          targetContext.beginPath?.();
          polygons.forEach(polygon => {
            const points = polygon.points;
            targetContext.moveTo?.(points[0].x - originX, points[0].y - originY);
            for (let index = 1; index < points.length; index += 1) {
              targetContext.lineTo?.(points[index].x - originX, points[index].y - originY);
            }
            targetContext.closePath?.();
          });
        };

        const puffIntersectsPolygonBounds = (puff, polygon) => (
          puff.pageX + puff.radiusX >= polygon.bounds.left
          && puff.pageX - puff.radiusX <= polygon.bounds.right
          && puff.pageY + puff.radiusY >= polygon.bounds.top
          && puff.pageY - puff.radiusY <= polygon.bounds.bottom
        );

        let rendered = 0;
        targetContext.save?.();
        if (viewport && typeof targetContext.rect === "function" && typeof targetContext.clip === "function") {
          targetContext.beginPath?.();
          targetContext.rect(0, 0, viewport.width, viewport.height);
          targetContext.clip();
        }
        for (const puff of puffs) {
          if (!puffIntersectsViewport(puff, viewport)) continue;
          let qualifyingPolygons = null;
          if (regions) {
            qualifyingPolygons = regions
              .filter(region => puff.z < region.nearerThan)
              .flatMap(region => region.polygons.filter(polygon => puffIntersectsPolygonBounds(puff, polygon)));
            if (!qualifyingPolygons.length) continue;
          } else if (!(puff.z < nearerThan)) continue;

          targetContext.save?.();
          if (qualifyingPolygons?.length && typeof targetContext.clip === "function") {
            tracePolygons(qualifyingPolygons);
            targetContext.clip();
          }
          drawMistPuff(
            targetContext,
            puff,
            puff.pageX - originX,
            puff.pageY - originY,
            shiftedClipRect(puff.chamberClip, originX, originY)
          );
          targetContext.restore?.();
          rendered += 1;
        }
        if (options.includeAttenuation !== false) {
          if (reading) cutoutPage(targetContext, reading, viewport);
          controls.forEach(item => cutoutPage(targetContext, item, viewport));
        }
        targetContext.restore?.();
        return rendered;
      };

      handle = Object.freeze({
        token,
        runtimeToken,
        frameNumber: state.frameCount,
        elapsedMs: state.elapsedMs,
        depthConvention: DEPTH_CONVENTION,
        mistDepthFlow: effectiveMistDepthFlow(),
        particleDepthFlow: effectiveParticleDepthFlow(),
        puffCount: puffs.length,
        depthRange,
        chamberClipped: true,
        renderForeground
      });
      currentDepthFrame = handle;
      return handle;
    }

    function getDepthFrame(frameToken = null) {
      if (!state.initialised || state.destroyed || state.suspended || !state.enabled || !currentDepthFrame) return null;
      if (frameToken !== null && frameToken !== undefined
        && frameToken !== currentDepthFrame.token
        && frameToken !== currentDepthFrame.runtimeToken) return null;
      return currentDepthFrame;
    }

    function particleOpacity(particle) {
      const progress = clamp01(particle.age / Math.max(0.001, particle.life));
      return particle.alpha * Math.max(0, Math.min(1, progress * 5, (1 - progress) * 5));
    }

    function drawParticle(targetContext, particle, intensity, scene) {
      const point = project(particle.x, particle.y, particle.z, particle.layer, scene);
      const opacity = particleOpacity(particle) * intensity;
      if (opacity <= 0.002) return;
      if (particle.type === "rain") {
        targetContext.strokeStyle = `rgba(255,126,88,${opacity * 0.42})`;
        targetContext.lineWidth = Math.max(0.6, particle.size * 0.08);
        targetContext.beginPath?.();
        targetContext.moveTo?.(point.x, point.y);
        targetContext.lineTo?.(point.x - state.wind.x * particle.size * 0.16, point.y + particle.size);
        targetContext.stroke?.();
      } else {
        targetContext.fillStyle = `rgba(255,112,70,${opacity * 0.56})`;
        targetContext.fillRect?.(point.x, point.y, particle.size, particle.size);
      }
    }

    function cutout(targetContext, rect, attenuation, layer) {
      if (!targetContext || !rect || !layer || attenuation <= 0) return;
      const padding = 12;
      targetContext.save();
      targetContext.globalCompositeOperation = "destination-out";
      targetContext.fillStyle = `rgba(0,0,0,${clamp01(attenuation)})`;
      const left = rect.left - layer.left - padding;
      const top = rect.top - layer.top - padding;
      const width = rect.width + padding * 2;
      const height = rect.height + padding * 2;
      if (typeof targetContext.roundRect === "function") {
        targetContext.beginPath();
        targetContext.roundRect(left, top, width, height, 16);
        targetContext.fill();
      } else targetContext.fillRect(left, top, width, height);
      targetContext.restore();
    }

    function clearCanvases() {
      LAYER_KEYS.forEach(key => {
        const targetContext = contexts.get(key);
        const rect = layerRects.get(key);
        if (targetContext && rect) targetContext.clearRect(0, 0, rect.width, rect.height);
      });
    }

    function render(intensity, scene, settings, runtimeFrame) {
      const puffs = buildMistPuffs(settings, scene);
      const depthFrame = publishDepthFrame(runtimeFrame, scene, puffs);
      clearCanvases();
      puffs.forEach(puff => {
        const layer = scene.rects.get(puff.layer);
        drawMistPuff(
          contexts.get(puff.layer),
          puff,
          puff.localX,
          puff.localY,
          shiftedClipRect(puff.chamberClip, layer.left, layer.top)
        );
      });
      ["dust", "rain"].forEach(type => particles[type].forEach(particle => {
        if (particle.active) drawParticle(contexts.get(particle.layer), particle, intensity, scene);
      }));
      LAYER_KEYS.forEach(key => {
        const targetContext = contexts.get(key);
        const layer = scene.rects.get(key);
        if (scene.reading) cutout(targetContext, scene.reading.rect, scene.reading.attenuation, layer);
        scene.controls.forEach(zone => cutout(targetContext, zone.rect, zone.attenuation, layer));
      });
      notifyAfterRender(runtimeFrame, depthFrame);
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
      const target = context.layers?.weather?.[layerKey || definition.layer];
      if (!target) throw new Error(`Weather effect layer is unavailable: weather:${layerKey || definition.layer}`);
      if (typeof effects.play !== "function") throw new Error("The accepted Effects dependency does not expose play().");
      const requestedIntensity = clamp01(options.intensity ?? 0.25);
      const envelope = context.director?.envelope?.(definition.channel, { intensity: requestedIntensity });
      if (envelope && envelope.allowed === false) return false;
      const safeOptions = { ...options };
      delete safeOptions.channel;
      delete safeOptions.purpose;
      const result = effects.play(key, target, {
        ...safeOptions,
        channel: definition.channel,
        purpose: definition.purpose,
        seed: Number.isFinite(Number(options.seed)) ? Number(options.seed) : hashSeed(`${state.seed}:${key}:${state.effectRequests + 1}`),
        intensity: Math.min(requestedIntensity, envelope?.intensity ?? 1)
      });
      state.effectRequests += 1;
      if (result && typeof result === "object" && typeof result.cancel === "function") {
        activeEffectHandles.add(result);
        result.finished?.finally?.(() => activeEffectHandles.delete(result));
      }
      return result ?? true;
    }

    function releaseEffects(reason) {
      activeEffectHandles.forEach(handle => {
        try { handle.cancel?.(reason); } catch (error) { console.error(error); }
      });
      activeEffectHandles.clear();
    }

    function runtimeStep(frame) {
      if (!state.initialised || state.destroyed || state.suspended || !state.enabled) return false;
      const quality = applyQuality(frame);
      const scene = collectScene(quality.profile, quality.changed);
      const rawDelta = resumeGuard ? 0 : Number(frame?.delta) || 0;
      resumeGuard = false;
      const delta = clamp(rawDelta, 0, 64);
      const deltaSeconds = delta / 1000;
      state.lastDelta = delta;
      state.frameCount += 1;
      state.elapsedMs += delta;
      updateTransition(delta);
      state.currentIntensity = mix(state.currentIntensity, state.targetIntensity, Math.min(1, delta / 260));
      const requested = state.currentIntensity * state.transitionAttenuation;
      const envelope = context.director?.envelope?.("environment", { intensity: requested })
        || { allowed: true, intensity: requested, mode: "ambient", reducedMotion: false };
      state.lastEnvelope = envelope;
      const readingScale = scene.reading || context.views?.isReading?.() ? 0.58 : 1;
      const intensity = envelope.allowed ? clamp01(envelope.intensity * readingScale) : 0;
      const settings = mistSettings(intensity);
      const counts = targetCounts(intensity, quality.profile);
      if (intensity > 0.002) {
        spawnToward("mist", counts.mist, quality.profile.mist, scene.bounds);
        spawnToward("dust", counts.dust, 4, scene.bounds);
        spawnToward("rain", counts.rain, 8, scene.bounds);
      }
      TYPES.forEach(type => deactivateSurplus(type, counts[type]));
      primeHeavyMistBank(scene.bounds);
      particles.mist.forEach(bank => updateMistBank(bank, deltaSeconds, scene.bounds, settings));
      updateMistCoverage(scene.bounds, counts.mist);
      ["dust", "rain"].forEach(type => particles[type].forEach(particle => updateParticle(particle, deltaSeconds, scene.bounds)));
      render(intensity, scene, settings, frame);
      const active = TYPES.reduce((sum, type) => sum + activeCount(type), 0);
      const settling = Boolean(state.transition) || Math.abs(state.currentIntensity - state.targetIntensity) > 0.002;
      return active > 0 || settling || state.targetIntensity > 0.002;
    }

    async function init() {
      ensureAlive();
      if (state.initialised) return snapshot();
      effects = context.integration?.requireService?.("effects") || null;
      mountCanvases();
      const quality = applyQuality(null, true, false);
      collectScene(quality.profile, true);
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
      return snapshot();
    }

    function setPreset(name) {
      ensureAlive();
      invalidateDepthFrame();
      const selected = presetByName(name);
      state.preset = selected.key;
      state.targetPreset = selected.key;
      state.config = selected.values;
      state.transition = null;
      state.heavyMistPrimePending = selected.key === HEAVY_MIST_PRESET;
      if (state.initialised && state.enabled && !state.suspended) runtimeHandle?.wake?.("weather:preset");
      return snapshot();
    }

    function setIntensity(value) {
      ensureAlive();
      invalidateDepthFrame();
      state.targetIntensity = clamp01(value);
      if (state.initialised && state.enabled && !state.suspended) runtimeHandle?.wake?.("weather:intensity");
      return state.targetIntensity;
    }

    function clearDisabledState(reason = "weather-disabled") {
      invalidateDepthFrame(reason);
      clearAfterRenderSubscriptions(reason);
      state.preset = "clear";
      state.targetPreset = "clear";
      state.config = clonePreset(PRESETS.clear);
      state.transition = null;
      state.heavyMistPrimePending = false;
      state.currentIntensity = 0;
      state.targetIntensity = 0;
      state.lastEnvelope = null;
      state.lastZones = { reading: false, controls: 0 };
      deactivateAll(true);
      releaseEffects(reason);
      clearCanvases();
      setCanvasVisibility(false);
    }

    function setEnabled(value) {
      ensureAlive();
      state.enabled = Boolean(value);
      if (!state.initialised) {
        if (!state.enabled) clearDisabledState();
        return state.enabled;
      }
      if (state.enabled && !state.suspended) {
        setCanvasVisibility(true);
        resumeGuard = true;
        runtimeHandle?.enable?.("weather:enabled");
      } else {
        runtimeHandle?.disable?.();
        if (!state.enabled) clearDisabledState();
      }
      return state.enabled;
    }

    function transitionTo(name, options = {}) {
      ensureAlive();
      invalidateDepthFrame();
      const selected = presetByName(name);
      const duration = Math.max(0, Number(options.duration) || 0);
      state.targetPreset = selected.key;
      state.heavyMistPrimePending = selected.key === HEAVY_MIST_PRESET;
      if (!duration) return setPreset(selected.key);
      state.transition = { name: selected.key, from: clonePreset(state.config), to: selected.values, duration, elapsed: 0 };
      if (options.effect === true && state.enabled && !state.suspended) {
        requestEffect(selected.key === "electrical-weather" ? "electrical-disturbance" : "light-flash", null, {
          intensity: clamp01(options.effectIntensity ?? 0.22),
          duration: Math.min(duration, 900)
        });
      }
      runtimeHandle?.wake?.("weather:transition");
      return snapshot();
    }

    function setWind(value = {}) {
      ensureAlive();
      invalidateDepthFrame();
      if (Number.isFinite(Number(value))) state.wind.x = clamp(Number(value), -1, 1);
      else {
        state.wind.x = clamp(value.x, -1, 1);
        state.wind.y = clamp(value.y, -1, 1);
        state.wind.z = clamp(value.z, -1, 1);
      }
      runtimeHandle?.wake?.("weather:wind");
      return Object.freeze({ ...state.wind });
    }

    function setQuality(value = "auto") {
      ensureAlive();
      invalidateDepthFrame();
      const key = String(value || "auto").toLowerCase();
      if (!["auto", "reduced", "low", "medium", "high"].includes(key)) throw new RangeError(`Unknown weather quality: ${value}`);
      const override = key === "auto" ? null : key;
      const changed = override !== state.qualityOverride;
      state.qualityOverride = override;
      if (state.initialised && changed) {
        const quality = applyQuality(null, true, true);
        collectScene(quality.profile, true);
        runtimeHandle?.wake?.("weather:quality");
      } else if (!state.initialised) state.resolvedQuality = effectiveQuality();
      return key;
    }

    function setSeed(value) {
      ensureAlive();
      invalidateDepthFrame();
      state.seed = hashSeed(value);
      random = seededRandom(state.seed);
      state.spawnSerial = 0;
      state.elapsedMs = 0;
      const bounds = { halfWidth: 4.2, halfHeight: 2.55, near: 2.5, far: 10.5 };
      particles.mist.forEach(bank => resetMistBank(bank, bounds, true));
      state.heavyMistPrimePending = state.targetPreset === HEAVY_MIST_PRESET;
      deactivateAll(false);
      runtimeHandle?.wake?.("weather:seed");
      return state.seed;
    }

    function applyProfile(profile = {}, meta = {}) {
      ensureAlive();
      const enabled = profile.enabled !== false;
      const legacyMist = Number(profile.mist);
      const preset = profile.preset
        || (!enabled ? "clear" : Number.isFinite(legacyMist) && legacyMist > 0 ? "mist" : state.targetPreset || "clear");
      const intensity = Number.isFinite(Number(profile.intensity)) ? Number(profile.intensity)
        : Number.isFinite(legacyMist) ? legacyMist : enabled ? state.targetIntensity : 0;
      if (profile.seed !== undefined || meta.seed !== undefined) setSeed(profile.seed ?? meta.seed);
      if (profile.quality !== undefined) setQuality(profile.quality);
      if (profile.wind !== undefined) setWind(typeof profile.wind === "number" ? { x: profile.wind, y: 0, z: 0 } : profile.wind);
      if (Number.isFinite(Number(profile.readingAttenuation))) state.readingAttenuation = clamp01(profile.readingAttenuation);
      if (Number.isFinite(Number(profile.controlAttenuation))) state.controlAttenuation = clamp01(profile.controlAttenuation);
      if (Number.isFinite(Number(profile.transitionAttenuation))) state.transitionAttenuation = clamp01(profile.transitionAttenuation);
      if (!enabled) { setEnabled(false); return snapshot(); }
      const duration = Number(profile.transition?.duration ?? profile.duration ?? 0);
      if (duration > 0) transitionTo(preset, { duration, effect: false }); else setPreset(preset);
      setIntensity(intensity);
      setEnabled(true);
      if (meta.requestEffect === true && duration > 0) {
        requestEffect(preset === "electrical-weather" ? "electrical-disturbance" : "light-flash", null, {
          intensity: clamp01(meta.effectIntensity ?? 0.22),
          duration: Math.min(duration, 900)
        });
      }
      if (meta.effect?.name) requestEffect(meta.effect.name, meta.effect.layer || null, meta.effect.options || {});
      return snapshot();
    }

    function suspend() {
      if (!state.initialised || state.destroyed || state.suspended) return false;
      state.suspended = true;
      invalidateDepthFrame("weather-suspended");
      clearAfterRenderSubscriptions("weather-suspended");
      runtimeHandle?.suspend?.();
      clearCanvases();
      setCanvasVisibility(false);
      return true;
    }

    function resume() {
      if (!state.initialised || state.destroyed || !state.suspended) return false;
      state.suspended = false;
      invalidateDepthFrame("weather-resumed");
      resumeGuard = true;
      if (state.enabled) {
        setCanvasVisibility(true);
        collectScene(QUALITY[state.resolvedQuality] || QUALITY.medium, true);
        clearCanvases();
        runtimeHandle?.resume?.("weather:resume");
      }
      return true;
    }

    function reset() {
      if (state.destroyed) return false;
      invalidateDepthFrame("weather-reset");
      clearAfterRenderSubscriptions("weather-reset");
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
      particles = { mist: [], dust: [], rain: [] };
      clearAfterRenderSubscriptions(reason);
      effects = null;
      state.initialised = false;
      state.destroyed = true;
      state.suspended = true;
      return true;
    }

    function particleFingerprint() {
      let hash = 2166136261;
      TYPES.forEach(type => particles[type].forEach(particle => {
        if (!particle.active) return;
        const token = `${type}:${particle.x?.toFixed?.(4) || "0"}:${particle.y?.toFixed?.(4) || "0"}:${particle.z?.toFixed?.(4) || "0"}:${particle.age.toFixed(4)}`;
        for (const character of token) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
      }));
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
        transition: state.transition ? Object.freeze({ name: state.transition.name, duration: state.transition.duration, elapsed: state.transition.elapsed }) : null,
        particles: Object.freeze({
          mist: activeCount("mist"),
          dust: activeCount("dust"),
          rain: activeCount("rain"),
          capacities: Object.freeze({ mist: particles.mist.length, dust: particles.dust.length, rain: particles.rain.length }),
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
        director: state.lastEnvelope ? Object.freeze({ mode: state.lastEnvelope.mode, allowed: state.lastEnvelope.allowed, intensity: state.lastEnvelope.intensity }) : null,
        diagnostics: Object.freeze({
          qualityChanges: state.qualityChanges,
          fpsUpdates: state.fpsUpdates,
          mistRenderer: "floor-mist-test-01-banks",
          floorVeil: false,
          generalHaze: false,
          frontEnergy: false,
          approvedMist: APPROVED_MIST,
          mistField: Object.freeze({
            recycled: state.mistRecycleCount,
            visibleBanks: state.mistVisibleBanks,
            minimumVisibleBanks: state.mistMinimumVisibleBanks
          }),
          effectiveDepthFlow: Object.freeze({
            configured: Number(state.config.depthFlow) || 0,
            wind: state.wind.z,
            mist: effectiveMistDepthFlow(),
            particles: effectiveParticleDepthFlow(),
            heavyMistPrimeCount: state.heavyMistPrimeCount
          }),
          depthFrame: Object.freeze({
            available: Boolean(getDepthFrame()),
            token: currentDepthFrame?.token || null,
            runtimeToken: currentDepthFrame?.runtimeToken ?? null,
            puffCount: currentDepthFrame?.puffCount || 0,
            convention: DEPTH_CONVENTION,
            afterRenderSubscribers: afterRenderSubscriptions.size,
            afterRenderGeneration
          })
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
      getDepthFrame,
      subscribeAfterRender,
      afterRenderContract: Object.freeze({
        timing: "synchronous-after-completed-weather-canvas-render",
        invalidation: "synchronous-immediately-after-current-depth-frame-inert",
        payload: "immutable-current-depth-frame",
        staleHandles: "invalid-after-disable-suspend-reset-destroy",
        subscriberLifecycle: "cleared-on-disable-suspend-reset-destroy"
      }),
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
