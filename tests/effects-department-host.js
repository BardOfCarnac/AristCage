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
        wake() { if (enabled) requestAnimationFrame(loop); },
        enable() { enabled = true; suspended = false; last = performance.now(); requestAnimationFrame(loop); },
        disable() { enabled = false; },
        suspend() { suspended = true; },
        resume() { enabled = true; suspended = false; last = performance.now(); requestAnimationFrame(loop); },
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

  const effectNodes = () => [...effectsLayer.querySelectorAll("[data-ncn-effect-node]")];
  const originalLayerState = JSON.stringify({
    className: effectsLayer.className,
    style: effectsLayer.getAttribute("style"),
    dataset: { ...effectsLayer.dataset }
  });

  let module;
  try {
    report("manifest targets effects slot", NCNEffectsDepartmentManifest.replaces === "effects");
    report("manifest writes only environment:effects", JSON.stringify(NCNEffectsDepartmentManifest.layers) === '["environment:effects"]');
    report("manifest declares shared runtime", NCNEffectsDepartmentManifest.animationLoop === "shared-runtime");
    report("public effect list is complete", NCNEffectsDepartmentEffectNames.length === 13);

    module = createNCNEffectsDepartment(context);
    await module.init();
    module.applyProfile({ enabled: true, ambient: true, interaction: true, intensity: 1 }, { application: "redwire", reason: "test" });
    const required = ["init","applyProfile","suspend","resume","reset","destroy","play","cancel","clear","snapshot"];
    report("required public interface", required.every(name => typeof module[name] === "function"));
    report("canonical registry is locked", module.snapshot().registryLocked && typeof module.register === "undefined");
    report("host layer geometry remains host-owned", originalLayerState === JSON.stringify({
      className: effectsLayer.className,
      style: effectsLayer.getAttribute("style"),
      dataset: { ...effectsLayer.dataset }
    }));

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

    const suspendedEffect = module.play("relay-scan", target, { duration: 280, seed: 5, purpose: "required" });
    await sleep(45);
    module.suspend("test");
    const nodesAtSuspend = effectNodes();
    const blocked = await module.play("light-flash", target, { duration: 90, purpose: "required" }).finished;
    report("suspension hides active nodes", nodesAtSuspend.length > 0 && nodesAtSuspend.every(node => node.hidden));
    report("suspension releases claims", claims.size === 0);
    report("playback while suspended creates no work", blocked.reason === "suspended" && effectNodes().length === nodesAtSuspend.length);
    module.resume("test");
    report("resume reveals active nodes", effectNodes().every(node => !node.hidden));
    const resumed = await suspendedEffect.finished;
    report("suspend and resume preserve completion", resumed.status === "completed");

    const ambient = module.play("particle-emission", target, { duration: 500, purpose: "ambient", seed: 6 });
    const interaction = module.play("glow-pulse", target, { duration: 500, purpose: "interaction", seed: 7 });
    await sleep(35);
    module.applyProfile({ enabled: true, ambient: false, interaction: false, intensity: 1 }, { application: "dripfeed", reason: "profile-test" });
    const profileResults = await Promise.all([ambient.finished, interaction.finished]);
    const ignoredAmbient = await module.play("particle-emission", target, { duration: 90, purpose: "ambient" }).finished;
    const ignoredInteraction = await module.play("glow-pulse", target, { duration: 90, purpose: "interaction" }).finished;
    const requiredResult = await module.play("light-flash", target, { duration: 90, purpose: "required" }).finished;
    report("profile clears disallowed active work", profileResults.every(result => result.status === "cancelled"));
    report("profile rejects disallowed new work", ignoredAmbient.reason === "profile-ambient-disabled" && ignoredInteraction.reason === "profile-interaction-disabled");
    report("required work remains available", requiredResult.status === "completed");
    module.applyProfile({ enabled: true, ambient: true, interaction: true, intensity: 1 }, { application: "redwire", reason: "restore" });

    const dynamic = module.play("light-flash", target, { duration: 1800, intensity: 0.05, purpose: "required", concurrency: "merge" });
    await sleep(40);
    const beforeOpacity = Number(effectNodes().at(-1)?.style.opacity || 0);
    const merged = module.play("light-flash", target, { duration: 1800, intensity: 1, purpose: "required", concurrency: "merge" });
    await sleep(40);
    const afterMergeOpacity = Number(effectNodes().at(-1)?.style.opacity || 0);
    const mergedIntensity = module.snapshot().active.find(item => item.id === dynamic.id)?.intensity || 0;
    dynamic.setIntensity(0.01, "attenuation-test");
    await sleep(40);
    const afterAttenuationOpacity = Number(effectNodes().at(-1)?.style.opacity || 0);
    const attenuatedIntensity = module.snapshot().active.find(item => item.id === dynamic.id)?.intensity || 0;
    report("merge strengthens the live effect", merged === dynamic && mergedIntensity > 0.9 && afterMergeOpacity > beforeOpacity);
    report("active attenuation reaches the live effect", attenuatedIntensity < 0.02 && afterAttenuationOpacity < afterMergeOpacity);
    dynamic.cancel("dynamic-test-complete");
    await dynamic.finished;

    runtime.setQuality("reduced");
    const reduced = await module.play("displacement", target, { duration: 90, seed: 8, purpose: "required" }).finished;
    report("reduced-motion substitute completes", reduced.status === "completed" && module.snapshot().reducedMotion);
    runtime.setQuality("full");

    const seededA = module.play("static-burst", target, { duration: 500, seed: 123, channel: "seed-a", purpose: "required" });
    const seededB = module.play("static-burst", target, { duration: 500, seed: 123, channel: "seed-b", purpose: "required" });
    await sleep(80);
    const seededNodes = effectNodes().filter(node => node.classList.contains("ncn-effect-static-burst"));
    const seededStyles = seededNodes.map(node => {
      const field = node.querySelector(".ncn-effect-static");
      return `${field?.style.transform}|${field?.style.backgroundPosition}`;
    });
    report("deterministic seeded playback", seededStyles.length === 2 && seededStyles[0] === seededStyles[1]);
    module.cancel(seededA, "seed-test");
    module.cancel(seededB, "seed-test");
    await Promise.all([seededA.finished, seededB.finished]);

    const activeA = module.play("particle-emission", target, { duration: 900, channel: "environment", seed: 9, purpose: "required" });
    const activeB = module.play("signal-fault", target, { duration: 900, channel: "fault", seed: 10, purpose: "required" });
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
    report("host layer remains untouched after destroy", originalLayerState === JSON.stringify({
      className: effectsLayer.className,
      style: effectsLayer.getAttribute("style"),
      dataset: { ...effectsLayer.dataset }
    }));
  } catch (error) {
    report("unexpected test error", false, error.stack || error.message);
    try { await module?.destroy?.("test-error"); } catch {}
  }
})();
