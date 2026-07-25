(() => {
  "use strict";

  const byId = id => document.getElementById(id);
  const effectSelect = byId("effect");
  const status = byId("status");
  let current = null;
  let statusTimer = 0;

  function target() {
    const name = byId("target").value;
    if (name === "terminal") return NCNEffectTargets.element(byId("stage"), { kind: "terminal" });
    return NCNEffectTargets.element(document.querySelector(`[data-target="${name}"]`), { kind: name });
  }

  function options() {
    return {
      intensity: Number(byId("intensity").value),
      duration: Number(byId("duration").value),
      seed: Number(byId("seed").value),
      channel: byId("channel").value,
      concurrency: byId("concurrency").value
    };
  }

  function refreshStatus() {
    status.textContent = JSON.stringify({
      effects: NCNEffects.snapshot(),
      runtime: NCNViewerRuntime.snapshot(),
      overlays: document.querySelectorAll(".ncn-effect-overlay").length
    }, null, 2);
  }

  function play() {
    NCNEffects.setReducedMotion(byId("reduced").value === "true");
    current = NCNEffects.play(effectSelect.value, target(), options());
    current.finished.then(refreshStatus);
    refreshStatus();
  }

  async function rapidRepeat() {
    for (let index = 0; index < 6; index += 1) {
      NCNEffects.play(effectSelect.value, target(), {
        ...options(),
        seed: Number(byId("seed").value) + index
      });
      await new Promise(resolve => setTimeout(resolve, 55));
    }
    refreshStatus();
  }

  async function boot() {
    await NCNEffects.init();
    NCNViewerLifecycle.transition(NCNViewerLifecycle.STATES.READY, {
      reason: "effects-gallery",
      force: true
    });

    for (const entry of NCNEffects.list()) {
      const option = document.createElement("option");
      option.value = entry.name;
      option.textContent = `${entry.name} · cost ${entry.cost}`;
      effectSelect.append(option);
    }
    effectSelect.value = "signal-fault";

    byId("play").addEventListener("click", play);
    byId("cancel").addEventListener("click", () => current?.cancel("gallery"));
    byId("repeat").addEventListener("click", rapidRepeat);
    byId("suspend").addEventListener("click", () => NCNEffects.suspend());
    byId("resume").addEventListener("click", () => NCNEffects.resume());
    byId("clear").addEventListener("click", () => NCNEffects.clear());

    statusTimer = setInterval(refreshStatus, 250);
    addEventListener("pagehide", () => clearInterval(statusTimer), { once: true });
    refreshStatus();
  }

  boot();
})();
