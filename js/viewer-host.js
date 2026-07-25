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

  let initialised = false;
  let destroyed = false;
  let savedWeather = null;
  let savedMotion = null;

  function bridgeLegacyEvents() {
    events?.bridgeWindow?.("ncn:lifecycle-change", "lifecycle:change");
    events?.bridgeWindow?.("ncn:application-change", "application:change");
    events?.bridgeWindow?.("ncn:panel-change", "panel:change");
    events?.bridgeWindow?.("ncn:chamber-camera-change", "chamber:camera");
    events?.bridgeWindow?.("ncn:application-environment-phase", "environment:phase");
  }

  function context() {
    return Object.freeze({
      runtime,
      lifecycle,
      events,
      scene,
      optical,
      applications: window.NCNApplications,
      environment: window.NCNEnvironment,
      settings: Object.freeze({
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      })
    });
  }

  function registerCoreModules() {
    modules.register("optical", optical, { replace: true });
    modules.register("effects", {
      reset: () => window.NCNEffects?.clear?.(),
      suspend: () => window.NCNEffects?.clear?.(),
      resume: () => undefined,
      destroy: () => window.NCNEffects?.clear?.()
    }, { replace: true });
    modules.register("weather", {
      suspend() {
        savedWeather = window.NCNWeatherRenderer?.snapshot?.() || null;
        window.NCNWeatherRenderer?.disable?.();
      },
      resume() {
        if (savedWeather?.enabled) window.NCNWeatherRenderer?.configure?.(savedWeather);
        savedWeather = null;
      },
      reset() {
        window.NCNWeatherRenderer?.disable?.();
      },
      destroy() {
        window.NCNWeatherRenderer?.disable?.();
      }
    }, { replace: true });
    modules.register("chamber-motion", {
      suspend() {
        savedMotion = window.NCNChamberMotion?.snapshot?.() || null;
        window.NCNChamberMotion?.disable?.();
      },
      resume() {
        if (savedMotion?.enabled) window.NCNChamberMotion?.configure?.({ enabled: true });
        savedMotion = null;
      },
      reset() {
        window.NCNChamberMotion?.stop?.({ reschedule: false });
      },
      destroy() {
        window.NCNChamberMotion?.disable?.();
      }
    }, { replace: true });
  }

  async function init() {
    if (initialised || destroyed) return snapshot();
    window.NCNEnvironmentHost?.ensure?.();
    scene?.bootstrap?.();
    bridgeLegacyEvents();
    modules.setContext(context());
    registerCoreModules();
    await modules.initAll();
    initialised = true;
    document.documentElement.dataset.viewerHost = "ready";
    events?.emit?.("host:ready", snapshot());
    return snapshot();
  }

  async function suspend(reason = "host") {
    if (!initialised || destroyed) return false;
    lifecycle?.transition?.(lifecycle.STATES.SUSPENDED || lifecycle.STATES.SLEEPING, { reason });
    await modules.suspendAll(reason);
    runtime?.suspend?.(reason);
    events?.emit?.("host:suspended", { reason });
    return true;
  }

  async function resume(reason = "host") {
    if (!initialised || destroyed) return false;
    runtime?.resume?.(reason);
    await modules.resumeAll(reason);
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
    window.NCNEnvironmentHost?.ensure?.();
    scene?.bootstrap?.();
    runtime?.reset?.(reason);
    const application = window.NCNApplications?.current?.() || "redwire";
    window.NCNEnvironment?.activateApplication?.(application, { previous: application, reset: true });
    runtime?.resume?.(reason);
    lifecycle?.transition?.(lifecycle.STATES.READY, { reason, force: true });
    events?.emit?.("host:reset", { reason, application });
    return true;
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
    if (initialised && options.autoInit !== false) void handle.init();
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
      application: window.NCNApplications?.current?.() || null
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
    snapshot,
    isReady: () => initialised && !destroyed
  });
})();
