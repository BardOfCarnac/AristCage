/*
  Manual PR-86 host-contract harness. This stages a candidate directly through a
  capability-scoped department context, but never installs it or replaces the
  incumbent weather slot.
*/
window.NCNWeatherPR86HostTests = (() => {
  "use strict";

  const wait = delay => new Promise(resolve => window.setTimeout(resolve, delay));
  const assert = (condition, message) => { if (!condition) throw new Error(message); };

  function visibleApplicationRoots() {
    return [document.querySelector("#redwire-root"), document.querySelector("#dripfeed-root")]
      .filter(Boolean)
      .filter(root => !root.hidden).length;
  }

  function activeParticles(snapshot) {
    return snapshot.particles.mist + snapshot.particles.dust + snapshot.particles.rain;
  }

  async function run(options = {}) {
    const manifest = window.NCNWeatherDepartmentManifest;
    const factory = window.NCNWeatherDepartment?.createWeather;
    const report = window.NCNIntegrationHarness?.inspectCandidate?.("weather", factory, manifest);
    assert(report?.accepted, `Weather intake failed: ${(report?.errors || []).join(" ")}`);

    const incumbent = window.NCNIntegration?.getService?.("weather");
    const initialApplication = window.NCNApplications?.current?.() || "redwire";
    const initialQuality = window.NCNViewerRuntime?.getQuality?.() || "full";
    const redwireRoot = document.querySelector("#redwire-root");
    const dripfeedRoot = document.querySelector("#dripfeed-root");
    const context = window.NCNDepartmentContext.create("weather-review", manifest);
    const beforeLayerChildren = Object.values(context.layers.weather)
      .map(layer => layer.childElementCount);
    const candidate = factory(context);
    const checks = [];
    const check = (name, pass, detail = null) => {
      checks.push(Object.freeze({ name, pass: Boolean(pass), detail }));
      assert(pass, name);
    };

    try {
      await candidate.init();
      check("incumbent slot untouched after candidate init",
        window.NCNIntegration.getService("weather") === incumbent);
      check("protected root identities retained",
        document.querySelector("#redwire-root") === redwireRoot
        && document.querySelector("#dripfeed-root") === dripfeedRoot);
      check("weather canvases remain outside protected roots",
        [...document.querySelectorAll(".ncn-department-weather-canvas")]
          .every(canvas => !redwireRoot?.contains(canvas) && !dripfeedRoot?.contains(canvas)));

      candidate.setQuality("auto");
      window.NCNViewerRuntime.setQuality("reduced");
      candidate.applyProfile({ enabled: true, preset: "mist", intensity: 0.42, seed: 2045 }, { seed: 2045 });
      await wait(options.settleDelay || 160);
      check("initial/repeated reduced quality follows host", candidate.snapshot().quality === "reduced", candidate.snapshot());
      check("RedWire weather is visibly active", candidate.snapshot().resources.visibleCanvases === 4);
      const depthFrame = candidate.getDepthFrame();
      check("Weather publishes an immutable exact-depth frame",
        Boolean(depthFrame) && Object.isFrozen(depthFrame)
        && depthFrame.depthConvention === "smaller-positive-z-is-nearer",
        depthFrame);
      check("Weather depth frame exposes no private puff collection",
        !Object.prototype.hasOwnProperty.call(depthFrame, "puffs"), depthFrame);
      const depthProbe = document.createElement("canvas").getContext("2d");
      const depthBefore = candidate.snapshot();
      const reproducedPuffs = depthFrame.renderForeground(depthProbe, {
        nearerThan: depthFrame.depthRange.farthest + 0.01
      });
      const depthAfter = candidate.snapshot();
      check("read-only depth pass reproduces the current puff count",
        reproducedPuffs === depthFrame.puffCount, { reproducedPuffs, puffCount: depthFrame.puffCount });
      check("read-only depth pass does not advance Weather",
        depthAfter.frameCount === depthBefore.frameCount
        && depthAfter.particles.fingerprint === depthBefore.particles.fingerprint);

      window.NCNViewerRuntime.setQuality("full");
      candidate.setIntensity(0.43);
      await wait(options.settleDelay || 160);
      check("quality returns from reduced to full-derived tier", candidate.snapshot().quality !== "reduced", candidate.snapshot());

      const effect = candidate.requestAtmosphericEffect("light-flash", "rear", {
        purpose: "required",
        channel: "boot",
        intensity: 0.08,
        duration: 120
      });
      check("accepted Effects name resolves without catalogue error", effect !== undefined);

      candidate.suspend("host-contract-test");
      const spawnAtSuspend = candidate.snapshot().particles.spawned;
      check("suspension invalidates the public depth frame", candidate.getDepthFrame() === null);
      check("stale depth frame becomes inert",
        depthFrame.renderForeground(depthProbe, { nearerThan: depthFrame.depthRange.farthest + 1 }) === 0);
      check("suspension hides weather canvases", candidate.snapshot().resources.visibleCanvases === 0);
      await wait(120);
      check("suspension stops spawning", candidate.snapshot().particles.spawned === spawnAtSuspend);
      candidate.resume("host-contract-test");
      check("resume restores weather canvases", candidate.snapshot().resources.visibleCanvases === 4);

      if (window.NCNApplications?.switchTo) {
        await window.NCNApplications.switchTo("dripfeed", { animate: false, reason: "weather-host-test" });
        candidate.applyProfile({ enabled: false, preset: "clear", intensity: 0 }, {
          application: "dripfeed",
          reason: "weather-host-test"
        });
        await wait(80);
        const disabled = candidate.snapshot();
        check("Dripfeed profile disables candidate weather", disabled.enabled === false, disabled);
        check("Dripfeed profile deactivates all particles", activeParticles(disabled) === 0, disabled);
        check("Dripfeed profile leaves no visible weather canvases", disabled.resources.visibleCanvases === 0, disabled);
        check("Dripfeed profile releases Weather effect handles", disabled.resources.effectHandles === 0, disabled);
        check("Dripfeed profile clears Weather intensity and transition",
          disabled.intensity === 0 && disabled.targetIntensity === 0 && disabled.transition === null, disabled);
        check("one application root remains visible in Dripfeed", visibleApplicationRoots() === 1);
        check("incumbent slot untouched in Dripfeed", window.NCNIntegration.getService("weather") === incumbent);

        await window.NCNApplications.switchTo("redwire", { animate: false, reason: "weather-host-test-return" });
        candidate.applyProfile({ enabled: true, preset: "mist", intensity: 0.42, seed: 2045 }, {
          application: "redwire",
          reason: "weather-host-test-return"
        });
        await wait(80);
        const restored = candidate.snapshot();
        check("RedWire weather profile restores", restored.enabled === true, restored);
        check("RedWire weather canvases restore", restored.resources.visibleCanvases === 4, restored);
        check("one application root remains visible after return", visibleApplicationRoots() === 1);
      }

      check("protected root identities retained after application round trip",
        document.querySelector("#redwire-root") === redwireRoot
        && document.querySelector("#dripfeed-root") === dripfeedRoot);
      return Object.freeze({ passed: checks.every(item => item.pass), checks: Object.freeze(checks), snapshot: candidate.snapshot() });
    } finally {
      candidate.destroy("host-contract-test");
      await window.NCNDepartmentContext.release(context, "weather-host-test-complete");
      window.NCNViewerRuntime?.setQuality?.(initialQuality);
      if (window.NCNApplications?.current?.() !== initialApplication) {
        await window.NCNApplications?.switchTo?.(initialApplication, {
          animate: false,
          reason: "weather-host-test-restore"
        });
      }
      const afterLayerChildren = Object.values(context.layers.weather || {})
        .map(layer => layer.childElementCount);
      assert(beforeLayerChildren.every((count, index) => count === afterLayerChildren[index]),
        "Weather candidate left layer residue after destruction.");
      assert(window.NCNIntegration?.getService?.("weather") === incumbent,
        "Weather host test replaced the incumbent slot.");
    }
  }

  return Object.freeze({ run });
})();
