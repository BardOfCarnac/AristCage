/*==================================================
  NCN VIEWER LIFECYCLE

  Governs machine state and effect authority. It does not render anything;
  renderers and environmental modules respond to its events.
==================================================*/

window.NCNViewerLifecycle = (() => {
  const STATES = Object.freeze({
    BOOTING: "booting",
    READY: "ready",
    READING: "reading",
    INTERACTING: "interacting",
    REALIGNING: "realigning",
    RESETTING: "resetting",
    DEGRADED: "degraded",
    SUSPENDED: "suspended",
    SLEEPING: "sleeping",
    DESTROYED: "destroyed"
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
  let stateBeforeSleep = STATES.READY;
  let destroyed = false;

  function snapshot() {
    return Object.freeze({
      state,
      stateSince,
      destroyed,
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
    if (destroyed && next !== STATES.DESTROYED && detail.force !== true) return false;
    if (next === state && detail.force !== true) return false;
    const previous = state;
    state = next;
    stateSince = performance.now();
    announce(previous, next, detail);
    window.NCNViewerRuntime?.wake?.(`lifecycle:${previous}->${next}`);
    return true;
  }

  function acquire(name, owner, priority = PRIORITY.ambient) {
    if (destroyed) return null;
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

  function releaseOwner(owner) {
    let released = 0;
    locks.forEach((lock, name) => {
      if (lock.owner !== owner) return;
      locks.delete(name);
      released += 1;
    });
    return released;
  }

  function clearLocks() {
    const count = locks.size;
    locks.clear();
    return count;
  }

  function isLocked(name, requesterPriority = PRIORITY.ambient) {
    const lock = locks.get(name);
    return Boolean(lock && lock.priority > requesterPriority);
  }

  function allows(kind, priority = PRIORITY.ambient) {
    if (destroyed || document.hidden || [STATES.SLEEPING, STATES.SUSPENDED, STATES.DESTROYED].includes(state)) {
      return false;
    }
    if (kind === "ambient") {
      return ![
        STATES.BOOTING,
        STATES.READING,
        STATES.INTERACTING,
        STATES.REALIGNING,
        STATES.RESETTING,
        STATES.DEGRADED
      ].includes(state) && !isLocked("ambient", priority);
    }
    if (kind === "minor-effect") {
      return ![STATES.REALIGNING, STATES.RESETTING, STATES.DEGRADED].includes(state)
        && !isLocked("effects", priority);
    }
    if (kind === "interaction") {
      return ![STATES.REALIGNING, STATES.RESETTING, STATES.DESTROYED].includes(state);
    }
    return true;
  }

  function noteInteraction(reason = "user") {
    if ([
      STATES.READING,
      STATES.REALIGNING,
      STATES.RESETTING,
      STATES.DEGRADED,
      STATES.SUSPENDED,
      STATES.SLEEPING,
      STATES.DESTROYED
    ].includes(state)) return;
    window.clearTimeout(interactionTimer);
    transition(STATES.INTERACTING, { reason });
    interactionTimer = window.setTimeout(() => {
      if (state === STATES.INTERACTING) transition(STATES.READY, { reason: "interaction-settled" });
    }, 520);
  }

  function handlePointer() {
    noteInteraction("pointer");
  }

  function handleKeyboard() {
    noteInteraction("keyboard");
  }

  function handleVisibility() {
    if (document.hidden) {
      if (![STATES.SLEEPING, STATES.DESTROYED].includes(state)) stateBeforeSleep = state;
      transition(STATES.SLEEPING, { reason: "document-hidden" });
      return;
    }
    const next = [STATES.BOOTING, STATES.RESETTING, STATES.DESTROYED].includes(stateBeforeSleep)
      ? STATES.READY
      : stateBeforeSleep;
    transition(next, { reason: "document-visible", force: true });
  }

  function reset(reason = "host-reset") {
    window.clearTimeout(interactionTimer);
    interactionTimer = 0;
    clearLocks();
    return transition(STATES.RESETTING, { reason, force: true });
  }

  function destroy(reason = "host-destroy") {
    if (destroyed) return false;
    destroyed = true;
    window.clearTimeout(interactionTimer);
    interactionTimer = 0;
    clearLocks();
    document.removeEventListener("pointerdown", handlePointer, true);
    document.removeEventListener("keydown", handleKeyboard, true);
    document.removeEventListener("visibilitychange", handleVisibility);
    transition(STATES.DESTROYED, { reason, force: true });
    listeners.clear();
    return true;
  }

  document.addEventListener("pointerdown", handlePointer, { passive: true, capture: true });
  document.addEventListener("keydown", handleKeyboard, { capture: true });
  document.addEventListener("visibilitychange", handleVisibility);
  document.documentElement.dataset.viewerState = state;

  return Object.freeze({
    STATES,
    PRIORITY,
    transition,
    acquire,
    releaseOwner,
    clearLocks,
    isLocked,
    allows,
    noteInteraction,
    reset,
    destroy,
    snapshot,
    current: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });
})();
