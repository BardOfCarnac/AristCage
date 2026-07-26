/*==================================================
  NCN SHARED DEVELOPER PANEL CONTROLS

  Keeps diagnostics reachable from every application and exposes explicit
  Weather and Chamber Movement overrides without widening either protected app.
==================================================*/
(() => {
  "use strict";

  const WEATHER_PRESETS = Object.freeze({
    clear: Object.freeze({ enabled: false, preset: "clear", intensity: 0, mist: 0, wind: 0 }),
    mist: Object.freeze({ enabled: true, preset: "mist", wind: 0.16 }),
    heavy: Object.freeze({ enabled: true, preset: "heavy-mist", wind: 0.22 }),
    rain: Object.freeze({ enabled: true, preset: "rain", wind: 0.28 }),
    electrical: Object.freeze({ enabled: true, preset: "electrical-weather", wind: 0.3 })
  });

  let panel = null;
  let controls = null;
  let weatherIntensity = null;
  let weatherIntensityOutput = null;
  let weatherStatus = null;
  let motionStatus = null;
  let serviceMessage = null;
  let motionEventsBound = false;

  function currentApplication() {
    return window.NCNApplications?.current?.()
      || (typeof NCN_STATE !== "undefined" ? NCN_STATE.activeApp : "redwire")
      || "redwire";
  }

  function ensureBaseInterface() {
    window.ensureDiagnosticsInterface?.();
    panel = document.querySelector(".diagnostics-panel");

    const toggle = document.querySelector(".diagnostics-toggle");
    if (toggle && !toggle.textContent.trim()) {
      toggle.textContent = document.documentElement.classList.contains("diagnostics-on")
        ? "Dev on"
        : "Dev";
    }
    return panel;
  }

  function controlsMarkup() {
    return `
      <section class="diagnostics-section diagnostics-environment-section" data-debug-service-controls>
        <div class="diagnostics-heading">Environment services · developer overrides</div>

        <div class="diagnostics-service-block" data-debug-weather-controls>
          <div class="diagnostics-service-heading">
            <strong>Weather</strong>
            <span data-debug-weather-status>Waiting for service</span>
          </div>
          <div class="diagnostics-control-grid diagnostics-control-grid--weather">
            <button type="button" data-debug-weather="clear">Off</button>
            <button type="button" data-debug-weather="mist">Mist</button>
            <button type="button" data-debug-weather="heavy">Heavy</button>
            <button type="button" data-debug-weather="rain">Rain</button>
            <button type="button" data-debug-weather="electrical">Electric</button>
          </div>
          <label class="diagnostics-range-control">
            <span>Intensity</span>
            <input type="range" min="0.1" max="1" step="0.05" value="0.8" data-debug-weather-intensity />
            <output data-debug-weather-intensity-output>0.80</output>
          </label>
        </div>

        <div class="diagnostics-service-block" data-debug-motion-controls>
          <div class="diagnostics-service-heading">
            <strong>Chamber Movement</strong>
            <span data-debug-motion-status>Waiting for service</span>
          </div>
          <div class="diagnostics-control-grid diagnostics-control-grid--motion">
            <button type="button" data-debug-motion="left">Left</button>
            <button type="button" data-debug-motion="right">Right</button>
            <button type="button" data-debug-motion="large">Large</button>
            <button type="button" data-debug-motion="settle">Settle</button>
            <button type="button" data-debug-motion="cancel">Cancel</button>
          </div>
        </div>

        <div class="diagnostics-app-readout diagnostics-environment-readout">
          Profile: <strong data-debug-environment-profile>EMPTY</strong> ·
          State: <strong data-debug-viewer-state>READY</strong>
        </div>
        <button type="button" class="diagnostics-restore-profile" data-debug-restore-profile>
          Restore current app profile
        </button>
        <div class="diagnostics-service-message" data-debug-service-message aria-live="polite"></div>
      </section>`;
  }

  function service(name) {
    return window.NCNIntegration?.getService?.(name) || null;
  }

  async function readyServices() {
    try {
      await window.NCNIntegratedDepartments?.ready?.();
      bindMotionEvents();
      return true;
    } catch (error) {
      setMessage(`Department services unavailable: ${String(error?.message || error)}`, true);
      return false;
    }
  }

  function setMessage(message, error = false) {
    if (!serviceMessage) return;
    serviceMessage.textContent = String(message || "");
    serviceMessage.classList.toggle("is-error", Boolean(error));
  }

  function resolvedWeatherIntensity() {
    return Math.max(0.1, Math.min(1, Number(weatherIntensity?.value) || 0.8));
  }

  function weatherProfile(name) {
    const base = WEATHER_PRESETS[name] || WEATHER_PRESETS.mist;
    if (name === "clear") return base;
    const intensity = resolvedWeatherIntensity();
    return Object.freeze({
      ...base,
      intensity,
      mist: ["mist", "heavy"].includes(name) ? intensity : 0,
      quality: "high"
    });
  }

  async function applyWeather(name) {
    if (!await readyServices()) return;
    const profile = weatherProfile(name);
    const applied = window.NCNIntegration?.applyProfile?.("weather", profile, {
      application: currentApplication(),
      reason: `dev-panel-weather:${name}`,
      requestEffect: name === "electrical",
      effectIntensity: profile.intensity || 0
    });
    setMessage(applied ? `Weather override: ${profile.preset}` : "Weather override was not applied.", !applied);
    window.setTimeout(updateReadouts, 50);
  }

  function motionProfile(clusterSize) {
    return Object.freeze({
      enabled: true,
      intensity: 0.82,
      quality: "full",
      maxActive: 1,
      clusterSize,
      durationRange: [5200, 5200],
      maxFps: 30,
      effects: Object.freeze({})
    });
  }

  async function triggerMotion(action) {
    if (!await readyServices()) return;
    const motion = service("chamber-motion");
    if (!motion?.trigger) {
      setMessage("Chamber Movement service is unavailable.", true);
      return;
    }

    if (action === "settle") {
      const result = motion.settle?.({ reason: "dev-panel", duration: 520 });
      setMessage("Requested a clean chamber settle.");
      Promise.resolve(result).finally(() => window.setTimeout(updateReadouts, 30));
      return;
    }
    if (action === "cancel") {
      const result = motion.cancel?.({ reason: "dev-panel" });
      setMessage("Cancelled active chamber movement.");
      Promise.resolve(result).finally(() => window.setTimeout(updateReadouts, 30));
      return;
    }

    const large = action === "large";
    const clusterSize = large ? [4, 7] : [2, 5];
    const region = action === "left"
      ? "left-wall"
      : action === "right"
        ? "right-wall"
        : "side-walls";
    const profile = motionProfile(clusterSize);

    window.NCNIntegration?.applyProfile?.("chamber-motion", profile, {
      application: currentApplication(),
      reason: `dev-panel-motion:${action}`
    });

    const result = motion.trigger({
      pattern: "extract-rotate-settle",
      region,
      targetRegion: "rear-wall",
      clusterSize,
      intensity: profile.intensity,
      duration: 5200,
      effects: Object.freeze({})
    });
    setMessage(`Triggered ${large ? "large" : region} chamber movement.`);
    window.setTimeout(updateReadouts, 30);
    Promise.resolve(result).then(value => {
      setMessage(`Chamber result: ${value?.status || "complete"}.`, value?.status === "error");
      updateReadouts();
    }).catch(error => {
      setMessage(`Chamber movement failed: ${String(error?.message || error)}`, true);
      updateReadouts();
    });
  }

  async function restoreApplicationProfile() {
    if (!await readyServices()) return;
    service("chamber-motion")?.cancel?.({ reason: "dev-panel-profile-restore" });
    const result = window.NCNIntegration?.syncApplicationProfile?.("dev-panel-profile-restore");
    setMessage(`Restored ${result?.application || currentApplication()} environment profile.`);
    window.setTimeout(updateReadouts, 50);
  }

  function updateWeatherReadout() {
    if (!weatherStatus) return;
    const snapshot = service("weather")?.snapshot?.();
    if (!snapshot) {
      weatherStatus.textContent = "Unavailable";
      return;
    }
    const desired = snapshot.desired || snapshot;
    const enabled = desired.enabled !== false && snapshot.enabled !== false;
    const preset = desired.preset || snapshot.targetPreset || snapshot.preset || "clear";
    const intensity = Number(desired.intensity ?? snapshot.targetIntensity ?? snapshot.intensity ?? 0);
    weatherStatus.textContent = enabled ? `${preset} · ${intensity.toFixed(2)}` : "Off";
  }

  function updateMotionReadout() {
    if (!motionStatus) return;
    const snapshot = service("chamber-motion")?.snapshot?.();
    if (!snapshot) {
      motionStatus.textContent = "Unavailable";
      return;
    }
    const active = Number(snapshot.activeSequenceCount || 0);
    const phase = snapshot.activeSequences?.[0]?.phase || snapshot.activeSequences?.[0]?.currentPose?.phase || null;
    if (snapshot.enabled === false) motionStatus.textContent = "Off";
    else if (active) motionStatus.textContent = `${active} active${phase ? ` · ${phase}` : ""}`;
    else motionStatus.textContent = "Ready";
  }

  function updateReadouts() {
    if (!controls?.isConnected) return;
    if (weatherIntensityOutput && weatherIntensity) {
      weatherIntensityOutput.value = resolvedWeatherIntensity().toFixed(2);
      weatherIntensityOutput.textContent = resolvedWeatherIntensity().toFixed(2);
    }
    updateWeatherReadout();
    updateMotionReadout();

    const profile = controls.querySelector("[data-debug-environment-profile]");
    const state = controls.querySelector("[data-debug-viewer-state]");
    if (profile) profile.textContent = String(window.NCNEnvironment?.current?.() || currentApplication()).toUpperCase();
    if (state) state.textContent = String(window.NCNViewerLifecycle?.current?.() || "ready").toUpperCase();
  }

  function bindMotionEvents() {
    if (motionEventsBound) return;
    const motion = service("chamber-motion");
    if (!motion?.addEventListener) return;
    ["blockmove:start", "blockmove:extract", "blockmove:settle", "blockmove:complete", "blockmove:cancel", "blockmove:error"]
      .forEach(type => motion.addEventListener(type, updateReadouts));
    motionEventsBound = true;
  }

  function bindControls() {
    controls.querySelectorAll("[data-debug-weather]").forEach(button => {
      button.addEventListener("click", () => void applyWeather(button.dataset.debugWeather));
    });
    controls.querySelectorAll("[data-debug-motion]").forEach(button => {
      button.addEventListener("click", () => void triggerMotion(button.dataset.debugMotion));
    });
    controls.querySelector("[data-debug-restore-profile]")?.addEventListener("click", () => {
      void restoreApplicationProfile();
    });
    weatherIntensity?.addEventListener("input", updateReadouts);
  }

  function ensureControls() {
    const base = ensureBaseInterface();
    if (!base) return false;

    controls = base.querySelector("[data-debug-service-controls]");
    if (!controls) {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = controlsMarkup().trim();
      controls = wrapper.firstElementChild;
      const applicationSection = base.querySelector(".diagnostics-application-section");
      if (applicationSection) applicationSection.insertAdjacentElement("afterend", controls);
      else base.querySelector(".diagnostics-title")?.insertAdjacentElement("afterend", controls);
    }

    weatherIntensity = controls.querySelector("[data-debug-weather-intensity]");
    weatherIntensityOutput = controls.querySelector("[data-debug-weather-intensity-output]");
    weatherStatus = controls.querySelector("[data-debug-weather-status]");
    motionStatus = controls.querySelector("[data-debug-motion-status]");
    serviceMessage = controls.querySelector("[data-debug-service-message]");

    if (controls.dataset.bound !== "true") {
      controls.dataset.bound = "true";
      bindControls();
    }
    updateReadouts();
    void readyServices().then(updateReadouts);
    return true;
  }

  const observer = new MutationObserver(() => {
    if (!controls?.isConnected) ensureControls();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener("ncn:application-change", () => window.setTimeout(updateReadouts, 40));
  window.addEventListener("ncn:lifecycle-change", updateReadouts);
  window.NCNEvents?.on?.("integration:profile-applied", updateReadouts);
  window.NCNEvents?.on?.("integration:department-installed", () => {
    motionEventsBound = false;
    bindMotionEvents();
    updateReadouts();
  });

  ensureControls();
})();