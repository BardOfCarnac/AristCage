(async () => {
  "use strict";
  const results = document.getElementById("results");
  const target = document.getElementById("target");
  const effectsLayer = document.getElementById("effects");
  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const report = (name, pass, detail = "") => {
    const item = document.createElement("li");
    item.className = pass ? "pass" : "fail";
    item.textContent = `${pass ? "PASS" : "FAIL"} — ${name}${detail ? `: ${detail}` : ""}`;
    results.append(item);
    if (!pass) console.error(name, detail);
  };

  const runtimeTasks = new Map();
  let quality = "full";
  let nextFrame = 0;
  const runtimeListeners = new Set();
  const runtime = {
    register(name, callback, options = {}) {
      let enabled = options.enabled !== false;
      let suspended = false;
      let last = performance.now();
      const record = { name, callback, options };
      runtimeTasks.set(name, record);
      function loop(now) {
        if (!runtimeTasks.has(name)) return;
        if (enabled && !suspended) {
          const active = callback({
            now,
            delta: Math.min(50, now - last || 16),
            elapsed: now,
            frame: ++nextFrame,
            quality,
            reducedMotion: quality === "reduced",
            task: name,
            group: options.group
          }) === true;
          last = now;
          if (!active) enabled = false;
        }
        if (runtimeTasks.has(name) && enabled) requestAnimationFrame(loop);
      }
      if (enabled && options.wake !== false) requestAnimationFrame(loop);
      return {
        wake() { if (!enabled) return; requestAnimationFrame(loop); },
        enable() { enabled = true; suspended = false; last = performance.now(); requestAnimationFrame(loop); },
        disable() { enabled = false; },
        suspend() { suspended = true; },
        resume() { suspended = false; last = performance.now(); if (enabled) requestAnimationFrame(loop); },
        reset() { last = performance.now(); },
        unregister() { runtimeTasks.delete(name); }
      };
    },
    subscribe(listener) { runtimeListeners.add(listener); return () => runtimeListeners.delete(listener); },
    snapshot: () => ({ quality, taskCount: runtimeTasks.size }),
    setQuality(next) {
      quality = next;
      runtimeListeners.forEach(listener => listener({ runtime: { quality } }));
    }
  };

  const claims = new Set();
  const context = {
    runtime,
    director: {
      envelope(channel, options = {}) {
        return { channel, mode: "ambient", allowed: true, intensity: Number(options.intensity) || 0, reducedMotion: quality === "reduced" };
      },
      claim(channel, options = {}) {
        const claim = { channel, intensity: Number(options.intensity) || 0, granted: true };
        claims.add(claim);
        return { ...claim, release() { claims.delete(claim); return true; } };
      }
    },
    layers: { effects: effectsLayer },
    settings: {
      get reducedMotion() { return quality === "reduced"; },
      get quality() { return quality; }
    },
    events: { emit() {} },
    applications: { current: () => "redwire" },
    lifecycle: { releaseOwnedLocks() {} }
  };

  let module;
  try {
    report("manifest targets effects slot", NCNEffectsDepartmentManifest.replaces === "effects");
    report("manifest writes only environment:effects", JSON.stringify(NCNEffectsDepartmentManifest.layers) === '["environment:effects"]');
    report("manifest declares shared runtime", NCNEffectsDepartmentManifest.animationLoop === "shared-runtime");
    report("public effect list is complete", NCNEffectsDepartmentEffectNames.length === 13);

    module = createNCNEffectsDepartment(context);
    await module.init();
    const required = ["init","applyProfile","suspend","resume","reset","destroy","play","cancel","clear","snapshot"];
    report("required public interface", required.every(name => typeof module[name] === "function"));

    const completed = await module.play("glow-pulse", target, { duration: 80, seed: 1 }).finished;
    await sleep(20);
    report("named effect completes", completed.status === "completed");
    report("completion removes temporary nodes", module.snapshot().temporaryNodes === 0);

    const cancelling = module.play("signal-fault", target, { duration: 500, seed: 2 });
    await sleep(60);
    module.cancel(cancelling, "test");
    const cancelled = await cancelling.finished;
    await sleep(20);
    report("cancel halfway", cancelled.status === "cancelled");
    report("cancellation removes tasks and nodes", module.snapshot().runtimeTasks === 0 && module.snapshot().temporaryNodes === 0);

    for (let index = 0; index < 7; index += 1) {
      module.play("static-burst", target, { duration: 75, seed: index, concurrency: "replace" });
      await sleep(12);
    }
    await sleep(150);
    report("rapid replay leaves no residue", module.snapshot().runtimeTasks === 0 && module.snapshot().temporaryNodes === 0);

    const queuedA = module.play("relay-scan", target, { duration: 70, channel: "fault", concurrency: "queue", seed: 3 });
    const queuedB = module.play("relay-scan", target, { duration: 70, channel: "fault", concurrency: "queue", seed: 4 });
    await Promise.all([queuedA.finished, queuedB.finished]);
    report("queue drains cleanly", module.snapshot().queued === 0 && module.snapshot().runtimeTasks === 0);

    const suspendedEffect = module.play("relay-scan", target, { duration: 240, seed: 5 });
    await sleep(45);
    module.suspend("test");
    const suspendedState = module.snapshot().active[0]?.state;
    await sleep(100);
    module.resume("test");
    const resumed = await suspendedEffect.finished;
    report("suspend and resume preserve completion", suspendedState === "suspended" && resumed.status === "completed");

    runtime.setQuality("reduced");
    const reduced = await module.play("displacement", target, { duration: 90, seed: 6 }).finished;
    report("reduced-motion substitute completes", reduced.status === "completed" && module.snapshot().reducedMotion);
    runtime.setQuality("full");

    const sequence = [];
    module.register("deterministic-probe", {
      channel: "interface", duration: 55, maxFps: 60,
      create({ random }) { return { frame() { sequence.push(Number(random().toFixed(8))); } }; }
    });
    await module.play("deterministic-probe", target, { seed: 123, channel: "seed-a" }).finished;
    const firstSequence = sequence.splice(0);
    await module.play("deterministic-probe", target, { seed: 123, channel: "seed-b" }).finished;
    report("deterministic seeded playback", JSON.stringify(firstSequence) === JSON.stringify(sequence));

    const activeA = module.play("particle-emission", target, { duration: 900, channel: "environment", seed: 8 });
    const activeB = module.play("signal-fault", target, { duration: 900, channel: "fault", seed: 9 });
    await sleep(35);
    module.clear();
    await Promise.all([activeA.finished, activeB.finished]);
    report("clear removes every active effect", module.snapshot().active.length === 0 && module.snapshot().runtimeTasks === 0 && module.snapshot().temporaryNodes === 0);

    await module.destroy("test");
    const final = module.snapshot();
    report("destroy removes nodes tasks listeners and claims",
      final.destroyed && final.runtimeTasks === 0 && final.temporaryNodes === 0 && final.listenerCount === 0 && claims.size === 0 && runtimeTasks.size === 0
    );
    report("destroy leaves effects layer empty", effectsLayer.childElementCount === 0);
    report("source target was not modified", target.parentElement === document.body);
  } catch (error) {
    report("unexpected test error", false, error.stack || error.message);
    try { await module?.destroy?.("test-error"); } catch {}
  }
})();
