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

    const legacy = window.NCNEffects?.snapshot?.() || null;
    checks.push(result("legacy Effects responder retired", legacy?.ambient === false && legacy?.interaction === false, legacy));

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
    checks.push(result("runtime suspended", suspended.runtime?.suspended === true, suspended.runtime));
    checks.push(result("managed modules suspended", suspended.modules
      .filter(item => item.managed)
      .every(item => item.state === "suspended"), suspended.modules));
    checks.push(result("Effects suspended", effectsService()?.snapshot?.().suspended === true, effectsService()?.snapshot?.()));

    await host.resume("integration-harness");
    const resumed = host.snapshot();
    checks.push(result("runtime resumed", resumed.runtime?.suspended === false, resumed.runtime));
    checks.push(result("managed modules resumed", resumed.modules
      .filter(item => item.managed)
      .every(item => item.state === "ready"), resumed.modules));
    checks.push(result("Effects resumed", effectsService()?.snapshot?.().suspended === false, effectsService()?.snapshot?.()));

    await host.reset("integration-harness");
    const reset = host.snapshot();
    const verification = host.verify();
    checks.push(result("host verifies after reset", verification.passed, verification));
    checks.push(result("application restored", reset.application === initialApplication, reset.application));
    checks.push(result("runtime task count stable", reset.runtime?.taskCount === initialTaskCount, {
      before: initialTaskCount,
      after: reset.runtime?.taskCount
    }));
    checks.push(result("Effects clean after reset", effectsService()?.snapshot?.().temporaryNodes === 0
      && effectsService()?.snapshot?.().runtimeTasks === 0, effectsService()?.snapshot?.()));

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

  function expectedEffectsProfile(application) {
    const profile = window.NCNEnvironment?.profile?.(application)?.effects || {};
    return Object.freeze({
      ambient: Boolean(profile.ambient),
      interaction: Boolean(profile.interaction)
    });
  }

  async function applicationCycle(options = {}) {
    await departments?.ready?.();
    const checks = [];
    const initial = applications?.current?.() || "redwire";
    const other = initial === "redwire" ? "dripfeed" : "redwire";
    const delay = Number(options.settleDelay) || 420;

    const switched = await applications?.switchTo?.(other, {
      animate: options.animate !== false,
      reason: "integration-harness"
    });
    await wait(delay);
    const firstVerification = host.verify();
    const firstEffects = effectsService()?.snapshot?.() || null;
    const expectedFirst = expectedEffectsProfile(other);
    checks.push(result(`switch to ${other}`, switched !== false && applications.current() === other, applications.current()));
    checks.push(result("host verifies after first switch", firstVerification.passed, firstVerification));
    checks.push(result(`Effects profile follows ${other}`, firstEffects?.profile?.ambient === expectedFirst.ambient
      && firstEffects?.profile?.interaction === expectedFirst.interaction, { expected: expectedFirst, actual: firstEffects?.profile }));

    const returned = await applications?.switchTo?.(initial, {
      animate: options.animate !== false,
      reason: "integration-harness-return"
    });
    await wait(delay);
    const returnVerification = host.verify();
    const returnedEffects = effectsService()?.snapshot?.() || null;
    const expectedReturn = expectedEffectsProfile(initial);
    checks.push(result(`return to ${initial}`, returned !== false && applications.current() === initial, applications.current()));
    checks.push(result("host verifies after return", returnVerification.passed, returnVerification));
    checks.push(result(`Effects profile returns to ${initial}`, returnedEffects?.profile?.ambient === expectedReturn.ambient
      && returnedEffects?.profile?.interaction === expectedReturn.interaction, { expected: expectedReturn, actual: returnedEffects?.profile }));
    checks.push(result("Effects clean after application cycle", returnedEffects?.temporaryNodes === 0 && returnedEffects?.runtimeTasks === 0, returnedEffects));

    return Object.freeze({ passed: checks.every(check => check.pass), checks: Object.freeze(checks), initial });
  }

  async function run(options = {}) {
    await departments?.ready?.();
    const reports = [passive()];
    if (options.effects !== false) reports.push(await effectsCycle(options));
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
    applicationCycle,
    run,
    inspectCandidate: (name, implementation, manifest) => intake?.inspect?.(name, implementation, manifest)
  });
})();
