/*==================================================
  NCN VIEWER LIFECYCLE

  Governs machine state and effect authority. It does not render anything;
  renderers and environmental modules respond to its events.
==================================================*/

window.NCNViewerLifecycle = (() => {
  const STATES = Object.freeze({
    BOOTING: "booting",
    READY: "ready",
    INTERACTING: "interacting",
    REALIGNING: "realigning",
    DEGRADED: "degraded",
    SLEEPING: "sleeping"
  });

  const PRIORITY = Object.freeze({
    ambient: 10,
    interaction: 40,
    transition: 70,
    fault: 90
  });

  const listeners = new Set();
  const locks = new Map();
  let state = STATES.BOOTING;
  let stateSince = performance.now();
  let interactionTimer = 0;

  function snapshot() {
    return Object.freeze({
      state,
      stateSince,
      locks: Object.freeze([...locks.entries()].map(([name, lock]) => ({ name, ...lock })))
    });
  }

  function announce(previous, next, detail = {}) {
    const payload = Object.freeze({ previous, next, detail, snapshot: snapshot() });
    document.documentElement.dataset.viewerState = next;
    listeners.forEach(listener => {
      try { listener(payload); } catch (error) { console.error(error); }
    });
    window.dispatchEvent(new CustomEvent("ncn:lifecycle-change", { detail: payload }));
  }

  function transition(next, detail = {}) {
    if (!Object.values(STATES).includes(next)) {
      throw new TypeError(`Unknown viewer state: ${next}`);
    }
    if (next === state && detail.force !== true) return false;
    const previous = state;
    state = next;
    stateSince = performance.now();
    announce(previous, next, detail);
    window.NCNViewerRuntime?.wake?.(`lifecycle:${previous}->${next}`);
    return true;
  }

  function acquire(name, owner, priority = PRIORITY.ambient) {
    const current = locks.get(name);
    if (current && current.priority > priority && current.owner !== owner) return null;
    const token = `${owner}:${name}:${Math.random().toString(36).slice(2)}`;
    locks.set(name, { owner, priority, token, acquiredAt: performance.now() });
    return Object.freeze({
      token,
      release() {
        if (locks.get(name)?.token === token) locks.delete(name);
      }
    });
  }

  function isLocked(name, requesterPriority = PRIORITY.ambient) {
    const lock = locks.get(name);
    return Boolean(lock && lock.priority > requesterPriority);
  }

  function allows(kind, priority = PRIORITY.ambient) {
    if (document.hidden || state === STATES.SLEEPING) return false;
    if (kind === "ambient") {
      return ![STATES.BOOTING, STATES.INTERACTING, STATES.REALIGNING, STATES.DEGRADED].includes(state)
        && !isLocked("ambient", priority);
    }
    if (kind === "minor-effect") {
      return ![STATES.REALIGNING, STATES.DEGRADED].includes(state)
        && !isLocked("effects", priority);
    }
    if (kind === "interaction") return state !== STATES.REALIGNING;
    return true;
  }

  function noteInteraction(reason = "user") {
    if ([STATES.REALIGNING, STATES.DEGRADED, STATES.SLEEPING].includes(state)) return;
    window.clearTimeout(interactionTimer);
    transition(STATES.INTERACTING, { reason });
    interactionTimer = window.setTimeout(() => {
      if (state === STATES.INTERACTING) transition(STATES.READY, { reason: "interaction-settled" });
    }, 520);
  }

  document.addEventListener("pointerdown", () => noteInteraction("pointer"), { passive: true, capture: true });
  document.addEventListener("keydown", () => noteInteraction("keyboard"), { capture: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) transition(STATES.SLEEPING, { reason: "document-hidden" });
    else transition(STATES.READY, { reason: "document-visible" });
  });

  document.documentElement.dataset.viewerState = state;

  return Object.freeze({
    STATES,
    PRIORITY,
    transition,
    acquire,
    isLocked,
    allows,
    noteInteraction,
    snapshot,
    current: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });
})();
