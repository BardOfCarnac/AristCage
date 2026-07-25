/*==================================================
  NCN VIEWER HOST

  Integration shell for boot, weather, effects and chamber modules. It exposes
  one shared context and one reset/suspend/destroy path without altering the
  protected production composition.
==================================================*/

window.NCNViewerHost = (() => {
  const runtime = window.NCNViewerRuntime;
  const lifecycle = window.NCNViewerLifecycle;
  const events = window.NCNEvents;
  const scene = window.NCNScene;
  const modules = window.NCNModules;
  const optical = window.NCNOptical;
  const dripfeed = window.NCNDripfeed;
  const environmentHost = window.NCNEnvironmentHost;

  let initialised = false;
  let destroyed = false;

  function bridgeLegacyEvents() {
    events?.bridgeWindow?.("ncn:lifecycle-change", "lifecycle:change");
    events?.bridgeWindow?.("ncn:application-change", "application:change");
    events?.bridgeWindow?.("ncn:panel-change", "panel:change");
    events?.bridgeWindow?.("ncn:chamber-camera-change", "chamber:camera");
    events?.bridgeWindow?.("ncn:application-environment-phase", "environment:phase");
  }

  function activeApplication() {
    return window.NCNApplications?.current?.()
      || (typeof NCN_STATE !== "undefined" ? NCN_STATE.activeApp : null)
      || "redwire";
  }

  function currentView() {
    return activeApplication() === "dripfeed" ? dripfeed : optical;
  }

  function zoneFor(element) {
    if (!element?.isConnected) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return Object.freeze({
      element,
      rect: Object.freeze({
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      })
    });
  }

  const layerContext = Object.freeze({
    get environment() { return environmentHost?.root?.() || null; },
    get weather() { return environmentHost?.weatherLayers?.() || Object.freeze({}); },
    get chamberMotion() { return environmentHost?.layer?.("chamber-motion") || null; },
    get effects() { return environmentHost?.layer?.("effects") || null; }
  });

  const settingsContext = Object.freeze({
    get reducedMotion() { return runtime?.getQuality?.() === "reduced"; },
    get quality() { return runtime?.getQuality?.() || "full"; }
  });

  const viewContext = Object.freeze({
    optical,
    dripfeed,
    current: currentView,
    getReadingZone: () => currentView()?.getReadingZone?.() || null,
    getControlZones() {
      if (activeApplication() === "dripfeed") return dripfeed?.getControlZones?.() || [];
      return [document.querySelector(".rail"), document.querySelector("#desktop-inspector")]
        .map(zoneFor)
        .filter(Boolean);
    },
    getDepthPlaneDefinitions: () => currentView()?.getDepthPlaneDefinitions?.() || []
  });

  function context() {
    return Object.freeze({
      runtime,
      lifecycle,
      events,
      scene,
      layers: layerContext,
      views: viewContext,
      optical,
      dripfeed,
      applications: window.NCNApplications,
      environment: window.NCNEnvironment,
      settings: settingsContext
    });
  }

  function normaliseWeatherSnapshot(snapshot) {
    const desired = snapshot?.desired || snapshot || null;
    if (!desired) return null;
    return {
      ...desired,
      mist: Number.isFinite(desired.mist) ? desired.mist : desired.targetMist
    };
  }

  function createWeatherAdapter() {
    let saved = null;
    const renderer = () => window.NCNWeatherRenderer || null;
    return Object.freeze({
      suspend() {
        const api = renderer();
        saved = normaliseWeatherSnapshot(api?.snapshot?.());
        if (typeof api?.suspend === "function") api.suspend();
        else api?.disable?.();
      },
      resume() {
        const api = renderer();
        if (typeof api?.resume === "function") api.resume();
        else if (saved?.enabled) api?.configure?.(saved);
        saved = null;
      },
      reset() {
        const api = renderer();
        if (typeof api?.reset === "function") api.reset();
        else api?.disable?.();
      },
      destroy() {
        const api = renderer();
        if (typeof api?.destroy === "function") api.destroy();
        else api?.disable?.();
        saved = null;
      },
      snapshot: () => renderer()?.snapshot?.() || null
    });
  }

  function createEffectsAdapter() {
    const effects = () => window.NCNEffects || null;
    return Object.freeze({
      suspend() {
        const api = effects();
        if (typeof api?.suspend === "function") api.suspend();
        else api?.clear?.();
      },
      resume() { effects()?.resume?.(); },
      reset() {
        const api = effects();
        if (typeof api?.reset === "function") api.reset();
        else api?.clear?.();
      },
      destroy() {
        const api = effects();
        if (typeof api?.destroy === "function") api.destroy();
        else api?.clear?.();
      }
    });
  }

  function createChamberMotionAdapter() {
    let saved = null;
    const motion = () => window.NCNChamberMotion || null;
    return Object.freeze({
      suspend() {
        const api = motion();
        saved = api?.snapshot?.() || null;
        if (typeof api?.suspend === "function") api.suspend();
        else api?.disable?.();
      },
      resume() {
        const api = motion();
        if (typeof api?.resume === "function") api.resume();
        else if (saved?.enabled) api?.configure?.({ enabled: true });
        saved = null;
      },
      reset() {
        const api = motion();
        if (typeof api?.reset === "function") api.reset();
        else api?.stop?.({ reschedule: false });
      },
      destroy() {
        const api = motion();
        if (typeof api?.destroy === "function") api.destroy();
        else api?.disable?.();
        saved = null;
      },
      snapshot: () => motion()?.snapshot?.() || null
    });
  }

  function registerCoreModules() {
    modules.register("optical", optical, { replace: true });
    modules.register("dripfeed", dripfeed, { replace: true });
    modules.register("effects", createEffectsAdapter(), { replace: true });
    modules.register("weather", createWeatherAdapter(), { replace: true });
    modules.register("chamber-motion", createChamberMotionAdapter(), { replace: true });
  }

  function verify(options = {}) {
    const checks = [];
    const check = (name, pass, detail = "") => checks.push(Object.freeze({ name, pass: Boolean(pass), detail }));

    check("shared runtime", Boolean(runtime?.register && runtime?.snapshot), "NCNViewerRuntime");
    check("lifecycle controller", Boolean(lifecycle?.transition && lifecycle?.allows), "NCNViewerLifecycle");
    check("event bus", Boolean(events?.on && events?.emit), "NCNEvents");
    check("module manager", Boolean(modules?.register && modules?.initAll), "NCNModules");
    check("scene registry", Boolean(scene?.require && scene?.snapshot), "NCNScene");
    check("Optical boundary", Boolean(optical?.getReadingZone && optical?.suspend), "NCNOptical");
    check("Dripfeed boundary", Boolean(dripfeed?.getReadingZone && dripfeed?.suspend), "NCNDripfeed");

    for (const name of environmentHost?.LAYER_NAMES || []) {
      check(`layer:${name}`, Boolean(environmentHost?.layer?.(name)), name);
    }
    const weatherLayers = environmentHost?.weatherLayers?.() || {};
    check("four weather layers", ["far", "rear", "middle", "near"].every(name => Boolean(weatherLayers[name])));

    const moduleStates = modules?.snapshot?.() || [];
    for (const module of moduleStates) {
      check(`module:${module.name}`, ["ready", "suspended"].includes(module.state), module.state);
    }

    const redwireRoot = document.querySelector("#redwire-root");
    const dripfeedRoot = document.querySelector("#dripfeed-root");
    check("protected RedWire root", Boolean(redwireRoot), "#redwire-root");
    check("protected Dripfeed root", Boolean(dripfeedRoot), "#dripfeed-root");
    check("one active application root", Boolean(redwireRoot && dripfeedRoot && redwireRoot.hidden !== dripfeedRoot.hidden));

    const result = Object.freeze({
      passed: checks.every(item => item.pass),
      checks: Object.freeze(checks),
      snapshot: snapshot()
    });
    events?.emit?.("host:verified", result);
    if (!result.passed && options.throwOnFailure === true) {
      const failed = checks.filter(item => !item.pass).map(item => item.name).join(", ");
      throw new Error(`NCN integration host verification failed: ${failed}`);
    }
    return result;
  }

  async function init() {
    if (initialised || destroyed) return snapshot();
    environmentHost?.ensure?.();
    scene?.bootstrap?.();
    bridgeLegacyEvents();
    modules.setContext(context());
    registerCoreModules();
    await modules.initAll();
    initialised = true;
    document.documentElement.dataset.viewerHost = "ready";
    const verification = verify();
    events?.emit?.("host:ready", { snapshot: snapshot(), verification });
    return snapshot();
  }

  async function suspend(reason = "host") {
    if (!initialised || destroyed) return false;
    lifecycle?.transition?.(lifecycle.STATES.SUSPENDED || lifecycle.STATES.SLEEPING, { reason });
    runtime?.suspend?.(reason);
    await modules.suspendAll(reason);
    events?.emit?.("host:suspended", { reason });
    return true;
  }

  async function resume(reason = "host") {
    if (!initialised || destroyed) return false;
    await modules.resumeAll(reason);
    runtime?.resume?.(reason);
    lifecycle?.transition?.(lifecycle.STATES.READY, { reason, force: true });
    events?.emit?.("host:resumed", { reason });
    return true;
  }

  async function reset(reason = "host-reset") {
    if (!initialised || destroyed) return false;
    lifecycle?.transition?.(lifecycle.STATES.RESETTING || lifecycle.STATES.BOOTING, { reason, force: true });
    runtime?.suspend?.(reason);
    await modules.resetAll(reason);
    window.NCNEnvironment?.disablePresentation?.();
    environmentHost?.ensure?.();
    scene?.bootstrap?.();
    runtime?.reset?.(reason);
    const application = activeApplication();
    window.NCNEnvironment?.activateApplication?.(application, { previous: application, reset: true });
    await modules.resumeAll(reason);
    runtime?.resume?.(reason);
    lifecycle?.transition?.(lifecycle.STATES.READY, { reason, force: true });
    const verification = verify();
    events?.emit?.("host:reset", { reason, application, verification });
    return verification.passed;
  }

  async function destroy(reason = "host-destroy") {
    if (destroyed) return false;
    destroyed = true;
    await modules.destroyAll(reason);
    runtime?.destroy?.(reason);
    lifecycle?.destroy?.(reason);
    events?.emit?.("host:destroyed", { reason });
    events?.clear?.();
    document.documentElement.dataset.viewerHost = "destroyed";
    return true;
  }

  function registerModule(name, implementation, options = {}) {
    if (destroyed) throw new Error("Cannot register modules on a destroyed viewer host.");
    const handle = modules.register(name, implementation, options);
    if (initialised && options.autoInit !== false) {
      void handle.init().catch(error => console.error(`[NCN host] failed to initialise module ${name}`, error));
    }
    return handle;
  }

  function snapshot() {
    return Object.freeze({
      initialised,
      destroyed,
      lifecycle: lifecycle?.snapshot?.() || null,
      runtime: runtime?.snapshot?.() || null,
      scene: scene?.snapshot?.() || [],
      modules: modules?.snapshot?.() || [],
      optical: optical?.snapshot?.() || null,
      dripfeed: dripfeed?.snapshot?.() || null,
      application: activeApplication()
    });
  }

  function boot() {
    void init().catch(error => {
      console.error("[NCN host] failed to initialise", error);
      document.documentElement.dataset.viewerHost = "error";
      lifecycle?.transition?.(lifecycle.STATES.DEGRADED, { reason: "host-init-error", error, force: true });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  return Object.freeze({
    init,
    suspend,
    resume,
    reset,
    destroy,
    registerModule,
    context,
    verify,
    snapshot,
    isReady: () => initialised && !destroyed
  });
})();