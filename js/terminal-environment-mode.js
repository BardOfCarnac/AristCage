/* Optional Terminal FX mode: dormant until explicitly enabled. */
(() => {
  'use strict';

  const VERSION = 1;
  const DEFAULT_TERMINAL = 'NCN-2045-001';
  const STORAGE_KEY = 'ncn-terminal-environment-number';
  const GRACE_MS = 8000;
  const STEP = 0.125;
  const PHASE = Object.freeze({ DORMANT:'dormant', ESCALATION:'escalation', PEAK:'peak', RECOVERY:'recovery', LATCHED:'latched' });
  const EVENT = Object.freeze({ ENV:'environment', ARC:'arc', SURGE:'surge', BLOOM:'bloom', SIGNAL:'signal', GEOMETRY:'geometry', BROWNOUT:'brownout', COLLAPSE:'collapse' });

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const clamp01 = v => clamp(v, 0, 1);
  const mix = (a, b, t) => a + (b - a) * t;
  const mod = (v, d) => ((v % d) + d) % d;

  function storageGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
  function storageSet(key, value) { try { localStorage.setItem(key, value); } catch { /* optional */ } }
  function hash(value) {
    let h = 2166136261;
    for (const char of String(value)) { h ^= char.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let n = seed >>> 0;
    return () => {
      n += 0x6D2B79F5;
      let t = n;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const terminalValue = (number, property) => rng(hash(`ncn-terminal-v${VERSION}:${number}:${property}`))();
  function sessionRng(number) {
    let entropy = Date.now() ^ Math.floor(performance.now() * 1000);
    try { const values = new Uint32Array(1); crypto.getRandomValues(values); entropy ^= values[0]; } catch { /* time entropy */ }
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
      incidentMin: mix(32, 19, charge),
      incidentMax: mix(78, 43, charge),
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
    if (cores <= 4) return { name:'LOW', dpr:1, banks:16, ambientFps:18, faultFps:24 };
    if (cores <= 8) return { name:'STANDARD', dpr:1.25, banks:24, ambientFps:22, faultFps:30 };
    return { name:'HIGH', dpr:1.5, banks:30, ambientFps:24, faultFps:30 };
  }

  function freshRuntime() {
    return {
      phase: PHASE.DORMANT, phaseAge:0, severity:0, usability:1, latched:false, resetRequired:false, latchType:'',
      nextIncidentAt:Infinity, queue:[], budget:0, accumulator:0,
      stress:{ power:0, optics:0, signal:0, geometry:0 },
      channels:{ electrical:0, optical:0, signal:0, geometry:0, environmental:0 },
      symptoms:{ arc:0, mistFlash:0, surge:0, bloom:0, ghost:0, slip:0, brownout:0, collapse:0, sparks:0, occlusion:0 }
    };
  }

  const quality = qualityProfile();
  let enabled = false;
  let previousChamberMode = null;
  let terminalNumber = storageGet(STORAGE_KEY) || DEFAULT_TERMINAL;
  let profile = makeProfile(terminalNumber);
  let random = sessionRng(terminalNumber);
  let runtime = freshRuntime();
  let banks = [];
  let sprites = [];
  let rearRoot, frontRoot, rearCanvas, frontCanvas, rearCtx, frontCtx, panel, toggleButton;
  let width = 0, height = 0, dpr = 1, raf = 0, lastFrame = 0, lastStep = 0;
  let browsing = false, eligibleAt = 0, gateCheckedAt = 0, hidden = document.hidden, uiBusyUntil = 0;

  function camera() {
    if (window.NCNChamberCamera?.snapshot) return window.NCNChamberCamera.snapshot();
    const focal = Math.min(width, height) * 0.84, near = 2.5;
    return {
      width, height, near,
      halfWidth:(width * .5) * near / focal,
      halfHeight:(height * .5) * near / focal,
      finalHalfWidth:(width * .5) * near / focal + 1,
      focalLength:focal,
      project(x, y, z) { z = Math.max(.001, z); return { x:width*.5 + x*focal/z, y:height*.5 - y*focal/z, scale:near/z }; }
    };
  }

  function mistSprite(kind) {
    const canvas = document.createElement('canvas');
    canvas.width = 192; canvas.height = 96;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(96, 52, 2, 96, 52, 88);
    const blue = kind === 2, hot = kind === 1;
    gradient.addColorStop(0, blue ? 'rgba(214,242,255,.78)' : hot ? 'rgba(255,151,92,.68)' : 'rgba(255,62,44,.60)');
    gradient.addColorStop(.3, blue ? 'rgba(100,190,255,.42)' : hot ? 'rgba(255,82,44,.44)' : 'rgba(220,18,29,.40)');
    gradient.addColorStop(.68, blue ? 'rgba(64,130,255,.12)' : 'rgba(112,3,13,.15)');
    gradient.addColorStop(1, 'rgba(24,0,5,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 192, 96);
    return canvas;
  }

  function buildAtmosphere() {
    sprites = [mistSprite(0), mistSprite(1), mistSprite(2)];
    const layout = rng(hash(`ncn-terminal-v${VERSION}:${terminalNumber}:mist-layout`));
    const count = Math.max(10, Math.round(quality.banks * (.55 + profile.density * .45)));
    banks = Array.from({ length:count }, (_, index) => ({
      lane:index % 5, start:mix(-1.2, 1.2, layout()), phase:layout()*90, z:mix(2.75,10.2,layout()),
      width:mix(.8,2.3,layout()), lift:mix(.04,profile.height,layout()), alpha:mix(.35,1,layout()),
      speed:mix(.035,.12,layout()) * (profile.drift < 0 ? -1 : 1), wobble:layout()*Math.PI*2
    }));
  }

  function layer(id, canvasId) {
    const root = document.createElement('div'); root.id = id; root.className = 'terminal-environment-layer';
    const canvas = document.createElement('canvas'); canvas.id = canvasId; canvas.className = 'terminal-environment-canvas';
    root.append(canvas); document.body.prepend(root);
    return { root, canvas, ctx:canvas.getContext('2d') };
  }

  function makePanel() {
    const node = document.createElement('section');
    node.id = 'terminal-environment-controls'; node.className = 'terminal-environment-controls';
    node.setAttribute('aria-label', 'Terminal environment controls');
    node.innerHTML = `<header><strong>Terminal Environment</strong><span id="terminal-environment-state">STABLE</span></header>
      <div class="terminal-environment-row"><label for="terminal-environment-number">Terminal</label>
      <input id="terminal-environment-number" type="text" spellcheck="false" autocomplete="off"><button id="terminal-environment-load" type="button">Load</button></div>
      <div class="terminal-environment-readout" id="terminal-environment-readout"></div>
      <div class="terminal-environment-actions"><button id="terminal-environment-test" type="button">Test cascade</button>
      <button id="terminal-environment-recalibrate" type="button">Recalibrate</button><button id="terminal-environment-reset" type="button">Hard reset</button></div>`;
    document.body.append(node);
    node.querySelector('#terminal-environment-number').value = terminalNumber;
    node.addEventListener('pointerdown', () => { uiBusyUntil = performance.now() + 1800; }, true);
    node.querySelector('#terminal-environment-load').addEventListener('click', () => loadTerminal(node.querySelector('#terminal-environment-number').value));
    node.querySelector('#terminal-environment-number').addEventListener('keydown', e => { if (e.key === 'Enter') loadTerminal(e.currentTarget.value); });
    node.querySelector('#terminal-environment-test').addEventListener('click', forceCascade);
    node.querySelector('#terminal-environment-recalibrate').addEventListener('click', recalibrate);
    node.querySelector('#terminal-environment-reset').addEventListener('click', hardReset);
    return node;
  }

  function resize() {
    if (!enabled) return;
    width = innerWidth; height = innerHeight; dpr = Math.min(devicePixelRatio || 1, quality.dpr);
    for (const canvas of [rearCanvas, frontCanvas]) {
      canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
      canvas.getContext('2d').setTransform(dpr,0,0,dpr,0,0);
    }
  }

  function openElement(selector) {
    const node = document.querySelector(selector);
    return Boolean(node && !node.hidden && node.getAttribute('aria-hidden') !== 'true');
  }

  function browsingState(now = performance.now()) {
    if (!enabled || runtime.latched || now < uiBusyUntil) return false;
    const active = document.activeElement;
    if (active?.matches?.('input,select,textarea,[contenteditable="true"]')) return false;
    if (document.querySelector('[data-panel][aria-pressed="true"]')) return false;
    if (openElement('[role="dialog"][aria-modal="true"]')) return false;
    if (openElement('.panel.open,.panel.active,.drawer.open,.drawer.active,.modal.open,.modal.active')) return false;
    const search = document.querySelector('input[type="search"],#search,[name="search"]');
    return !(search && String(search.value || '').trim());
  }

  function schedule(now = performance.now()) {
    runtime.nextIncidentAt = now + mix(profile.incidentMin, profile.incidentMax, random()) * 1000;
  }

  function updateGate(now, force = false) {
    if (!force && now - gateCheckedAt < 250) return;
    gateCheckedAt = now;
    const next = browsingState(now);
    if (next === browsing) return;
    browsing = next;
    runtime.queue.length = 0;
    if (!next) {
      if (!runtime.latched && runtime.phase !== PHASE.DORMANT) runtime.phase = PHASE.RECOVERY;
    } else {
      eligibleAt = now + GRACE_MS;
      schedule(eligibleAt);
    }
  }

  const mayCascade = now => browsing && now >= eligibleAt && !runtime.latched && !runtime.resetRequired;
  function weightedPrimary() {
    const weights = [
      [EVENT.ARC, profile.susceptibility.electrical*1.15 + profile.charge*.35],
      [EVENT.ENV, profile.susceptibility.environmental*1.08 + profile.density*.25],
      [EVENT.BLOOM, profile.susceptibility.optical*.88],
      [EVENT.SIGNAL, profile.susceptibility.signal*.82],
      [EVENT.GEOMETRY, profile.susceptibility.geometry*.72]
    ];
    let cursor = random() * weights.reduce((sum, item) => sum + item[1], 0);
    for (const [type, weight] of weights) { cursor -= weight; if (cursor <= 0) return type; }
    return EVENT.ENV;
  }

  function startIncident(now, forced = false) {
    if (!forced && !mayCascade(now)) return false;
    runtime.phase = PHASE.ESCALATION; runtime.phaseAge = 0;
    runtime.severity = forced ? mix(.84,.99,random()) : clamp(.30 + Math.pow(random(),2.5)*.58 + profile.charge*.12,.24,.96);
    runtime.budget = forced ? 7 : Math.max(2, Math.round(2 + runtime.severity*4));
    runtime.queue = [{ type:weightedPrimary(), strength:runtime.severity, generation:0 }];
    runtime.nextIncidentAt = Infinity;
    return true;
  }

  function susceptibility(type) {
    if ([EVENT.ARC,EVENT.SURGE,EVENT.BROWNOUT].includes(type)) return profile.susceptibility.electrical;
    if (type === EVENT.BLOOM) return profile.susceptibility.optical;
    if (type === EVENT.SIGNAL) return profile.susceptibility.signal;
    if ([EVENT.GEOMETRY,EVENT.COLLAPSE].includes(type)) return profile.susceptibility.geometry;
    return profile.susceptibility.environmental;
  }

  function branch(type, parent, threshold, base, scale) {
    if (runtime.budget <= 0 || parent.strength <= threshold || !mayCascade(performance.now())) return;
    const excess = (parent.strength-threshold) / Math.max(.001,1-threshold);
    const stress = Math.max(...Object.values(runtime.stress));
    const probability = base*excess*excess*(.55+susceptibility(type)*.65)*(1+stress*.28);
    if (random() >= probability) return;
    runtime.budget--;
    runtime.queue.push({ type, strength:clamp01(parent.strength*scale*mix(.88,1.08,random())), generation:parent.generation+1 });
  }

  function stress(channel, amount) { runtime.stress[channel] = clamp01(runtime.stress[channel] + amount); }
  function applyEvent(event) {
    const s = runtime.symptoms, c = runtime.channels, x = event.strength;
    switch (event.type) {
      case EVENT.ENV:
        c.environmental=Math.max(c.environmental,x); s.occlusion=Math.max(s.occlusion,x); stress('optics',x*.05);
        branch(EVENT.BLOOM,event,.42,.38,.76); branch(EVENT.ARC,event,.58,.30+profile.charge*.18,.82); break;
      case EVENT.ARC:
        c.electrical=Math.max(c.electrical,x); s.arc=Math.max(s.arc,x); s.mistFlash=Math.max(s.mistFlash,x*.88);
        stress('power',.08+x*.15); stress('optics',x*.06);
        branch(EVENT.SURGE,event,.48,.46,.84); branch(EVENT.BLOOM,event,.42,.30,.68); branch(EVENT.SIGNAL,event,.66,.25,.62); break;
      case EVENT.SURGE:
        c.electrical=Math.max(c.electrical,x); s.surge=Math.max(s.surge,x); s.sparks=Math.max(s.sparks,x); stress('power',.10+x*.18);
        branch(EVENT.BROWNOUT,event,.69,.25,.82); branch(EVENT.SIGNAL,event,.55,.28,.70); branch(EVENT.BLOOM,event,.44,.35,.74); break;
      case EVENT.BLOOM:
        c.optical=Math.max(c.optical,x); s.bloom=Math.max(s.bloom,x); stress('optics',.08+x*.16); branch(EVENT.SIGNAL,event,.62,.24,.62); break;
      case EVENT.SIGNAL:
        c.signal=Math.max(c.signal,x); s.ghost=Math.max(s.ghost,x); stress('signal',.09+x*.17); branch(EVENT.GEOMETRY,event,.60,.34,.72); break;
      case EVENT.GEOMETRY:
        c.geometry=Math.max(c.geometry,x); s.slip=Math.max(s.slip,x); stress('geometry',.09+x*.17);
        branch(EVENT.COLLAPSE,event,.72,.24,.78); branch(EVENT.BLOOM,event,.60,.18,.48); break;
      case EVENT.BROWNOUT:
        c.electrical=Math.max(c.electrical,x); s.brownout=Math.max(s.brownout,x); stress('power',.10+x*.14); stress('signal',x*.08); break;
      case EVENT.COLLAPSE:
        c.geometry=Math.max(c.geometry,x); s.collapse=Math.max(s.collapse,x); s.slip=Math.max(s.slip,x); stress('geometry',.12+x*.18); break;
    }
  }

  function processQueue() {
    let count = 0;
    while (runtime.queue.length && count++ < 6) applyEvent(runtime.queue.shift());
  }

  function decideEnding() {
    const s = runtime.symptoms;
    runtime.usability = clamp01(1 - s.brownout*.75 - s.ghost*.28 - s.collapse*.70 - s.bloom*.24 - s.occlusion*.18);
    const hardCombo = s.brownout > .72 && (s.ghost > .5 || s.collapse > .42);
    const latchChance = clamp((.22-runtime.usability)*1.7 + (runtime.severity-.78)*.62, 0, .34);
    if (hardCombo && runtime.severity > .86 && random() < .14) {
      runtime.latched=true; runtime.resetRequired=true; runtime.latchType='HARD RESET REQUIRED'; runtime.phase=PHASE.LATCHED;
    } else if (runtime.usability < .30 && runtime.severity > .76 && random() < latchChance) {
      runtime.latched=true; runtime.resetRequired=false;
      runtime.latchType = runtime.channels.geometry >= runtime.channels.signal ? 'GEOMETRY RECALIBRATION REQUIRED' : 'SIGNAL RECALIBRATION REQUIRED';
      runtime.phase=PHASE.LATCHED;
    } else runtime.phase = PHASE.RECOVERY;
    runtime.phaseAge = 0;
  }

  function decay(dt, fast = false) {
    const multiplier = fast ? 2.8 : 1;
    const rates = { arc:4.4,mistFlash:2.7,surge:1.45,bloom:.82,ghost:.58,slip:.48,brownout:.72,collapse:.36,sparks:1.5,occlusion:.68 };
    for (const [key, rate] of Object.entries(rates)) runtime.symptoms[key] *= Math.exp(-dt*rate*multiplier);
    for (const key of Object.keys(runtime.channels)) runtime.channels[key] *= Math.exp(-dt*.48*multiplier);
    for (const key of Object.keys(runtime.stress)) runtime.stress[key] *= Math.exp(-dt*.075*multiplier);
  }

  function simulationStep(dt, now) {
    updateGate(now);
    if (!runtime.latched && mayCascade(now) && now >= runtime.nextIncidentAt) startIncident(now);
    runtime.phaseAge += dt;
    if (runtime.phase === PHASE.ESCALATION) {
      if (mayCascade(now)) processQueue();
      else runtime.phase = PHASE.RECOVERY;
      if (!runtime.queue.length && runtime.phaseAge > mix(.8,1.7,runtime.severity)) { runtime.phase=PHASE.PEAK; runtime.phaseAge=0; }
    } else if (runtime.phase === PHASE.PEAK && runtime.phaseAge > mix(.45,1.1,runtime.severity)) decideEnding();
    else if (runtime.phase === PHASE.RECOVERY) {
      decay(dt,!browsing);
      if (Math.max(...Object.values(runtime.symptoms)) < .012) { runtime=freshRuntime(); if (browsing) { eligibleAt=now+GRACE_MS; schedule(eligibleAt); } }
    } else if (runtime.phase === PHASE.DORMANT) decay(dt,false);
    runtime.usability = clamp01(1-runtime.symptoms.brownout*.75-runtime.symptoms.ghost*.28-runtime.symptoms.collapse*.70-runtime.symptoms.bloom*.24-runtime.symptoms.occlusion*.18);
  }

  function drawMist(ctx, elapsed, nearPass) {
    const cam = camera();
    const floor = profile.weatherType === 'floorMist';
    const anchorY = floor ? -cam.halfHeight : cam.halfHeight;
    const direction = floor ? 1 : -1;
    const flash = runtime.symptoms.mistFlash;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const bank of banks) {
      const isNear = bank.z < 4.45;
      if (isNear !== nearPass) continue;
      const span = cam.finalHalfWidth*2 + bank.width*2;
      const x = -cam.finalHalfWidth-bank.width + mod((bank.start+elapsed*bank.speed+bank.phase)*span,span);
      const wave = Math.sin(elapsed*(.16+profile.turbulence*.18)+bank.wobble)*bank.width*.12*profile.turbulence;
      const y = anchorY + direction*(bank.lift + Math.sin(elapsed*.11+bank.wobble)*profile.height*.08);
      const point = cam.project(x+wave,y,bank.z);
      const scale = cam.near / bank.z;
      const drawWidth = Math.max(26, bank.width*cam.focalLength/bank.z*1.8);
      const drawHeight = Math.max(12, drawWidth*(.22+profile.height*.26));
      const alpha = profile.opacity*profile.density*bank.alpha*(.28+scale*.68)*(1+flash*.28);
      const sprite = flash > .72 ? sprites[2] : flash > .18 || runtime.symptoms.surge > .3 ? sprites[1] : sprites[0];
      ctx.globalAlpha = clamp01(alpha);
      ctx.drawImage(sprite,point.x-drawWidth/2,point.y-drawHeight/2,drawWidth,drawHeight);
    }
    ctx.restore();
  }

  function drawArc(ctx, elapsed) {
    const strength = runtime.symptoms.arc;
    if (strength < .02) return;
    const cam = camera(), r = rng(hash(`${terminalNumber}:arc:${Math.floor(elapsed*5)}`));
    const x = mix(-cam.halfWidth*.62,cam.halfWidth*.62,r()), z = mix(3.0,8.5,r());
    const points = [];
    for (let i=0;i<=11;i++) {
      const t=i/11, envelope=Math.sin(t*Math.PI);
      points.push(cam.project(x+(r()-.5)*.8*envelope,mix(cam.halfHeight*.82,-cam.halfHeight+.08,t)+(r()-.5)*.34*envelope,z+(r()-.5)*.45*envelope));
    }
    const stroke = (lineWidth, colour) => { ctx.beginPath(); points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)); ctx.lineWidth=lineWidth; ctx.strokeStyle=colour; ctx.stroke(); };
    ctx.save(); ctx.globalCompositeOperation='lighter'; stroke(9,`rgba(74,176,255,${strength*.07})`); stroke(4,`rgba(153,222,255,${strength*.28})`); stroke(1.4,`rgba(255,255,255,${strength*.92})`); ctx.restore();
  }

  function drawSparks(ctx, elapsed) {
    const strength = runtime.symptoms.sparks;
    if (strength < .02) return;
    const cam = camera(), count = Math.round(4 + quality.banks*.3*strength);
    ctx.save(); ctx.globalCompositeOperation='lighter';
    for (let i=0;i<count;i++) {
      const r = rng(hash(`${terminalNumber}:spark:${i}`));
      const z=mix(2.7,7.5,r()), x=mix(-cam.halfWidth,cam.halfWidth,r()), cycle=mod(elapsed*mix(.25,.7,r())+r()*8,1), y=-cam.halfHeight+cycle*mix(.35,1.25,r());
      const p=cam.project(x,y,z); ctx.fillStyle=`rgba(255,${Math.round(120+r()*100)},80,${strength*(1-cycle)*.75})`; ctx.fillRect(p.x,p.y,1.2,1.2);
    }
    ctx.restore();
  }

  function drawEntryFaults(ctx, elapsed) {
    const ghost=runtime.symptoms.ghost, slip=runtime.symptoms.slip+runtime.symptoms.collapse*.55;
    if (ghost < .02 && slip < .02) return;
    ctx.save(); ctx.lineWidth=1;
    document.querySelectorAll('#feed .entry:not(.panel)').forEach((node,index) => {
      const rect=node.getBoundingClientRect(); if (rect.bottom<0 || rect.top>height) return;
      const dx=Math.sin(elapsed*1.8+index)*slip*18, dy=Math.cos(elapsed*1.3+index)*slip*5;
      if (ghost>.02) { ctx.strokeStyle=`rgba(130,210,255,${ghost*.11})`; ctx.strokeRect(rect.left+ghost*10,rect.top,rect.width,rect.height); ctx.strokeStyle=`rgba(255,70,46,${ghost*.10})`; ctx.strokeRect(rect.left-ghost*7,rect.top,rect.width,rect.height); }
      if (slip>.025) { ctx.strokeStyle=`rgba(255,70,46,${slip*.25})`; ctx.strokeRect(rect.left+dx,rect.top+dy,rect.width,rect.height); }
    });
    ctx.restore();
  }

  function drawOverlays(ctx) {
    const bloom=runtime.symptoms.bloom;
    if (bloom>.015) {
      const gradient=ctx.createRadialGradient(width*.5,height*.48,0,width*.5,height*.48,Math.max(width,height)*.78);
      gradient.addColorStop(0,`rgba(255,142,86,${bloom*.095})`); gradient.addColorStop(.42,`rgba(255,55,38,${bloom*.052})`); gradient.addColorStop(1,'rgba(255,40,30,0)');
      ctx.fillStyle=gradient; ctx.fillRect(0,0,width,height);
    }
    const darkness=runtime.symptoms.brownout*.64+runtime.symptoms.collapse*.18;
    if (darkness>.01) { ctx.fillStyle=`rgba(0,0,0,${clamp01(darkness)})`; ctx.fillRect(0,0,width,height); }
  }

  function documentEffects() {
    const style=document.documentElement.style;
    style.setProperty('--terminal-card-brightness',String(clamp(1-runtime.symptoms.brownout*.54+runtime.symptoms.bloom*.12,.28,1.18)));
    style.setProperty('--terminal-ghost-strength',runtime.symptoms.ghost.toFixed(3));
    style.setProperty('--terminal-bloom-strength',runtime.symptoms.bloom.toFixed(3));
  }

  function updatePanel() {
    if (!panel) return;
    const status=runtime.latched?runtime.latchType:!browsing?'CASCADE SUPPRESSED — INTERFACE ACTIVE':performance.now()<eligibleAt?'BROWSING GRACE PERIOD':runtime.phase.toUpperCase();
    panel.querySelector('#terminal-environment-state').textContent=status;
    panel.classList.toggle('fault',runtime.latched); panel.classList.toggle('hard-fault',runtime.resetRequired);
    panel.querySelector('#terminal-environment-recalibrate').disabled=!runtime.latched||runtime.resetRequired;
    panel.querySelector('#terminal-environment-reset').disabled=!runtime.latched&&runtime.phase===PHASE.DORMANT;
    panel.querySelector('#terminal-environment-readout').textContent=`${profile.weatherType==='floorMist'?'FLOOR MIST':'CEILING SMOKE'} · DENS ${Math.round(profile.density*100)} · CHG ${Math.round(profile.charge*100)} · USE ${Math.round(runtime.usability*100)} · ${quality.name}`;
  }

  function frame(now) {
    raf=0; if (!enabled || hidden) return;
    const fault=runtime.phase!==PHASE.DORMANT||runtime.latched, fps=fault?quality.faultFps:quality.ambientFps;
    if (now-lastFrame<1000/fps) { raf=requestAnimationFrame(frame); return; }
    const dt=clamp((now-(lastStep||now))/1000,0,.1); lastStep=now; lastFrame=now; runtime.accumulator+=dt;
    while (runtime.accumulator>=STEP) { simulationStep(STEP,now); runtime.accumulator-=STEP; }
    rearCtx.clearRect(0,0,width,height); frontCtx.clearRect(0,0,width,height);
    const elapsed=now/1000; drawMist(rearCtx,elapsed,false); drawMist(frontCtx,elapsed,true); drawEntryFaults(frontCtx,elapsed); drawSparks(frontCtx,elapsed); drawArc(frontCtx,elapsed); drawOverlays(frontCtx);
    documentEffects(); updatePanel(); raf=requestAnimationFrame(frame);
  }

  function interactionChanged(event) {
    if (event?.target?.closest?.('.terminal-environment-controls')) uiBusyUntil=performance.now()+1800;
    requestAnimationFrame(()=>updateGate(performance.now(),true));
  }
  function visibilityChanged() { hidden=document.hidden; if (!hidden&&enabled&&!raf) { lastStep=performance.now(); raf=requestAnimationFrame(frame); } }
  function addListeners() { addEventListener('resize',resize,{passive:true}); document.addEventListener('focusin',interactionChanged,true); document.addEventListener('focusout',interactionChanged,true); document.addEventListener('input',interactionChanged,true); document.addEventListener('click',interactionChanged,true); document.addEventListener('visibilitychange',visibilityChanged); }
  function removeListeners() { removeEventListener('resize',resize); document.removeEventListener('focusin',interactionChanged,true); document.removeEventListener('focusout',interactionChanged,true); document.removeEventListener('input',interactionChanged,true); document.removeEventListener('click',interactionChanged,true); document.removeEventListener('visibilitychange',visibilityChanged); }

  function mount() {
    const rear=layer('terminal-environment-rear','terminal-environment-rear-canvas'); rearRoot=rear.root; rearCanvas=rear.canvas; rearCtx=rear.ctx;
    const front=layer('terminal-environment-front','terminal-environment-front-canvas'); frontRoot=front.root; frontCanvas=front.canvas; frontCtx=front.ctx;
    panel=makePanel(); buildAtmosphere(); resize(); addListeners();
  }
  function unmount() {
    if (raf) cancelAnimationFrame(raf); raf=0; removeListeners(); rearRoot?.remove(); frontRoot?.remove(); panel?.remove();
    rearRoot=frontRoot=rearCanvas=frontCanvas=rearCtx=frontCtx=panel=null;
    const style=document.documentElement.style; style.removeProperty('--terminal-card-brightness'); style.removeProperty('--terminal-ghost-strength'); style.removeProperty('--terminal-bloom-strength');
  }

  function enable() {
    if (enabled) return; enabled=true;
    const chamber=window.LayeredChamber; previousChamberMode=chamber?.getMode?.()||'off';
    if (chamber?.setMode&&chamber.MODES?.BACKGROUND) chamber.setMode(chamber.MODES.BACKGROUND,{persist:false,restartAnimation:true});
    document.documentElement.classList.add('terminal-environment-mode'); toggleButton?.setAttribute('aria-pressed','true'); if (toggleButton) toggleButton.textContent='Terminal FX On';
    runtime=freshRuntime(); random=sessionRng(terminalNumber); mount();
    const now=performance.now(); browsing=browsingState(now); eligibleAt=now+GRACE_MS; schedule(eligibleAt); lastFrame=lastStep=now; raf=requestAnimationFrame(frame);
  }
  function disable() {
    if (!enabled) return; enabled=false; document.documentElement.classList.remove('terminal-environment-mode'); toggleButton?.setAttribute('aria-pressed','false'); if (toggleButton) toggleButton.textContent='Terminal FX Off';
    unmount(); const chamber=window.LayeredChamber;
    if (chamber?.setMode&&previousChamberMode&&previousChamberMode!==chamber.getMode?.()) chamber.setMode(previousChamberMode,{persist:false,restartAnimation:false});
    previousChamberMode=null;
  }
  const toggle = () => enabled ? disable() : enable();

  function loadTerminal(value) {
    terminalNumber=String(value||'').trim().toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,32)||DEFAULT_TERMINAL;
    storageSet(STORAGE_KEY,terminalNumber); profile=makeProfile(terminalNumber); random=sessionRng(terminalNumber); runtime=freshRuntime(); buildAtmosphere();
    if (panel) panel.querySelector('#terminal-environment-number').value=terminalNumber;
    const now=performance.now(); eligibleAt=now+GRACE_MS; schedule(eligibleAt); updatePanel();
    window.dispatchEvent(new CustomEvent('ncn:terminal-environment-change',{detail:{number:terminalNumber,profile}})); return profile;
  }
  function forceCascade() { if (!enabled||runtime.latched) return false; browsing=true; eligibleAt=0; return startIncident(performance.now(),true); }
  function recalibrate() { if (!enabled||!runtime.latched||runtime.resetRequired) return false; runtime=freshRuntime(); const now=performance.now(); browsing=browsingState(now); eligibleAt=now+GRACE_MS; schedule(eligibleAt); return true; }
  function hardReset() { if (!enabled) return false; runtime=freshRuntime(); random=sessionRng(terminalNumber); const now=performance.now(); browsing=browsingState(now); eligibleAt=now+GRACE_MS; schedule(eligibleAt); window.LayeredChamber?.restart?.(); return true; }

  function init() {
    toggleButton=document.querySelector('#terminal-environment-toggle');
    toggleButton?.addEventListener('click',toggle); toggleButton?.setAttribute('aria-pressed','false'); if (toggleButton) toggleButton.textContent='Terminal FX Off';
  }

  window.TerminalEnvironmentMode=Object.freeze({
    enable, disable, toggle, isEnabled:()=>enabled, loadTerminal, getTerminalNumber:()=>terminalNumber,
    getProfile:()=>profile, getRuntime:()=>JSON.parse(JSON.stringify(runtime)), forceCascade, recalibrate, hardReset, PHASE, EVENT
  });
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
