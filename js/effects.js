/*==================================================
  NCN EFFECTS PUBLIC INSTANCE
==================================================*/
(() => {
  "use strict";

  const effects = window.createEffects({
    runtime: window.NCNViewerRuntime,
    lifecycle: window.NCNViewerLifecycle,
    registerRuntimeInvalidations: false
  });
  window.NCNEffects = effects;

  const init = () => effects.init().catch(error => {
    console.error("[NCN effects] initialisation failed", error);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
