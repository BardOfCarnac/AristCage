/*==================================================
  NCN INTEGRATION SERVICE CAPABILITY GATE

  Core compatibility adapters temporarily occupy the replaceable environment
  slots while accepted departments install. Consumers must not mistake those
  lifecycle-only placeholders for the accepted public service instances.
==================================================*/
(() => {
  "use strict";

  const integration = window.NCNIntegration;
  if (!integration?.getService || integration.__capabilityGate === true) return;

  const REQUIRED_CAPABILITIES = Object.freeze({
    weather: Object.freeze([
      "applyProfile",
      "configure",
      "setProfile",
      "setWeather",
      "setEnabled"
    ]),
    "chamber-motion": Object.freeze(["trigger"])
  });

  function hasRequiredCapability(name, service) {
    const required = REQUIRED_CAPABILITIES[name];
    if (!required) return Boolean(service);
    return Boolean(service && required.some(method => typeof service[method] === "function"));
  }

  function getService(name, options = {}) {
    const key = String(name || "").trim();
    const service = integration.getService(key);
    if (hasRequiredCapability(key, service)) return service;

    if (options.required === true) {
      const state = window.NCNIntegratedDepartments?.snapshot?.();
      const failure = state?.failure ? ` ${state.failure}` : "";
      throw new Error(`Accepted ${key} service is not ready.${failure}`);
    }
    return null;
  }

  window.NCNIntegration = Object.freeze({
    ...integration,
    getService,
    requireService: name => getService(name, { required: true }),
    hasPublicService: name => hasRequiredCapability(String(name || "").trim(), integration.getService(name)),
    __capabilityGate: true
  });
})();
