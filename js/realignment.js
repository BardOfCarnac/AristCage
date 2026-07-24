/*==================================================
  NCN TERMINAL REALIGNMENT

  Shared machine transition. It operates on the chamber shell and any modules
  currently mounted in the environment host, but owns no application profile.
==================================================*/

window.NCNRealignment = (() => {
  const lifecycle = window.NCNViewerLifecycle;
  const runtime = window.NCNViewerRuntime;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const state = {
    active: false,
    startedAt: 0,
    duration: 1280,
    magnitude: 1,
    reason: "manual",
    energyInjected: false,
    lockAmbient: null,
    lockEffects: null,
    resolvePromise: null
  };

  const clamp01 = value => Math.max(0, Math.min(1, value));
  const easeInOut = value => {
    const n = clamp01(value);
    return n < 0.5 ? 4 * n * n * n : 1 - Math.pow(-2 * n + 2, 3) / 2;
  };

  function sample(now) {
    const progress = clamp01((now - state.startedAt) / state.duration);
    const envelope = Math.sin(progress * Math.PI);
    const settle = 1 - easeInOut(progress);
    const tremor = Math.sin(progress * Math.PI * 7) * envelope;
    const x = (Math.sin(progress * Math.PI * 2.2) * 7 + tremor * 1.8)
      * envelope * state.magnitude * settle;
    const y = (Math.sin(progress * Math.PI * 3.1 + 0.7) * 4 + tremor)
      * envelope * state.magnitude * settle;
    const rotation = Math.sin(progress * Math.PI * 2.6 - 0.5) * 0.24
      * envelope * state.magnitude * settle;
    const scale = 1 + envelope * 0.006 * state.magnitude;
    return { progress, x, y, rotation, scale };
  }

  function apply(current) {
    const style = document.documentElement.style;
    style.setProperty("--ncn-align-x", `${current.x.toFixed(3)}px`);
    style.setProperty("--ncn-align-y", `${current.y.toFixed(3)}px`);
    style.setProperty("--ncn-align-rotation", `${current.rotation.toFixed(4)}deg`);
    style.setProperty("--ncn-align-scale", current.scale.toFixed(6));
    style.setProperty("--ncn-align-progress", current.progress.toFixed(4));
    style.setProperty("--ncn-align-brightness", (1 + Math.sin(current.progress * Math.PI) * 0.15).toFixed(4));
  }

  function clear() {
    const style = document.documentElement.style;
    [
      "--ncn-align-x",
      "--ncn-align-y",
      "--ncn-align-rotation",
      "--ncn-align-scale",
      "--ncn-align-progress",
      "--ncn-align-brightness"
    ].forEach(property => style.removeProperty(property));
    document.documentElement.classList.remove("viewer-realigning");
  }

  function finish() {
    if (!state.active) return;
    state.active = false;
    clear();
    state.lockAmbient?.release();
    state.lockEffects?.release();
    state.lockAmbient = null;
    state.lockEffects = null;
    lifecycle?.transition?.(lifecycle.STATES.READY, {
      reason: "realignment-complete",
      source: state.reason
    });
    window.OpticalProjection?.refresh?.();
    window.dispatchEvent(new CustomEvent("ncn:realignment-complete", {
      detail: { reason: state.reason }
    }));
    const resolvePromise = state.resolvePromise;
    state.resolvePromise = null;
    resolvePromise?.(true);
  }

  function update(context) {
    if (!state.active) return false;
    const current = sample(context.now);
    apply(current);

    if (!state.energyInjected && current.progress > 0.34) {
      state.energyInjected = true;
      window.LayeredChamber?.injectEnergy?.(0.18, 0.58);
    }

    if (current.progress >= 1) {
      finish();
      return false;
    }
    return true;
  }

  const runtimeHandle = runtime?.register?.("terminal-realignment", update, {
    priority: 90,
    maxFps: 60,
    enabled: false,
    wake: false
  });

  function run(reason = "manual", options = {}) {
    if (state.active) return Promise.resolve(false);
    if (reduceMotion.matches && options.force !== true) {
      window.OpticalProjection?.refresh?.();
      return Promise.resolve(false);
    }

    state.active = true;
    state.startedAt = performance.now();
    state.duration = Math.max(520, Number(options.duration) || 1280);
    state.magnitude = Math.max(0.25, Math.min(1.8, Number(options.magnitude) || 1));
    state.reason = reason;
    state.energyInjected = false;
    state.lockAmbient = lifecycle?.acquire?.("ambient", "realignment", lifecycle.PRIORITY.transition);
    state.lockEffects = lifecycle?.acquire?.("effects", "realignment", lifecycle.PRIORITY.transition);

    lifecycle?.transition?.(lifecycle.STATES.REALIGNING, { reason });
    document.documentElement.classList.add("viewer-realigning");
    window.dispatchEvent(new CustomEvent("ncn:realignment-start", { detail: { reason } }));
    runtimeHandle?.enable?.(`realignment:${reason}`);

    return new Promise(resolvePromise => {
      state.resolvePromise = result => {
        runtimeHandle?.disable?.();
        resolvePromise(result);
      };
    });
  }

  return Object.freeze({
    run,
    isActive: () => state.active,
    snapshot: () => Object.freeze({
      active: state.active,
      reason: state.reason,
      duration: state.duration,
      magnitude: state.magnitude
    })
  });
})();
