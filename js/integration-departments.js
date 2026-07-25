/*==================================================
  NCN ACCEPTED DEPARTMENT INSTALLER

  Installs reviewed departmental publications through the PR 86 intake gate.
  Publications remain inert until this coordinator has validated and staged them.
==================================================*/
(() => {
  "use strict";

  const integration = window.NCNIntegration;
  const intake = window.NCNModuleIntake;
  const events = window.NCNEvents;
  const modules = window.NCNModules;

  const publications = Object.freeze([
    Object.freeze({
      name: "effects",
      factory: () => window.createNCNEffectsDepartment,
      manifest: () => window.NCNEffectsDepartmentManifest
    })
  ]);

  const installed = new Map();
  let readyPromise = null;
  let readyState = "idle";
  let failure = null;

  function moduleRecord(name) {
    return (modules?.snapshot?.() || []).find(record => record.name === name) || null;
  }

  function publicationAlreadyInstalled(name, manifest) {
    const record = moduleRecord(name);
    return Boolean(
      record
      && ["ready", "suspended"].includes(record.state)
      && record.manifest?.department === manifest.department
      && record.manifest?.version === manifest.version
    );
  }

  function retireLegacyEffects() {
    const legacy = window.NCNEffects;
    legacy?.setProfile?.({ ambient: false, interaction: false });
    legacy?.clear?.();
    return legacy?.snapshot?.() || null;
  }

  async function installPublication(specification) {
    const name = specification.name;
    const factory = specification.factory();
    const manifest = specification.manifest();

    if (typeof factory !== "function") {
      throw new Error(`Accepted ${name} publication factory is unavailable.`);
    }
    if (!manifest || typeof manifest !== "object") {
      throw new Error(`Accepted ${name} publication manifest is unavailable.`);
    }

    if (publicationAlreadyInstalled(name, manifest)) {
      const record = Object.freeze({
        name,
        status: "already-installed",
        version: manifest.version,
        report: null,
        snapshot: integration?.getService?.(name)?.snapshot?.() || null
      });
      installed.set(name, record);
      return record;
    }

    const report = intake?.inspect?.(name, factory, manifest);
    if (!report?.accepted) {
      throw new Error(`Accepted ${name} publication failed intake: ${(report?.errors || []).join(" ")}`);
    }

    const result = await intake.install(name, factory, manifest, { replace: true });
    const service = integration?.getService?.(name);
    if (!service) throw new Error(`Installed ${name} service is unavailable.`);

    let legacy = null;
    if (name === "effects") legacy = retireLegacyEffects();

    const record = Object.freeze({
      name,
      status: "installed",
      version: manifest.version,
      report,
      legacy,
      snapshot: service.snapshot?.() || result?.result?.snapshot || null
    });
    installed.set(name, record);
    events?.emit?.("integration:department-installed", record);
    return record;
  }

  async function start() {
    if (!integration?.ensureCoreServices || !intake?.install) {
      throw new Error("Integration services are unavailable for departmental installation.");
    }

    readyState = "installing";
    failure = null;
    document.documentElement.dataset.integratedDepartments = "installing";
    await integration.ensureCoreServices();

    for (const specification of publications) {
      await installPublication(specification);
    }

    readyState = "ready";
    document.documentElement.dataset.integratedDepartments = "ready";
    const current = snapshot();
    events?.emit?.("integration:departments-ready", current);
    return current;
  }

  function ready() {
    if (!readyPromise) {
      readyPromise = start().catch(error => {
        readyState = "error";
        failure = error;
        document.documentElement.dataset.integratedDepartments = "error";
        events?.emit?.("integration:departments-error", { error });
        throw error;
      });
    }
    return readyPromise;
  }

  function snapshot() {
    return Object.freeze({
      state: readyState,
      ready: readyState === "ready",
      failure: failure ? String(failure.message || failure) : null,
      publications: Object.freeze(publications.map(item => item.name)),
      installed: Object.freeze([...installed.values()]),
      modules: modules?.snapshot?.() || []
    });
  }

  window.NCNIntegratedDepartments = Object.freeze({
    ready,
    installPublication,
    snapshot,
    isReady: () => readyState === "ready"
  });

  void ready().catch(error => {
    console.error("[NCN integration] accepted department installation failed", error);
  });
})();
