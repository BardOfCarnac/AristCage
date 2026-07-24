/* Optional Terminal FX lab mode. Loaded only when ?terminalfx=1 is present. */
(() => {
  'use strict';

  const VERSION = 2;
  const DEFAULT_TERMINAL = 'NCN-2045-001';
  const STORAGE_KEY = 'ncn-terminal-environment-number';
  const GRACE_MS = 8000;
  const RESET_GRACE_MS = 30000;
  const STEP = 0.125;
  const DEPTH_BUCKETS = 6;
  const MAX_NATURAL_INCIDENTS = 3;
  const CARD_NEAR = 3.125;
  const CARD_DEPTH_STEP = 0.72;
  const DEBUG = document.currentScript?.dataset.debug === 'true';

  const PHASE = Object.freeze({
    DORMANT: 'dormant',
    ESCALATION: 'escalation',
    PEAK: 'peak',
    RECOVERY: 'recovery',
    LATCHED: 'latched'
  });

  const EVENT = Object.freeze({
    ENV: 'environment',
    ARC: 'arc',
    SURGE: 'surge',
    BLOOM: 'bloom',
    SIGNAL: 'signal',
    GEOMETRY: 'geometry',
    BROWNOUT: 'brownout',
    COLLAPSE: 'collapse'
  });

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const clamp01 = value => clamp(value, 0, 1);
  const mix = (a, b, amount) => a + (b - a) * amount;
  const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;

  function storageGet(key) {
    try { return localStorage.getItem(key); }
    catch { return null; }
  }

  function storageSet(key, value) {
    try { localStorage.setItem(key, value); }
    catch { /* Optional lab state. */ }
  }

  function hash(value) {
    let result = 2166136261;
    for (const character of String(value)) {
      result ^= character.charCodeAt(0);
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  }

  function rng(seed) {
    let state = seed >>> 0;
    return () => {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  const terminalValue = (number, property) => (
    rng(hash(`ncn-terminal-v${VERSION}:${number}:${property}`))()
  );

  function sessionRng(number) {
    let entropy = Date.now() ^ Math.floor(performance.now() * 1000);
    try {
      const values = new Uint32Array(1);
      crypto.getRandomValues(values);
      entropy ^= values[0];
    } catch {
      /* Time entropy is adequate for non-security visual variation. */
    }
    return rng(hash(`${number}:session:${entropy}`));
  }

  function makeProfile(number) {
    const moisture = terminalValue(number, 'moisture');
    const agitation = terminalValue(number, 'agitation');
    const electrical = terminalValue(number, 'electrical');
    const age = terminalValue(number, 'age');
    const calibration = terminalValue(number, 'calibration');
    const opticalWear = terminalValue(number, 'optical-wear');
    const signalWear = terminalValue(number, 'signal-wear');
    const density = clamp(0.15 + moisture * 0.66 + age * 0.08, 0.12, 0.94);
    const charge = clamp(electrical * (0.40 + moisture * 0.60), 0.02, 0.98);

    return Object.freeze({
      version: VERSION,
      number,
      weatherType: terminalValue(number, 'weather-type') < 0.72 ? 'floorMist' : 'ceilingSmoke',
      density,
      height: clamp(0.12 + moisture * 0.45 + agitation * 0.14, 0.10, 0.78),
      opacity: clamp(0.30 + moisture * 0.46 + opticalWear * 0.10, 0.28, 0.88),
      drift: mix(-0.26, 0.26, terminalValue(number, 'drift')),
      depthFlow: mix(-0.10, 0.10, terminalValue(number, 'depth-flow')),
      turbulence: clamp(0.08 + agitation * 0.54, 0.06, 0.68),
      energy: clamp(0.34 + electrical * 0.31 + calibration * 0.10, 0.32, 0.78),
      charge,
      incidentMin: mix(180, 75, charge),
      incidentMax: mix(420, 180, charge),
      susceptibility: Object.freeze({
        electrical: clamp(age * 0.35 + electrical * 0.65, 0, 1),
        optical: clamp(opticalWear * 0.60 + age * 0.20 + (1 - calibration) * 0.20, 0, 1),
        signal: clamp(signalWear * 0.62 + age * 0.24 + electrical * 0.14, 0, 1),
        geometry: clamp(age * 0.52 + (1 - calibration) * 0.48, 0, 1),
        environmental: clamp(moisture * 0.70 + agitation * 0.30, 0, 1)
      })
    });
  }

  function qualityProfile() {
    const cores = navigator.hardwareConcurrency || 4;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
    if (cores <= 4) return { name: 'LOW', dpr: 1, banks: 12, ambientFps: reducedMotion ? 8 : 12, faultFps: 20 };
    if (cores <= 8) return { name: 'STANDARD', dpr: 1.15, banks: 18, ambientFps: reducedMotion ? 10 : 16, faultFps: 24 };
    return { name: 'HIGH', dpr: 1.35, banks: 24, ambientFps: reducedMotion ? 12 : 20, faultFps: 30 };
  }

  function freshRuntime() {
    return {
      phase: PHASE.DORMANT,
      phaseAge: 0,
      severity: 0,
      usability: 1,
      latched: false,
      resetRequired: false,
      latchType: '',
      nextIncidentAt: Infinity,
      queue: [],
      budget: 0,
      accumulator: 0,
      stress: { power: 0, optics: 0, signal: 0, geometry: 0 },
      channels: { electrical: 0, optical: 0, signal: 0, geometry: 0, environmental: 0 },
      symptoms: {
        arc: 0,
        mistFlash: 0,
        surge: 0,
        bloom: 0,
        ghost: 0,
        slip: 0,
        brownout: 0,
        collapse: 0,
        sparks: 0,
        occlusion: 0
      }
    };
  }

  const quality = qualityProfile();
  let enabled = false;
  let terminalNumber = storageGet(STORAGE_KEY) || DEFAULT_TERMINAL;
  let profile = makeProfile(terminalNumber);
  let random = sessionRng(terminalNumber);
  let runtime = freshRuntime();
  let naturalIncidents = 0;
  let hardFailureUsed = false;

  let previousChamberMode = null;
  let previousRangeActive = false;
  let previousOpticsActive = false;
  const disabledControls = new Map();

  let root = null;
  let canvas = null;
  let context = null;
  let panel = null;
  let toggleButton = null;
  let sprites = [];
  let banks = [];
  let cards = [];
  let cardsDirty = true;
  let feedObserver = null;
  let resizeObserver = null;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let raf = 0;
  let lastFrame = 0;
  let lastStep = 0;
  let hidden = document.hidden;
  let activityMode = 'disabled';
  let eligibleAt = 0;
  let gateCheckedAt = 0;
  let uiBusyUntil = 0;

  function camera() {
    if (window.NCNChamberCamera?.snapshot) return window.NCNChamberCamera.snapshot();
    const focalLength = Math.min(width, height) * 0.84;
    const near = 2.5;
    const halfWidth = (width * 0.5) * near / focalLength;
    const halfHeight = (height * 0.5) * near / focalLength;
    return {
      width,
      height,
      near,
      halfWidth,
      halfHeight,
      finalHalfWidth: halfWidth + 1,
      focalLength,
      project(x, y, z) {
        const safeZ = Math.max(0.001, z);
        return {
          x: width * 0.5 + x * focalLength / safeZ,
          y: height * 0.5 - y * focalLength / safeZ,
          scale: near / safeZ
        };
      }
    };
  }

  function makeMistSprite(kind) {
    const sprite = document.createElement('canvas');
    sprite.width = 192;
    sprite.height = 96;
    const spriteContext = sprite.getContext('2d');
    const gradient = spriteContext.createRadialGradient(96, 52, 2, 96, 52, 88);
    const blue = kind === 2;
    const hot = kind === 1;
    gradient.addColorStop(0, blue ? 'rgba(214,242,255,.78)' : hot ? 'rgba(255,151,92,.68)' : 'rgba(255,62,44,.60)');
    gradient.addColorStop(0.3, blue ? 'rgba(100,190,255,.42)' : hot ? 'rgba(255,82,44,.44)' : 'rgba(220,18,29,.40)');
    gradient.addColorStop(0.68, blue ? 'rgba(64,130,255,.12)' : 'rgba(112,3,13,.15)');
    gradient.addColorStop(1, 'rgba(24,0,5,0)');
    spriteContext.fillStyle = gradient;
    spriteContext.fillRect(0, 0, 192, 96);
    return sprite;
  }

  function ensureSprites() {
    if (!sprites.length) sprites = [makeMistSprite(0), makeMistSprite(1), makeMistSprite(2)];
  }

  function buildAtmosphere() {
    ensureSprites();
    const layout = rng(hash(`ncn-terminal-v${VERSION}:${terminalNumber}:mist-layout`));
    const count = Math.max(8, Math.round(quality.banks * (0.55 + profile.density * 0.45)));
    const driftMagnitude = Math.abs(profile.drift);
    const driftDirection = profile.drift < 0 ? -1 : 1;

    banks = Array.from({ length: count }, (_, index) => ({
      lane: index % 5,
      start: mix(-1.2, 1.2, layout()),
      phase: layout() * 90,
      baseZ: mix(2.75, 10.2, layout()),
      width: mix(0.8, 2.3, layout()),
      lift: mix(0.04, profile.height, layout()),
      alpha: mix(0.35, 1, layout()),
      speed: (0.022 + driftMagnitude * mix(0.24, 0.42, layout())) * driftDirection,
      depthSpeed: profile.depthFlow * mix(0.22, 0.50, layout()),
      wobble: layout() * Math.PI * 2
    }));
  }

  function makePanel() {
    const node = document.createElement('section');
    node.id = 'terminal-environment-controls';
    node.className = 'terminal-environment-controls';
    node.setAttribute('aria-label', 'Terminal environment controls');
    node.innerHTML = `
      <header>
        <strong>Terminal Environment</strong>
        <span id="terminal-environment-state">STABLE</span>
      </header>
      <div class="terminal-environment-row">
        <label for="terminal-environment-number">Terminal</label>
        <input id="terminal-environment-number" type="text" spellcheck="false" autocomplete="off">
        <button id="terminal-environment-load" type="button">Load</button>
      </div>
      <div class="terminal-environment-readout" id="terminal-environment-readout"></div>
      <div class="terminal-environment-actions">
        <button id="terminal-environment-test" type="button" ${DEBUG ? '' : 'hidden'}>Test cascade</button>
        <button id="terminal-environment-recalibrate" type="button" hidden>Recalibrate</button>
        <button id="terminal-environment-reset" type="button" hidden>Hard reset</button>
      </div>`;

    document.body.append(node);
    node.querySelector('#terminal-environment-number').value = terminalNumber;
    node.querySelector('#terminal-environment-load').addEventListener('click', () => {
      loadTerminal(node.querySelector('#terminal-environment-number').value);
    });
    node.querySelector('#terminal-environment-number').addEventListener('keydown', event => {
      if (event.key === 'Enter') loadTerminal(event.currentTarget.value);
    });
    node.querySelector('#terminal-environment-test').addEventListener('click', forceCascade);
    node.querySelector('#terminal-environment-recalibrate').addEventListener('click', recalibrate);
    node.querySelector('#terminal-environment-reset').addEventListener('click', hardReset);
    return node;
  }

  function mount() {
    const viewer = document.querySelector('.viewer');
    if (!viewer) throw new Error('Terminal FX requires the NCN viewer root.');

    root = document.createElement('div');
    root.id = 'terminal-environment-layer';
    root.className = 'terminal-environment-layer';
    root.setAttribute('aria-hidden', 'true');
    canvas = document.createElement('canvas');
    canvas.id = 'terminal-environment-canvas';
    canvas.className = 'terminal-environment-canvas';
    root.append(canvas);
    viewer.append(root);
    context = canvas.getContext('2d');

    panel = makePanel();
    buildAtmosphere();
    resize();
    addListeners();
    observeFeed();
  }

  function unmount() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    removeListeners();
    feedObserver?.disconnect();
    resizeObserver?.disconnect();
    feedObserver = null;
    resizeObserver = null;
    clearCardEffects();
    root?.remove();
    panel?.remove();
    root = canvas = context = panel = null;
    cards = [];
    cardsDirty = true;

    const style = document.documentElement.style;
    style.removeProperty('--terminal-card-brightness');
    style.removeProperty('--terminal-ghost-strength');
    style.removeProperty('--terminal-bloom-strength');
  }

  function resize() {
    if (!enabled || !canvas) return;
    width = innerWidth;
    height = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, quality.dpr);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    cardsDirty = true;
  }

  function observeFeed() {
    const feed = document.querySelector('#feed');
    if (!feed) return;
    feedObserver = new MutationObserver(() => { cardsDirty = true; });
    feedObserver.observe(feed, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(() => { cardsDirty = true; });
      resizeObserver.observe(feed);
    }
  }

  function refreshCards() {
    if (!cardsDirty) return;
    cardsDirty = false;
    cards = [...document.querySelectorAll('#feed .entry:not(.panel)')]
      .filter(node => getComputedStyle(node).display !== 'none')
      .map((node, index) => ({
        node,
        plate: node.querySelector('.projection-plate'),
        rect: node.getBoundingClientRect(),
        z: CARD_NEAR + index * CARD_DEPTH_STEP,
        index
      }))
      .filter(card => card.rect.bottom > -80 && card.rect.top < height + 80);
  }

  function clearCardEffects() {
    document.querySelectorAll('#feed .entry:not(.panel)').forEach(node => {
      node.style.removeProperty('--terminal-slip-x');
      node.style.removeProperty('--terminal-slip-y');
    });
  }

  function rootClassActive(className) {
    return document.documentElement.classList.contains(className);
  }

  function panelIsActive() {
    try {
      if (typeof NCN_STATE !== 'undefined' && NCN_STATE.activePanel) return true;
      if (typeof NCN_SELECTOR_TRANSITIONING !== 'undefined' && NCN_SELECTOR_TRANSITIONING) return true;
    } catch {
      /* Global application state is optional to this lab module. */
    }
    return Boolean(
      document.querySelector('[data-panel][aria-pressed="true"], .ncn-select.is-open')
    );
  }

  function currentActivity(now = performance.now()) {
    if (!enabled) return 'disabled';
    if (runtime.latched) return 'latched';
    if (hidden) return 'hidden';
    if (now < uiBusyUntil) return 'interface';
    if (rootClassActive('heuristic-rangefinder-active')) return 'rangefinder';
    if (window.OpticalProjection?.isEnabled?.() || rootClassActive('optical-mode')) return 'optics';
    if (panelIsActive()) return 'panel';
    const active = document.activeElement;
    if (active?.matches?.('input,select,textarea,[contenteditable="true"]')) return 'text-entry';
    if (document.querySelector('[role="dialog"][aria-modal="true"], .drawer.open, .drawer.active, .modal.open, .modal.active')) return 'dialog';
    return 'browsing';
  }

  function schedule(now = performance.now()) {
    if (naturalIncidents >= MAX_NATURAL_INCIDENTS) {
      runtime.nextIncidentAt = Infinity;
      return;
    }
    runtime.nextIncidentAt = now + mix(profile.incidentMin, profile.incidentMax, random()) * 1000;
  }

  function updateGate(now, force = false) {
    if (!force && now - gateCheckedAt < 250) return;
    gateCheckedAt = now;
    const next = currentActivity(now);
    if (next === activityMode) return;

    const wasBrowsing = activityMode === 'browsing';
    const isBrowsing = next === 'browsing';
    activityMode = next;

    if (wasBrowsing && !isBrowsing) {
      runtime.queue.length = 0;
      if (!runtime.latched && runtime.phase !== PHASE.DORMANT) {
        runtime.phase = PHASE.RECOVERY;
        runtime.phaseAge = 0;
      }
    } else if (!wasBrowsing && isBrowsing) {
      eligibleAt = now + GRACE_MS;
      schedule(eligibleAt);
    }
  }

  const mayCascade = now => (
    activityMode === 'browsing'
    && now >= eligibleAt
    && !runtime.latched
    && !runtime.resetRequired
  );

  function weightedPrimary() {
    const weights = [
      [EVENT.ARC, profile.susceptibility.electrical * 1.15 + profile.charge * 0.35],
      [EVENT.ENV, profile.susceptibility.environmental * 1.08 + profile.density * 0.25],
      [EVENT.BLOOM, profile.susceptibility.optical * 0.88],
      [EVENT.SIGNAL, profile.susceptibility.signal * 0.82],
      [EVENT.GEOMETRY, profile.susceptibility.geometry * 0.72]
    ];
    let cursor = random() * weights.reduce((sum, item) => sum + item[1], 0);
    for (const [type, weight] of weights) {
      cursor -= weight;
      if (cursor <= 0) return type;
    }
    return EVENT.ENV;
  }

  function startIncident(now, forced = false) {
    if (!forced && !mayCascade(now)) return false;
    if (!forced && naturalIncidents >= MAX_NATURAL_INCIDENTS) return false;
    if (!forced) naturalIncidents += 1;

    runtime.phase = PHASE.ESCALATION;
    runtime.phaseAge = 0;
    runtime.severity = forced
      ? mix(0.84, 0.99, random())
      : clamp(0.30 + Math.pow(random(), 2.5) * 0.58 + profile.charge * 0.12, 0.24, 0.96);
    runtime.budget = forced ? 7 : Math.max(2, Math.round(2 + runtime.severity * 4));
    runtime.queue = [{ type: weightedPrimary(), strength: runtime.severity, generation: 0 }];
    runtime.nextIncidentAt = Infinity;
    return true;
  }

  function susceptibility(type) {
    if ([EVENT.ARC, EVENT.SURGE, EVENT.BROWNOUT].includes(type)) return profile.susceptibility.electrical;
    if (type === EVENT.BLOOM) return profile.susceptibility.optical;
    if (type === EVENT.SIGNAL) return profile.susceptibility.signal;
    if ([EVENT.GEOMETRY, EVENT.COLLAPSE].includes(type)) return profile.susceptibility.geometry;
    return profile.susceptibility.environmental;
  }

  function branch(type, parent, threshold, base, scale, now) {
    if (runtime.budget <= 0 || parent.strength <= threshold || !mayCascade(now)) return;
    const excess = (parent.strength - threshold) / Math.max(0.001, 1 - threshold);
    const stressLevel = Math.max(...Object.values(runtime.stress));
    const probability = base * excess * excess
      * (0.55 + susceptibility(type) * 0.65)
      * (1 + stressLevel * 0.28);
    if (random() >= probability) return;
    runtime.budget -= 1;
    runtime.queue.push({
      type,
      strength: clamp01(parent.strength * scale * mix(0.88, 1.08, random())),
      generation: parent.generation + 1
    });
  }

  function addStress(channel, amount) {
    runtime.stress[channel] = clamp01(runtime.stress[channel] + amount);
  }

  function applyEvent(event, now) {
    const symptoms = runtime.symptoms;
    const channels = runtime.channels;
    const strength = event.strength;

    switch (event.type) {
      case EVENT.ENV:
        channels.environmental = Math.max(channels.environmental, strength);
        symptoms.occlusion = Math.max(symptoms.occlusion, strength);
        addStress('optics', strength * 0.05);
        branch(EVENT.BLOOM, event, 0.42, 0.38, 0.76, now);
        branch(EVENT.ARC, event, 0.58, 0.30 + profile.charge * 0.18, 0.82, now);
        break;
      case EVENT.ARC:
        channels.electrical = Math.max(channels.electrical, strength);
        symptoms.arc = Math.max(symptoms.arc, strength);
        symptoms.mistFlash = Math.max(symptoms.mistFlash, strength * 0.88);
        addStress('power', 0.08 + strength * 0.15);
        addStress('optics', strength * 0.06);
        branch(EVENT.SURGE, event, 0.48, 0.46, 0.84, now);
        branch(EVENT.BLOOM, event, 0.42, 0.30, 0.68, now);
        branch(EVENT.SIGNAL, event, 0.66, 0.25, 0.62, now);
        break;
      case EVENT.SURGE:
        channels.electrical = Math.max(channels.electrical, strength);
        symptoms.surge = Math.max(symptoms.surge, strength);
        symptoms.sparks = Math.max(symptoms.sparks, strength);
        addStress('power', 0.10 + strength * 0.18);
        branch(EVENT.BROWNOUT, event, 0.69, 0.25, 0.82, now);
        branch(EVENT.SIGNAL, event, 0.55, 0.28, 0.70, now);
        branch(EVENT.BLOOM, event, 0.44, 0.35, 0.74, now);
        break;
      case EVENT.BLOOM:
        channels.optical = Math.max(channels.optical, strength);
        symptoms.bloom = Math.max(symptoms.bloom, strength);
        addStress('optics', 0.08 + strength * 0.16);
        branch(EVENT.SIGNAL, event, 0.62, 0.24, 0.62, now);
        break;
      case EVENT.SIGNAL:
        channels.signal = Math.max(channels.signal, strength);
        symptoms.ghost = Math.max(symptoms.ghost, strength);
        addStress('signal', 0.09 + strength * 0.17);
        branch(EVENT.GEOMETRY, event, 0.60, 0.34, 0.72, now);
        break;
      case EVENT.GEOMETRY:
        channels.geometry = Math.max(channels.geometry, strength);
        symptoms.slip = Math.max(symptoms.slip, strength);
        addStress('geometry', 0.09 + strength * 0.17);
        branch(EVENT.COLLAPSE, event, 0.72, 0.24, 0.78, now);
        branch(EVENT.BLOOM, event, 0.60, 0.18, 0.48, now);
        break;
      case EVENT.BROWNOUT:
        channels.electrical = Math.max(channels.electrical, strength);
        symptoms.brownout = Math.max(symptoms.brownout, strength);
        addStress('power', 0.10 + strength * 0.14);
        addStress('signal', strength * 0.08);
        break;
      case EVENT.COLLAPSE:
        channels.geometry = Math.max(channels.geometry, strength);
        symptoms.collapse = Math.max(symptoms.collapse, strength);
        symptoms.slip = Math.max(symptoms.slip, strength);
        addStress('geometry', 0.12 + strength * 0.18);
        break;
      default:
        break;
    }
  }

  function processQueue(now) {
    let processed = 0;
    while (runtime.queue.length && processed < 6) {
      applyEvent(runtime.queue.shift(), now);
      processed += 1;
    }
  }

  function decideEnding() {
    const symptoms = runtime.symptoms;
    runtime.usability = clamp01(
      1
      - symptoms.brownout * 0.75
      - symptoms.ghost * 0.28
      - symptoms.collapse * 0.70
      - symptoms.bloom * 0.24
      - symptoms.occlusion * 0.18
    );

    const hardCombo = symptoms.brownout > 0.72
      && (symptoms.ghost > 0.5 || symptoms.collapse > 0.42);
    const latchChance = clamp(
      (0.22 - runtime.usability) * 1.7 + (runtime.severity - 0.78) * 0.62,
      0,
      0.34
    );

    if (!hardFailureUsed && hardCombo && runtime.severity > 0.86 && random() < 0.14) {
      hardFailureUsed = true;
      runtime.latched = true;
      runtime.resetRequired = true;
      runtime.latchType = 'HARD RESET REQUIRED';
      runtime.phase = PHASE.LATCHED;
    } else if (runtime.usability < 0.30 && runtime.severity > 0.76 && random() < latchChance) {
      runtime.latched = true;
      runtime.resetRequired = false;
      runtime.latchType = runtime.channels.geometry >= runtime.channels.signal
        ? 'GEOMETRY RECALIBRATION REQUIRED'
        : 'SIGNAL RECALIBRATION REQUIRED';
      runtime.phase = PHASE.LATCHED;
    } else {
      runtime.phase = PHASE.RECOVERY;
    }
    runtime.phaseAge = 0;
  }

  function decay(dt, fast = false) {
    const multiplier = fast ? 2.8 : 1;
    const rates = {
      arc: 4.4,
      mistFlash: 2.7,
      surge: 1.45,
      bloom: 0.82,
      ghost: 0.58,
      slip: 0.48,
      brownout: 0.72,
      collapse: 0.36,
      sparks: 1.5,
      occlusion: 0.68
    };
    for (const [key, rate] of Object.entries(rates)) {
      runtime.symptoms[key] *= Math.exp(-dt * rate * multiplier);
    }
    for (const key of Object.keys(runtime.channels)) {
      runtime.channels[key] *= Math.exp(-dt * 0.48 * multiplier);
    }
    for (const key of Object.keys(runtime.stress)) {
      runtime.stress[key] *= Math.exp(-dt * 0.075 * multiplier);
    }
  }

  function simulationStep(dt, now) {
    updateGate(now);
    if (!runtime.latched && mayCascade(now) && now >= runtime.nextIncidentAt) startIncident(now);
    runtime.phaseAge += dt;

    if (runtime.phase === PHASE.ESCALATION) {
      if (mayCascade(now)) processQueue(now);
      else runtime.phase = PHASE.RECOVERY;
      if (!runtime.queue.length && runtime.phaseAge > mix(0.8, 1.7, runtime.severity)) {
        runtime.phase = PHASE.PEAK;
        runtime.phaseAge = 0;
      }
    } else if (runtime.phase === PHASE.PEAK && runtime.phaseAge > mix(0.45, 1.1, runtime.severity)) {
      decideEnding();
    } else if (runtime.phase === PHASE.RECOVERY) {
      decay(dt, activityMode !== 'browsing');
      if (Math.max(...Object.values(runtime.symptoms)) < 0.012) {
        runtime = freshRuntime();
        if (activityMode === 'browsing') {
          eligibleAt = now + GRACE_MS;
          schedule(eligibleAt);
        }
      }
    } else if (runtime.phase === PHASE.DORMANT) {
      decay(dt, false);
    }

    runtime.usability = clamp01(
      1
      - runtime.symptoms.brownout * 0.75
      - runtime.symptoms.ghost * 0.28
      - runtime.symptoms.collapse * 0.70
      - runtime.symptoms.bloom * 0.24
      - runtime.symptoms.occlusion * 0.18
    );
  }

  function bankDepth(bank, elapsed) {
    const near = 2.75;
    const range = 7.45;
    return near + mod(bank.baseZ - near + elapsed * bank.depthSpeed, range);
  }

  function cardExclusionPath(bucketDepth) {
    if (typeof Path2D !== 'function') return null;
    const path = new Path2D();
    path.rect(0, 0, width, height);
    for (const card of cards) {
      if (card.z >= bucketDepth) continue;
      const padding = 2;
      path.rect(
        card.rect.left - padding,
        card.rect.top - padding,
        card.rect.width + padding * 2,
        card.rect.height + padding * 2
      );
    }
    return path;
  }

  function drawAtmosphere(ctx, elapsed) {
    const cam = camera();
    const floor = profile.weatherType === 'floorMist';
    const anchorY = floor ? -cam.halfHeight : cam.halfHeight;
    const direction = floor ? 1 : -1;
    const flash = runtime.symptoms.mistFlash;
    const occlusion = runtime.symptoms.occlusion;
    const energyGain = 0.72 + profile.energy * 0.55;
    const bucketContents = Array.from({ length: DEPTH_BUCKETS }, () => []);
    const near = 2.75;
    const far = 10.2;

    for (const bank of banks) {
      const z = bankDepth(bank, elapsed);
      const bucket = clamp(Math.floor((z - near) / (far - near) * DEPTH_BUCKETS), 0, DEPTH_BUCKETS - 1);
      bucketContents[bucket].push({ bank, z });
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let bucket = DEPTH_BUCKETS - 1; bucket >= 0; bucket -= 1) {
      const entries = bucketContents[bucket];
      if (!entries.length) continue;
      const bucketDepth = near + (bucket + 0.5) / DEPTH_BUCKETS * (far - near);
      const exclusion = cardExclusionPath(bucketDepth);

      ctx.save();
      if (exclusion) {
        try { ctx.clip(exclusion, 'evenodd'); }
        catch { /* Browsers without even-odd canvas clipping draw the atmosphere unmasked. */ }
      }

      for (const { bank, z } of entries) {
        const span = cam.finalHalfWidth * 2 + bank.width * 2;
        const x = -cam.finalHalfWidth - bank.width
          + mod((bank.start + elapsed * bank.speed + bank.phase) * span, span);
        const laneOffset = (bank.lane - 2) * profile.height * 0.10;
        const wave = Math.sin(elapsed * (0.16 + profile.turbulence * 0.18) + bank.wobble)
          * bank.width * 0.12 * profile.turbulence;
        const y = anchorY + direction * (
          bank.lift
          + laneOffset
          + Math.sin(elapsed * 0.11 + bank.wobble) * profile.height * 0.08
        );
        const point = cam.project(x + wave, y, z);
        const scale = cam.near / z;
        const densityBoost = 1 + occlusion * 0.85;
        const drawWidth = Math.max(26, bank.width * cam.focalLength / z * 1.8 * densityBoost);
        const drawHeight = Math.max(12, drawWidth * (0.22 + profile.height * 0.26));
        const alpha = profile.opacity * profile.density * bank.alpha
          * (0.28 + scale * 0.68)
          * energyGain
          * (1 + flash * 0.28 + occlusion * 0.62);
        const sprite = flash > 0.72
          ? sprites[2]
          : flash > 0.18 || runtime.symptoms.surge > 0.3
            ? sprites[1]
            : sprites[0];
        ctx.globalAlpha = clamp01(alpha);
        ctx.drawImage(sprite, point.x - drawWidth / 2, point.y - drawHeight / 2, drawWidth, drawHeight);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawArc(ctx, elapsed) {
    const strength = runtime.symptoms.arc;
    if (strength < 0.02) return;
    const cam = camera();
    const randomArc = rng(hash(`${terminalNumber}:arc:${Math.floor(elapsed * 5)}`));
    const x = mix(-cam.halfWidth * 0.62, cam.halfWidth * 0.62, randomArc());
    const z = mix(3.0, 8.5, randomArc());
    const points = [];

    for (let index = 0; index <= 11; index += 1) {
      const amount = index / 11;
      const envelope = Math.sin(amount * Math.PI);
      points.push(cam.project(
        x + (randomArc() - 0.5) * 0.8 * envelope,
        mix(cam.halfHeight * 0.82, -cam.halfHeight + 0.08, amount)
          + (randomArc() - 0.5) * 0.34 * envelope,
        z + (randomArc() - 0.5) * 0.45 * envelope
      ));
    }

    const stroke = (lineWidth, colour) => {
      ctx.beginPath();
      points.forEach((point, index) => (
        index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)
      ));
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = colour;
      ctx.stroke();
    };

    const energy = 0.72 + profile.energy * 0.42;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    stroke(8, `rgba(74,176,255,${strength * 0.06 * energy})`);
    stroke(3.6, `rgba(153,222,255,${strength * 0.25 * energy})`);
    stroke(1.3, `rgba(255,255,255,${strength * 0.88 * energy})`);
    ctx.restore();
  }

  function drawSparks(ctx, elapsed) {
    const strength = runtime.symptoms.sparks;
    if (strength < 0.02) return;
    const cam = camera();
    const count = Math.round(3 + quality.banks * 0.25 * strength);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let index = 0; index < count; index += 1) {
      const sparkRandom = rng(hash(`${terminalNumber}:spark:${index}`));
      const z = mix(2.7, 7.5, sparkRandom());
      const x = mix(-cam.halfWidth, cam.halfWidth, sparkRandom());
      const cycle = mod(elapsed * mix(0.25, 0.7, sparkRandom()) + sparkRandom() * 8, 1);
      const y = -cam.halfHeight + cycle * mix(0.35, 1.25, sparkRandom());
      const point = cam.project(x, y, z);
      ctx.fillStyle = `rgba(255,${Math.round(120 + sparkRandom() * 100)},80,${strength * (1 - cycle) * 0.75})`;
      ctx.fillRect(point.x, point.y, 1.2, 1.2);
    }
    ctx.restore();
  }

  function drawEntryFaults(ctx, elapsed) {
    const ghost = runtime.symptoms.ghost;
    const slip = runtime.symptoms.slip + runtime.symptoms.collapse * 0.55;
    if (ghost < 0.02 && slip < 0.02) {
      clearCardEffects();
      return;
    }

    ctx.save();
    ctx.lineWidth = 1;
    for (const card of cards) {
      const dx = Math.sin(elapsed * 1.8 + card.index) * slip * 14;
      const dy = Math.cos(elapsed * 1.3 + card.index) * slip * 4;
      card.node.style.setProperty('--terminal-slip-x', `${dx.toFixed(2)}px`);
      card.node.style.setProperty('--terminal-slip-y', `${dy.toFixed(2)}px`);

      if (ghost > 0.02) {
        ctx.strokeStyle = `rgba(130,210,255,${ghost * 0.11})`;
        ctx.strokeRect(card.rect.left + ghost * 10, card.rect.top, card.rect.width, card.rect.height);
        ctx.strokeStyle = `rgba(255,70,46,${ghost * 0.10})`;
        ctx.strokeRect(card.rect.left - ghost * 7, card.rect.top, card.rect.width, card.rect.height);
      }
      if (slip > 0.025) {
        ctx.strokeStyle = `rgba(255,70,46,${slip * 0.25})`;
        ctx.strokeRect(card.rect.left + dx, card.rect.top + dy, card.rect.width, card.rect.height);
      }
    }
    ctx.restore();
  }

  function drawOverlays(ctx) {
    const bloom = runtime.symptoms.bloom;
    const occlusion = runtime.symptoms.occlusion;
    if (bloom > 0.015) {
      const gradient = ctx.createRadialGradient(
        width * 0.5,
        height * 0.48,
        0,
        width * 0.5,
        height * 0.48,
        Math.max(width, height) * 0.78
      );
      gradient.addColorStop(0, `rgba(255,142,86,${bloom * 0.095})`);
      gradient.addColorStop(0.42, `rgba(255,55,38,${bloom * 0.052})`);
      gradient.addColorStop(1, 'rgba(255,40,30,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }

    if (occlusion > 0.02) {
      ctx.fillStyle = `rgba(80,0,8,${occlusion * 0.055})`;
      ctx.fillRect(0, 0, width, height);
    }

    const darkness = runtime.symptoms.brownout * 0.64 + runtime.symptoms.collapse * 0.18;
    if (darkness > 0.01) {
      ctx.fillStyle = `rgba(0,0,0,${clamp01(darkness)})`;
      ctx.fillRect(0, 0, width, height);
    }
  }

  function applyDocumentEffects() {
    const style = document.documentElement.style;
    style.setProperty(
      '--terminal-card-brightness',
      String(clamp(1 - runtime.symptoms.brownout * 0.54 + runtime.symptoms.bloom * 0.12, 0.28, 1.18))
    );
    style.setProperty('--terminal-ghost-strength', runtime.symptoms.ghost.toFixed(3));
    style.setProperty('--terminal-bloom-strength', runtime.symptoms.bloom.toFixed(3));
  }

  function updatePanel() {
    if (!panel) return;
    const status = runtime.latched
      ? runtime.latchType
      : activityMode !== 'browsing'
        ? `CASCADE SUPPRESSED — ${activityMode.toUpperCase()}`
        : performance.now() < eligibleAt
          ? 'BROWSING GRACE PERIOD'
          : runtime.phase.toUpperCase();

    panel.querySelector('#terminal-environment-state').textContent = status;
    panel.classList.toggle('fault', runtime.latched);
    panel.classList.toggle('hard-fault', runtime.resetRequired);

    const recalibrateButton = panel.querySelector('#terminal-environment-recalibrate');
    const resetButton = panel.querySelector('#terminal-environment-reset');
    recalibrateButton.hidden = !runtime.latched || runtime.resetRequired;
    resetButton.hidden = !runtime.resetRequired;

    panel.querySelector('#terminal-environment-readout').textContent = [
      profile.weatherType === 'floorMist' ? 'FLOOR MIST' : 'CEILING SMOKE',
      `DENS ${Math.round(profile.density * 100)}`,
      `DRIFT ${Math.round(profile.drift * 100)}`,
      `FLOW ${Math.round(profile.depthFlow * 100)}`,
      `CHG ${Math.round(profile.charge * 100)}`,
      `USE ${Math.round(runtime.usability * 100)}`,
      quality.name
    ].join(' · ');
  }

  function frame(now) {
    raf = 0;
    if (!enabled || hidden || !context) return;
    const faultActive = runtime.phase !== PHASE.DORMANT || runtime.latched;
    const fps = faultActive ? quality.faultFps : quality.ambientFps;
    if (now - lastFrame < 1000 / fps) {
      raf = requestAnimationFrame(frame);
      return;
    }

    const dt = clamp((now - (lastStep || now)) / 1000, 0, 0.1);
    lastStep = now;
    lastFrame = now;
    runtime.accumulator += dt;
    while (runtime.accumulator >= STEP) {
      simulationStep(STEP, now);
      runtime.accumulator -= STEP;
    }

    refreshCards();
    context.clearRect(0, 0, width, height);
    const elapsed = now / 1000;
    drawAtmosphere(context, elapsed);
    drawEntryFaults(context, elapsed);
    drawSparks(context, elapsed);
    drawArc(context, elapsed);
    drawOverlays(context);
    applyDocumentEffects();
    updatePanel();
    raf = requestAnimationFrame(frame);
  }

  function suspendImmediately(duration = 1300) {
    uiBusyUntil = Math.max(uiBusyUntil, performance.now() + duration);
    updateGate(performance.now(), true);
  }

  function interactionChanged(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.closest('#terminal-environment-test, #terminal-environment-recalibrate, #terminal-environment-reset')) {
      requestAnimationFrame(() => updateGate(performance.now(), true));
      return;
    }

    if (target.closest('#terminal-environment-number, #terminal-environment-load')) {
      suspendImmediately(1800);
      return;
    }

    if (target.closest('[data-panel], .entry.panel, .ncn-select, form, input, select, textarea, [contenteditable="true"], [role="dialog"], .drawer, .modal')) {
      suspendImmediately();
      return;
    }

    requestAnimationFrame(() => updateGate(performance.now(), true));
  }

  function markCardsDirty() {
    cardsDirty = true;
  }

  function visibilityChanged() {
    hidden = document.hidden;
    if (!hidden && enabled && !raf) {
      lastStep = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  function addListeners() {
    addEventListener('resize', resize, { passive: true });
    addEventListener('scroll', markCardsDirty, { passive: true });
    document.addEventListener('pointerdown', interactionChanged, true);
    document.addEventListener('focusin', interactionChanged, true);
    document.addEventListener('focusout', interactionChanged, true);
    document.addEventListener('input', interactionChanged, true);
    document.addEventListener('click', interactionChanged, true);
    document.addEventListener('visibilitychange', visibilityChanged);
  }

  function removeListeners() {
    removeEventListener('resize', resize);
    removeEventListener('scroll', markCardsDirty);
    document.removeEventListener('pointerdown', interactionChanged, true);
    document.removeEventListener('focusin', interactionChanged, true);
    document.removeEventListener('focusout', interactionChanged, true);
    document.removeEventListener('input', interactionChanged, true);
    document.removeEventListener('click', interactionChanged, true);
    document.removeEventListener('visibilitychange', visibilityChanged);
  }

  function setOtherModeControlsDisabled(disabled) {
    ['#layered-chamber-toggle', '#heuristic-rangefinder-toggle', '#optical-projection-toggle'].forEach(selector => {
      const control = document.querySelector(selector);
      if (!control) return;
      if (disabled) {
        disabledControls.set(control, control.disabled);
        control.disabled = true;
      } else {
        control.disabled = disabledControls.get(control) || false;
      }
    });
    if (!disabled) disabledControls.clear();
  }

  function takeModeOwnership() {
    const chamber = window.LayeredChamber;
    previousChamberMode = chamber?.getMode?.() || 'off';
    previousRangeActive = rootClassActive('heuristic-rangefinder-active');
    previousOpticsActive = Boolean(window.OpticalProjection?.isEnabled?.());

    if (previousRangeActive) window.HeuristicRangefinder?.disable?.();
    if (previousOpticsActive) window.OpticalProjection?.disable?.({ persist: false });
    if (chamber?.setMode && chamber.MODES?.BACKGROUND) {
      chamber.setMode(chamber.MODES.BACKGROUND, { persist: false, restartAnimation: true });
    }
    setOtherModeControlsDisabled(true);
  }

  function releaseModeOwnership() {
    const chamber = window.LayeredChamber;
    setOtherModeControlsDisabled(false);
    if (chamber?.setMode && previousChamberMode) {
      chamber.setMode(previousChamberMode, { persist: false, restartAnimation: false });
    }
    if (previousRangeActive) window.HeuristicRangefinder?.enable?.();
    if (previousOpticsActive) window.OpticalProjection?.enable?.({ persist: false });
    previousChamberMode = null;
    previousRangeActive = false;
    previousOpticsActive = false;
  }

  function enable() {
    if (enabled) return true;
    enabled = true;
    takeModeOwnership();
    document.documentElement.classList.add('terminal-environment-mode');
    toggleButton?.setAttribute('aria-pressed', 'true');
    if (toggleButton) toggleButton.textContent = 'Terminal FX On';

    runtime = freshRuntime();
    random = sessionRng(terminalNumber);
    mount();
    const now = performance.now();
    activityMode = currentActivity(now);
    eligibleAt = now + GRACE_MS;
    schedule(eligibleAt);
    lastFrame = lastStep = now;
    raf = requestAnimationFrame(frame);
    return true;
  }

  function disable() {
    if (!enabled) return true;
    enabled = false;
    document.documentElement.classList.remove('terminal-environment-mode');
    toggleButton?.setAttribute('aria-pressed', 'false');
    if (toggleButton) toggleButton.textContent = 'Terminal FX Off';
    unmount();
    releaseModeOwnership();
    activityMode = 'disabled';
    return true;
  }

  const toggle = () => enabled ? disable() : enable();

  function loadTerminal(value) {
    terminalNumber = String(value || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '')
      .slice(0, 32) || DEFAULT_TERMINAL;
    storageSet(STORAGE_KEY, terminalNumber);
    profile = makeProfile(terminalNumber);
    random = sessionRng(terminalNumber);
    runtime = freshRuntime();
    naturalIncidents = 0;
    hardFailureUsed = false;
    buildAtmosphere();
    cardsDirty = true;
    if (panel) panel.querySelector('#terminal-environment-number').value = terminalNumber;
    const now = performance.now();
    activityMode = currentActivity(now);
    eligibleAt = now + GRACE_MS;
    schedule(eligibleAt);
    updatePanel();
    window.dispatchEvent(new CustomEvent('ncn:terminal-environment-change', {
      detail: { number: terminalNumber, profile }
    }));
    return profile;
  }

  function forceCascade() {
    if (!DEBUG || !enabled || runtime.latched) return false;
    document.activeElement?.blur?.();
    uiBusyUntil = 0;
    activityMode = currentActivity(performance.now());
    if (activityMode !== 'browsing') return false;
    eligibleAt = 0;
    return startIncident(performance.now(), true);
  }

  function recalibrate() {
    if (!enabled || !runtime.latched || runtime.resetRequired) return false;
    runtime = freshRuntime();
    const now = performance.now();
    activityMode = currentActivity(now);
    eligibleAt = now + GRACE_MS;
    schedule(eligibleAt);
    updatePanel();
    return true;
  }

  function hardReset() {
    if (!enabled || !runtime.resetRequired) return false;
    runtime = freshRuntime();
    random = sessionRng(terminalNumber);
    const now = performance.now();
    activityMode = currentActivity(now);
    eligibleAt = now + RESET_GRACE_MS;
    schedule(eligibleAt);
    window.LayeredChamber?.restart?.();
    updatePanel();
    return true;
  }

  function init() {
    toggleButton = document.querySelector('#terminal-environment-toggle');
    toggleButton?.addEventListener('click', toggle);
    toggleButton?.setAttribute('aria-pressed', 'false');
    if (toggleButton) toggleButton.textContent = 'Terminal FX Off';
  }

  window.TerminalEnvironmentMode = Object.freeze({
    enable,
    disable,
    toggle,
    isEnabled: () => enabled,
    loadTerminal,
    getTerminalNumber: () => terminalNumber,
    getProfile: () => profile,
    getRuntime: () => JSON.parse(JSON.stringify(runtime)),
    forceCascade,
    recalibrate,
    hardReset,
    PHASE,
    EVENT
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
