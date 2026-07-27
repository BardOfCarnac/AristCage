/*==================================================
  NCN SHARED VISUAL RUNTIME

  One scheduler for machine-level and environmental work. Tasks may declare
  their own maximum frame rate and group. The runtime sleeps between due frames
  and can suspend individual groups without creating competing animation loops.
==================================================*/

window.NCNViewerRuntime = (() => {
  const tasks = new Map();
  const listeners = new Set();
  const suspendedGroups = new Set();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let frameId = 0;
  let timerId = 0;
  let frameNumber = 0;
  let startedAt = performance.now();
  let quality = reduceMotion.matches ? "reduced" : "full";
  let wakeReason = "boot";
  let running = false;
  let suspended = false;
  let destroyed = false;

  function taskEligible(task) {
    return task.enabled
      && task.active
      && !task.suspended
      && !suspendedGroups.has(task.group);
  }

  function orderedTasks() {
    return [...tasks.values()].sort((a, b) => b.priority - a.priority);
  }

  function snapshot() {
    return Object.freeze({
      running,
      suspended,
      destroyed,
      quality,
      frame: frameNumber,
      taskCount: tasks.size,
      activeTaskCount: [...tasks.values()].filter(taskEligible).length,
      suspendedGroups: Object.freeze([...suspendedGroups]),
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
    if (destroyed || suspended || document.hidden || frameId || timerId) return;
    if (delay > 18) {
      timerId = window.setTimeout(() => {
        timerId = 0;
        if (!destroyed && !suspended && !document.hidden && !frameId) {
          frameId = requestAnimationFrame(tick);
        }
      }, Math.max(0, delay - 8));
      return;
    }
    frameId = requestAnimationFrame(tick);
  }

  function schedule(reason = "invalidate") {
    if (destroyed) return false;
    wakeReason = reason;
    if (timerId) {
      window.clearTimeout(timerId);
      timerId = 0;
    }
    requestTick(0);
    return true;
  }

  function nextDelay(now) {
    const active = [...tasks.values()].filter(taskEligible);
    if (!active.length) return null;
    const nextDue = Math.min(...active.map(task => task.nextRunAt));
    return Math.max(0, nextDue - now);
  }

  function tick(now) {
    frameId = 0;
    if (destroyed || suspended || document.hidden) {
      running = false;
      return;
    }

    running = true;
    frameNumber += 1;

    for (const task of orderedTasks()) {
      if (!taskEligible(task) || now + 0.5 < task.nextRunAt) continue;

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
        task: task.name,
        group: task.group
      });

      try {
        task.active = task.callback(context) === true;
        task.nextRunAt = task.active ? now + task.interval : Number.POSITIVE_INFINITY;
      } catch (error) {
        task.enabled = false;
        task.active = false;
        console.error(`[NCN runtime] disabled task ${task.name}`, error);
        announce("error", { task: task.name, group: task.group, error });
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
    if (destroyed) throw new Error("Cannot register tasks on a destroyed runtime.");
    if (!name || typeof callback !== "function") {
      throw new TypeError("Runtime tasks require a name and callback.");
    }
    if (tasks.has(name) && options.replace !== true) {
      throw new Error(`Runtime task already registered: ${name}`);
    }

    const maxFps = Math.max(1, Math.min(60, Number(options.maxFps) || 60));
    const task = {
      name,
      callback,
      group: String(options.group || "default"),
      priority: Number(options.priority) || 0,
      enabled: options.enabled !== false,
      active: options.enabled !== false,
      suspended: false,
      interval: 1000 / maxFps,
      nextRunAt: 0,
      lastRunAt: 0
    };

    tasks.set(name, task);
    if (task.enabled && options.wake !== false) schedule(`register:${name}`);

    return Object.freeze({
      wake(reason) {
        if (!task.enabled || task.suspended) return;
        task.active = true;
        task.nextRunAt = 0;
        schedule(reason || `task:${name}`);
      },
      enable(reason) {
        task.enabled = true;
        task.active = true;
        task.suspended = false;
        task.nextRunAt = 0;
        schedule(reason || `enable:${name}`);
      },
      disable() {
        task.enabled = false;
        task.active = false;
        task.nextRunAt = Number.POSITIVE_INFINITY;
      },
      suspend() {
        task.suspended = true;
      },
      resume(reason) {
        task.suspended = false;
        if (task.enabled) {
          task.active = true;
          task.nextRunAt = 0;
          schedule(reason || `resume:${name}`);
        }
      },
      reset(reason) {
        task.lastRunAt = 0;
        task.nextRunAt = 0;
        task.active = task.enabled;
        if (task.enabled) schedule(reason || `reset:${name}`);
      },
      setMaxFps(value) {
        const fps = Math.max(1, Math.min(60, Number(value) || 60));
        task.interval = 1000 / fps;
        if (task.enabled) schedule(`fps:${name}`);
      },
      unregister() {
        tasks.delete(name);
      },
      snapshot: () => Object.freeze({
        name: task.name,
        group: task.group,
        enabled: task.enabled,
        active: task.active,
        suspended: task.suspended,
        maxFps: 1000 / task.interval
      })
    });
  }

  function setQuality(next) {
    if (!new Set(["full", "reduced"]).has(next) || next === quality || destroyed) return;
    quality = next;
    announce("quality-change", { quality });
    [...tasks.values()].forEach(task => {
      if (task.enabled && !task.suspended) {
        task.active = true;
        task.nextRunAt = 0;
      }
    });
    schedule("quality-change");
  }

  function suspendGroup(group, reason = "group-suspend") {
    suspendedGroups.add(String(group));
    clearScheduledFrame();
    announce("group-suspend", { group: String(group), reason });
    schedule(reason);
  }

  function resumeGroup(group, reason = "group-resume") {
    const key = String(group);
    if (!suspendedGroups.delete(key)) return false;
    tasks.forEach(task => {
      if (task.group === key && task.enabled && !task.suspended) {
        task.active = true;
        task.nextRunAt = 0;
        task.lastRunAt = 0;
      }
    });
    announce("group-resume", { group: key, reason });
    schedule(reason);
    return true;
  }

  function resetGroup(group, reason = "group-reset") {
    const key = String(group);
    tasks.forEach(task => {
      if (task.group !== key) return;
      task.lastRunAt = 0;
      task.nextRunAt = 0;
      task.active = task.enabled;
    });
    schedule(reason);
  }

  function suspendRuntime(reason = "host") {
    if (suspended || destroyed) return false;
    suspended = true;
    running = false;
    clearScheduledFrame();
    announce("pause", { reason });
    return true;
  }

  function resumeRuntime(reason = "host") {
    if (!suspended || destroyed) return false;
    suspended = false;
    startedAt = performance.now();
    tasks.forEach(task => {
      if (task.enabled && !task.suspended) {
        task.active = true;
        task.nextRunAt = 0;
        task.lastRunAt = 0;
      }
    });
    announce("resume", { reason });
    schedule(reason);
    return true;
  }

  function reset(reason = "host-reset") {
    if (destroyed) return false;
    clearScheduledFrame();
    frameNumber = 0;
    startedAt = performance.now();
    tasks.forEach(task => {
      task.lastRunAt = 0;
      task.nextRunAt = 0;
      task.active = task.enabled;
    });
    announce("reset", { reason });
    if (!suspended) schedule(reason);
    return true;
  }

  function handleVisibility() {
    clearScheduledFrame();
    if (document.hidden) {
      running = false;
      announce("pause", { reason: "document-hidden" });
      return;
    }

    startedAt = performance.now();
    tasks.forEach(task => {
      if (task.enabled && !task.suspended) {
        task.active = true;
        task.nextRunAt = 0;
        task.lastRunAt = 0;
      }
    });
    announce("resume", { reason: "document-visible" });
    schedule("document-visible");
  }

  function handleReducedMotion(event) {
    setQuality(event.matches ? "reduced" : "full");
  }

  function destroy(reason = "host-destroy") {
    if (destroyed) return false;
    destroyed = true;
    running = false;
    clearScheduledFrame();
    document.removeEventListener("visibilitychange", handleVisibility);
    reduceMotion.removeEventListener?.("change", handleReducedMotion);
    tasks.clear();
    suspendedGroups.clear();
    announce("destroy", { reason });
    listeners.clear();
    return true;
  }

  document.addEventListener("visibilitychange", handleVisibility);
  reduceMotion.addEventListener?.("change", handleReducedMotion);

  return Object.freeze({
    register,
    wake: schedule,
    setQuality,
    getQuality: () => quality,
    suspendGroup,
    resumeGroup,
    resetGroup,
    suspend: suspendRuntime,
    resume: resumeRuntime,
    reset,
    destroy,
    snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });
})();
