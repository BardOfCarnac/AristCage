/*==================================================
  NCN CHAMBER MOTION

  Optional physical chamber behaviour. It sleeps between scheduled events and
  is visible only while RedWire's Filter or Submit panel is open.
==================================================*/

window.NCNChamberMotion = (() => {
  const runtime = window.NCNViewerRuntime;
  const lifecycle = window.NCNViewerLifecycle;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const MOTION_PANELS = new Set(["filter", "submit"]);

  const state = {
    enabled: false,
    active: false,
    startedAt: 0,
    duration: 2600,
    side: 1,
    row: 0,
    lock: null
  };

  let block = null;
  let ambientTimer = 0;

  const clamp01 = value => Math.max(0, Math.min(1, value));
  const easeInOut = value => {
    const n = clamp01(value);
    return n < 0.5 ? 4 * n * n * n : 1 - Math.pow(-2 * n + 2, 3) / 2;
  };

  function panelAllowsMotion() {
    if (typeof NCN_STATE === "undefined") return false;
    return NCN_STATE.activeApp === "redwire"
      && MOTION_PANELS.has(NCN_STATE.activePanel);
  }

  function camera() {
    return window.LayeredChamber?.getCameraSnapshot?.()
      || window.NCNChamberCamera?.snapshot?.()
      || null;
  }

  function ensureBlock() {
    if (block?.isConnected) return block;
    block = document.createElement("div");
    block.className = "ncn-chamber-block";
    block.setAttribute("aria-hidden", "true");
    block.innerHTML = '<i class="ncn-chamber-block-grid"></i><i class="ncn-chamber-block-edge"></i>';
    window.NCNEnvironmentHost.root().append(block);
    return block;
  }

  function position() {
    ensureBlock();
    const cameraSnapshot = camera();
    if (!cameraSnapshot) return;

    const zNear = 3.25;
    const zFar = 4.35;
    const side = state.side;
    const x = side * cameraSnapshot.finalHalfWidth;
    const yTop = cameraSnapshot.halfHeight * 0.55 - state.row * cameraSnapshot.cell;
    const yBottom = yTop - cameraSnapshot.cell * 1.9;
    const points = [
      cameraSnapshot.project(x, yTop, zNear),
      cameraSnapshot.project(x, yTop, zFar),
      cameraSnapshot.project(x, yBottom, zFar),
      cameraSnapshot.project(x, yBottom, zNear)
    ];
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const right = Math.max(...xs);
    const bottom = Math.max(...ys);
    const polygon = points.map(point => (
      `${(point.x - left).toFixed(2)}px ${(point.y - top).toFixed(2)}px`
    )).join(", ");

    block.style.left = `${left}px`;
    block.style.top = `${top}px`;
    block.style.width = `${Math.max(12, right - left)}px`;
    block.style.height = `${Math.max(34, bottom - top)}px`;
    block.style.clipPath = `polygon(${polygon})`;
    block.style.setProperty("--block-origin-x", side < 0 ? "100%" : "0%");
  }

  function clearTimer() {
    window.clearTimeout(ambientTimer);
    ambientTimer = 0;
  }

  function scheduleNext(initial = false) {
    clearTimer();
    if (!state.enabled || reduceMotion.matches || !panelAllowsMotion()) return;
    const delay = initial
      ? 650 + Math.random() * 650
      : 4200 + Math.random() * 4600;
    ambientTimer = window.setTimeout(() => {
      ambientTimer = 0;
      if (!move()) scheduleNext(false);
    }, delay);
  }

  function stop(options = {}) {
    const wasActive = state.active;
    state.active = false;
    state.lock?.release();
    state.lock = null;
    block?.classList.remove("is-moving");
    block?.style.removeProperty("transform");
    runtimeHandle?.disable?.();
    if (options.reschedule !== false && panelAllowsMotion()) scheduleNext(false);
    return wasActive;
  }

  function move(options = {}) {
    const forced = options.force === true;
    if (!panelAllowsMotion()) return false;
    if (!state.enabled && !forced) return false;
    if (state.active || (!forced && !lifecycle?.allows?.("ambient"))) return false;

    ensureBlock();
    state.active = true;
    state.startedAt = performance.now();
    state.duration = Math.max(1200, Number(options.duration) || 2600);
    state.side = options.side === -1 ? -1
      : options.side === 1 ? 1
        : (Math.random() < 0.5 ? -1 : 1);
    state.row = Number.isFinite(options.row) ? options.row : Math.floor(Math.random() * 3) - 1;
    state.lock = lifecycle?.acquire?.("chamber-block", "chamber-motion", lifecycle.PRIORITY.ambient);
    position();
    block.classList.add("is-moving");
    runtimeHandle?.enable?.("chamber-block");
    return true;
  }

  function update(frame) {
    if (!state.active || !block) return false;
    if (!panelAllowsMotion()) {
      stop({ reschedule: false });
      return false;
    }

    const progress = clamp01((frame.now - state.startedAt) / state.duration);
    const out = easeInOut(clamp01(progress / 0.33));
    const hold = progress > 0.33 && progress < 0.68 ? 1 : 0;
    const back = easeInOut(clamp01((progress - 0.68) / 0.32));
    const travel = hold ? 1 : progress < 0.33 ? out : 1 - back;
    const offsetX = state.side * travel * 34;
    const offsetY = travel * -3;
    const rotation = state.side * travel * 14;
    block.style.transform = `translate3d(${offsetX.toFixed(3)}px, ${offsetY.toFixed(3)}px, 0) rotateY(${rotation.toFixed(3)}deg)`;

    if (progress >= 1) {
      stop({ reschedule: true });
      return false;
    }
    return true;
  }

  const runtimeHandle = runtime?.register?.("chamber-motion", update, {
    priority: 30,
    maxFps: 30,
    enabled: false,
    wake: false
  });

  function configure(profile = {}) {
    state.enabled = Boolean(profile.enabled) && !reduceMotion.matches;
    ensureBlock();
    block.classList.toggle("is-profile-enabled", state.enabled);
    if (!state.enabled) {
      clearTimer();
      stop({ reschedule: false });
      block.classList.remove("is-moving");
      return;
    }
    scheduleNext(true);
  }

  function handlePanelChange() {
    clearTimer();
    if (!state.enabled || !panelAllowsMotion()) {
      stop({ reschedule: false });
      return;
    }
    scheduleNext(true);
  }

  window.addEventListener("resize", position, { passive: true });
  window.addEventListener("ncn:chamber-camera-change", position);
  window.addEventListener("ncn:panel-change", handlePanelChange);
  window.addEventListener("ncn:application-change", handlePanelChange);
  window.addEventListener("ncn:lifecycle-change", event => {
    if ([lifecycle.STATES.INTERACTING, lifecycle.STATES.REALIGNING].includes(event.detail?.next)) {
      stop({ reschedule: false });
    }
    if (event.detail?.next === lifecycle.STATES.READY && panelAllowsMotion()) {
      scheduleNext(true);
    }
  });
  reduceMotion.addEventListener?.("change", event => {
    if (event.matches) configure({ enabled: false });
  });

  return Object.freeze({
    configure,
    move,
    stop,
    disable: () => configure({ enabled: false }),
    snapshot: () => Object.freeze({
      enabled: state.enabled,
      active: state.active,
      panelEligible: panelAllowsMotion(),
      side: state.side,
      row: state.row
    })
  });
})();
