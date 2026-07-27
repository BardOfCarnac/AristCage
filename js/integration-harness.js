/*==================================================
  NCN INTEGRATION HARNESS

  Manual browser verification for the host and accepted departments. Nothing runs
  automatically; mutating checks must be requested from the console.
==================================================*/

window.NCNIntegrationHarness = (() => {
  const host = window.NCNViewerHost;
  const integration = window.NCNIntegration;
  const departments = window.NCNIntegratedDepartments;
  const intake = window.NCNModuleIntake;
  const applications = window.NCNApplications;
  const modules = window.NCNModules;

  const wait = delay => new Promise(resolve => window.setTimeout(resolve, delay));

  function result(name, pass, detail = null) {
    return Object.freeze({ name, pass: Boolean(pass), detail });
  }

  function effectsService() {
    return modules?.get?.("effects") || null;
  }

  function weatherService() {
    return modules?.get?.("weather") || null;
  }

  function chamberMotionService() {
    return modules?.get?.("chamber-motion") || null;
  }

  function weatherParticleTotal(snapshot) {
    const particles = snapshot?.particles || {};
    return Number(particles.mist || 0) + Number(particles.dust || 0) + Number(particles.rain || 0);
  }

  function expectedEffectsProfile(application) {
    const profile = window.NCNEnvironment?.profile?.(application)?.effects || {};
    return Object.freeze({
      ambient: Boolean(profile.ambient),
      interaction: Boolean(profile.interaction)
    });
  }

  function expectedWeatherProfile(application) {
    const profile = window.NCNEnvironment?.profile?.(application)?.weather || {};
    const enabled = profile.enabled !== false;
    const intensity = Number.isFinite(Number(profile.intensity))
      ? Number(profile.intensity)
      : Number(profile.mist) || 0;
    return Object.freeze({
      enabled,
      preset: profile.preset || (!enabled ? "clear" : intensity > 0 ? "mist" : "clear"),
      targetIntensity: enabled ? intensity : 0
    });
  }

  function expectedChamberMotionProfile(application) {
    const profile = window.NCNEnvironment?.profile?.(application)?.chamberMotion || {};
    return Object.freeze({
      enabled: profile.enabled !== false,
      maxActive: Number(profile.maxActive) || null,
      clusterSize: Array.isArray(profile.clusterSize) ? [...profile.clusterSize] : null
    });
  }

  function weatherMatchesProfile(snapshot, expected) {
    if (!snapshot || !expected) return false;
    if (snapshot.enabled !== expected.enabled) return false;
    if (snapshot.targetPreset !== expected.preset && snapshot.preset !== expected.preset) return false;
    return Math.abs(Number(snapshot.targetIntensity || 0) - expected.targetIntensity) < 0.001;
  }

  function chamberMotionMatchesProfile(snapshot, expected) {
    if (!snapshot || !expected || snapshot.enabled !== expected.enabled) return false;
    if (expected.maxActive && Number(snapshot.profile?.maxActive) !== expected.maxActive) return false;
    if (expected.clusterSize && JSON.stringify(snapshot.profile?.clusterSize) !== JSON.stringify(expected.clusterSize)) return false;
    return true;
  }

  function passive() {
    const checks = [];
    const verification = host?.verify?.() || null;
    checks.push(result("host verification", Boolean(verification?.passed), verification));
    checks.push(result("integration services", Boolean(integration?.isReady?.()), integration?.snapshot?.()));
    checks.push(result("accepted departments", Boolean(departments?.isReady?.()), departments?.snapshot?.()));

    const scene = host?.snapshot?.().scene || [];
    const sceneNames = scene.map(item => item.name);
    checks.push(result("unique scene names", new Set(sceneNames).size === sceneNames.length, sceneNames));
    checks.push(result("connected environment layers", scene
      .filter(item => item.name.startsWith("weather:") || item.name.startsWith("environment:"))
      .every(item => item.connected), scene));

    const moduleSnapshot = modules?.snapshot?.() || [];
    checks.push(result("module states", moduleSnapshot.every(item => ["ready", "suspended"].includes(item.state)), moduleSnapshot));
    checks.push(result("visual director", Boolean(window.NCNVisualDirector?.snapshot), window.NCNVisualDirector?.snapshot?.()));
    checks.push(result("boot slot", Boolean(modules?.get?.("boot")?.run), modules?.get?.("boot")?.snapshot?.()));

    const effects = effectsService();
    const effectsSnapshot = effects?.snapshot?.() || null;
    const effectsRecord = moduleSnapshot.find(item => item.name === "effects") || null;
    checks.push(result("Effects Department installed", Boolean(
      effects
      && effectsRecord?.manifest?.department === "effects"
      && effectsSnapshot?.department === "effects"
      && effectsSnapshot?.registryLocked === true
    ), { record: effectsRecord, snapshot: effectsSnapshot }));
    checks.push(result("Effects service interface", ["play", "cancel", "clear", "snapshot"]
      .every(method => typeof effects?.[method] === "function"), effectsSnapshot));
    checks.push(result("Effects layer clean", effectsSnapshot?.temporaryNodes === 0 && effectsSnapshot?.runtimeTasks === 0, effectsSnapshot));

    const legacyEffects = window.NCNEffects?.snapshot?.() || null;
    checks.push(result("legacy Effects responder retired", legacyEffects?.ambient === false && legacyEffects?.interaction === false, legacyEffects));

    const weather = weatherService();
    const weatherSnapshot = weather?.snapshot?.() || null;
    const weatherRecord = moduleSnapshot.find(item => item.name === "weather") || null;
    const currentApplication = applications?.current?.() || "redwire";
    const expectedWeather = expectedWeatherProfile(currentApplication);
    checks.push(result("Weather Department installed", Boolean(
      weather
      && weatherRecord?.manifest?.department === "weather"
      && weatherSnapshot?.initialised === true
      && weatherSnapshot?.destroyed === false
    ), { record: weatherRecord, snapshot: weatherSnapshot }));
    checks.push(result("Weather service interface", ["applyProfile", "setPreset", "setIntensity", "transitionTo", "snapshot"]
      .every(method => typeof weather?.[method] === "function"), weatherSnapshot));
    checks.push(result(`Weather profile follows ${currentApplication}`,
      weatherMatchesProfile(weatherSnapshot, expectedWeather), { expected: expectedWeather, actual: weatherSnapshot }));

    const legacyWeather = window.NCNWeatherRenderer?.snapshot?.() || null;
    const legacyWeatherCanvas = document.querySelector(".ncn-floor-mist");
    checks.push(result("legacy Weather renderer retired", Boolean(
      legacyWeather?.enabled === false
      && Number(legacyWeather?.targetMist || 0) === 0
      && (!legacyWeatherCanvas || (
        legacyWeatherCanvas.hidden === true
        && legacyWeatherCanvas.dataset.ncnLegacyWeatherRetired === "true"
      ))
    ), { snapshot: legacyWeather, canvas: legacyWeatherCanvas }));

    const motion = chamberMotionService();
    const motionSnapshot = motion?.snapshot?.() || null;
    const motionRecord = moduleSnapshot.find(item => item.name === "chamber-motion") || null;
    const expectedMotion = expectedChamberMotionProfile(currentApplication);
    checks.push(result("Chamber Movement Department installed", Boolean(
      motion
      && motionRecord?.manifest?.department === "chamber-motion"
      && motionSnapshot?.initialised === true
      && motionSnapshot?.destroyed === false
      && motionSnapshot?.adapter?.canvasConnected === true
    ), { record: motionRecord, snapshot: motionSnapshot }));
    checks.push(result("Chamber Movement service interface", ["applyProfile", "trigger", "cancel", "settle", "snapshot"]
      .every(method => typeof motion?.[method] === "function"), motionSnapshot));
    checks.push(result(`Chamber Movement profile follows ${currentApplication}`,
      chamberMotionMatchesProfile(motionSnapshot, expectedMotion), { expected: expectedMotion, actual: motionSnapshot }));
    checks.push(result("Chamber Movement controller bound",
      window.NCNChamberMotionController?.snapshot?.().bound === true,
      window.NCNChamberMotionController?.snapshot?.()));

    const legacyMotion = window.NCNChamberMotion?.snapshot?.() || null;
    const legacyBlock = document.querySelector(".ncn-chamber-block");
    checks.push(result("legacy Chamber Movement responder retired", Boolean(
      legacyMotion?.enabled === false
      && (!legacyBlock || (
        legacyBlock.hidden === true
        && legacyBlock.dataset.ncnLegacyChamberMotionRetired === "true"
      ))
    ), { snapshot: legacyMotion, block: legacyBlock }));

    if (!expectedMotion.enabled) {
      checks.push(result(`${currentApplication} leaves Chamber Movement fully clear`, Boolean(
        motionSnapshot?.activeSequenceCount === 0
        && motionSnapshot?.reservedRouteCount === 0
        && motionSnapshot?.adapter?.activePoseCount === 0
        && motionSnapshot?.adapter?.canvasVisible === false
      ), motionSnapshot));
    }

    return Object.freeze({
      passed: checks.every(check => check.pass),
      checks: Object.freeze(checks),
      snapshot: host?.snapshot?.() || null
    });
  }

  async function lifecycleCycle(options = {}) {
    await departments?.ready?.();
    const checks = [];
    const before = host.snapshot();
    const initialTaskCount = before.runtime?.taskCount;
    const initialApplication = before.application;

    await host.suspend("integration-harness");
    const suspended = host.snapshot();
    const suspendedWeather = weatherService()?.snapshot?.() || null;
    const suspendedMotion = chamberMotionService()?.snapshot?.() || null;
    checks.push(result("runtime suspended", suspended.runtime?.suspended === true, suspended.runtime));
    checks.push(result("managed modules suspended", suspended.modules
      .filter(item => item.managed)
      .every(item => item.state === "suspended"), suspended.modules));
    checks.push(result("Effects suspended", effectsService()?.snapshot?.().suspended === true, effectsService()?.snapshot?.()));
    checks.push(result("Weather suspended and hidden", suspendedWeather?.suspended === true
      && suspendedWeather?.resources?.visibleCanvases === 0, suspendedWeather));
    checks.push(result("Chamber Movement suspended and hidden", suspendedMotion?.suspended === true
      && suspendedMotion?.adapter?.canvasVisible === false, suspendedMotion));

    await host.resume("integration-harness");
    const resumed = host.snapshot();
    const resumedWeather = weatherService()?.snapshot?.() || null;
    const resumedMotion = chamberMotionService()?.snapshot?.() || null;
    checks.push(result("runtime resumed", resumed.runtime?.suspended === false, resumed.runtime));
    checks.push(result("managed modules resumed", resumed.modules
      .filter(item => item.managed)
      .every(item => item.state === "ready"), resumed.modules));
    checks.push(result("Effects resumed", effectsService()?.snapshot?.().suspended === false, effectsService()?.snapshot?.()));
    checks.push(result("Weather resumed", resumedWeather?.suspended === false, resumedWeather));
    checks.push(result("Chamber Movement resumed", resumedMotion?.suspended === false, resumedMotion));

    await host.reset("integration-harness");
    const reset = host.snapshot();
    const verification = host.verify();
    const resetWeather = weatherService()?.snapshot?.() || null;
    const resetMotion = chamberMotionService()?.snapshot?.() || null;
    const expectedWeather = expectedWeatherProfile(initialApplication);
    const expectedMotion = expectedChamberMotionProfile(initialApplication);
    checks.push(result("host verifies after reset", verification.passed, verification));
    checks.push(result("application restored", reset.application === initialApplication, reset.application));
    checks.push(result("runtime task count stable", reset.runtime?.taskCount === initialTaskCount, {
      before: initialTaskCount,
      after: reset.runtime?.taskCount
    }));
    checks.push(result("Effects clean after reset", effectsService()?.snapshot?.().temporaryNodes === 0
      && effectsService()?.snapshot?.().runtimeTasks === 0, effectsService()?.snapshot?.()));
    checks.push(result("Weather profile restored after reset", weatherMatchesProfile(resetWeather, expectedWeather), {
      expected: expectedWeather,
      actual: resetWeather
    }));
    checks.push(result("Weather has no effect residue after reset", resetWeather?.resources?.effectHandles === 0, resetWeather));
    checks.push(result("Chamber Movement profile restored after reset", chamberMotionMatchesProfile(resetMotion, expectedMotion), {
      expected: expectedMotion,
      actual: resetMotion
    }));
    checks.push(result("Chamber Movement clean after reset", Boolean(
      resetMotion?.activeSequenceCount === 0
      && resetMotion?.reservedRouteCount === 0
      && resetMotion?.adapter?.activePoseCount === 0
      && resetMotion?.adapter?.canvasVisible === false
    ), resetMotion));

    if (options.settle !== false) await wait(Number(options.settleDelay) || 120);
    return Object.freeze({ passed: checks.every(check => check.pass), checks: Object.freeze(checks), before, after: reset });
  }

  async function effectsCycle(options = {}) {
    await departments?.ready?.();
    const checks = [];
    const effects = effectsService();
    const target = document.querySelector(".rail-title") || document.querySelector("#redwire-root") || document.body;

    checks.push(result("Effects target available", Boolean(target), target));
    checks.push(result("Effects publication available", Boolean(effects?.play && effects?.snapshot), effects?.snapshot?.()));
    if (!target || !effects?.play) {
      return Object.freeze({ passed: false, checks: Object.freeze(checks) });
    }

    const handle = effects.play("light-flash", target, {
      purpose: "required",
      intensity: 0.35,
      duration: Number(options.effectDuration) || 120,
      seed: 2045
    });
    const completed = await handle.finished;
    await wait(30);
    const after = effects.snapshot();
    checks.push(result("required effect completes", completed.status === "completed", completed));
    checks.push(result("effect leaves no residue", after.temporaryNodes === 0 && after.runtimeTasks === 0 && after.active.length === 0, after));

    return Object.freeze({ passed: checks.every(check => check.pass), checks: Object.freeze(checks), after });
  }

  async function chamberMotionCycle(options = {}) {
    await departments?.ready?.();
    const checks = [];
    const motion = chamberMotionService();
    const application = applications?.current?.() || "redwire";
    checks.push(result("Chamber Movement publication available", Boolean(motion?.trigger && motion?.snapshot), motion?.snapshot?.()));
    if (!motion?.trigger) return Object.freeze({ passed: false, checks: Object.freeze(checks) });
    if (application !== "redwire") {
      checks.push(result("Chamber Movement cycle skipped outside RedWire", true, application));
      return Object.freeze({ passed: true, checks: Object.freeze(checks), skipped: true });
    }

    const before = motion.snapshot();
    const movement = motion.trigger({
      region: "left-wall",
      clusterSize: [1, 1],
      intensity: 0.5,
      duration: Number(options.motionDuration) || 420
    });
    await wait(50);
    const active = motion.snapshot();
    checks.push(result("Chamber Movement enters active geometry", active.activeSequenceCount === 1
      && active.adapter?.activePoseCount > 0
      && active.adapter?.canvasVisible === true, active));
    const completed = await movement;
    await wait(40);
    const after = motion.snapshot();
    checks.push(result("Chamber Movement sequence completes", ["complete", "settled"].includes(completed?.status), completed));
    checks.push(result("Chamber Movement renderer drew frames", Number(after.adapter?.drawCount || 0) > Number(before.adapter?.drawCount || 0), {
      before: before.adapter,
      after: after.adapter
    }));
    checks.push(result("Chamber Movement leaves no residue", Boolean(
      after.activeSequenceCount === 0
      && after.reservedRouteCount === 0
      && after.adapter?.activePoseCount === 0
      && after.adapter?.canvasVisible === false
    ), after));

    return Object.freeze({ passed: checks.every(check => check.pass), checks: Object.freeze(checks), before, active, after });
  }

  async function applicationCycle(options = {}) {
    await departments?.ready?.();
    const checks = [];
    const initial = applications?.current?.() || "redwire";
    const other = initial === "redwire" ? "dripfeed" : "redwire";
    const delay = Number(options.settleDelay) || 560;

    const switched = await applications?.switchTo?.(other, {
      animate: options.animate !== false,
      reason: "integration-harness"
    });
    await wait(delay);
    const firstVerification = host.verify();
    const firstEffects = effectsService()?.snapshot?.() || null;
    const firstWeather = weatherService()?.snapshot?.() || null;
    const firstMotion = chamberMotionService()?.snapshot?.() || null;
    const expectedFirstEffects = expectedEffectsProfile(other);
    const expectedFirstWeather = expectedWeatherProfile(other);
    const expectedFirstMotion = expectedChamberMotionProfile(other);
    checks.push(result(`switch to ${other}`, switched !== false && applications.current() === other, applications.current()));
    checks.push(result("host verifies after first switch", firstVerification.passed, firstVerification));
    checks.push(result(`Effects profile follows ${other}`, firstEffects?.profile?.ambient === expectedFirstEffects.ambient
      && firstEffects?.profile?.interaction === expectedFirstEffects.interaction, { expected: expectedFirstEffects, actual: firstEffects?.profile }));
    checks.push(result(`Weather profile follows ${other}`, weatherMatchesProfile(firstWeather, expectedFirstWeather), {
      expected: expectedFirstWeather,
      actual: firstWeather
    }));
    checks.push(result(`Chamber Movement profile follows ${other}`, chamberMotionMatchesProfile(firstMotion, expectedFirstMotion), {
      expected: expectedFirstMotion,
      actual: firstMotion
    }));
    if (!expectedFirstWeather.enabled) {
      checks.push(result(`${other} leaves Weather fully clear`, weatherParticleTotal(firstWeather) === 0
        && firstWeather?.resources?.visibleCanvases === 0
        && firstWeather?.resources?.effectHandles === 0, firstWeather));
    }
    if (!expectedFirstMotion.enabled) {
      checks.push(result(`${other} leaves Chamber Movement fully clear`, Boolean(
        firstMotion?.activeSequenceCount === 0
        && firstMotion?.reservedRouteCount === 0
        && firstMotion?.adapter?.activePoseCount === 0
        && firstMotion?.adapter?.canvasVisible === false
      ), firstMotion));
    }

    const returned = await applications?.switchTo?.(initial, {
      animate: options.animate !== false,
      reason: "integration-harness-return"
    });
    await wait(delay);
    const returnVerification = host.verify();
    const returnedEffects = effectsService()?.snapshot?.() || null;
    const returnedWeather = weatherService()?.snapshot?.() || null;
    const returnedMotion = chamberMotionService()?.snapshot?.() || null;
    const expectedReturnEffects = expectedEffectsProfile(initial);
    const expectedReturnWeather = expectedWeatherProfile(initial);
    const expectedReturnMotion = expectedChamberMotionProfile(initial);
    checks.push(result(`return to ${initial}`, returned !== false && applications.current() === initial, applications.current()));
    checks.push(result("host verifies after return", returnVerification.passed, returnVerification));
    checks.push(result(`Effects profile returns to ${initial}`, returnedEffects?.profile?.ambient === expectedReturnEffects.ambient
      && returnedEffects?.profile?.interaction === expectedReturnEffects.interaction, { expected: expectedReturnEffects, actual: returnedEffects?.profile }));
    checks.push(result(`Weather profile returns to ${initial}`, weatherMatchesProfile(returnedWeather, expectedReturnWeather), {
      expected: expectedReturnWeather,
      actual: returnedWeather
    }));
    checks.push(result(`Chamber Movement profile returns to ${initial}`, chamberMotionMatchesProfile(returnedMotion, expectedReturnMotion), {
      expected: expectedReturnMotion,
      actual: returnedMotion
    }));
    checks.push(result("Effects clean after application cycle", returnedEffects?.temporaryNodes === 0 && returnedEffects?.runtimeTasks === 0, returnedEffects));
    checks.push(result("Weather owns exactly four canvases after application cycle", returnedWeather?.resources?.canvases === 4, returnedWeather));
    checks.push(result("Chamber Movement owns one clean adapter canvas after application cycle", Boolean(
      returnedMotion?.adapter?.canvasConnected === true
      && returnedMotion?.adapter?.activePoseCount === 0
      && returnedMotion?.adapter?.canvasVisible === false
    ), returnedMotion));

    return Object.freeze({ passed: checks.every(check => check.pass), checks: Object.freeze(checks), initial });
  }

  async function run(options = {}) {
    await departments?.ready?.();
    const reports = [passive()];
    if (options.effects !== false) reports.push(await effectsCycle(options));
    if (options.chamberMotion !== false) reports.push(await chamberMotionCycle(options));
    if (options.lifecycle !== false) reports.push(await lifecycleCycle(options));
    if (options.applications === true) reports.push(await applicationCycle(options));
    const report = Object.freeze({
      passed: reports.every(item => item.passed),
      reports: Object.freeze(reports),
      completedAt: performance.now()
    });
    window.NCNEvents?.emit?.("integration:harness-complete", report);
    return report;
  }

  return Object.freeze({
    passive,
    lifecycleCycle,
    effectsCycle,
    chamberMotionCycle,
    applicationCycle,
    run,
    inspectCandidate: (name, implementation, manifest) => intake?.inspect?.(name, implementation, manifest)
  });
})();
