/*==================================================
  NCN DRIPFEED ADAPTER

  Host-facing boundary around the protected Dripfeed application. Other modules
  may inspect published surfaces and request geometry ownership, but must not
  manipulate tile membership, packing or reader internals.

  Responsive column changes remain Dripfeed-owned. This adapter observes only
  the effective CSS column count and asks the Dripfeed renderer to replan when
  that count changes; Integration continues to own chamber geometry.
==================================================*/

window.NCNDripfeed = (() => {
  let suspended = false;
  let restoreAfterSuspend = false;
  let geometryOwner = null;
  let responsiveObserver = null;
  let responsiveFrame = 0;
  let responsiveTrackingBound = false;
  let effectiveColumns = null;
  const responsiveListeners = new Map();

  function root() {
    return document.querySelector('#dripfeed-root');
  }

  function instance() {
    return root()?.__dripfeedApp || null;
  }

  function isActive() {
    const element = root();
    return Boolean(
      element
      && !element.hidden
      && (window.NCNApplications?.current?.() || window.NCN_STATE?.activeApp) === 'dripfeed'
    );
  }

  function computedColumns() {
    const element = root();
    if (!element || typeof getComputedStyle !== 'function') return null;
    const value = Number(getComputedStyle(element).getPropertyValue('--cols'));
    if (!Number.isFinite(value)) return null;
    return Math.max(1, Math.min(6, Math.floor(value)));
  }

  function cancelResponsiveFrame() {
    if (!responsiveFrame) return;
    cancelAnimationFrame(responsiveFrame);
    responsiveFrame = 0;
  }

  function publishResponsiveColumns(previous, columns, reason, rendered) {
    const element = root();
    if (!element) return;
    const detail = Object.freeze({ previous, columns, reason, rendered });
    if (window.Dripfeed?.mechanics?.dispatch) {
      window.Dripfeed.mechanics.dispatch(element, 'responsive-columns-change', detail);
      return;
    }
    if (typeof CustomEvent === 'function') {
      element.dispatchEvent(new CustomEvent('dripfeed:responsive-columns-change', {
        bubbles: true,
        detail
      }));
    }
  }

  function syncResponsiveColumns(reason = 'measure') {
    responsiveFrame = 0;
    const next = computedColumns();
    if (next == null) return false;

    const previous = effectiveColumns;
    if (previous == null) {
      effectiveColumns = next;
      return false;
    }
    if (next === previous) return false;

    effectiveColumns = next;
    const app = instance();
    const rendered = Boolean(app && isActive() && typeof app.render === 'function');
    if (rendered) app.render();
    publishResponsiveColumns(previous, next, reason, rendered);
    return true;
  }

  function scheduleResponsiveColumns(reason = 'resize') {
    if (responsiveFrame) return false;
    responsiveFrame = requestAnimationFrame(() => syncResponsiveColumns(reason));
    return true;
  }

  function bindResponsiveColumns() {
    if (responsiveTrackingBound) return;
    responsiveTrackingBound = true;
    if (effectiveColumns == null) effectiveColumns = computedColumns();

    const onResize = () => scheduleResponsiveColumns('viewport-resize');
    const onOrientation = () => scheduleResponsiveColumns('orientation-change');
    const onApplication = event => {
      if (event.detail?.name === 'dripfeed') scheduleResponsiveColumns('application-activate');
    };

    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onOrientation, { passive: true });
    window.addEventListener('ncn:application-change', onApplication);
    responsiveListeners.set('resize', onResize);
    responsiveListeners.set('orientationchange', onOrientation);
    responsiveListeners.set('ncn:application-change', onApplication);

    if (typeof ResizeObserver === 'function') {
      responsiveObserver = new ResizeObserver(() => scheduleResponsiveColumns('root-resize'));
      const element = root();
      if (element) responsiveObserver.observe(element);
    }
  }

  function unbindResponsiveColumns() {
    cancelResponsiveFrame();
    responsiveObserver?.disconnect?.();
    responsiveObserver = null;
    responsiveListeners.forEach((listener, type) => window.removeEventListener(type, listener));
    responsiveListeners.clear();
    responsiveTrackingBound = false;
  }

  function publishedElement(role) {
    const element = root();
    if (!element) return null;
    if (role === 'depthHost') return element.querySelector('[data-depth-host]');
    if (role === 'live') {
      return element.querySelector('[data-spatial-surface="live"], [data-depth-plane="live"]');
    }
    if (role === 'latent') {
      return element.querySelector('[data-spatial-surface="latent"], [data-depth-plane="latent"]');
    }
    if (role === 'reading') {
      return element.querySelector('[data-spatial-surface="reading"]');
    }
    return null;
  }

  function readingElement() {
    if (!isActive()) return null;
    const published = publishedElement('reading');
    if (published?.isConnected) return published;
    const element = root();
    return element?.querySelector(
      '[data-overlay="reader"].open .reader-card, '
      + '[data-overlay="reader"][aria-hidden="false"] .reader-card'
    ) || null;
  }

  function getSpatialSurfaces() {
    const element = root();
    if (!element) return Object.freeze({
      depthHost: null,
      live: null,
      latent: null,
      reading: null,
      controls: Object.freeze([])
    });
    return Object.freeze({
      depthHost: publishedElement('depthHost'),
      live: publishedElement('live'),
      latent: publishedElement('latent'),
      reading: readingElement(),
      controls: Object.freeze([
        element.querySelector('.dripfeed-filter-rail'),
        element.querySelector('.dripfeed-utility-rail')
      ].filter(Boolean))
    });
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

  function getReadingZone() {
    return rectFor(readingElement());
  }

  function getControlZones() {
    if (!isActive()) return [];
    const element = root();
    return [
      ...getSpatialSurfaces().controls,
      element?.querySelector('[data-overlay="submit"].open .submit-card')
    ].map(rectFor).filter(Boolean);
  }

  function applyGeometryOwner() {
    if (!geometryOwner) return false;
    const depth = instance()?.depth;
    return Boolean(depth?.claimExternalGeometry?.(geometryOwner));
  }

  function claimGeometryOwnership(owner) {
    const key = String(owner || '').trim();
    if (!key) throw new TypeError('Dripfeed geometry ownership requires a non-empty owner.');
    if (geometryOwner && geometryOwner !== key) return false;
    geometryOwner = key;
    applyGeometryOwner();
    return true;
  }

  function releaseGeometryOwnership(owner) {
    const key = String(owner || '').trim();
    if (!geometryOwner || geometryOwner !== key) return false;
    instance()?.depth?.releaseExternalGeometry?.(key);
    geometryOwner = null;
    return true;
  }

  function isReading() {
    return Boolean(readingElement());
  }

  function suspend() {
    if (suspended) return;
    suspended = true;
    restoreAfterSuspend = isActive();
    if (!restoreAfterSuspend) return;
    const app = instance();
    if (typeof app?.suspend === 'function') app.suspend();
    else app?.depth?.pause?.();
  }

  function resume() {
    if (!suspended) {
      scheduleResponsiveColumns('resume');
      return;
    }
    suspended = false;
    if (restoreAfterSuspend && isActive()) {
      const app = instance();
      if (typeof app?.resume === 'function') app.resume();
      else app?.depth?.resume?.();
      applyGeometryOwner();
    }
    restoreAfterSuspend = false;
    scheduleResponsiveColumns('resume');
  }

  function reset() {
    const app = instance();
    if (!app) return;
    if (typeof app.reset === 'function') {
      app.reset();
      scheduleResponsiveColumns('reset');
      return;
    }
    app.readerTransition?.close?.({ immediate: true });
    app.submit?.close?.();
    app.render?.();
    effectiveColumns = computedColumns() ?? effectiveColumns;
  }

  function repack() {
    const app = instance();
    if (!app || typeof app.repack !== 'function') return null;
    const publication = app.repack();
    scheduleResponsiveColumns('repack');
    return publication;
  }

  function destroy() {
    unbindResponsiveColumns();
    const element = root();
    const app = instance();
    if (geometryOwner) app?.depth?.releaseExternalGeometry?.(geometryOwner);
    app?.destroy?.();
    if (element?.__dripfeedApp === app) delete element.__dripfeedApp;
    suspended = false;
    restoreAfterSuspend = false;
    geometryOwner = null;
    effectiveColumns = null;
  }

  function getDepthPlaneDefinitions() {
    return instance()?.getDepthPlaneDefinitions?.()
      || window.Dripfeed?.depth?.PLANE_DEFINITIONS
      || [];
  }

  bindResponsiveColumns();

  return Object.freeze({
    getSpatialSurfaces,
    getReadingZone,
    getControlZones,
    getDepthPlaneDefinitions,
    claimGeometryOwnership,
    releaseGeometryOwnership,
    syncResponsiveColumns,
    getEffectiveColumns: () => computedColumns(),
    isReading,
    suspend,
    resume,
    reset,
    repack,
    destroy,
    isActive,
    snapshot: () => Object.freeze({
      active: isActive(),
      reading: isReading(),
      mounted: Boolean(instance()),
      suspended,
      hasReadingZone: Boolean(readingElement()),
      geometryOwner,
      responsiveColumns: Object.freeze({
        effective: effectiveColumns,
        computed: computedColumns(),
        tracking: responsiveTrackingBound,
        observerConnected: Boolean(responsiveObserver),
        pending: Boolean(responsiveFrame)
      }),
      depth: instance()?.depth?.snapshot?.() || null,
      surfaces: Object.freeze(Object.fromEntries(
        Object.entries(getSpatialSurfaces()).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.length : Boolean(value)
        ])
      ))
    })
  });
})();
