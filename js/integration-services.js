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

  let servicesReady = false;
  let bootRunning = false;

  function context() {
    return Object.freeze({
      ...(host?.context?.() || {}),
      contract,
      director,
      intake,
      integration: api
    });
  }

  function createBootAdapter() {
    const sequence = () => window.NCNBootSequence || null;
    return Object.freeze({
      init(sharedContext) { return sequence()?.init?.(sharedContext); },
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

  async function ensureCoreServices() {
    if (servicesReady) return snapshot();
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

    const wrapped = typeof implementation === "function"
      ? () => implementation(context())
      : implementation;
    const handle = host.registerModule(key, wrapped, {
      ...options,
      replace: exists,
      autoInit: false
    });
    const instance = options.autoInit === false ? null : await handle.init();

    if (lifecycle?.current?.() === lifecycle?.STATES?.SUSPENDED) {
      await handle.suspend("installed-while-suspended");
    }

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
      const boot = modules?.get?.(contract.MODULES?.BOOT || "boot");
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
  else window.addEventListener("ncn:host-ready", start, { once: true });

  return api;
})();
