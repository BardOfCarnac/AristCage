/* Department-level browser acceptance harness. It never installs the candidate. */
window.NCNWeatherDepartmentTests = (() => {
  "use strict";

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  async function run(contextFactory) {
    const context = await contextFactory();
    const candidate = window.NCNWeatherDepartment.createWeather(context);
    const beforeChildren = Object.values(context.layers.weather)
      .reduce((sum, layer) => sum + layer.children.length, 0);

    await candidate.init();
    candidate.setSeed(2045);
    candidate.applyProfile({ enabled: true, preset: "mist", intensity: 0.42 }, { seed: 2045 });
    context.__step?.(16, 30);
    const mist = candidate.snapshot();
    assert(mist.resources.canvases === 4, "Expected one canvas in each supplied weather layer.");
    assert(mist.particles.mist > 0, "Mist should spawn through the shared runtime.");

    candidate.transitionTo("rain", { duration: 300 });
    context.__step?.(16, 40);
    const rain = candidate.snapshot();
    assert(rain.particles.rain > 0, "Rain should appear after transition.");
    assert(rain.zones.reading === true, "Reading-zone attenuation should be detected.");
    assert(rain.zones.controls > 0, "Control-zone attenuation should be detected.");

    candidate.suspend();
    const suspended = candidate.snapshot();
    assert(suspended.resources.visibleCanvases === 0, "Suspension must remove the frozen weather frame.");
    context.__step?.(250, 10);
    assert(candidate.snapshot().particles.spawned === suspended.particles.spawned,
      "Suspended weather must not continue spawning.");

    candidate.resume();
    assert(candidate.snapshot().resources.visibleCanvases === 4, "Resume should restore owned canvases.");
    context.__step?.(1000, 1);
    assert(candidate.snapshot().lastDelta <= 64, "Resume delta must remain bounded.");

    candidate.reset();
    const reset = candidate.snapshot();
    assert(reset.particles.mist + reset.particles.dust + reset.particles.rain === 0,
      "Reset must leave a clean chamber.");

    candidate.destroy();
    const destroyed = candidate.snapshot();
    const afterChildren = Object.values(context.layers.weather)
      .reduce((sum, layer) => sum + layer.children.length, 0);
    assert(destroyed.resources.canvases === 0, "Destroy must remove every generated canvas.");
    assert(afterChildren === beforeChildren, "Destroy must restore layer child counts.");
    assert(destroyed.privateAnimationLoop === false, "Candidate must not own a private animation loop.");

    return Object.freeze({ passed: true, snapshots: Object.freeze({ mist, rain, suspended, reset, destroyed }) });
  }

  return Object.freeze({ run });
})();
