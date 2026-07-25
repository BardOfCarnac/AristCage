/* Initialise department-facing services only after the stable viewer host exists. */
(function startNCNIntegration() {
  const start = () => {
    void window.NCNIntegration?.ensureCoreServices?.().catch(error => {
      console.error("[NCN integration] service startup failed", error);
    });
  };

  if (window.NCNViewerHost?.isReady?.()) {
    start();
    return;
  }

  const unsubscribe = window.NCNEvents?.on?.("host:ready", () => {
    unsubscribe?.();
    start();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      if (window.NCNViewerHost?.isReady?.()) start();
    }, { once: true });
  }
})();
