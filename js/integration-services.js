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
  const departmentContexts = window.NCNDepartmentContext;

  const PROFILE_MODULES = Object.freeze([
    contract.MODULES?.WEATHER || "weather",
    contract.MODULES?.EFFECTS || "effects",
    contract.MODULES?.CHAMBER_MOTION || "chamber-motion"
  ]);
  const MANAGED_METHODS = Object.freeze(["init", "suspend", "resume", "reset", "destroy"]);
  const PROFILE_METHODS = Object.freeze({
    weather: Object.freeze(["applyProfile", "configure", "setProfile", "setWeather", "setEnabled"]),
    effects: Object.freeze(["applyProfile", "configure", "setProfile"]),
    "chamber-motion": Object.freeze(["applyProfile", "configure", "setProfile", "setEnabled"])
  });
  const REPLACEABLE_MODULES = new Set(contract.REPLACEABLE_MODULES || ["boot", "effects", "weather", "chamber-motion"]);
  const PROTECTED_MODULES = new Set(contract.PROTECTED_MODULES || ["visual-director", "optical", "dripfeed"]);
  const PROTECTED_DEPENDENCIES = new Set([
    contract.MODULES?.OPTICAL || "optical",
    contract.MODULES?.DRIPFEED || "dripfeed"
  ]);
  const BOOT_SLOT_MANIFEST = Object.freeze({
    name: contract.MODULES?.BOOT || "boot",
    department: "boot",
    dependencies: [
      contract.MODULES?.VISUAL_DIRECTOR || "visual-director",
      contract.MODULES?.EFFECTS || "effects",
      contract.MODULES?.WEATHER || "weather",
      contract.MODULES?.CHAMBER_MOTION || "chamber-motion"
    ],
    runtimeGroups: [contract.RUNTIME_GROUPS?.BOOT || "boot"],
    visualChannels: Object.values(contract.VISUAL_CHANNELS || {}),
    layers: []
  });

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

  function context(owner = "integration", manifest = {}) {
    if (departmentContexts?.create) return departmentContexts.create(owner, manifest);
    return Object.freeze({
      ...(host?.context?.() || {}),
      contract,
      director,
      integration: Object.freeze({
        getService,
        requireService: name => getService(name, { required: true })
      })
    });
  }

  function adaptInstance(instance, moduleContext) {
    if (!instance || typeof instance !== "object") return instance;
    return new Proxy(instance, {
      get(target, property) {
        const value = Reflect.get(target, property, target);
        if (property === "init" && typeof value === "function") {
          return () => value.call(target, moduleContext);
        }
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
  }

  async function prepareImplementation(implementation, name, manifest = {}) {
    const moduleContext = context(name, manifest);
    const created = typeof implementation === "function"
      ? await implementation(moduleContext)
      : implementation;
    return adaptInstance(created, moduleContext);
  }

  function validatePrepared(name, instance) {
    const key = String(name);
    if (!instance || typeof instance !== "object") {
      throw new TypeError(`Module ${key} did not return an object instance.`);
    }
    for (const method of MANAGED_METHODS) {
      if (typeof instance[method] !== "function") {
        throw new TypeError(`Module ${key} is missing required method ${method}().`);
      }
    }
    const profileMethods = PROFILE_METHODS[key];
    if (profileMethods && !profileMethods.some(method => typeof instance[method] === "function")) {
      throw new TypeError(`Module ${key} has no accepted application-profile entry point.`);
    }
    if (key === (contract.MODULES?.BOOT || "boot") && typeof instance.run !== "function") {
      throw new TypeError("The boot module is missing run(options).");
    }
    return instance;
  }

  function createBootAdapter() {
    const sequence = () => window.NCNBootSequence || null;
    const bootContext = () => context(contract.MODULES?.BOOT || "boot", BOOT_SLOT_MANIFEST);
    return Object.freeze({
      init() { return sequence()?.init?.(bootContext()); },
      suspend(reason) { return sequence()?.suspend?.(reason); },
      resume(reason) { return sequence()?.resume?.(reason); },
      reset(reason) { return sequence()?.reset?.(reason); },
      destroy(reason) { return sequence()?.destroy?.(reason); },
      run(options) {
        const implementation = sequence();
        return typeof implementation?.run === "function"
          ? implementation.run(bootContext(), options)
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

  async function prepareDependencies(dependencies = []) {
    for (const dependency of dependencies) {
      if (PROTECTED_DEPENDENCIES.has(dependency)) {
        throw new Error(`Direct dependency on ${dependency} is forbidden; use context.views instead.`);
      }
      if (!modules?.has?.(dependency)) throw new Error(`Unknown module dependency: ${dependency}`);
      await modules.init(dependency);
    }
  }

  async function installModule(name, implementation, options = {}) {
    await ensureCoreServices();
    const key = String(name || "").trim();
    if (!key) throw new TypeError("An integration module name is required.");
    if (PROTECTED_MODULES.has(key)) throw new Error(`Protected module slot cannot be installed: ${key}`);

    const manifest = Object.freeze({
      ...(options.manifest || {}),
      name: key,
      dependencies: Object.freeze([...(options.dependencies || options.manifest?.dependencies || [])])
    });
    await prepareDependencies(manifest.dependencies);
    const prepared = validatePrepared(key, await prepareImplementation(implementation, key, manifest));
    const exists = modules?.has?.(key);

    if (exists) {
      if (!REPLACEABLE_MODULES.has(key)) throw new Error(`Module slot is not replaceable: ${key}`);
      if (options.replace !== true) throw new Error(`Module already installed: ${key}`);
      const dependants = activeDependants(key);
      if (dependants.length) {
        throw new Error(`Cannot replace ${key} while active dependants remain: ${dependants.map(item => item.name).join(", ")}`);
      }
      await modules.destroy(key, "integration-replace");
    }

    const handle = host.registerModule(key, prepared, {
      ...options,
      dependencies: manifest.dependencies,
      manifest,
      replace: exists,
      autoInit: false
    });

    let instance = null;
    try {
      instance = options.autoInit === false ? null : await handle.init();
    } catch (error) {
      lifecycle?.transition?.(lifecycle.STATES.DEGRADED, {
        reason: `module-init-error:${key}`,
        error,
        force: true
      });
      throw error;
    }

    if (lifecycle?.current?.() === lifecycle?.STATES?.SUSPENDED) {
      await handle.suspend("installed-while-suspended");
    }

    if (PROFILE_MODULES.includes(key)) syncApplicationProfile("module-installed", key);
    events?.emit?.("integration:module-installed", {
      name: key,
      manifest,
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
