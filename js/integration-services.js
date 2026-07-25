/*==================================================
  NCN INTEGRATION SERVICES

  Department-facing façade over the stable viewer host. Incoming modules receive
  the versioned contract and visual director without widening the protected host.
==================================================*/

window.NCNIntegration = (() => {
  const contract = window.NCNIntegrationContract || {};
  const host = window.NCNViewerHost;
  const modules = window.NCNModules;
  const lifecycle = window.NCNViewerLifecycle;
  const events = window.NCNEvents;
  const director = window.NCNVisualDirector;
  const intake = window.NCNModuleIntake;

  const PROFILE_MODULES = Object.freeze([
    contract.MODULES?.WEATHER || "weather",
    contract.MODULES?.EFFECTS || "effects",
    contract.MODULES?.CHAMBER_MOTION || "chamber-motion"
  ]);

  let servicesReady = false;
  let servicesPromise = null;
  let bootRunning = false;

  function getService(name, options = {}) {
    const key = String(name || "").trim();
    if (!key) throw new TypeError("A service name is required.");
    const service = modules?.get?.(key) || null;
    if (!service && options.required === true) {
      throw new Error(`Required integration service is unavailable: ${key}`);
    }
    return service;
  }

  function context() {
    return Object.freeze({
      ...(host?.context?.() || {}),
      contract,
      director,
      intake,
      integration: api
    });
  }

  function adaptInstance(instance) {
    if (!instance || typeof instance !== "object") return instance;
    return new Proxy(instance, {
      get(target, property) {
        const value = Reflect.get(target, property, target);
        if (property === "init" && typeof value === "function") {
          return () => value.call(target, context());
        }
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
  }

  function wrapImplementation(implementation) {
    if (typeof implementation === "function") {
      return async () => adaptInstance(await implementation(context()));
    }
    return adaptInstance(implementation);
  }

  function createBootAdapter() {
    const sequence = () => window.NCNBootSequence || null;
    return Object.freeze({
      init() { return sequence()?.init?.(context()); },
      suspend(reason) { return sequence()?.suspend?.(reason); },
      resume(reason) { return sequence()?.resume?.(reason); },
      reset(reason) { return sequence()?.reset?.(reason); },
      destroy(reason) { return sequence()?.destroy?.(reason); },
      run(options) {
        const implementation = sequence();
        return typeof implementation?.run === "function"
          ? implementation.run(context(), options)
          : Promise.resolve(false);
      },
      snapshot: () => sequence()?.snapshot?.() || Object.freeze({ installed: false })
    });
  }

  function observeResult(result, label) {
    if (result && typeof result.then === "function") {
      void result.catch(error => console.error(`[NCN integration] ${label} failed`, error));
    }
  }

  function applyProfile(name, profile = {}, meta = {}) {
    const key = String(name || "").trim();
    const service = getService(key);
    if (!service) return false;

    let result;
    let method = null;
    if (typeof service.applyProfile === "function") {
      method = "applyProfile";
      result = service.applyProfile(profile, meta);
    } else if (typeof service.configure === "function") {
      method = "configure";
      result = service.configure(profile, meta);
    } else if (typeof service.setProfile === "function") {
      method = "setProfile";
      result = service.setProfile(profile, meta);
    } else if (typeof service.setWeather === "function") {
      method = "setWeather";
      result = service.setWeather(profile, meta);
    } else if (key === (contract.MODULES?.WEATHER || "weather")
      && (service.setPreset || service.setIntensity || service.setEnabled)) {
      method = "weather-controls";
      service.setEnabled?.(profile.enabled !== false);
      const preset = profile.preset
        || (profile.enabled === false ? "clear" : Number(profile.mist) > 0 ? "mist" : "clear");
      service.setPreset?.(preset);
      service.setIntensity?.(Number.isFinite(profile.intensity) ? profile.intensity : Number(profile.mist) || 0);
      if (Number.isFinite(profile.wind)) service.setWind?.({ x: profile.wind, y: 0, z: 0 });
    } else if (key === (contract.MODULES?.CHAMBER_MOTION || "chamber-motion")
      && typeof service.setEnabled === "function") {
      method = "setEnabled";
      result = service.setEnabled(profile.enabled !== false);
    }

    if (!method) return false;
    observeResult(result, `${key}.${method}`);
    events?.emit?.("integration:profile-applied", { name: key, profile, method, meta });
    return true;
  }

  function currentApplicationName() {
    return window.NCNApplications?.current?.()
      || (typeof NCN_STATE !== "undefined" ? NCN_STATE.activeApp : "redwire")
      || "redwire";
  }

  function profileFor(name, applicationProfile) {
    if (name === (contract.MODULES?.WEATHER || "weather")) return applicationProfile?.weather;
    if (name === (contract.MODULES?.EFFECTS || "effects")) return applicationProfile?.effects;
    if (name === (contract.MODULES?.CHAMBER_MOTION || "chamber-motion")) return applicationProfile?.chamberMotion;
    return null;
  }

  function syncApplicationProfile(reason = "integration-sync", onlyName = null) {
    const application = currentApplicationName();
    const applicationProfile = window.NCNEnvironment?.profile?.(application);
    if (!applicationProfile) return Object.freeze({ application, applied: [] });

    const names = onlyName ? [onlyName] : PROFILE_MODULES;
    const applied = names.filter(name => {
      const profile = profileFor(name, applicationProfile);
      return profile ? applyProfile(name, profile, { application, reason }) : false;
    });
    return Object.freeze({ application, applied: Object.freeze(applied) });
  }

  async function initialiseCoreServices() {
    if (!host?.isReady?.()) await host?.init?.();

    if (!modules?.has?.(contract.MODULES?.VISUAL_DIRECTOR || "visual-director")) {
      const handle = host.registerModule(
        contract.MODULES?.VISUAL_DIRECTOR || "visual-director",
        director,
        { autoInit: false, manifest: Object.freeze({ department: "integration", version: "1", core: true }) }
      );
      await handle.init();
    }

    if (!modules?.has?.(contract.MODULES?.BOOT || "boot")) {
      const handle = host.registerModule(
        contract.MODULES?.BOOT || "boot",
        createBootAdapter(),
        {
          autoInit: false,
          dependencies: [contract.MODULES?.VISUAL_DIRECTOR || "visual-director"],
          manifest: Object.freeze({ department: "boot", version: "slot", core: true })
        }
      );
      await handle.init();
    }

    servicesReady = true;
    events?.emit?.("integration:ready", snapshot());
    return snapshot();
  }

  async function ensureCoreServices() {
    if (servicesReady) return snapshot();
    if (!servicesPromise) {
      servicesPromise = initialiseCoreServices().catch(error => {
        servicesPromise = null;
        throw error;
      });
    }
    return servicesPromise;
  }

  function activeDependants(name) {
    return (modules?.snapshot?.() || []).filter(record => (
      record.dependencies?.includes?.(name)
      && ["ready", "suspended", "initialising"].includes(record.state)
    ));
  }

  async function installModule(name, implementation, options = {}) {
    await ensureCoreServices();
    const key = String(name || "").trim();
    if (!key) throw new TypeError("An integration module name is required.");

    const exists = modules?.has?.(key);
    if (exists) {
      if (options.replace !== true) throw new Error(`Module already installed: ${key}`);
      const dependants = activeDependants(key);
      if (dependants.length) {
        throw new Error(`Cannot replace ${key} while active dependants remain: ${dependants.map(item => item.name).join(", ")}`);
      }
      await modules.destroy(key, "integration-replace");
    }

    const handle = host.registerModule(key, wrapImplementation(implementation), {
      ...options,
      replace: exists,
      autoInit: false
    });
    const instance = options.autoInit === false ? null : await handle.init();

    if (lifecycle?.current?.() === lifecycle?.STATES?.SUSPENDED) {
      await handle.suspend("installed-while-suspended");
    }

    if (PROFILE_MODULES.includes(key)) syncApplicationProfile("module-installed", key);
    events?.emit?.("integration:module-installed", {
      name: key,
      manifest: options.manifest || null,
      snapshot: handle.snapshot()
    });
    return Object.freeze({ handle, instance, snapshot: handle.snapshot() });
  }

  async function runBoot(options = {}) {
    await ensureCoreServices();
    if (bootRunning) return false;
    bootRunning = true;
    const owner = "boot-coordinator";
    const hold = director?.hold?.(director.MODES.BOOTING, {
      owner,
      priority: lifecycle?.PRIORITY?.transition || 70
    });

    lifecycle?.transition?.(lifecycle.STATES.BOOTING, { reason: options.reason || "boot", force: true });
    events?.emit?.(contract.EVENTS?.BOOT_START || "boot:start", { options });

    try {
      const boot = getService(contract.MODULES?.BOOT || "boot", { required: true });
      const result = typeof boot?.run === "function" ? await boot.run(options) : false;
      events?.emit?.(contract.EVENTS?.BOOT_COMPLETE || "boot:complete", { result });
      if (lifecycle?.current?.() === lifecycle?.STATES?.BOOTING) {
        lifecycle.transition(lifecycle.STATES.READY, { reason: "boot-complete", force: true });
      }
      return result;
    } catch (error) {
      events?.emit?.(contract.EVENTS?.BOOT_ERROR || "boot:error", { error });
      lifecycle?.transition?.(lifecycle.STATES.DEGRADED, { reason: "boot-error", error, force: true });
      throw error;
    } finally {
      hold?.release?.("boot-finished");
      director?.releaseOwner?.(owner, "boot-finished");
      bootRunning = false;
    }
  }

  function snapshot() {
    return Object.freeze({
      ready: servicesReady,
      bootRunning,
      contractVersion: contract.API_VERSION || null,
      director: director?.snapshot?.() || null,
      intakeCount: intake?.snapshot?.().length || 0,
      modules: modules?.snapshot?.() || []
    });
  }

  const api = Object.freeze({
    ensureCoreServices,
    installModule,
    getService,
    requireService: name => getService(name, { required: true }),
    applyProfile,
    syncApplicationProfile,
    runBoot,
    context,
    snapshot,
    isReady: () => servicesReady
  });

  function start() {
    void ensureCoreServices().catch(error => {
      console.error("[NCN integration] failed to initialise services", error);
      lifecycle?.transition?.(lifecycle.STATES.DEGRADED, {
        reason: "integration-services-error",
        error,
        force: true
      });
    });
  }

  if (host?.isReady?.()) start();
  else events?.once?.("host:ready", start);

  return api;
})();
