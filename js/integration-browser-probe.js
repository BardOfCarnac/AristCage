/*==================================================
  NCN BROWSER INSTALLATION PROBE

  Inert during normal use. With ?integrationProbe=1 it publishes the real
  accepted-department startup result into the document for headless CI.
==================================================*/
(() => {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  if (params.get("integrationProbe") !== "1") return;

  const root = document.documentElement;
  const output = document.createElement("pre");
  output.id = "integration-browser-probe";
  output.hidden = true;
  document.body.appendChild(output);

  function serialise(value) {
    try { return JSON.stringify(value, null, 2); }
    catch (error) { return JSON.stringify({ serialisationError: String(error?.message || error) }); }
  }

  function publish(status, detail) {
    root.dataset.integrationProbeStatus = status;
    root.dataset.integrationProbeMessage = String(detail?.message || status).slice(0, 500);
    output.dataset.status = status;
    output.textContent = serialise(detail);
  }

  Promise.resolve().then(async () => {
    try {
      const result = await window.NCNIntegratedDepartments?.ready?.();
      const snapshot = window.NCNIntegratedDepartments?.snapshot?.() || result || null;
      const required = ["effects", "weather", "chamber-motion"];
      const modules = window.NCNModules?.snapshot?.() || [];
      const missing = required.filter(name => {
        const record = modules.find(item => item.name === name);
        return !record || !["ready", "suspended"].includes(record.state);
      });
      const weather = window.NCNIntegration?.getService?.("weather");
      const motion = window.NCNIntegration?.getService?.("chamber-motion");
      if (missing.length || typeof weather?.applyProfile !== "function" || typeof motion?.trigger !== "function") {
        throw new Error(`Accepted services incomplete: ${missing.join(", ") || "public capability missing"}`);
      }
      publish("ready", {
        message: "Accepted departments installed in the browser.",
        snapshot,
        modules,
        weatherCapabilities: Object.keys(weather).filter(key => typeof weather[key] === "function"),
        motionCapabilities: Object.keys(motion).filter(key => typeof motion[key] === "function")
      });
    } catch (error) {
      publish("error", {
        message: String(error?.message || error),
        stack: String(error?.stack || ""),
        departments: window.NCNIntegratedDepartments?.snapshot?.() || null,
        integration: window.NCNIntegration?.snapshot?.() || null,
        modules: window.NCNModules?.snapshot?.() || []
      });
    }
  });
})();
