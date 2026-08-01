/*==================================================
  NCN SHARED DEVELOPER PANEL CONTROLS

  A diagnostics-only Weather laboratory plus the existing application and
  Chamber Movement overrides. The panel observes public service snapshots and
  never creates another renderer, private timer or Weather service.
==================================================*/
(() => {
  "use strict";

  const WEATHER_PRESETS = Object.freeze({
    clear: Object.freeze({ label: "Clear", preset: "clear", enabled: false, intensity: 0 }),
    dust: Object.freeze({ label: "Dust", preset: "dust", enabled: true, intensity: 0.52 }),
    mist: Object.freeze({ label: "Mist", preset: "mist", enabled: true, intensity: 0.46 }),
    heavy: Object.freeze({ label: "Heavy", preset: "heavy-mist", enabled: true, intensity: 0.80 }),
    smoke: Object.freeze({ label: "Smoke", preset: "smoke", enabled: true, intensity: 0.62 }),
    "light-rain": Object.freeze({ label: "Light rain", preset: "light-rain", enabled: true, intensity: 0.46 }),
    rain: Object.freeze({ label: "Rain", preset: "rain", enabled: true, intensity: 0.72 }),
    electrical: Object.freeze({ label: "Electrical", preset: "electrical-weather", enabled: true, intensity: 0.76 })
  });
  const WEATHER_LAYERS = Object.freeze(["far", "rear", "middle", "near"]);
  const WEATHER_QUALITY = Object.freeze(["auto", "reduced", "low", "medium", "high"]);
  const TELEMETRY_TASK = "diagnostics:weather-laboratory";

  let panel = null;
  let controls = null;
  let serviceMessage = null;
  let weatherStatus = null;
  let weatherStatusDetail = null;
  let motionStatus = null;
  let motionEventsService = null;
  let departmentReadyAttempt = null;
  let telemetryTask = null;
  let diagnosticsActive = false;
  let diagnosticBindingsActive = false;
  let selectedWeather = "mist";
  let hiddenWeatherLayers = new Set();
  let diagnosticUnsubscribers = [];
  let lastAction = null;
  let lastWeatherFrame = null;
  let lastWeatherFrameAt = 0;
  let overrideActive = false;

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, Number(value) || 0));
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const formatNumber = (value, digits = 2) => finite(value).toFixed(digits);
  const formatInteger = value => Math.round(finite(value)).toLocaleString("en-GB");

  function currentApplication() {
    return window.NCNApplications?.current?.()
      || (typeof NCN_STATE !== "undefined" ? NCN_STATE.activeApp : "redwire")
      || "redwire";
  }

  function currentService(name) {
    return window.NCNIntegration?.getService?.(name) || null;
  }

  function diagnosticsEnabled() {
    return Boolean(document.documentElement?.classList?.contains?.("diagnostics-on"));
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
    if (!diagnosticsEnabled()) return null;

    if (typeof window.ensureDiagnosticsInterface === "function") {
      window.ensureDiagnosticsInterface();
    } else if (typeof ensureDiagnosticsInterface === "function") {
      ensureDiagnosticsInterface();
    }

    panel = document.querySelector(".diagnostics-panel");
    const toggle = document.querySelector(".diagnostics-toggle");
    if (toggle && !toggle.textContent.trim()) toggle.textContent = "Dev on";
    return panel;
  }

  function presetButtonsMarkup() {
    return Object.entries(WEATHER_PRESETS).map(([key, definition]) => `
      <button type="button" data-debug-weather="${key}" aria-pressed="false">${definition.label}</button>
    `).join("");
  }

  function metricMarkup(key, label) {
    return `<div><span>${label}</span><strong data-debug-weather-metric="${key}">—</strong></div>`;
  }

  function controlsMarkup() {
    return `
      <section class="diagnostics-section diagnostics-environment-section" data-debug-service-controls>
        <div class="diagnostics-heading diagnostics-heading--split">
          <span>Environment laboratory</span>
          <span data-debug-lab-profile>PROFILE —</span>
        </div>

        <details class="diagnostics-lab" data-debug-weather-lab open>
          <summary>
            <span>Weather</span>
            <span class="diagnostics-health" data-debug-weather-status data-state="waiting">Waiting for service</span>
          </summary>

          <div class="diagnostics-lab-body">
            <div class="diagnostics-status-detail" data-debug-weather-status-detail>
              Public Weather service has not reported yet.
            </div>

            <div class="diagnostics-subheading">Preset</div>
            <div class="diagnostics-control-grid diagnostics-control-grid--presets" role="group" aria-label="Weather preset">
              ${presetButtonsMarkup()}
            </div>

            <div class="diagnostics-subheading">Live state</div>
            <div class="diagnostics-telemetry" data-debug-weather-telemetry>
              ${metricMarkup("preset", "Current → target")}
              ${metricMarkup("intensity", "Intensity")}
              ${metricMarkup("transition", "Transition")}
              ${metricMarkup("quality", "Quality")}
              ${metricMarkup("particles", "Mist / dust / rain")}
              ${metricMarkup("depth", "Depth frame")}
              ${metricMarkup("canvases", "Canvases")}
              ${metricMarkup("runtime", "Runtime")}
              ${metricMarkup("wind", "Wind X / Y / Z")}
              ${metricMarkup("flow", "Depth flow")}
              ${metricMarkup("zones", "Reading / controls")}
              ${metricMarkup("director", "Director")}
              ${metricMarkup("seed", "Seed / fingerprint")}
              ${metricMarkup("geometry", "Geometry reads")}
            </div>

            <div class="diagnostics-subheading">Profile controls</div>
            <div class="diagnostics-weather-settings">
              <label class="diagnostics-range-control">
                <span>Intensity</span>
                <input type="range" min="0" max="1" step="0.01" value="0.46" data-debug-weather-input="intensity" />
                <output data-debug-weather-output="intensity">0.46</output>
              </label>
              <label class="diagnostics-range-control">
                <span>Blend ms</span>
                <input type="range" min="0" max="5000" step="100" value="900" data-debug-weather-input="duration" />
                <output data-debug-weather-output="duration">900</output>
              </label>
              <label class="diagnostics-range-control">
                <span>Wind X</span>
                <input type="range" min="-1" max="1" step="0.05" value="0" data-debug-weather-input="wind-x" />
                <output data-debug-weather-output="wind-x">0.00</output>
              </label>
              <label class="diagnostics-range-control">
                <span>Wind Y</span>
                <input type="range" min="-1" max="1" step="0.05" value="0" data-debug-weather-input="wind-y" />
                <output data-debug-weather-output="wind-y">0.00</output>
              </label>
              <label class="diagnostics-range-control">
                <span>Wind Z</span>
                <input type="range" min="-1" max="1" step="0.05" value="0" data-debug-weather-input="wind-z" />
                <output data-debug-weather-output="wind-z">0.00</output>
              </label>
              <label class="diagnostics-range-control">
                <span>Reading cut</span>
                <input type="range" min="0" max="1" step="0.01" value="0.48" data-debug-weather-input="reading" />
                <output data-debug-weather-output="reading">0.48</output>
              </label>
              <label class="diagnostics-range-control">
                <span>Control cut</span>
                <input type="range" min="0" max="1" step="0.01" value="0.68" data-debug-weather-input="controls" />
                <output data-debug-weather-output="controls">0.68</output>
              </label>
              <label class="diagnostics-field-control">
                <span>Quality</span>
                <select data-debug-weather-input="quality">
                  ${WEATHER_QUALITY.map(value => `<option value="${value}">${value}</option>`).join("")}
                </select>
              </label>
              <label class="diagnostics-field-control">
                <span>Seed input</span>
                <input type="text" inputmode="numeric" value="2045" data-debug-weather-input="seed" autocomplete="off" spellcheck="false" />
              </label>
            </div>

            <div class="diagnostics-control-grid diagnostics-control-grid--actions">
              <button type="button" data-debug-weather-action="apply">Apply settings</button>
              <button type="button" data-debug-weather-action="reseed">Replay seed</button>
              <button type="button" data-debug-weather-action="copy">Copy report</button>
            </div>

            <div class="diagnostics-subheading diagnostics-subheading--inline">
              <span>Canvas isolation</span>
              <button type="button" data-debug-weather-action="show-all">Show all</button>
            </div>
            <div class="diagnostics-control-grid diagnostics-control-grid--layers" role="group" aria-label="Weather canvas visibility">
              ${WEATHER_LAYERS.map(layer => `<button type="button" data-debug-weather-layer="${layer}" aria-pressed="true">${layer}</button>`).join("")}
            </div>
          </div>
        </details>

        <details class="diagnostics-lab" data-debug-motion-lab>
          <summary>
            <span>Chamber Movement</span>
            <span class="diagnostics-health" data-debug-motion-status data-state="waiting">Waiting for service</span>
          </summary>
          <div class="diagnostics-lab-body">
            <div class="diagnostics-control-grid diagnostics-control-grid--motion">
              <button type="button" data-debug-motion="left">Left</button>
              <button type="button" data-debug-motion="right">Right</button>
              <button type="button" data-debug-motion="large">Large</button>
              <button type="button" data-debug-motion="settle">Settle</button>
              <button type="button" data-debug-motion="cancel">Cancel</button>
            </div>
          </div>
        </details>

        <div class="diagnostics-app-readout diagnostics-environment-readout">
          Application: <strong data-debug-environment-profile>EMPTY</strong> ·
          Lifecycle: <strong data-debug-viewer-state>READY</strong>
        </div>
        <button type="button" class="diagnostics-restore-profile" data-debug-restore-profile>
          Restore current application profile
        </button>
        <div class="diagnostics-service-message" data-debug-service-message aria-live="polite"></div>
      </section>`;
  }

  function setMessage(message, error = false) {
    if (!serviceMessage) return;
    serviceMessage.textContent = String(message || "");
    serviceMessage.classList.toggle("is-error", Boolean(error));
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

  function inputElement(name) {
    return controls?.querySelector?.(`[data-debug-weather-input="${name}"]`) || null;
  }

  function inputNumber(name, fallback, minimum, maximum) {
    return clamp(finite(inputElement(name)?.value, fallback), minimum, maximum);
  }

  function currentWeatherControls() {
    return Object.freeze({
      intensity: inputNumber("intensity", WEATHER_PRESETS[selectedWeather]?.intensity ?? 0.46, 0, 1),
      duration: Math.round(inputNumber("duration", 0, 0, 5000)),
      wind: Object.freeze({
        x: inputNumber("wind-x", 0, -1, 1),
        y: inputNumber("wind-y", 0, -1, 1),
        z: inputNumber("wind-z", 0, -1, 1)
      }),
      readingAttenuation: inputNumber("reading", 0.48, 0, 1),
      controlAttenuation: inputNumber("controls", 0.68, 0, 1),
      quality: WEATHER_QUALITY.includes(String(inputElement("quality")?.value || "auto"))
        ? String(inputElement("quality")?.value || "auto")
        : "auto",
      seed: String(inputElement("seed")?.value || "2045").trim() || "2045"
    });
  }

  function setInputValue(name, value) {
    const input = inputElement(name);
    if (!input) return false;
    input.value = String(value);
    updateControlOutputs(input);
    return true;
  }

  function selectWeatherButton(name) {
    selectedWeather = WEATHER_PRESETS[name] ? name : "mist";
    controls?.querySelectorAll?.("[data-debug-weather]").forEach(button => {
      const active = button.dataset.debugWeather === selectedWeather;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    return selectedWeather;
  }

  function loadPresetDefaults(name) {
    const definition = WEATHER_PRESETS[name] || WEATHER_PRESETS.mist;
    setInputValue("intensity", definition.intensity);
    return definition;
  }

  function weatherProfile(name, options = {}) {
    const definition = WEATHER_PRESETS[name] || WEATHER_PRESETS.mist;
    const settings = currentWeatherControls();
    if (!definition.enabled) {
      return Object.freeze({ enabled: false, preset: "clear", intensity: 0, mist: 0, wind: 0 });
    }

    const profile = {
      enabled: true,
      preset: definition.preset,
      intensity: settings.intensity,
      quality: settings.quality,
      wind: settings.wind,
      readingAttenuation: settings.readingAttenuation,
      controlAttenuation: settings.controlAttenuation
    };
    if (settings.duration > 0) profile.transition = Object.freeze({ duration: settings.duration });
    if (options.includeSeed === true) profile.seed = settings.seed;
    return Object.freeze(profile);
  }

  async function applyWeather(name, options = {}) {
    const selected = selectWeatherButton(WEATHER_PRESETS[name] ? name : "mist");
    if (options.usePresetDefaults === true) loadPresetDefaults(selected);
    const profile = weatherProfile(selected, options);
    setMessage(`Applying Weather: ${WEATHER_PRESETS[selected].label}…`);
    recordAction("weather", selected, "requested", profile);

    try {
      const weather = await resolveService("weather");
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

      overrideActive = true;
      setEnvironmentPreview(selected !== "clear", `weather:${selected}`);
      const snapshotValue = weather.snapshot?.() || result || null;
      recordAction("weather", selected, "complete", snapshotValue);
      setMessage(`Weather target: ${snapshotValue?.targetPreset || snapshotValue?.preset || profile.preset}.`);
      updateReadouts();
      telemetryTask?.wake?.("diagnostics:weather-applied");
      return snapshotValue;
    } catch (error) {
      recordAction("weather", selected, "error", String(error?.message || error));
      setMessage(`Weather failed: ${String(error?.message || error)}`, true);
      updateReadouts();
      return null;
    }
  }

  async function applyWeatherSettings() {
    return applyWeather(selectedWeather, { includeSeed: false, usePresetDefaults: false });
  }

  async function replayWeatherSeed() {
    const settings = currentWeatherControls();
    setMessage(`Replaying Weather seed ${settings.seed}…`);
    recordAction("weather-seed", settings.seed, "requested");
    try {
      const weather = await resolveService("weather");
      if (typeof weather.setSeed !== "function") throw new Error("Weather does not publish setSeed().");
      const resolved = await Promise.resolve(weather.setSeed(settings.seed));
      overrideActive = true;
      recordAction("weather-seed", settings.seed, "complete", resolved);
      setMessage(`Weather seed replayed: ${settings.seed}.`);
      updateReadouts();
      telemetryTask?.wake?.("diagnostics:weather-reseeded");
      return resolved;
    } catch (error) {
      recordAction("weather-seed", settings.seed, "error", String(error?.message || error));
      setMessage(`Seed replay failed: ${String(error?.message || error)}`, true);
      return null;
    }
  }

  function normaliseHiddenLayers(value) {
    const candidate = value instanceof Set ? [...value] : Array.isArray(value) ? value : [];
    return new Set(candidate.filter(layer => WEATHER_LAYERS.includes(layer)));
  }

  function publishLayerIsolation() {
    hiddenWeatherLayers = normaliseHiddenLayers(hiddenWeatherLayers);
    const root = document.documentElement;
    if (root) {
      const value = [...hiddenWeatherLayers].join(" ");
      if (value) root.dataset.debugWeatherHiddenLayers = value;
      else delete root.dataset.debugWeatherHiddenLayers;
    }

    controls?.querySelectorAll?.("[data-debug-weather-layer]").forEach(button => {
      const visible = !hiddenWeatherLayers.has(button.dataset.debugWeatherLayer);
      button.classList.toggle("active", visible);
      button.setAttribute("aria-pressed", String(visible));
      button.title = visible ? "Visible — press to isolate it out" : "Hidden — press to restore it";
    });
    return Object.freeze({ hidden: Object.freeze([...hiddenWeatherLayers]) });
  }

  function toggleWeatherLayer(layer) {
    const selected = String(layer || "");
    if (!WEATHER_LAYERS.includes(selected)) return publishLayerIsolation();
    if (hiddenWeatherLayers.has(selected)) hiddenWeatherLayers.delete(selected);
    else hiddenWeatherLayers.add(selected);
    overrideActive = true;
    recordAction("weather-layer", selected, hiddenWeatherLayers.has(selected) ? "hidden" : "visible");
    return publishLayerIsolation();
  }

  function showAllWeatherLayers() {
    hiddenWeatherLayers.clear();
    recordAction("weather-layer", "all", "visible");
    return publishLayerIsolation();
  }

  function cameraSnapshot() {
    return window.LayeredChamber?.getCameraSnapshot?.()
      || window.NCNChamberCamera?.snapshot?.()
      || null;
  }

  function weatherReport() {
    return Object.freeze({
      capturedAt: new Date().toISOString(),
      application: currentApplication(),
      environmentProfile: window.NCNEnvironment?.current?.() || currentApplication(),
      lifecycle: window.NCNViewerLifecycle?.current?.() || "ready",
      documentHidden: Boolean(document.hidden),
      selectedPreset: selectedWeather,
      controls: currentWeatherControls(),
      hiddenLayers: Object.freeze([...hiddenWeatherLayers]),
      weather: currentService("weather")?.snapshot?.() || null,
      camera: cameraSnapshot(),
      developerPanel: snapshot(),
      lastAction
    });
  }

  async function copyWeatherReport() {
    const report = JSON.stringify(weatherReport(), null, 2);
    recordAction("weather-report", "clipboard", "requested");
    try {
      if (!globalThis.navigator?.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await globalThis.navigator.clipboard.writeText(report);
      recordAction("weather-report", "clipboard", "complete");
      setMessage("Weather diagnostic report copied.");
      return report;
    } catch (error) {
      console.info("[NCN Weather report]", report);
      recordAction("weather-report", "console", "complete", String(error?.message || error));
      setMessage("Clipboard unavailable; Weather report written to the console.");
      return report;
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

  function motionIsActive(snapshotValue = currentService("chamber-motion")?.snapshot?.()) {
    return Number(snapshotValue?.activeSequenceCount || 0) > 0;
  }

  function weatherIsActive(snapshotValue = currentService("weather")?.snapshot?.()) {
    return Boolean(snapshotValue && snapshotValue.enabled !== false && Number(snapshotValue.targetIntensity ?? snapshotValue.intensity ?? 0) > 0.002);
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
      const meta = { application: currentApplication(), reason: `dev-panel-motion:${selected}` };

      if (typeof motion.applyProfile === "function") {
        await Promise.resolve(motion.applyProfile(profile, meta));
      } else if (!window.NCNIntegration?.applyProfile?.("chamber-motion", profile, meta)) {
        throw new Error("Chamber Movement has no usable profile entry point.");
      }

      overrideActive = true;
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

  async function restoreApplicationProfile(options = {}) {
    const application = currentApplication();
    if (!options.quiet) setMessage(`Restoring ${application} profile…`);
    recordAction("profile", application, "requested", options.reason || null);

    try {
      const motion = currentService("chamber-motion");
      await Promise.resolve(motion?.cancel?.({ reason: options.reason || "dev-panel-profile-restore" }));
      const result = window.NCNIntegration?.syncApplicationProfile?.(options.reason || "dev-panel-profile-restore")
        || Object.freeze({ application, applied: [] });
      setEnvironmentPreview(false);
      showAllWeatherLayers();
      overrideActive = false;
      recordAction("profile", result.application || application, "complete", result);
      if (!options.quiet) setMessage(`Restored ${result.application || application} environment profile.`);
      if (diagnosticsActive) telemetryTask?.wake?.("diagnostics:profile-restored");
      return result;
    } catch (error) {
      recordAction("profile", application, "error", String(error?.message || error));
      if (!options.quiet) setMessage(`Profile restore failed: ${String(error?.message || error)}`, true);
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
      showAllWeatherLayers();
      overrideActive = false;
      recordAction("application", selected, "complete", result);
      setMessage(result === false ? `${selected} is already active.` : `Switched to ${selected}.`);
      updateReadouts();
      telemetryTask?.wake?.("diagnostics:application-switch");
      return result;
    } catch (error) {
      recordAction("application", selected, "error", String(error?.message || error));
      setMessage(`Application switch failed: ${String(error?.message || error)}`, true);
      return false;
    }
  }

  async function dispatchControl(type, value) {
    if (type === "weather") return applyWeather(value, { usePresetDefaults: true });
    if (type === "weather-action") {
      if (value === "apply") return applyWeatherSettings();
      if (value === "reseed") return replayWeatherSeed();
      if (value === "copy") return copyWeatherReport();
      if (value === "show-all") return showAllWeatherLayers();
    }
    if (type === "weather-layer") return toggleWeatherLayer(value);
    if (type === "motion") return triggerMotion(value);
    if (type === "application") return switchApplication(value);
    if (type === "profile") return restoreApplicationProfile();
    throw new RangeError(`Unknown developer control: ${type}${value ? `:${value}` : ""}`);
  }

  function setMetric(name, value, title = "") {
    const node = controls?.querySelector?.(`[data-debug-weather-metric="${name}"]`);
    if (!node) return;
    node.textContent = String(value ?? "—");
    node.title = String(title || value || "");
  }

  function transitionText(snapshotValue) {
    const transition = snapshotValue?.transition;
    if (!transition) return "settled";
    const duration = Math.max(1, finite(transition.duration, 1));
    const elapsed = clamp(transition.elapsed, 0, duration);
    return `${transition.name} · ${Math.round(elapsed / duration * 100)}%`;
  }

  function weatherHealth(snapshotValue) {
    if (!snapshotValue) return { state: "error", label: "Unavailable", detail: "The canonical Weather service is not registered." };
    if (snapshotValue.destroyed) return { state: "error", label: "Destroyed", detail: "The Weather instance has been destroyed and cannot render." };
    if (!snapshotValue.initialised) return { state: "warning", label: "Not initialised", detail: "Weather exists but has not mounted its runtime resources." };
    if (snapshotValue.suspended) return { state: "warning", label: "Suspended", detail: "Weather is suspended by the viewer lifecycle." };
    if (snapshotValue.enabled === false || finite(snapshotValue.targetIntensity) <= 0.002) {
      return { state: "off", label: "Off", detail: "Weather is deliberately disabled by the current profile or Clear preset." };
    }
    if (snapshotValue.director?.allowed === false) {
      return { state: "warning", label: "Director blocked", detail: `The Visual Director is suppressing environment output in ${snapshotValue.director.mode || "the current mode"}.` };
    }
    if (finite(snapshotValue.resources?.canvases) !== 4 || snapshotValue.resources?.runtimeTask !== true) {
      return { state: "error", label: "Resources incomplete", detail: `${finite(snapshotValue.resources?.canvases)} of 4 canvases; runtime task ${snapshotValue.resources?.runtimeTask ? "present" : "missing"}.` };
    }
    if (finite(snapshotValue.resources?.visibleCanvases) !== 4) {
      return { state: "warning", label: "Canvases hidden", detail: `${finite(snapshotValue.resources?.visibleCanvases)} of 4 Weather canvases are service-visible.` };
    }
    if (!document.hidden && lastWeatherFrame !== null && snapshotValue.frameCount === lastWeatherFrame
      && performance.now() - lastWeatherFrameAt > 1800) {
      return { state: "warning", label: "Frame stalled", detail: "Weather is enabled but its shared-runtime frame counter is not advancing." };
    }
    if (snapshotValue.transition) return { state: "transition", label: "Transitioning", detail: transitionText(snapshotValue) };
    if (!snapshotValue.diagnostics?.depthFrame?.available) {
      return { state: "warning", label: "No depth frame", detail: "Weather is active but has not published a current immutable depth frame." };
    }
    return { state: "healthy", label: "Healthy", detail: "One canonical service, four canvases and a live shared-runtime depth frame." };
  }

  function updateWeatherReadout() {
    if (!weatherStatus) return;
    const snapshotValue = currentService("weather")?.snapshot?.();
    const health = weatherHealth(snapshotValue);
    weatherStatus.textContent = health.label;
    weatherStatus.dataset.state = health.state;
    if (weatherStatusDetail) weatherStatusDetail.textContent = health.detail;

    if (!snapshotValue) {
      ["preset", "intensity", "transition", "quality", "particles", "depth", "canvases", "runtime", "wind", "flow", "zones", "director", "seed", "geometry"]
        .forEach(name => setMetric(name, "—"));
      return;
    }

    const particles = snapshotValue.particles || {};
    const depth = snapshotValue.diagnostics?.depthFrame || {};
    const flow = snapshotValue.diagnostics?.effectiveDepthFlow || {};
    const resources = snapshotValue.resources || {};
    const geometry = snapshotValue.geometry || {};
    const wind = snapshotValue.wind || {};
    const zones = snapshotValue.zones || {};
    const director = snapshotValue.director;

    setMetric("preset", `${snapshotValue.preset || "clear"} → ${snapshotValue.targetPreset || snapshotValue.preset || "clear"}`);
    setMetric("intensity", `${formatNumber(snapshotValue.intensity)} → ${formatNumber(snapshotValue.targetIntensity)}`);
    setMetric("transition", transitionText(snapshotValue));
    setMetric("quality", `${snapshotValue.quality || "—"} (${snapshotValue.qualityOverride || "auto"})`);
    setMetric("particles", `${finite(particles.mist)} / ${finite(particles.dust)} / ${finite(particles.rain)}`,
      `Capacities: ${finite(particles.capacities?.mist)} / ${finite(particles.capacities?.dust)} / ${finite(particles.capacities?.rain)}`);
    setMetric("depth", depth.available ? `${finite(depth.puffCount)} puffs · live` : "unavailable",
      `${depth.convention || "no convention"}; subscribers ${finite(depth.afterRenderSubscribers)}`);
    setMetric("canvases", `${finite(resources.visibleCanvases)} visible / ${finite(resources.canvases)} total`);
    setMetric("runtime", `${formatInteger(snapshotValue.frameCount)} frames · ${formatNumber(snapshotValue.lastDelta, 1)} ms`);
    setMetric("wind", `${formatNumber(wind.x)} / ${formatNumber(wind.y)} / ${formatNumber(wind.z)}`);
    setMetric("flow", `${formatNumber(flow.mist, 3)} mist / ${formatNumber(flow.particles, 3)} particles`,
      `Configured ${formatNumber(flow.configured, 3)} + wind ${formatNumber(flow.wind, 3)}`);
    setMetric("zones", `${zones.reading ? "reading" : "open"} / ${finite(zones.controls)} controls`);
    setMetric("director", director ? `${director.mode || "—"} · ${director.allowed === false ? "blocked" : formatNumber(director.intensity)}` : "not sampled");
    setMetric("seed", `${snapshotValue.seed ?? "—"} / ${particles.fingerprint ?? "—"}`);
    setMetric("geometry", `${finite(geometry.cameraReads)} camera / ${finite(geometry.layerMeasurements)} layers / ${finite(geometry.zoneReads)} zones`);

    const frame = finite(snapshotValue.frameCount, 0);
    if (lastWeatherFrame === null || frame !== lastWeatherFrame) {
      lastWeatherFrame = frame;
      lastWeatherFrameAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    }

    const targetName = Object.entries(WEATHER_PRESETS).find(([, definition]) => definition.preset === snapshotValue.targetPreset)?.[0];
    if (targetName) selectWeatherButton(targetName);
  }

  function updateMotionReadout() {
    if (!motionStatus) return;
    const snapshotValue = currentService("chamber-motion")?.snapshot?.();
    if (!snapshotValue) {
      motionStatus.textContent = "Unavailable";
      motionStatus.dataset.state = "error";
      return;
    }
    const active = Number(snapshotValue.activeSequenceCount || 0);
    const phase = snapshotValue.activeSequences?.[0]?.phase || snapshotValue.activeSequences?.[0]?.currentPose?.phase || null;
    if (snapshotValue.enabled === false) {
      motionStatus.textContent = "Off";
      motionStatus.dataset.state = "off";
    } else if (active) {
      motionStatus.textContent = `${active} active${phase ? ` · ${phase}` : ""}`;
      motionStatus.dataset.state = "transition";
    } else {
      motionStatus.textContent = "Ready";
      motionStatus.dataset.state = "healthy";
    }
  }

  function updateControlOutputs(target = null) {
    if (!controls?.isConnected) return;
    const inputs = target ? [target] : [...controls.querySelectorAll("[data-debug-weather-input]")];
    inputs.forEach(input => {
      const name = input.dataset.debugWeatherInput;
      const output = controls.querySelector(`[data-debug-weather-output="${name}"]`);
      if (!output || input.type !== "range") return;
      const digits = name === "duration" ? 0 : 2;
      output.value = finite(input.value).toFixed(digits);
      output.textContent = output.value;
    });
  }

  function updateReadouts() {
    if (!controls?.isConnected || !diagnosticsActive) return;
    updateControlOutputs();
    updateWeatherReadout();
    updateMotionReadout();
    publishLayerIsolation();

    const profile = controls.querySelector("[data-debug-environment-profile]");
    const state = controls.querySelector("[data-debug-viewer-state]");
    const labProfile = controls.querySelector("[data-debug-lab-profile]");
    const currentProfile = String(window.NCNEnvironment?.current?.() || currentApplication()).toUpperCase();
    if (profile) profile.textContent = currentProfile;
    if (labProfile) labProfile.textContent = `PROFILE ${currentProfile}`;
    if (state) state.textContent = String(window.NCNViewerLifecycle?.current?.() || "ready").toUpperCase();
  }

  function handleMotionEvent() {
    updateReadouts();
    refreshEnvironmentPreview();
    telemetryTask?.wake?.("diagnostics:motion-event");
  }

  function unbindMotionEvents() {
    if (!motionEventsService?.removeEventListener) {
      motionEventsService = null;
      return;
    }
    ["blockmove:start", "blockmove:extract", "blockmove:settle", "blockmove:complete", "blockmove:cancel", "blockmove:error"]
      .forEach(type => motionEventsService.removeEventListener(type, handleMotionEvent));
    motionEventsService = null;
  }

  function bindMotionEvents() {
    const motion = currentService("chamber-motion");
    if (!motion?.addEventListener || motionEventsService === motion) return;
    unbindMotionEvents();
    motionEventsService = motion;
    ["blockmove:start", "blockmove:extract", "blockmove:settle", "blockmove:complete", "blockmove:cancel", "blockmove:error"]
      .forEach(type => motion.addEventListener(type, handleMotionEvent));
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

    weatherStatus = controls.querySelector("[data-debug-weather-status]");
    weatherStatusDetail = controls.querySelector("[data-debug-weather-status-detail]");
    motionStatus = controls.querySelector("[data-debug-motion-status]");
    serviceMessage = controls.querySelector("[data-debug-service-message]");

    selectWeatherButton(selectedWeather);
    updateReadouts();
    return true;
  }

  function telemetryStep() {
    if (!diagnosticsActive || !controls?.isConnected) return false;
    updateReadouts();
    return true;
  }

  function startTelemetry() {
    if (telemetryTask) return true;
    const runtime = window.NCNViewerRuntime;
    if (!runtime?.register) throw new Error("Shared viewer runtime is unavailable for diagnostics telemetry.");
    telemetryTask = runtime.register(TELEMETRY_TASK, telemetryStep, {
      group: "diagnostics",
      priority: -100,
      maxFps: 2,
      enabled: true
    });
    return true;
  }

  function stopTelemetry() {
    if (!telemetryTask) return false;
    telemetryTask.disable?.();
    telemetryTask.unregister?.();
    telemetryTask = null;
    lastWeatherFrame = null;
    lastWeatherFrameAt = 0;
    return true;
  }

  function handleApplicationChange() {
    setEnvironmentPreview(false);
    showAllWeatherLayers();
    overrideActive = false;
    bindMotionEvents();
    updateReadouts();
    telemetryTask?.wake?.("diagnostics:application-change");
  }

  function handleLifecycleChange() {
    updateReadouts();
    telemetryTask?.wake?.("diagnostics:lifecycle-change");
  }

  function bindDiagnosticBindings() {
    if (diagnosticBindingsActive) return true;
    document.addEventListener("click", handleControlClick, true);
    document.addEventListener("input", handleControlInput, true);
    window.addEventListener("ncn:application-change", handleApplicationChange);
    window.addEventListener("ncn:lifecycle-change", handleLifecycleChange);

    const profileUnsubscribe = window.NCNEvents?.on?.("integration:profile-applied", handleLifecycleChange);
    const installUnsubscribe = window.NCNEvents?.on?.("integration:department-installed", () => {
      bindMotionEvents();
      handleLifecycleChange();
    });
    diagnosticUnsubscribers = [profileUnsubscribe, installUnsubscribe].filter(unsubscribe => typeof unsubscribe === "function");
    bindMotionEvents();
    diagnosticBindingsActive = true;
    return true;
  }

  function unbindDiagnosticBindings() {
    if (diagnosticBindingsActive) {
      document.removeEventListener("click", handleControlClick, true);
      document.removeEventListener("input", handleControlInput, true);
      window.removeEventListener("ncn:application-change", handleApplicationChange);
      window.removeEventListener("ncn:lifecycle-change", handleLifecycleChange);
    }
    diagnosticUnsubscribers.splice(0).forEach(unsubscribe => {
      try { unsubscribe(); } catch (error) { console.error("[NCN Dev Panel] unsubscribe failed", error); }
    });
    unbindMotionEvents();
    diagnosticBindingsActive = false;
    return true;
  }

  async function setDiagnosticsActive(enabled) {
    const requested = Boolean(enabled);
    const wasActive = diagnosticsActive;

    if (requested) {
      diagnosticsActive = true;
      const mounted = ensureControls();
      if (!mounted) {
        diagnosticsActive = false;
        return false;
      }
      bindDiagnosticBindings();
      startTelemetry();
      updateReadouts();
      telemetryTask?.wake?.("diagnostics:enabled");
      return true;
    }

    diagnosticsActive = false;
    stopTelemetry();
    unbindDiagnosticBindings();
    showAllWeatherLayers();
    setEnvironmentPreview(false);

    if (wasActive) {
      await restoreApplicationProfile({ quiet: true, reason: "diagnostics-disabled" });
    } else {
      overrideActive = false;
    }
    return false;
  }

  function controlFromEvent(event) {
    const button = event.target?.closest?.("button");
    if (!button) return null;
    if (button.dataset.debugWeather) return { type: "weather", value: button.dataset.debugWeather };
    if (button.dataset.debugWeatherAction) return { type: "weather-action", value: button.dataset.debugWeatherAction };
    if (button.dataset.debugWeatherLayer) return { type: "weather-layer", value: button.dataset.debugWeatherLayer };
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
    if (!event.target?.matches?.("[data-debug-weather-input]")) return;
    updateControlOutputs(event.target);
  }

  function snapshot() {
    return Object.freeze({
      application: currentApplication(),
      diagnosticsActive,
      panelConnected: Boolean(panel?.isConnected),
      controlsConnected: Boolean(controls?.isConnected),
      telemetryActive: Boolean(telemetryTask),
      telemetryTask: telemetryTask?.snapshot?.() || null,
      bindingsActive: diagnosticBindingsActive,
      motionBindingsActive: Boolean(motionEventsService),
      eventSubscriptionCount: diagnosticUnsubscribers.length,
      environmentPreview: document.documentElement?.dataset?.devEnvironmentPreview === "true",
      selectedWeather,
      hiddenWeatherLayers: Object.freeze([...hiddenWeatherLayers]),
      overrideActive,
      lastAction,
      weather: currentService("weather")?.snapshot?.() || null,
      chamberMotion: currentService("chamber-motion")?.snapshot?.() || null
    });
  }

  window.NCNDevPanel = Object.freeze({
    ensureControls,
    setDiagnosticsActive,
    dispatchControl,
    applyWeather,
    applyWeatherSettings,
    replayWeatherSeed,
    toggleWeatherLayer,
    showAllWeatherLayers,
    weatherReport,
    copyWeatherReport,
    triggerMotion,
    restoreApplicationProfile,
    switchApplication,
    updateReadouts,
    snapshot
  });

  if (typeof document !== "undefined" && document.body && diagnosticsEnabled()) {
    void setDiagnosticsActive(true);
  }
})();
