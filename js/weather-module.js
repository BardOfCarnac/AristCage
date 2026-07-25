/*==================================================
  NCN CHAMBER WEATHER MODULE

  Factory only. The caller supplies the shared runtime, environmental layers,
  camera access and optional effects/block-event adapters.
==================================================*/
(() => {
  'use strict';

  const LAYER_NAMES = Object.freeze(['far', 'rear', 'middle', 'near']);
  const TYPE_NAMES = Object.freeze(['mist', 'dust', 'rain']);
  const DEFAULT_CAPS = Object.freeze({ mist: 72, dust: 90, rain: 180 });
  const QUALITY = Object.freeze({
    low: Object.freeze({ dpr: 1, maxFps: 12, spawnScale: 0.58, motionScale: 0.82, caps: { mist: 26, dust: 36, rain: 64 } }),
    medium: Object.freeze({ dpr: 1.2, maxFps: 20, spawnScale: 0.82, motionScale: 1, caps: { mist: 46, dust: 58, rain: 112 } }),
    high: Object.freeze({ dpr: 1.5, maxFps: 30, spawnScale: 1, motionScale: 1, caps: DEFAULT_CAPS }),
    reduced: Object.freeze({ dpr: 1, maxFps: 8, spawnScale: 0.16, motionScale: 0.14, caps: { mist: 14, dust: 12, rain: 0 } })
  });

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const clamp01 = value => clamp(Number(value) || 0, 0, 1);
  const mix = (a, b, amount) => a + (b - a) * amount;
  const smoothstep = amount => {
    const value = clamp01(amount);
    return value * value * (3 - 2 * value);
  };

  function hash(value) {
    let result = 2166136261;
    for (const character of String(value)) {
      result ^= character.charCodeAt(0);
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  }

  function mulberry32(seed) {
    let state = seed >>> 0;
    return () => {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function cloneConfig(config) {
    return {
      name: config.name,
      atmosphere: { ...config.atmosphere },
      particles: Object.fromEntries(TYPE_NAMES.map(type => [type, { ...config.particles[type] }])),
      layerWeights: { ...config.layerWeights },
      wind: { ...config.wind },
      electricalPotential: Number(config.electricalPotential) || 0
    };
  }

  function blendConfig(from, to, amount) {
    const blendObject = (a, b) => Object.fromEntries(
      Object.keys(b).map(key => [key, mix(Number(a[key]) || 0, Number(b[key]) || 0, amount)])
    );
    return {
      name: amount >= 1 ? to.name : `${from.name}->${to.name}`,
      atmosphere: blendObject(from.atmosphere, to.atmosphere),
      particles: Object.fromEntries(TYPE_NAMES.map(type => [type, blendObject(from.particles[type], to.particles[type])])),
      layerWeights: blendObject(from.layerWeights, to.layerWeights),
      wind: blendObject(from.wind, to.wind),
      electricalPotential: mix(from.electricalPotential, to.electricalPotential, amount)
    };
  }

  function createWeather(context = {}) {
    const presets = context.presets || window.NCNWeatherPresets;
    const runtime = context.runtime;
    if (!presets || !presets.clear) throw new Error('Weather presets are required.');
    if (!runtime?.register) throw new Error('A shared runtime with register() is required.');

    const suppliedLayers = context.layers || {};
    for (const name of LAYER_NAMES) {
      if (!suppliedLayers[name]) throw new Error(`Weather layer reference missing: ${name}`);
    }

    const id = String(context.id || `weather-${Math.random().toString(36).slice(2)}`);
    const taskName = String(context.taskName || `weather:${id}`);
    const cameraSource = context.camera;
    const effects = context.effects || null;
    const allowAmbient = typeof context.allowAmbient === 'function' ? context.allowAmbient : () => true;
    const resizeTarget = context.resizeTarget || window;
    const blockEvents = context.blockEvents || null;
    const requestedQuality = context.quality;

    let initialised = false;
    let destroyed = false;
    let enabled = context.enabled !== false;
    let suspended = false;
    let qualityName = QUALITY[requestedQuality] ? requestedQuality : 'medium';
    let quality = QUALITY[qualityName];
    let explicitQuality = QUALITY[requestedQuality] ? requestedQuality : null;
    let seed = Number.isFinite(context.seed) ? Number(context.seed) : 2045;
    let random = mulberry32(hash(`${id}:${seed}`));
    let intensity = clamp01(context.intensity ?? 0.35);
    let windOverride = null;
    let currentConfig = cloneConfig(presets.clear);
    let currentPreset = 'clear';
    let transition = null;
    let readingZone = null;
    let controlZones = [];
    let runtimeHandle = null;
    let runtimeUnsubscribe = null;
    let electricalPulse = 0;
    let transitionAttenuation = 1;
    let spawnSerial = 0;
    let lastFrameAt = 0;

    const layerRecords = new Map();
    const pools = { mist: [], dust: [], rain: [] };
    const spawnCredit = { mist: 0, dust: 0, rain: 0 };
    const disturbances = [];
    const cleanup = [];
    const spriteCache = new Map();

    function resolveCamera() {
      const snapshot = typeof cameraSource === 'function'
        ? cameraSource()
        : cameraSource?.snapshot?.() || cameraSource;
      if (snapshot?.project) return snapshot;
      const width = window.innerWidth || 1;
      const height = window.innerHeight || 1;
      const near = 2.5;
      const focalLength = Math.min(width, height) * 0.84;
      return {
        width,
        height,
        near,
        halfWidth: width * 0.5 * near / focalLength,
        finalHalfWidth: width * 0.5 * near / focalLength + 1,
        halfHeight: height * 0.5 * near / focalLength,
        focalLength,
        project(x, y, z) {
          const depth = Math.max(0.001, z);
          return { x: width * 0.5 + x * focalLength / depth, y: height * 0.5 - y * focalLength / depth, scale: near / depth };
        }
      };
    }

    function createCanvasForLayer(name, layer) {
      const canvas = layer instanceof HTMLCanvasElement ? layer : document.createElement('canvas');
      const owned = canvas !== layer;
      canvas.classList.add('ncn-weather-canvas', `ncn-weather-canvas-${name}`);
      canvas.dataset.weatherLayer = name;
      canvas.setAttribute('aria-hidden', 'true');
      if (owned) layer.append(canvas);
      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) throw new Error(`Unable to create 2D context for weather layer: ${name}`);
      return { name, layer, canvas, context: ctx, owned, width: 0, height: 0, dpr: 1 };
    }

    function resizeRecord(record) {
      const rect = record.layer.getBoundingClientRect?.();
      const width = Math.max(1, Math.round(rect?.width || window.innerWidth || 1));
      const height = Math.max(1, Math.round(rect?.height || window.innerHeight || 1));
      const dpr = Math.min(window.devicePixelRatio || 1, quality.dpr);
      if (record.width === width && record.height === height && record.dpr === dpr) return;
      record.width = width;
      record.height = height;
      record.dpr = dpr;
      record.canvas.width = Math.round(width * dpr);
      record.canvas.height = Math.round(height * dpr);
      record.canvas.style.width = `${width}px`;
      record.canvas.style.height = `${height}px`;
      record.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function resize() {
      if (!initialised || destroyed) return;
      layerRecords.forEach(resizeRecord);
      runtimeHandle?.wake?.('weather-resize');
    }

    function particleTemplate(type) {
      return {
        active: false,
        type,
        layer: 'middle',
        x: 0,
        y: 0,
        z: 5,
        vx: 0,
        vy: 0,
        vz: 0,
        size: 1,
        alpha: 1,
        age: 0,
        life: 1000,
        phase: 0,
        serial: 0
      };
    }

    function rebuildPools() {
      for (const type of TYPE_NAMES) {
        const desired = Math.max(0, Math.min(
          Number(context.particleCaps?.[type] ?? DEFAULT_CAPS[type]) || 0,
          Number(quality.caps[type]) || 0
        ));
        const pool = pools[type];
        if (pool.length > desired) pool.length = desired;
        while (pool.length < desired) pool.push(particleTemplate(type));
        pool.forEach(particle => { if (!enabled) particle.active = false; });
      }
    }

    function chooseLayer(weights) {
      let cursor = random() * LAYER_NAMES.reduce((sum, name) => sum + Math.max(0, weights[name] || 0), 0);
      for (const name of LAYER_NAMES) {
        cursor -= Math.max(0, weights[name] || 0);
        if (cursor <= 0) return name;
      }
      return 'middle';
    }

    function depthRange(layer) {
      if (layer === 'far') return [8.2, 11.4];
      if (layer === 'rear') return [6.2, 8.6];
      if (layer === 'middle') return [4.25, 6.6];
      return [2.75, 4.5];
    }

    function spawn(type, particleConfig, config) {
      const particle = pools[type].find(item => !item.active);
      if (!particle) return false;
      const cam = resolveCamera();
      const layer = chooseLayer(config.layerWeights);
      const [zMin, zMax] = depthRange(layer);
      const floorWeather = config.atmosphere.moisture > 0.18 || type === 'mist';
      particle.active = true;
      particle.type = type;
      particle.layer = layer;
      particle.z = mix(zMin, zMax, random());
      particle.x = mix(-cam.finalHalfWidth * 1.18, cam.finalHalfWidth * 1.18, random());
      particle.y = type === 'rain'
        ? mix(cam.halfHeight * 0.35, cam.halfHeight * 1.18, random())
        : floorWeather
          ? mix(-cam.halfHeight * 1.02, -cam.halfHeight * 0.25, random())
          : mix(-cam.halfHeight, cam.halfHeight, random());
      const speed = particleConfig.speed * mix(0.72, 1.25, random());
      particle.vx = mix(-0.035, 0.035, random());
      particle.vy = type === 'rain' ? -speed : mix(-0.018, 0.034, random()) * speed;
      particle.vz = type === 'rain' ? mix(-0.035, 0.01, random()) : mix(-0.022, 0.022, random());
      particle.size = particleConfig.size * mix(0.66, 1.45, random());
      particle.alpha = particleConfig.alpha * mix(0.55, 1, random());
      particle.age = 0;
      particle.life = Math.max(160, particleConfig.life * mix(0.72, 1.28, random()));
      particle.phase = random() * Math.PI * 2;
      particle.serial = ++spawnSerial;
      return true;
    }

    function activeCount(type) {
      return pools[type].reduce((sum, particle) => sum + (particle.active ? 1 : 0), 0);
    }

    function readingRect(zone) {
      if (!zone) return null;
      if (zone.rect) return { ...zone.rect };
      const element = zone.element;
      if (!element?.isConnected) return null;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      return rect;
    }

    function zoneList() {
      const zones = [];
      const reading = readingRect(readingZone);
      if (reading) zones.push({ rect: reading, attenuation: readingZone.attenuation, padding: readingZone.padding, radius: readingZone.radius });
      for (const zone of controlZones) {
        const rect = readingRect(zone);
        if (rect) zones.push({ rect, attenuation: zone.attenuation, padding: zone.padding, radius: zone.radius });
      }
      return zones;
    }

    function roundedRect(ctx, x, y, width, height, radius) {
      const r = Math.min(radius, width * 0.5, height * 0.5);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + width, y, x + width, y + height, r);
      ctx.arcTo(x + width, y + height, x, y + height, r);
      ctx.arcTo(x, y + height, x, y, r);
      ctx.arcTo(x, y, x + width, y, r);
      ctx.closePath();
    }

    function applyZones(record, zones) {
      if (!zones.length) return;
      const ctx = record.context;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      const layerRect = record.layer.getBoundingClientRect?.() || { left: 0, top: 0 };
      for (const zone of zones) {
        const padding = Number(zone.padding) || 18;
        const x = zone.rect.left - layerRect.left - padding;
        const y = zone.rect.top - layerRect.top - padding;
        const width = zone.rect.width + padding * 2;
        const height = zone.rect.height + padding * 2;
        const gradient = ctx.createRadialGradient(
          x + width * 0.5,
          y + height * 0.5,
          Math.min(width, height) * 0.18,
          x + width * 0.5,
          y + height * 0.5,
          Math.max(width, height) * 0.66
        );
        const attenuation = clamp01(zone.attenuation ?? 0.8);
        gradient.addColorStop(0, `rgba(0,0,0,${attenuation})`);
        gradient.addColorStop(0.72, `rgba(0,0,0,${attenuation * 0.72})`);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        roundedRect(ctx, x, y, width, height, Number(zone.radius) || 28);
        ctx.fill();
      }
      ctx.restore();
    }

    function makeMistSprite(size = 192) {
      const key = `mist:${size}`;
      if (spriteCache.has(key)) return spriteCache.get(key);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = Math.round(size * 0.54);
      const ctx = canvas.getContext('2d');
      const gradient = ctx.createRadialGradient(size * 0.5, canvas.height * 0.55, 2, size * 0.5, canvas.height * 0.55, size * 0.5);
      gradient.addColorStop(0, 'rgba(255,102,70,.58)');
      gradient.addColorStop(0.34, 'rgba(220,30,36,.34)');
      gradient.addColorStop(0.72, 'rgba(104,3,12,.12)');
      gradient.addColorStop(1, 'rgba(20,0,4,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      spriteCache.set(key, canvas);
      return canvas;
    }

    function drawAtmosphereBase(record, config, effectiveIntensity) {
      const density = config.atmosphere.density * effectiveIntensity;
      const haze = config.atmosphere.haze * effectiveIntensity;
      const clouding = config.atmosphere.clouding * effectiveIntensity;
      if (density < 0.004 && haze < 0.004 && clouding < 0.004) return;
      const ctx = record.context;
      const layerMultiplier = { far: 0.70, rear: 0.88, middle: 0.72, near: 0.46 }[record.name];
      const gradient = ctx.createLinearGradient(0, 0, 0, record.height);
      gradient.addColorStop(0, `rgba(76,2,12,${clouding * layerMultiplier * 0.09})`);
      gradient.addColorStop(0.52, `rgba(146,9,20,${haze * layerMultiplier * 0.07})`);
      gradient.addColorStop(1, `rgba(255,60,40,${density * layerMultiplier * 0.09})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, record.width, record.height);
    }

    function drawParticle(record, particle, config, effectiveIntensity, nowSeconds) {
      if (particle.layer !== record.name) return;
      const cam = resolveCamera();
      const point = cam.project(particle.x, particle.y, particle.z);
      const lifeProgress = clamp01(particle.age / particle.life);
      const fade = Math.sin(Math.PI * clamp01(lifeProgress));
      const alpha = particle.alpha * fade * effectiveIntensity;
      if (alpha < 0.004) return;
      const ctx = record.context;

      if (particle.type === 'mist') {
        const sprite = makeMistSprite();
        const width = Math.max(18, particle.size * cam.focalLength / particle.z * 1.65);
        const height = width * (0.24 + config.atmosphere.moisture * 0.18);
        ctx.globalAlpha = alpha * (1 + electricalPulse * 0.22);
        ctx.drawImage(sprite, point.x - width * 0.5, point.y - height * 0.5, width, height);
        ctx.globalAlpha = 1;
        return;
      }

      if (particle.type === 'rain') {
        const length = Math.max(3, particle.size * 13 * point.scale);
        const slant = (config.wind.x + (windOverride?.x || 0)) * length * 1.7;
        ctx.strokeStyle = `rgba(255,128,92,${alpha * 0.64})`;
        ctx.lineWidth = Math.max(0.45, particle.size * point.scale * 0.85);
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(point.x - slant, point.y + length);
        ctx.stroke();
        return;
      }

      const twinkle = 0.55 + Math.sin(nowSeconds * 1.7 + particle.phase) * 0.28;
      ctx.fillStyle = `rgba(255,112,72,${alpha * twinkle})`;
      const size = Math.max(0.55, particle.size * point.scale * 1.8);
      ctx.fillRect(point.x, point.y, size, size);
    }

    function clearCanvases() {
      layerRecords.forEach(record => record.context.clearRect(0, 0, record.width, record.height));
    }

    function requestEffect(name, targetLayer, options = {}) {
      const target = suppliedLayers[targetLayer] || suppliedLayers.middle;
      if (typeof context.requestEffect === 'function') return context.requestEffect(name, target, options);
      if (typeof effects?.play === 'function') return effects.play(name, target, options);
      return true;
    }

    function applyDisturbances(particle, dt) {
      if (!disturbances.length) return;
      for (const disturbance of disturbances) {
        const dx = particle.x - disturbance.x;
        const dy = particle.y - disturbance.y;
        const dz = particle.z - disturbance.z;
        const distance = Math.hypot(dx, dy, dz);
        if (distance >= disturbance.radius || distance < 0.001) continue;
        const force = (1 - distance / disturbance.radius) * disturbance.strength * dt;
        particle.vx += dx / distance * force;
        particle.vy += dy / distance * force * 0.45;
        particle.vz += dz / distance * force * 0.35;
      }
    }

    function updateParticles(deltaSeconds, config) {
      const cam = resolveCamera();
      const activeWind = {
        x: windOverride?.x ?? config.wind.x,
        y: windOverride?.y ?? config.wind.y,
        z: windOverride?.z ?? config.wind.z
      };
      const motionScale = quality.motionScale;

      for (const type of TYPE_NAMES) {
        for (const particle of pools[type]) {
          if (!particle.active) continue;
          particle.age += deltaSeconds * 1000;
          if (particle.age >= particle.life) {
            particle.active = false;
            continue;
          }
          applyDisturbances(particle, deltaSeconds);
          const turbulence = config.atmosphere.density * 0.018;
          particle.vx += Math.sin(particle.phase + particle.age * 0.0007) * turbulence * deltaSeconds;
          particle.x += (particle.vx + activeWind.x * 0.16) * deltaSeconds * motionScale;
          particle.y += (particle.vy + activeWind.y * 0.10) * deltaSeconds * motionScale;
          particle.z += (particle.vz + activeWind.z * 0.12) * deltaSeconds * motionScale;

          if (particle.x > cam.finalHalfWidth * 1.35) particle.x = -cam.finalHalfWidth * 1.35;
          if (particle.x < -cam.finalHalfWidth * 1.35) particle.x = cam.finalHalfWidth * 1.35;
          if (particle.z < 2.65) particle.z = 10.8;
          if (particle.z > 11.6) particle.z = 2.85;
          if (particle.type === 'rain' && particle.y < -cam.halfHeight * 1.18) particle.active = false;
        }
      }

      for (let index = disturbances.length - 1; index >= 0; index -= 1) {
        disturbances[index].age += deltaSeconds;
        disturbances[index].strength *= Math.exp(-deltaSeconds * 2.8);
        if (disturbances[index].age > disturbances[index].life || disturbances[index].strength < 0.005) disturbances.splice(index, 1);
      }

      electricalPulse *= Math.exp(-deltaSeconds * 3.2);
      transitionAttenuation += (1 - transitionAttenuation) * Math.min(1, deltaSeconds * 3.5);
    }

    function spawnParticles(deltaSeconds, config, effectiveIntensity, ambientAllowed) {
      if (!ambientAllowed || suspended || qualityName === 'reduced' && currentPreset.includes('rain')) return;
      for (const type of TYPE_NAMES) {
        const settings = config.particles[type];
        const rate = settings.spawn * effectiveIntensity * quality.spawnScale;
        spawnCredit[type] += rate * deltaSeconds;
        let allowance = Math.min(8, Math.floor(spawnCredit[type]));
        spawnCredit[type] -= allowance;
        while (allowance-- > 0) {
          if (!spawn(type, settings, config)) break;
        }
      }
    }

    function currentBlendedConfig(now) {
      if (!transition) return currentConfig;
      const amount = transition.duration <= 0 ? 1 : clamp01((now - transition.startedAt) / transition.duration);
      const eased = smoothstep(amount);
      currentConfig = blendConfig(transition.from, transition.to, eased);
      if (amount >= 1) {
        currentConfig = cloneConfig(transition.to);
        currentPreset = transition.name;
        transition = null;
      }
      return currentConfig;
    }

    function render(now, config, effectiveIntensity) {
      const zones = zoneList();
      const nowSeconds = now / 1000;
      for (const record of layerRecords.values()) {
        const ctx = record.context;
        ctx.clearRect(0, 0, record.width, record.height);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        drawAtmosphereBase(record, config, effectiveIntensity);
        for (const type of TYPE_NAMES) {
          for (const particle of pools[type]) {
            if (particle.active) drawParticle(record, particle, config, effectiveIntensity, nowSeconds);
          }
        }
        ctx.restore();
        applyZones(record, zones);
      }
    }

    function update(frame) {
      if (!enabled || suspended || destroyed) return false;
      layerRecords.forEach(resizeRecord);
      const now = frame.now;
      const deltaSeconds = Math.min(0.05, Math.max(0, frame.delta / 1000));
      const config = currentBlendedConfig(now);
      const ambientAllowed = Boolean(allowAmbient(frame));
      const readingFactor = readingRect(readingZone)
        ? 1 - clamp01(readingZone.attenuation ?? 0.8) * 0.28
        : 1;
      const effectiveIntensity = intensity * readingFactor * transitionAttenuation;

      updateParticles(deltaSeconds, config);
      spawnParticles(deltaSeconds, config, effectiveIntensity, ambientAllowed);
      render(now, config, effectiveIntensity);
      lastFrameAt = now;

      const active = TYPE_NAMES.some(type => activeCount(type) > 0);
      const atmospheric = config.atmosphere.density * effectiveIntensity > 0.004;
      return enabled && !suspended && (active || atmospheric || Boolean(transition) || electricalPulse > 0.01);
    }

    function wake(reason = 'weather-change') {
      runtimeHandle?.wake?.(reason);
    }

    function normaliseZone(input, fallbackAttenuation = 0.8) {
      if (!input) return null;
      if (!(input.element || input.rect)) throw new TypeError('A reading/control zone requires element or rect.');
      return {
        element: input.element || null,
        rect: input.rect ? { ...input.rect } : null,
        attenuation: clamp01(input.attenuation ?? fallbackAttenuation),
        padding: Math.max(0, Number(input.padding) || 18),
        radius: Math.max(0, Number(input.radius) || 28)
      };
    }

    function setPreset(name) {
      const preset = presets[name];
      if (!preset) throw new RangeError(`Unknown weather preset: ${name}`);
      currentPreset = name;
      currentConfig = cloneConfig(preset);
      transition = null;
      wake(`weather-preset:${name}`);
      return api;
    }

    function transitionTo(name, options = {}) {
      const preset = presets[name];
      if (!preset) throw new RangeError(`Unknown weather preset: ${name}`);
      const now = performance.now();
      currentBlendedConfig(now);
      transition = {
        name,
        from: cloneConfig(currentConfig),
        to: cloneConfig(preset),
        startedAt: now,
        duration: Math.max(0, Number(options.duration) || 0)
      };
      if (transition.duration === 0) setPreset(name);
      else wake(`weather-transition:${name}`);
      return api;
    }

    function setIntensity(value) {
      intensity = clamp01(value);
      wake('weather-intensity');
      return api;
    }

    function setReadingZone(zone) {
      readingZone = normaliseZone(zone, 0.8);
      wake('weather-reading-zone');
      return api;
    }

    function setControlZones(zones = []) {
      controlZones = Array.from(zones, zone => normaliseZone(zone, 0.68)).filter(Boolean);
      wake('weather-control-zones');
      return api;
    }

    function setWind(next = {}) {
      windOverride = {
        x: clamp(Number(next.x) || 0, -2, 2),
        y: clamp(Number(next.y) || 0, -2, 2),
        z: clamp(Number(next.z) || 0, -2, 2)
      };
      wake('weather-wind');
      return api;
    }

    function clearWindOverride() {
      windOverride = null;
      wake('weather-wind-preset');
      return api;
    }

    function setQuality(name) {
      if (!QUALITY[name]) throw new RangeError(`Unknown weather quality: ${name}`);
      explicitQuality = name;
      qualityName = name;
      quality = QUALITY[name];
      rebuildPools();
      layerRecords.forEach(record => { record.dpr = 0; });
      runtimeHandle?.setMaxFps?.(quality.maxFps);
      resize();
      wake(`weather-quality:${name}`);
      return api;
    }

    function setSeed(nextSeed) {
      seed = Number.isFinite(Number(nextSeed)) ? Number(nextSeed) : 2045;
      random = mulberry32(hash(`${id}:${seed}`));
      deactivateAllParticles();
      spawnSerial = 0;
      wake('weather-seed');
      return api;
    }

    function setEnabled(next) {
      enabled = Boolean(next);
      if (!enabled) {
        deactivateAllParticles();
        clearCanvases();
        runtimeHandle?.disable?.();
      } else if (initialised && !suspended) {
        runtimeHandle?.enable?.('weather-enabled');
      }
      return api;
    }

    function deactivateAllParticles() {
      TYPE_NAMES.forEach(type => pools[type].forEach(particle => { particle.active = false; }));
      TYPE_NAMES.forEach(type => { spawnCredit[type] = 0; });
      disturbances.length = 0;
      electricalPulse = 0;
    }

    function suspend() {
      if (suspended) return api;
      suspended = true;
      runtimeHandle?.disable?.();
      return api;
    }

    function resume() {
      if (!suspended || destroyed) return api;
      suspended = false;
      lastFrameAt = performance.now();
      if (enabled) runtimeHandle?.enable?.('weather-resume');
      return api;
    }

    function clearImmediate() {
      deactivateAllParticles();
      transition = null;
      currentPreset = 'clear';
      currentConfig = cloneConfig(presets.clear);
      clearCanvases();
      return api;
    }

    function reset() {
      clearImmediate();
      readingZone = null;
      controlZones = [];
      windOverride = null;
      intensity = clamp01(context.intensity ?? 0.35);
      random = mulberry32(hash(`${id}:${seed}`));
      wake('weather-reset');
      return api;
    }

    function attenuateForTransition(amount = 0.25) {
      transitionAttenuation = clamp01(amount);
      wake('weather-transition-attenuation');
      return api;
    }

    function addDisturbance(detail = {}) {
      disturbances.push({
        x: Number(detail.x) || 0,
        y: Number(detail.y) || 0,
        z: Number(detail.z) || 4.5,
        radius: Math.max(0.2, Number(detail.radius) || 1.4),
        strength: clamp(Number(detail.strength) || 0.32, 0, 2),
        age: 0,
        life: Math.max(0.1, Number(detail.life) || 1.1)
      });
      wake('weather-disturbance');
      return api;
    }

    function requestElectricalPulse(level = 0.25) {
      const amount = clamp01(level);
      if (currentConfig.electricalPotential < 0.15 || amount <= 0) return false;
      const allowed = requestEffect('electrical-flash', 'middle', { intensity: amount, source: id });
      if (allowed === false) return false;
      requestEffect('mist-illumination', 'rear', { intensity: amount * 0.75, duration: 800, source: id });
      electricalPulse = Math.max(electricalPulse, amount);
      wake('weather-electrical-pulse');
      return true;
    }

    function handleBlockStart(event) {
      const detail = event.detail || {};
      addDisturbance({ ...detail, strength: detail.strength ?? 0.38, life: detail.life ?? 1.2 });
    }

    function handleBlockSettle(event) {
      const detail = event.detail || {};
      addDisturbance({ ...detail, strength: detail.strength ?? 0.52, life: detail.life ?? 0.75 });
      requestEffect('mist-illumination', 'middle', { intensity: 0.12, duration: 360, source: id });
    }

    function bindEvent(target, type, listener, options) {
      if (!target?.addEventListener) return;
      target.addEventListener(type, listener, options);
      cleanup.push(() => target.removeEventListener(type, listener, options));
    }

    async function init() {
      if (initialised) return api;
      if (destroyed) throw new Error('Destroyed weather modules cannot be reinitialised.');
      for (const name of LAYER_NAMES) {
        const record = createCanvasForLayer(name, suppliedLayers[name]);
        layerRecords.set(name, record);
        resizeRecord(record);
      }
      rebuildPools();
      runtimeHandle = runtime.register(taskName, update, {
        priority: Number(context.priority) || 20,
        maxFps: quality.maxFps,
        enabled: enabled && !suspended,
        wake: false
      });
      bindEvent(resizeTarget, 'resize', resize, { passive: true });
      bindEvent(blockEvents, 'ncn:block-motion-start', handleBlockStart);
      bindEvent(blockEvents, 'ncn:block-motion-pulse', handleBlockStart);
      bindEvent(blockEvents, 'ncn:block-motion-settle', handleBlockSettle);
      if (runtime.subscribe) {
        runtimeUnsubscribe = runtime.subscribe(event => {
          if (explicitQuality) return;
          if (event.type === 'quality-change') setQuality(event.runtime.quality === 'reduced' ? 'reduced' : 'medium');
        });
      }
      initialised = true;
      if (enabled && !suspended) runtimeHandle.enable('weather-init');
      return api;
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      suspended = true;
      runtimeHandle?.unregister?.();
      runtimeHandle = null;
      runtimeUnsubscribe?.();
      runtimeUnsubscribe = null;
      cleanup.splice(0).forEach(dispose => dispose());
      deactivateAllParticles();
      clearCanvases();
      for (const record of layerRecords.values()) {
        if (record.owned) record.canvas.remove();
        else record.canvas.classList.remove('ncn-weather-canvas', `ncn-weather-canvas-${record.name}`);
      }
      layerRecords.clear();
      spriteCache.clear();
      readingZone = null;
      controlZones = [];
    }

    function snapshot() {
      return Object.freeze({
        id,
        initialised,
        destroyed,
        enabled,
        suspended,
        preset: currentPreset,
        transitioningTo: transition?.name || null,
        intensity,
        quality: qualityName,
        seed,
        lastFrameAt,
        readingZoneActive: Boolean(readingRect(readingZone)),
        particleCounts: Object.freeze(Object.fromEntries(TYPE_NAMES.map(type => [type, activeCount(type)]))),
        particleCaps: Object.freeze(Object.fromEntries(TYPE_NAMES.map(type => [type, pools[type].length]))),
        resources: Object.freeze({ canvases: layerRecords.size, listeners: cleanup.length })
      });
    }

    const api = Object.freeze({
      init,
      setPreset,
      setIntensity,
      transitionTo,
      setReadingZone,
      setControlZones,
      setWind,
      clearWindOverride,
      setQuality,
      setSeed,
      setEnabled,
      suspend,
      resume,
      reset,
      clearImmediate,
      attenuateForTransition,
      addDisturbance,
      requestElectricalPulse,
      snapshot,
      destroy
    });

    return api;
  }

  window.createWeather = createWeather;
  window.NCNWeatherModule = Object.freeze({ createWeather, QUALITY, layerNames: LAYER_NAMES });
})();
