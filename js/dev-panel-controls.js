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
  let motionEventsService = null;
  let departmentReadyAttempt = null;
  let lastAction = null;

  function currentApplication() {
    return window.NCNApplications?.current?.()
      || (typeof NCN_STATE !== "undefined" ? NCN_STATE.activeApp : "redwire")
      || "redwire";
  }

  function currentService(name) {
    return window.NCNIntegration?.getService?.(name) || null;
  }

  async function resolveService(name) {
    const live = currentService(name);
    if (live) return live;

    if (!departmentReadyAttempt) {
      departmentReadyAttempt = Promise.resolve(window.NCNIntegratedDepartments?.ready?.())
        .catch(error => error)
        .finally(() => { departmentReadyAttempt = null; });
    }
    await departmentReadyAttempt;

    const resolved = currentService(name);
    if (!resolved) throw new Error(`${name} service is unavailable.`);
    return resolved;
  }

  function ensureBaseInterface() {
    if (typeof window.ensureDiagnosticsInterface === "function") {
      window.ensureDiagnosticsInterface();
    } else if (typeof ensureDiagnosticsInterface === "function") {
      ensureDiagnosticsInterface();
    }

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

  function setMessage(message, error = false) {
    if (serviceMessage) {
      serviceMessage.textContent = String(message || "");
      serviceMessage.classList.toggle("is-error", Boolean(error));
    }
  }

  function recordAction(type, value, status, detail = null) {
    lastAction = Object.freeze({
      type,
      value,
      status,
      detail,
      at: typeof performance !== "undefined" ? performance.now() : Date.now()
    });
    return lastAction;
  }

  function setEnvironmentPreview(enabled, reason = "developer-control") {
    const root = document.documentElement;
    if (!root) return false;
    if (enabled) {
      root.dataset.devEnvironmentPreview = "true";
      root.dataset.devEnvironmentReason = reason;
    } else {
      delete root.dataset.devEnvironmentPreview;
      delete root.dataset.devEnvironmentReason;
    }
    return enabled;
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
    const selected = WEATHER_PRESETS[name] ? name : "mist";
    setMessage(`Applying Weather: ${selected}…`);
    recordAction("weather", selected, "requested");

    try {
      const weather = await resolveService("weather");
      const profile = weatherProfile(selected);
      const meta = {
        application: currentApplication(),
        reason: `dev-panel-weather:${selected}`,
        requestEffect: selected === "electrical",
        effectIntensity: profile.intensity || 0
      };

      let result;
      if (typeof weather.applyProfile === "function") {
        result = await Promise.resolve(weather.applyProfile(profile, meta));
      } else if (window.NCNIntegration?.applyProfile?.("weather", profile, meta)) {
        result = weather.snapshot?.() || null;
      } else {
        throw new Error("Weather has no usable profile entry point.");
      }

      setEnvironmentPreview(selected !== "clear", `weather:${selected}`);
      const snapshot = weather.snapshot?.() || result || null;
      recordAction("weather", selected, "complete", snapshot);
      setMessage(`Weather active: ${snapshot?.targetPreset || snapshot?.preset || profile.preset}.`);
      updateReadouts();
      return snapshot;
    } catch (error) {
      recordAction("weather", selected, "error", String(error?.message || error));
      setMessage(`Weather failed: ${String(error?.message || error)}`, true);
      updateReadouts();
      return null;
    }
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

  function motionIsActive(snapshot = currentService("chamber-motion")?.snapshot?.()) {
    return Number(snapshot?.activeSequenceCount || 0) > 0;
  }

  function weatherIsActive(snapshot = currentService("weather")?.snapshot?.()) {
    return Boolean(snapshot && snapshot.enabled !== false && Number(snapshot.targetIntensity ?? snapshot.intensity ?? 0) > 0.002);
  }

  function refreshEnvironmentPreview() {
    const active = currentApplication() === "dripfeed" && (weatherIsActive() || motionIsActive());
    setEnvironmentPreview(active, active ? "active-developer-override" : "developer-control-idle");
    return active;
  }

  async function triggerMotion(action) {
    const selected = ["left", "right", "large", "settle", "cancel"].includes(action) ? action : "large";
    setMessage(`Requesting Chamber Movement: ${selected}…`);
    recordAction("motion", selected, "requested");

    try {
      const motion = await resolveService("chamber-motion");

      if (selected === "settle") {
        const result = await Promise.resolve(motion.settle?.({ reason: "dev-panel", duration: 520 }));
        recordAction("motion", selected, "complete", result);
        setMessage("Requested a clean chamber settle.");
        updateReadouts();
        window.setTimeout(refreshEnvironmentPreview, 560);
        return result;
      }

      if (selected === "cancel") {
        const result = await Promise.resolve(motion.cancel?.({ reason: "dev-panel" }));
        recordAction("motion", selected, "complete", result);
        setMessage("Cancelled active chamber movement.");
        updateReadouts();
        refreshEnvironmentPreview();
        return result;
      }

      const large = selected === "large";
      const clusterSize = large ? [4, 7] : [2, 5];
      const region = selected === "left"
        ? "left-wall"
        : selected === "right"
          ? "right-wall"
          : "side-walls";
      const profile = motionProfile(clusterSize);
      const meta = {
        application: currentApplication(),
        reason: `dev-panel-motion:${selected}`
      };

      if (typeof motion.applyProfile === "function") {
        await Promise.resolve(motion.applyProfile(profile, meta));
      } else if (!window.NCNIntegration?.applyProfile?.("chamber-motion", profile, meta)) {
        throw new Error("Chamber Movement has no usable profile entry point.");
      }

      setEnvironmentPreview(true, `motion:${selected}`);
      const result = await Promise.resolve(motion.trigger({
        pattern: "extract-rotate-settle",
        region,
        targetRegion: "rear-wall",
        clusterSize,
        intensity: profile.intensity,
        duration: 5200,
        effects: Object.freeze({})
      }));

      recordAction("motion", selected, "complete", result);
      setMessage(`Chamber result: ${result?.status || "complete"}.`, result?.status === "error");
      updateReadouts();
      refreshEnvironmentPreview();
      return result;
    } catch (error) {
      recordAction("motion", selected, "error", String(error?.message || error));
      setMessage(`Chamber Movement failed: ${String(error?.message || error)}`, true);
      updateReadouts();
      refreshEnvironmentPreview();
      return null;
    }
  }

  async function restoreApplicationProfile() {
    setMessage(`Restoring ${currentApplication()} profile…`);
    recordAction("profile", currentApplication(), "requested");

    try {
      const motion = currentService("chamber-motion");
      await Promise.resolve(motion?.cancel?.({ reason: "dev-panel-profile-restore" }));
      const result = window.NCNIntegration?.syncApplicationProfile?.("dev-panel-profile-restore")
        || Object.freeze({ application: currentApplication(), applied: [] });
      setEnvironmentPreview(false);
      recordAction("profile", result.application || currentApplication(), "complete", result);
      setMessage(`Restored ${result.application || currentApplication()} environment profile.`);
      window.setTimeout(updateReadouts, 50);
      return result;
    } catch (error) {
      recordAction("profile", currentApplication(), "error", String(error?.message || error));
      setMessage(`Profile restore failed: ${String(error?.message || error)}`, true);
      return null;
    }
  }

  async function switchApplication(name) {
    const selected = name === "dripfeed" ? "dripfeed" : "redwire";
    setMessage(`Switching to ${selected}…`);
    recordAction("application", selected, "requested");

    try {
      const result = await Promise.resolve(window.NCNApplications?.switchTo?.(selected));
      setEnvironmentPreview(false);
      recordAction("application", selected, "complete", result);
      setMessage(result === false ? `${selected} is already active.` : `Switched to ${selected}.`);
      updateReadouts();
      return result;
    } catch (error) {
      recordAction("application", selected, "error", String(error?.message || error));
      setMessage(`Application switch failed: ${String(error?.message || error)}`, true);
      return false;
    }
  }

  async function dispatchControl(type, value) {
    if (type === "weather") return applyWeather(value);
    if (type === "motion") return triggerMotion(value);
    if (type === "application") return switchApplication(value);
    if (type === "profile") return restoreApplicationProfile();
    throw new RangeError(`Unknown developer control: ${type}`);
  }

  function updateWeatherReadout() {
    if (!weatherStatus) return;
    const snapshot = currentService("weather")?.snapshot?.();
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
    const snapshot = currentService("chamber-motion")?.snapshot?.();
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
    const motion = currentService("chamber-motion");
    if (!motion?.addEventListener || motionEventsService === motion) return;
    motionEventsService = motion;
    ["blockmove:start", "blockmove:extract", "blockmove:settle", "blockmove:complete", "blockmove:cancel", "blockmove:error"]
      .forEach(type => motion.addEventListener(type, () => {
        updateReadouts();
        refreshEnvironmentPreview();
      }));
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

    updateReadouts();
    bindMotionEvents();
    return true;
  }

  function controlFromEvent(event) {
    const button = event.target?.closest?.("button");
    if (!button) return null;
    if (button.dataset.debugWeather) return { type: "weather", value: button.dataset.debugWeather };
    if (button.dataset.debugMotion) return { type: "motion", value: button.dataset.debugMotion };
    if (button.dataset.debugApp) return { type: "application", value: button.dataset.debugApp };
    if (button.hasAttribute("data-debug-restore-profile")) return { type: "profile", value: currentApplication() };
    return null;
  }

  function handleControlClick(event) {
    const request = controlFromEvent(event);
    if (!request) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void dispatchControl(request.type, request.value);
  }

  function handleControlInput(event) {
    if (!event.target?.matches?.("[data-debug-weather-intensity]")) return;
    weatherIntensity = event.target;
    updateReadouts();
  }

  function snapshot() {
    return Object.freeze({
      application: currentApplication(),
      panelConnected: Boolean(panel?.isConnected),
      controlsConnected: Boolean(controls?.isConnected),
      environmentPreview: document.documentElement?.dataset?.devEnvironmentPreview === "true",
      lastAction,
      weather: currentService("weather")?.snapshot?.() || null,
      chamberMotion: currentService("chamber-motion")?.snapshot?.() || null
    });
  }

  window.NCNDevPanel = Object.freeze({
    ensureControls,
    dispatchControl,
    applyWeather,
    triggerMotion,
    restoreApplicationProfile,
    switchApplication,
    updateReadouts,
    snapshot
  });

  if (typeof document !== "undefined" && document.body) {
    document.addEventListener("click", handleControlClick, true);
    document.addEventListener("input", handleControlInput, true);

    const observer = new MutationObserver(() => {
      if (!controls?.isConnected) ensureControls();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("ncn:application-change", () => {
      setEnvironmentPreview(false);
      window.setTimeout(updateReadouts, 40);
    });
    window.addEventListener("ncn:lifecycle-change", updateReadouts);
    window.NCNEvents?.on?.("integration:profile-applied", updateReadouts);
    window.NCNEvents?.on?.("integration:department-installed", () => {
      bindMotionEvents();
      updateReadouts();
    });

    ensureControls();
  }
})();