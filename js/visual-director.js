/*==================================================
  NCN VISUAL DIRECTOR

  Non-rendering arbitration for boot, reading, weather, chamber movement and
  faults. It decides how much visual authority is available; modules still own
  their own implementation and must request effects through their public APIs.
==================================================*/

window.NCNVisualDirector = (() => {
  const contract = window.NCNIntegrationContract || {};
  const lifecycle = window.NCNViewerLifecycle;
  const events = window.NCNEvents;

  const MODES = Object.freeze({
    CALM: "calm",
    BOOTING: "booting",
    AMBIENT: "ambient",
    READING: "reading",
    DISTURBED: "disturbed",
    FAULT: "fault",
    CRITICAL: "critical"
  });

  const CHANNELS = Object.freeze(Object.values(contract.VISUAL_CHANNELS || {
    BOOT: "boot",
    INTERFACE: "interface",
    ARTICLE: "article",
    ENVIRONMENT: "environment",
    CHAMBER: "chamber",
    FAULT: "fault"
  }));

  const POLICY = Object.freeze({
    [MODES.CALM]: Object.freeze({ boot: 0, interface: 1, article: 1, environment: 0, chamber: 0, fault: 0 }),
    [MODES.BOOTING]: Object.freeze({ boot: 1, interface: 0.45, article: 0, environment: 0.18, chamber: 0.12, fault: 0.2 }),
    [MODES.AMBIENT]: Object.freeze({ boot: 0, interface: 1, article: 1, environment: 1, chamber: 0.72, fault: 0.58 }),
    [MODES.READING]: Object.freeze({ boot: 0, interface: 1, article: 1, environment: 0.24, chamber: 0, fault: 0.12 }),
    [MODES.DISTURBED]: Object.freeze({ boot: 0, interface: 0.82, article: 0.68, environment: 0.54, chamber: 1, fault: 0.42 }),
    [MODES.FAULT]: Object.freeze({ boot: 0, interface: 0.72, article: 0.54, environment: 0.4, chamber: 0.28, fault: 1 }),
    [MODES.CRITICAL]: Object.freeze({ boot: 0, interface: 0.62, article: 0, environment: 0.2, chamber: 0, fault: 1 })
  });

  const claims = new Map();
  const holds = new Map();
  const listeners = new Set();
  let sequence = 0;
  let suspended = false;
  let destroyed = false;
  let unsubscribeLifecycle = null;

  const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));

  function assertChannel(channel) {
    const key = String(channel || "").trim();
    if (!CHANNELS.includes(key)) throw new RangeError(`Unknown visual channel: ${channel}`);
    return key;
  }

  function assertMode(mode) {
    const key = String(mode || "").trim();
    if (!Object.values(MODES).includes(key)) throw new RangeError(`Unknown visual mode: ${mode}`);
    return key;
  }

  function activeView() {
    const app = window.NCNApplications?.current?.()
      || (typeof NCN_STATE !== "undefined" ? NCN_STATE.activeApp : "redwire");
    return app === "dripfeed" ? window.NCNDripfeed : window.NCNOptical;
  }

  function readingActive() {
    const adapter = activeView();
    if (typeof adapter?.isReading === "function") return Boolean(adapter.isReading());
    return Boolean(adapter?.getReadingZone?.());
  }

  function strongestHold() {
    return [...holds.values()].sort((a, b) => b.priority - a.priority || b.createdAt - a.createdAt)[0] || null;
  }

  function inferredMode() {
    if (destroyed || suspended || document.hidden) return MODES.CALM;
    const held = strongestHold();
    if (held) return held.mode;

    const state = lifecycle?.current?.();
    if (state === lifecycle?.STATES?.BOOTING) return MODES.BOOTING;
    if (state === lifecycle?.STATES?.READING || readingActive()) return MODES.READING;
    if (state === lifecycle?.STATES?.REALIGNING || state === lifecycle?.STATES?.RESETTING) return MODES.DISTURBED;
    if (state === lifecycle?.STATES?.DEGRADED) return MODES.CRITICAL;
    if ([lifecycle?.STATES?.SUSPENDED, lifecycle?.STATES?.SLEEPING, lifecycle?.STATES?.DESTROYED].includes(state)) {
      return MODES.CALM;
    }
    return MODES.AMBIENT;
  }

  function announce(reason = "change", detail = {}) {
    const payload = Object.freeze({ reason, detail, snapshot: snapshot() });
    listeners.forEach(listener => {
      try { listener(payload); } catch (error) { console.error(error); }
    });
    events?.emit?.(contract.EVENTS?.DIRECTOR_CHANGE || "director:change", payload);
    return payload;
  }

  function envelope(channel, options = {}) {
    const key = assertChannel(channel);
    const mode = inferredMode();
    const requested = options.intensity === undefined ? 1 : clamp01(options.intensity);
    const base = POLICY[mode]?.[key] ?? 0;
    const reduced = window.NCNViewerRuntime?.getQuality?.() === "reduced";
    const accessibilityScale = reduced && !["interface", "article"].includes(key) ? 0.35 : 1;
    const intensity = clamp01(base * requested * accessibilityScale);
    return Object.freeze({
      channel: key,
      mode,
      requested,
      base,
      intensity,
      allowed: !destroyed && !suspended && intensity > 0,
      reducedMotion: reduced
    });
  }

  function releaseClaim(id, reason = "release") {
    const claim = claims.get(id);
    if (!claim) return false;
    window.clearTimeout(claim.timer);
    claims.delete(id);
    events?.emit?.(contract.EVENTS?.DIRECTOR_RELEASE || "director:release", {
      id,
      owner: claim.owner,
      channel: claim.channel,
      reason
    });
    announce("claim-release", { id, owner: claim.owner, channel: claim.channel, reason });
    return true;
  }

  function claim(channel, options = {}) {
    const key = assertChannel(channel);
    const owner = String(options.owner || "anonymous").trim();
    const priority = Number(options.priority) || 10;
    const exclusive = options.exclusive === true;
    const currentEnvelope = envelope(key, options);

    const conflicts = [...claims.values()]
      .filter(item => item.channel === key && (item.exclusive || exclusive))
      .sort((a, b) => b.priority - a.priority);
    const blocker = conflicts.find(item => item.priority >= priority);

    if (!currentEnvelope.allowed || blocker) {
      return Object.freeze({
        granted: false,
        owner,
        channel: key,
        intensity: 0,
        reason: blocker ? `blocked-by:${blocker.owner}` : `mode:${currentEnvelope.mode}`,
        release: () => false
      });
    }

    conflicts.filter(item => item.priority < priority).forEach(item => releaseClaim(item.id, `preempted-by:${owner}`));

    const id = `${owner}:${key}:${++sequence}`;
    const record = {
      id,
      owner,
      channel: key,
      priority,
      exclusive,
      intensity: currentEnvelope.intensity,
      createdAt: performance.now(),
      timer: 0
    };
    const duration = Math.max(0, Number(options.duration) || 0);
    if (duration) record.timer = window.setTimeout(() => releaseClaim(id, "duration"), duration);
    claims.set(id, record);
    events?.emit?.(contract.EVENTS?.DIRECTOR_CLAIM || "director:claim", { ...record, timer: undefined });
    announce("claim", { id, owner, channel: key });

    return Object.freeze({
      granted: true,
      id,
      owner,
      channel: key,
      intensity: record.intensity,
      mode: currentEnvelope.mode,
      release: reason => releaseClaim(id, reason)
    });
  }

  function releaseHold(id, reason = "release") {
    const hold = holds.get(id);
    if (!hold) return false;
    window.clearTimeout(hold.timer);
    holds.delete(id);
    announce("hold-release", { id, owner: hold.owner, mode: hold.mode, reason });
    return true;
  }

  function hold(mode, options = {}) {
    const key = assertMode(mode);
    const owner = String(options.owner || "host").trim();
    const priority = Number(options.priority) || 10;
    const id = `${owner}:mode:${++sequence}`;
    const record = { id, owner, mode: key, priority, createdAt: performance.now(), timer: 0 };
    const duration = Math.max(0, Number(options.duration) || 0);
    if (duration) record.timer = window.setTimeout(() => releaseHold(id, "duration"), duration);
    holds.set(id, record);
    announce("hold", { id, owner, mode: key, priority });
    return Object.freeze({ id, owner, mode: key, release: reason => releaseHold(id, reason) });
  }

  function releaseOwner(owner, reason = "owner-release") {
    const key = String(owner);
    let released = 0;
    [...claims.values()].filter(item => item.owner === key).forEach(item => {
      if (releaseClaim(item.id, reason)) released += 1;
    });
    [...holds.values()].filter(item => item.owner === key).forEach(item => {
      if (releaseHold(item.id, reason)) released += 1;
    });
    return released;
  }

  function clear(reason = "clear") {
    [...claims.keys()].forEach(id => releaseClaim(id, reason));
    [...holds.keys()].forEach(id => releaseHold(id, reason));
  }

  function init() {
    if (destroyed) throw new Error("Destroyed visual director cannot be initialised.");
    if (!unsubscribeLifecycle && lifecycle?.subscribe) {
      unsubscribeLifecycle = lifecycle.subscribe(change => announce("lifecycle", change));
    }
    announce("init");
  }

  function suspend(reason = "host") {
    if (suspended || destroyed) return false;
    suspended = true;
    clear(`suspend:${reason}`);
    announce("suspend", { reason });
    return true;
  }

  function resume(reason = "host") {
    if (!suspended || destroyed) return false;
    suspended = false;
    announce("resume", { reason });
    return true;
  }

  function reset(reason = "host-reset") {
    if (destroyed) return false;
    clear(`reset:${reason}`);
    suspended = false;
    announce("reset", { reason });
    return true;
  }

  function destroy(reason = "host-destroy") {
    if (destroyed) return false;
    clear(`destroy:${reason}`);
    unsubscribeLifecycle?.();
    unsubscribeLifecycle = null;
    listeners.clear();
    destroyed = true;
    suspended = true;
    return true;
  }

  function snapshot() {
    const mode = inferredMode();
    return Object.freeze({
      mode,
      suspended,
      destroyed,
      policy: Object.freeze({ ...POLICY[mode] }),
      claims: Object.freeze([...claims.values()].map(item => Object.freeze({
        id: item.id,
        owner: item.owner,
        channel: item.channel,
        priority: item.priority,
        exclusive: item.exclusive,
        intensity: item.intensity
      }))),
      holds: Object.freeze([...holds.values()].map(item => Object.freeze({
        id: item.id,
        owner: item.owner,
        mode: item.mode,
        priority: item.priority
      })))
    });
  }

  return Object.freeze({
    MODES,
    CHANNELS,
    POLICY,
    init,
    envelope,
    claim,
    hold,
    releaseOwner,
    suspend,
    resume,
    reset,
    destroy,
    snapshot,
    currentMode: inferredMode,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });
})();
