/*==================================================
  NCN OPTICAL ADAPTER

  The only supported host-facing boundary around the protected Optical
  renderer. Environmental modules may inspect the reading zone, but never
  manipulate Optical internals.
==================================================*/

window.NCNOptical = (() => {
  let suspended = false;
  let restoreAfterSuspend = false;

  function renderer() {
    return window.OpticalProjection || null;
  }

  function activate(options = {}) {
    suspended = false;
    renderer()?.enable?.({ persist: options.persist === true });
    window.NCNEvents?.emit?.("optical:activated", { reason: options.reason || "host" });
    return isActive();
  }

  function deactivate(options = {}) {
    renderer()?.disable?.({ persist: options.persist === true });
    window.NCNEvents?.emit?.("optical:deactivated", { reason: options.reason || "host" });
    return !isActive();
  }

  function refresh() {
    renderer()?.refresh?.();
  }

  function readingElement() {
    const expanded = document.querySelector("#feed > .entry.expanded:not(.panel)");
    if (expanded) return expanded;
    const inspector = document.querySelector("#desktop-inspector");
    if (inspector && inspector.getClientRects().length && inspector.textContent.trim()) return inspector;
    return document.querySelector("#feed");
  }

  function getReadingZone() {
    const element = readingElement();
    if (!element) return null;
    const rect = element.getBoundingClientRect();
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

  function getDepthPlaneDefinitions() {
    return renderer()?.getPlaneDefinitions?.() || [];
  }

  function suspend() {
    if (suspended) return;
    restoreAfterSuspend = isActive();
    suspended = true;
    if (restoreAfterSuspend) deactivate({ reason: "suspend" });
  }

  function resume() {
    if (!suspended) return;
    suspended = false;
    if (restoreAfterSuspend) activate({ reason: "resume" });
    restoreAfterSuspend = false;
  }

  function reset() {
    if (isActive()) refresh();
  }

  function destroy() {
    restoreAfterSuspend = false;
    suspended = false;
    renderer()?.destroy?.();
  }

  function isActive() {
    return Boolean(renderer()?.isEnabled?.());
  }

  return Object.freeze({
    activate,
    deactivate,
    refresh,
    getReadingZone,
    getPlaneDefinitions: getDepthPlaneDefinitions,
    getDepthPlaneDefinitions,
    getCameraSnapshot: () => renderer()?.getCameraSnapshot?.() || null,
    suspend,
    resume,
    reset,
    destroy,
    isActive,
    snapshot: () => Object.freeze({
      active: isActive(),
      suspended,
      hasReadingZone: Boolean(readingElement())
    })
  });
})();