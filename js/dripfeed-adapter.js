/*==================================================
  NCN DRIPFEED ADAPTER

  Host-facing boundary around the protected Dripfeed application. Other modules
  may inspect reading/control zones but must not manipulate tile or reader DOM.
==================================================*/

window.NCNDripfeed = (() => {
  let suspended = false;
  let restoreAfterSuspend = false;

  function root() {
    return document.querySelector("#dripfeed-root");
  }

  function instance() {
    return root()?.__dripfeedApp || null;
  }

  function isActive() {
    const element = root();
    return Boolean(
      element
      && !element.hidden
      && (window.NCNApplications?.current?.() || window.NCN_STATE?.activeApp) === "dripfeed"
    );
  }

  function rectFor(element) {
    if (!element?.isConnected) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
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

  function readingElement() {
    const element = root();
    if (!element || !isActive()) return null;
    return element.querySelector(
      '[data-overlay="reader"].open .reader-card, '
      + '[data-overlay="reader"][aria-hidden="false"] .reader-card'
    );
  }

  function getReadingZone() {
    return rectFor(readingElement());
  }

  function getControlZones() {
    const element = root();
    if (!element || !isActive()) return [];
    return [
      element.querySelector(".dripfeed-filter-rail"),
      element.querySelector(".dripfeed-utility-rail"),
      element.querySelector('[data-overlay="submit"].open .submit-card')
    ].map(rectFor).filter(Boolean);
  }

  function suspend() {
    if (suspended) return;
    suspended = true;
    restoreAfterSuspend = isActive();
    if (!restoreAfterSuspend) return;
    const app = instance();
    if (typeof app?.suspend === "function") app.suspend();
    else app?.depth?.pause?.();
  }

  function resume() {
    if (!suspended) return;
    suspended = false;
    if (restoreAfterSuspend && isActive()) {
      const app = instance();
      if (typeof app?.resume === "function") app.resume();
      else app?.depth?.resume?.();
    }
    restoreAfterSuspend = false;
  }

  function reset() {
    const app = instance();
    if (!app) return;
    if (typeof app.reset === "function") {
      app.reset();
      return;
    }
    app.readerTransition?.close?.({ immediate: true });
    app.submit?.close?.();
    app.render?.();
  }

  function destroy() {
    const element = root();
    const app = instance();
    app?.destroy?.();
    if (element?.__dripfeedApp === app) delete element.__dripfeedApp;
    suspended = false;
    restoreAfterSuspend = false;
  }

  function getDepthPlaneDefinitions() {
    return instance()?.getDepthPlaneDefinitions?.()
      || window.Dripfeed?.depth?.PLANE_DEFINITIONS
      || [];
  }

  return Object.freeze({
    getReadingZone,
    getControlZones,
    getDepthPlaneDefinitions,
    suspend,
    resume,
    reset,
    destroy,
    isActive,
    snapshot: () => Object.freeze({
      active: isActive(),
      mounted: Boolean(instance()),
      suspended,
      hasReadingZone: Boolean(readingElement())
    })
  });
})();