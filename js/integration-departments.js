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

  function retireLegacyEffects() {
    const legacy = window.NCNEffects;
    legacy?.setProfile?.({ ambient: false, interaction: false });
    legacy?.clear?.();
    return legacy?.snapshot?.() || null;
  }

  function retireLegacyWeather() {
    const legacy = window.NCNWeatherRenderer;
    legacy?.disable?.();

    const canvas = document.querySelector(".ncn-floor-mist");
    if (canvas) {
      canvas.classList.remove("is-enabled");
      canvas.hidden = true;
      canvas.dataset.ncnLegacyWeatherRetired = "true";
    }

    return Object.freeze({
      snapshot: legacy?.snapshot?.() || null,
      canvasPresent: Boolean(canvas),
      canvasHidden: canvas ? canvas.hidden === true : true
    });
  }

  function retireLegacyChamberMotion() {
    const legacy = window.NCNChamberMotion;
    legacy?.disable?.();
    legacy?.stop?.({ reschedule: false });

    const block = document.querySelector(".ncn-chamber-block");
    if (block) {
      block.classList.remove("is-profile-enabled", "is-moving");
      block.hidden = true;
      block.style.display = "none";
      block.dataset.ncnLegacyChamberMotionRetired = "true";
    }

    return Object.freeze({
      snapshot: legacy?.snapshot?.() || null,
      blockPresent: Boolean(block),
      blockHidden: block ? block.hidden === true : true
    });
  }

  function createChamberMotionFactory() {
    const publication = window.NCNChamberMotionPublication;
    const adapter = window.NCNChamberMotionAdapter;
    if (!publication?.create || !adapter?.createPublicationInstance) return null;
    return context => adapter.createPublicationInstance(context, publication, {
      seed: "ncn-production-chamber-motion"
    });
  }

  function activateChamberMotion(service) {
    return window.NCNChamberMotionController?.bind?.(service) || null;
  }

  const publications = Object.freeze([
    Object.freeze({
      name: "effects",
      factory: () => window.createNCNEffectsDepartment,
      manifest: () => window.NCNEffectsDepartmentManifest,
      retireLegacy: retireLegacyEffects
    }),
    Object.freeze({
      name: "weather",
      factory: () => window.createNCNWeatherDepartment,
      manifest: () => window.NCNWeatherDepartmentManifest,
      retireLegacy: retireLegacyWeather
    }),
    Object.freeze({
      name: "chamber-motion",
      factory: createChamberMotionFactory,
      manifest: () => window.NCNChamberMotionPublication?.manifest,
      retireLegacy: retireLegacyChamberMotion,
      activate: activateChamberMotion
    })
  ]);

  const installed = new Map();
  let readyPromise = null;
  let readyState = "idle";
  let failure = null;
  let weatherProof = null;
  let chamberMotionProof = null;

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

  function completePublication(specification, service, status, manifest, report = null, result = null) {
    const legacy = specification.retireLegacy?.(service) || null;
    const activation = specification.activate?.(service) || null;
    const record = Object.freeze({
      name: specification.name,
      status,
      version: manifest.version,
      report,
      legacy,
      activation,
      snapshot: service?.snapshot?.() || result?.result?.snapshot || null
    });
    installed.set(specification.name, record);
    if (status === "installed") events?.emit?.("integration:department-installed", record);
    return record;
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
      const service = integration?.getService?.(name);
      if (!service) throw new Error(`Installed ${name} service is unavailable.`);
      return completePublication(specification, service, "already-installed", manifest);
    }

    const report = intake?.inspect?.(name, factory, manifest);
    if (!report?.accepted) {
      throw new Error(`Accepted ${name} publication failed intake: ${(report?.errors || []).join(" ")}`);
    }

    const result = await intake.install(name, factory, manifest, { replace: true });
    const service = integration?.getService?.(name);
    if (!service) throw new Error(`Installed ${name} service is unavailable.`);
    return completePublication(specification, service, "installed", manifest, report, result);
  }

  function applyWeatherProofMode() {
    const requested = new URLSearchParams(window.location.search).get("weatherTest");
    if (!requested) return null;

    const mode = String(requested).toLowerCase();
    const profiles = Object.freeze({
      mist: Object.freeze({ enabled: true, preset: "mist", intensity: 0.9, wind: 0.18, quality: "high" }),
      heavy: Object.freeze({ enabled: true, preset: "heavy-mist", intensity: 1, wind: 0.22, quality: "high" }),
      rain: Object.freeze({ enabled: true, preset: "rain", intensity: 0.9, wind: 0.28, quality: "high" }),
      electrical: Object.freeze({ enabled: true, preset: "electrical-weather", intensity: 0.9, wind: 0.3, quality: "high" })
    });
    const profile = profiles[mode] || profiles.heavy;
    const selected = profiles[mode] ? mode : "heavy";
    const applied = integration?.applyProfile?.("weather", profile, {
      application: window.NCNApplications?.current?.() || "redwire",
      reason: "weather-mobile-proof",
      requestEffect: selected === "electrical",
      effectIntensity: 0.45
    });

    document.documentElement.dataset.weatherTest = selected;
    weatherProof = Object.freeze({ mode: selected, applied: Boolean(applied), profile });
    events?.emit?.("integration:weather-proof", weatherProof);
    return weatherProof;
  }

  function applyChamberMotionProofMode() {
    const requested = new URLSearchParams(window.location.search).get("motionTest");
    if (!requested) return null;
    const selected = ["single", "left", "right", "large"].includes(String(requested).toLowerCase())
      ? String(requested).toLowerCase()
      : "large";
    chamberMotionProof = window.NCNChamberMotionController?.prove?.(selected) || Object.freeze({
      mode: selected,
      started: false,
      reason: "controller-unavailable"
    });
    events?.emit?.("integration:chamber-motion-proof", chamberMotionProof);
    return chamberMotionProof;
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

    applyWeatherProofMode();
    applyChamberMotionProofMode();
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
      weatherProof,
      chamberMotionProof,
      publications: Object.freeze(publications.map(item => item.name)),
      installed: Object.freeze([...installed.values()]),
      modules: modules?.snapshot?.() || []
    });
  }

  window.NCNIntegratedDepartments = Object.freeze({
    ready,
    installPublication,
    applyWeatherProofMode,
    applyChamberMotionProofMode,
    snapshot,
    isReady: () => readyState === "ready"
  });

  void ready().catch(error => {
    console.error("[NCN integration] accepted department installation failed", error);
  });
})();
