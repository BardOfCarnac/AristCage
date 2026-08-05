/*==================================================
  NCN APPLICATION ENVIRONMENT MANAGER

  The chamber is terminal infrastructure. Applications explicitly request
  presentation modules; an empty profile inherits no renderer, weather,
  ambient faults or chamber motion from the previous application.
==================================================*/

window.NCNEnvironment = (() => {
  const lifecycle = window.NCNViewerLifecycle;

  const profiles = Object.freeze({
    redwire: Object.freeze({
      name: "redwire",
      chamber: "background",
      renderer: "optical",
      weather: Object.freeze({
        enabled: true,
        preset: "mist",
        intensity: 0.46,
        mist: 0.46,
        wind: 0,
        quality: "auto",
        seed: 2045,
        controlAttenuation: 0.68
      }),
      effects: Object.freeze({ ambient: true, interaction: true }),
      chamberMotion: Object.freeze({
        enabled: true,
        intensity: 0.62,
        quality: "full",
        maxActive: 2,
        clusterSize: Object.freeze([2, 6]),
        durationRange: Object.freeze([5600, 8200]),
        maxFps: 30,
        effects: Object.freeze({})
      })
    }),
    dripfeed: Object.freeze({
      name: "dripfeed",
      chamber: "background",
      renderer: "application",
      weather: Object.freeze({
        enabled: false,
        preset: "clear",
        intensity: 0,
        mist: 0,
        wind: 0,
        quality: "auto",
        seed: 2045
      }),
      effects: Object.freeze({ ambient: false, interaction: false }),
      chamberMotion: Object.freeze({ enabled: false })
    })
  });

  let activeProfile = "empty";
  let diagnosticsObserver = null;

  function profile(name) {
    return profiles[name] || Object.freeze({
      name: String(name || "empty"),
      chamber: "background",
      renderer: "application",
      weather: Object.freeze({
        enabled: false,
        preset: "clear",
        intensity: 0,
        mist: 0,
        wind: 0,
        quality: "auto",
        seed: 2045
      }),
      effects: Object.freeze({ ambient: false, interaction: false }),
      chamberMotion: Object.freeze({ enabled: false })
    });
  }

  function routeProfile(name, next, fallback, meta = {}) {
    const integration = window.NCNIntegration;
    if (integration?.isReady?.() && integration.applyProfile?.(name, next, meta)) return true;
    fallback?.();
    return false;
  }

  function environmentService(name, fallback, capabilities = []) {
    const candidate = window.NCNIntegration?.getService?.(name);
    if (candidate && (!capabilities.length || capabilities.some(method => typeof candidate[method] === "function"))) {
      return candidate;
    }
    return fallback || null;
  }

  function announceChamberGeometry() {
    const camera = window.NCNChamberCamera?.snapshot?.();
    if (!camera) return;
    window.dispatchEvent(new CustomEvent("ncn:chamber-camera-change", {
      detail: camera
    }));
  }

  function ensureNeutralChamber() {
    window.NCNEnvironmentHost?.ensure?.();
    const chamber = window.LayeredChamber;
    if (!chamber) return false;

    if (chamber.MODES && chamber.getMode?.() !== chamber.MODES.BACKGROUND) {
      chamber.setMode(chamber.MODES.BACKGROUND, {
        persist: false,
        restartAnimation: chamber.getMode?.() === chamber.MODES.OFF
      });
    } else {
      chamber.mount?.();
      chamber.refresh?.();
    }

    requestAnimationFrame(() => {
      chamber.refresh?.();
      announceChamberGeometry();
    });
    return true;
  }

  function disablePresentation() {
    routeProfile("weather", {
      enabled: false,
      preset: "clear",
      intensity: 0,
      mist: 0,
      wind: 0,
      quality: "auto",
      seed: 2045
    }, () => {
      window.NCNWeatherRenderer?.disable?.();
    }, { application: activeProfile, reason: "disable-presentation" });
    routeProfile("chamber-motion", { enabled: false }, () => {
      window.NCNChamberMotion?.disable?.();
    }, { application: activeProfile, reason: "disable-presentation", cancel: true });
    routeProfile("effects", { ambient: false, interaction: false }, () => {
      window.NCNEffects?.setProfile?.({ ambient: false, interaction: false });
    }, { application: activeProfile, reason: "disable-presentation" });
    window.OpticalProjection?.disable?.({ persist: false });
    window.HeuristicRangefinder?.disable?.({ persist: false });
    activeProfile = "empty";
    document.documentElement.dataset.environmentProfile = "empty";
    updateDiagnostics();
  }

  async function prepareApplication(nextName, options = {}) {
    ensureNeutralChamber();
    disablePresentation();
    window.dispatchEvent(new CustomEvent("ncn:application-environment-phase", {
      detail: { phase: "empty", previous: options.previous || null, next: nextName }
    }));

    if (options.animate === false) return false;
    return window.NCNRealignment?.run?.(
      `application:${options.previous || "unknown"}->${nextName}`,
      { magnitude: Number(options.magnitude) || 1.08 }
    ) || false;
  }

  function activateApplication(name, options = {}) {
    const next = profile(name);
    ensureNeutralChamber();

    if (next.renderer === "optical") {
      window.OpticalProjection?.enable?.({ persist: false });
    } else {
      window.OpticalProjection?.disable?.({ persist: false });
    }

    const meta = {
      application: next.name,
      previous: options.previous || null,
      reason: options.initial ? "initial-application-profile" : "application-profile-ready"
    };
    routeProfile("weather", next.weather, () => {
      window.NCNWeatherRenderer?.configure?.(next.weather);
    }, meta);
    routeProfile("chamber-motion", next.chamberMotion, () => {
      window.NCNChamberMotion?.configure?.(next.chamberMotion);
    }, { ...meta, cancel: next.chamberMotion.enabled === false });
    routeProfile("effects", next.effects, () => {
      window.NCNEffects?.setProfile?.(next.effects);
    }, meta);

    activeProfile = next.name;
    document.documentElement.dataset.environmentProfile = next.name;
    lifecycle?.transition?.(lifecycle.STATES.READY, {
      reason: meta.reason,
      application: next.name,
      force: true
    });
    window.OpticalProjection?.refresh?.();
    window.LayeredChamber?.refresh?.();
    requestAnimationFrame(announceChamberGeometry);
    window.dispatchEvent(new CustomEvent("ncn:application-environment-phase", {
      detail: { phase: "active", previous: options.previous || null, next: next.name }
    }));
    updateDiagnostics();
    return true;
  }

  function diagnosticMarkup() {
    return `
      <section class="diagnostics-section diagnostics-environment-section">
        <div class="diagnostics-heading">Terminal shell · application environment profile</div>
        <div class="diagnostics-app-switch" role="group" aria-label="Environment tests">
          <button type="button" data-debug-environment="realign">Realign</button>
          <button type="button" data-debug-environment="block">Move block</button>
          <button type="button" data-debug-environment="mist">Mist</button>
        </div>
        <div class="diagnostics-app-readout">
          Profile: <strong data-debug-environment-profile>EMPTY</strong> ·
          State: <strong data-debug-viewer-state>READY</strong>
        </div>
      </section>`;
  }

  function updateDiagnostics() {
    const panel = document.querySelector(".diagnostics-panel");
    if (!panel) return;
    const environment = panel.querySelector("[data-debug-environment-profile]");
    const viewerState = panel.querySelector("[data-debug-viewer-state]");
    if (environment) environment.textContent = String(activeProfile).toUpperCase();
    if (viewerState) viewerState.textContent = String(lifecycle?.current?.() || "ready").toUpperCase();
  }

  function attachDiagnostics() {
    const panel = document.querySelector(".diagnostics-panel");
    if (!panel || panel.querySelector(".diagnostics-environment-section")) return;
    panel.querySelector(".diagnostics-title")?.insertAdjacentHTML("afterend", diagnosticMarkup());
    panel.querySelector('[data-debug-environment="realign"]')?.addEventListener("click", () => {
      void window.NCNRealignment?.run?.("diagnostics", { force: true });
    });
    panel.querySelector('[data-debug-environment="block"]')?.addEventListener("click", () => {
      const motion = environmentService(
        "chamber-motion",
        window.NCNChamberMotion,
        ["move", "trigger"]
      );
      if (typeof motion?.move === "function") motion.move({ force: true, duration: 2200 });
      else motion?.trigger?.({
        pattern: "extract-rotate-settle",
        region: "side-walls",
        clusterSize: [3, 6],
        intensity: 0.68,
        duration: 5600
      });
    });
    panel.querySelector('[data-debug-environment="mist"]')?.addEventListener("click", () => {
      const weather = environmentService("weather", window.NCNWeatherRenderer, ["snapshot"]);
      const current = weather?.snapshot?.() || {};
      const desired = current.desired || current;
      const next = {
        enabled: !desired.enabled,
        mist: desired.enabled ? 0 : 0.46,
        intensity: desired.enabled ? 0 : 0.46,
        wind: 0,
        quality: "auto",
        seed: 2045,
        controlAttenuation: 0.68,
        preset: desired.enabled ? "clear" : "mist"
      };
      if (!window.NCNIntegration?.applyProfile?.("weather", next, { reason: "diagnostics" })) {
        window.NCNWeatherRenderer?.setWeather?.(next);
      }
    });
    updateDiagnostics();
  }

  function init() {
    ensureNeutralChamber();
    const initial = window.NCNApplications?.current?.()
      || (typeof NCN_STATE !== "undefined" ? NCN_STATE.activeApp : "redwire");
    activateApplication(initial, { initial: true });

    diagnosticsObserver = new MutationObserver(attachDiagnostics);
    diagnosticsObserver.observe(document.body, { childList: true, subtree: true });
    attachDiagnostics();

    window.addEventListener("ncn:lifecycle-change", updateDiagnostics);
    window.addEventListener("ncn:application-change", event => {
      if (event.detail?.environmentHandled !== true) {
        activateApplication(event.detail?.name || "redwire", {
          previous: event.detail?.previous || null
        });
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  return Object.freeze({
    profiles: () => Object.values(profiles).map(item => ({ ...item })),
    profile,
    ensureNeutralChamber,
    prepareApplication,
    activateApplication,
    disablePresentation,
    current: () => activeProfile
  });
})();