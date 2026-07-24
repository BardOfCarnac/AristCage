/*==================================================
  NCN SHARED VISUAL RUNTIME

  One scheduler for machine-level and environmental work. Tasks may declare
  their own maximum frame rate; the runtime sleeps between due frames rather
  than keeping a permanent 60fps loop alive.
==================================================*/

window.NCNViewerRuntime = (() => {
  const tasks = new Map();
  const listeners = new Set();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let frameId = 0;
  let timerId = 0;
  let frameNumber = 0;
  let startedAt = performance.now();
  let quality = reduceMotion.matches ? "reduced" : "full";
  let wakeReason = "boot";
  let running = false;

  function orderedTasks() {
    return [...tasks.values()].sort((a, b) => b.priority - a.priority);
  }

  function snapshot() {
    return Object.freeze({
      running,
      quality,
      frame: frameNumber,
      taskCount: tasks.size,
      activeTaskCount: [...tasks.values()].filter(task => task.enabled && task.active).length,
      wakeReason,
      hidden: document.hidden
    });
  }

  function announce(type, detail = {}) {
    const payload = Object.freeze({ type, ...detail, runtime: snapshot() });
    listeners.forEach(listener => {
      try { listener(payload); } catch (error) { console.error(error); }
    });
    window.dispatchEvent(new CustomEvent(`ncn:runtime-${type}`, { detail: payload }));
  }

  function clearScheduledFrame() {
    if (frameId) cancelAnimationFrame(frameId);
    if (timerId) window.clearTimeout(timerId);
    frameId = 0;
    timerId = 0;
  }

  function requestTick(delay = 0) {
    if (document.hidden || frameId || timerId) return;
    if (delay > 18) {
      timerId = window.setTimeout(() => {
        timerId = 0;
        if (!document.hidden && !frameId) frameId = requestAnimationFrame(tick);
      }, Math.max(0, delay - 8));
      return;
    }
    frameId = requestAnimationFrame(tick);
  }

  function schedule(reason = "invalidate") {
    wakeReason = reason;
    if (timerId) {
      window.clearTimeout(timerId);
      timerId = 0;
    }
    requestTick(0);
  }

  function nextDelay(now) {
    const active = [...tasks.values()].filter(task => task.enabled && task.active);
    if (!active.length) return null;
    const nextDue = Math.min(...active.map(task => task.nextRunAt));
    return Math.max(0, nextDue - now);
  }

  function tick(now) {
    frameId = 0;
    if (document.hidden) {
      running = false;
      return;
    }

    running = true;
    frameNumber += 1;

    for (const task of orderedTasks()) {
      if (!task.enabled || !task.active || now + 0.5 < task.nextRunAt) continue;

      const delta = Math.min(250, task.lastRunAt ? now - task.lastRunAt : task.interval);
      task.lastRunAt = now;

      const context = Object.freeze({
        now,
        delta,
        elapsed: now - startedAt,
        frame: frameNumber,
        quality,
        reducedMotion: quality === "reduced",
        wakeReason,
        task: task.name
      });

      try {
        task.active = task.callback(context) === true;
        task.nextRunAt = task.active ? now + task.interval : Number.POSITIVE_INFINITY;
      } catch (error) {
        task.enabled = false;
        task.active = false;
        console.error(`[NCN runtime] disabled task ${task.name}`, error);
        announce("error", { task: task.name, error });
      }
    }

    const delay = nextDelay(now);
    if (delay === null) {
      running = false;
      announce("idle", { reason: wakeReason });
      return;
    }
    requestTick(delay);
  }

  function register(name, callback, options = {}) {
    if (!name || typeof callback !== "function") {
      throw new TypeError("Runtime tasks require a name and callback.");
    }

    const maxFps = Math.max(1, Math.min(60, Number(options.maxFps) || 60));
    const task = {
      name,
      callback,
      priority: Number(options.priority) || 0,
      enabled: options.enabled !== false,
      active: options.enabled !== false,
      interval: 1000 / maxFps,
      nextRunAt: 0,
      lastRunAt: 0
    };

    tasks.set(name, task);
    if (task.enabled && options.wake !== false) schedule(`register:${name}`);

    return Object.freeze({
      wake(reason) {
        if (!task.enabled) return;
        task.active = true;
        task.nextRunAt = 0;
        schedule(reason || `task:${name}`);
      },
      enable(reason) {
        task.enabled = true;
        task.active = true;
        task.nextRunAt = 0;
        schedule(reason || `enable:${name}`);
      },
      disable() {
        task.enabled = false;
        task.active = false;
        task.nextRunAt = Number.POSITIVE_INFINITY;
      },
      setMaxFps(value) {
        const fps = Math.max(1, Math.min(60, Number(value) || 60));
        task.interval = 1000 / fps;
        if (task.enabled) schedule(`fps:${name}`);
      },
      unregister() {
        tasks.delete(name);
      }
    });
  }

  function setQuality(next) {
    if (!new Set(["full", "reduced"]).has(next) || next === quality) return;
    quality = next;
    announce("quality-change", { quality });
    [...tasks.values()].forEach(task => {
      if (task.enabled) {
        task.active = true;
        task.nextRunAt = 0;
      }
    });
    schedule("quality-change");
  }

  function handleVisibility() {
    clearScheduledFrame();
    if (document.hidden) {
      running = false;
      announce("pause", { reason: "document-hidden" });
      return;
    }

    startedAt = performance.now();
    [...tasks.values()].forEach(task => {
      if (task.enabled) {
        task.active = true;
        task.nextRunAt = 0;
        task.lastRunAt = 0;
      }
    });
    announce("resume", { reason: "document-visible" });
    schedule("document-visible");
  }

  document.addEventListener("visibilitychange", handleVisibility);
  reduceMotion.addEventListener?.("change", event => {
    setQuality(event.matches ? "reduced" : "full");
  });

  return Object.freeze({
    register,
    wake: schedule,
    setQuality,
    getQuality: () => quality,
    snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });
})();
