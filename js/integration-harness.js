/*==================================================
  NCN INTEGRATION HARNESS

  Manual browser verification for the host and incoming modules. Nothing runs
  automatically; mutating checks must be requested from the console.
==================================================*/

window.NCNIntegrationHarness = (() => {
  const host = window.NCNViewerHost;
  const integration = window.NCNIntegration;
  const intake = window.NCNModuleIntake;
  const applications = window.NCNApplications;
  const runtime = window.NCNViewerRuntime;
  const modules = window.NCNModules;

  const wait = delay => new Promise(resolve => window.setTimeout(resolve, delay));

  function result(name, pass, detail = null) {
    return Object.freeze({ name, pass: Boolean(pass), detail });
  }

  function passive() {
    const checks = [];
    const verification = host?.verify?.() || null;
    checks.push(result("host verification", Boolean(verification?.passed), verification));
    checks.push(result("integration services", Boolean(integration?.isReady?.()), integration?.snapshot?.()));

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

    return Object.freeze({
      passed: checks.every(check => check.pass),
      checks: Object.freeze(checks),
      snapshot: host?.snapshot?.() || null
    });
  }

  async function lifecycleCycle(options = {}) {
    await integration?.ensureCoreServices?.();
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

    await host.resume("integration-harness");
    const resumed = host.snapshot();
    checks.push(result("runtime resumed", resumed.runtime?.suspended === false, resumed.runtime));
    checks.push(result("managed modules resumed", resumed.modules
      .filter(item => item.managed)
      .every(item => item.state === "ready"), resumed.modules));

    await host.reset("integration-harness");
    const reset = host.snapshot();
    checks.push(result("host verifies after reset", host.verify().passed, host.verify()));
    checks.push(result("application restored", reset.application === initialApplication, reset.application));
    checks.push(result("runtime task count stable", reset.runtime?.taskCount === initialTaskCount, {
      before: initialTaskCount,
      after: reset.runtime?.taskCount
    }));

    if (options.settle !== false) await wait(Number(options.settleDelay) || 120);
    return Object.freeze({ passed: checks.every(check => check.pass), checks: Object.freeze(checks), before, after: reset });
  }

  async function applicationCycle(options = {}) {
    await integration?.ensureCoreServices?.();
    const checks = [];
    const initial = applications?.current?.() || "redwire";
    const other = initial === "redwire" ? "dripfeed" : "redwire";
    const delay = Number(options.settleDelay) || 420;

    const switched = await applications?.switchTo?.(other, {
      animate: options.animate !== false,
      reason: "integration-harness"
    });
    await wait(delay);
    checks.push(result(`switch to ${other}`, switched !== false && applications.current() === other, applications.current()));
    checks.push(result("host verifies after first switch", host.verify().passed, host.verify()));

    const returned = await applications?.switchTo?.(initial, {
      animate: options.animate !== false,
      reason: "integration-harness-return"
    });
    await wait(delay);
    checks.push(result(`return to ${initial}`, returned !== false && applications.current() === initial, applications.current()));
    checks.push(result("host verifies after return", host.verify().passed, host.verify()));

    return Object.freeze({ passed: checks.every(check => check.pass), checks: Object.freeze(checks), initial });
  }

  async function run(options = {}) {
    const reports = [passive()];
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
    applicationCycle,
    run,
    inspectCandidate: (name, implementation, manifest) => intake?.inspect?.(name, implementation, manifest)
  });
})();
