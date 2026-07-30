/*==================================================
  DRIPFEED CHAMBER INTEGRATION

  Host-owned placement for Dripfeed's published live, latent and reading
  surfaces. Dripfeed continues to own packing and content; this bridge owns
  chamber-relative aperture geometry, foreground controls and lifecycle cleanup.
==================================================*/
window.NCNDripfeedChamber = (() => {
  'use strict';

  const OWNER = 'integration:dripfeed-chamber';
  const TASK_NAME = 'dripfeed:chamber-geometry';
  const OCCLUDER_ID = 'dripfeed-chamber-occluder';
  const MAX_GRID_STEPS = 14;
  const VIEWPORT_MARGIN = 8;
  const CONTROL_GAP = 4;
  const OCCLUSION_GAP = 7;
  const MIN_APERTURE_HEIGHT = 250;

  let active = false;
  let destroyed = false;
  let geometryTask = null;
  let geometry = null;
  let pendingOpen = null;
  let readyPublication = null;
  let rootEventsBound = false;

  const eventHandlers = new Map();

  function root() {
    return document.querySelector('#dripfeed-root');
  }

  function app() {
    return root()?.__dripfeedApp || null;
  }

  function isDripfeedActive() {
    const element = root();
    return Boolean(
      element
      && !element.hidden
      && (window.NCNApplications?.current?.() || window.NCN_STATE?.activeApp) === 'dripfeed'
    );
  }

  function finite(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function freezeRect(rect) {
    return Object.freeze({
      left: finite(rect?.left),
      top: finite(rect?.top),
      right: finite(rect?.right),
      bottom: finite(rect?.bottom),
      width: Math.max(0, finite(rect?.width)),
      height: Math.max(0, finite(rect?.height))
    });
  }

  function setPx(element, property, value) {
    element?.style?.setProperty?.(property, `${Math.round(finite(value) * 100) / 100}px`);
  }

  function cameraSnapshot() {
    return window.NCNChamberCamera?.snapshot?.()
      || window.LayeredChamber?.getCameraSnapshot?.()
      || null;
  }

  function currentRailBottom() {
    return Math.max(0, finite(document.querySelector('.rail')?.getBoundingClientRect?.().bottom));
  }

  function controlElements(element = root()) {
    return Object.freeze({
      filter: element?.querySelector?.('.dripfeed-filter-rail') || null,
      utility: element?.querySelector?.('.dripfeed-utility-rail') || null
    });
  }

  function measureHeight(element, fallback) {
    const rectHeight = finite(element?.getBoundingClientRect?.().height);
    return Math.max(0, rectHeight || finite(element?.offsetHeight) || fallback);
  }

  function computeGeometry(camera, metrics = {}) {
    if (!camera?.apertureAt || !camera?.scaleAt) return null;

    const near = Math.max(0.001, finite(camera.near, 2.5));
    const cell = Math.max(0.001, finite(camera.cell, 0.5));
    const viewportWidth = Math.max(1, finite(camera.width, window.innerWidth));
    const viewportHeight = Math.max(1, finite(camera.height, window.innerHeight));
    const railBottom = Math.max(0, finite(metrics.railBottom));
    const filterHeight = Math.max(0, finite(metrics.filterHeight, 38));
    const utilityHeight = Math.max(0, finite(metrics.utilityHeight, 42));
    const controlTop = railBottom + CONTROL_GAP;
    const utilityTop = controlTop + filterHeight + CONTROL_GAP;
    const controlsBottom = utilityTop + utilityHeight;

    let chosen = null;
    let fallback = null;

    for (let step = 1; step <= MAX_GRID_STEPS; step += 1) {
      const lineZ = near + cell * step;
      const aperture = freezeRect(camera.apertureAt(lineZ));
      if (!aperture.width || !aperture.height) continue;

      const candidate = { lineZ, aperture, step };
      fallback = candidate;

      const clearsControls = aperture.top >= controlsBottom + OCCLUSION_GAP;
      const clearsViewport = aperture.left >= -VIEWPORT_MARGIN
        && aperture.right <= viewportWidth + VIEWPORT_MARGIN
        && aperture.bottom <= viewportHeight - VIEWPORT_MARGIN;
      const usableHeight = aperture.height >= MIN_APERTURE_HEIGHT;

      if (clearsControls && clearsViewport && usableHeight) {
        chosen = candidate;
        break;
      }
    }

    chosen ||= fallback;
    if (!chosen) return null;

    const liveZ = chosen.lineZ + cell * 0.12;
    const latentZ = liveZ + cell * 0.32;
    const readerZ = Math.max(near + cell * 0.04, chosen.lineZ - cell * 0.58);
    const rearScale = Math.max(0.9, Math.min(0.985, camera.scaleAt(latentZ) / camera.scaleAt(liveZ)));

    return Object.freeze({
      depthConvention: 'smaller-positive-z-is-nearer',
      lineZ: chosen.lineZ,
      liveZ,
      latentZ,
      readerZ,
      rearScale,
      gridStep: chosen.step,
      aperture: chosen.aperture,
      controls: Object.freeze({
        top: controlTop,
        filterHeight,
        utilityTop,
        utilityHeight,
        bottom: controlsBottom,
        left: chosen.aperture.left,
        width: chosen.aperture.width
      })
    });
  }

  function ensureOccluder(element = root()) {
    if (!element) return null;
    let occluder = element.querySelector?.(`#${OCCLUDER_ID}`) || null;
    if (!occluder) {
      occluder = document.createElement('div');
      occluder.id = OCCLUDER_ID;
      occluder.className = 'dripfeed-chamber-occluder';
      occluder.setAttribute('aria-hidden', 'true');
      element.append?.(occluder);
    }
    return occluder;
  }

  function publishScene() {
    const scene = window.NCNScene;
    if (!scene?.register) return;

    const register = (name, resolver, description) => scene.register(name, resolver, {
      owner: OWNER,
      replace: true,
      writable: false,
      description
    });

    register('dripfeed:controls', () => root()?.querySelector?.('.dripfeed-filter-rail'), 'Foreground Dripfeed filter controls.');
    register('dripfeed:live', () => app()?.getSpatialSurfaces?.().live || null, 'Live Dripfeed wall immediately behind the selected chamber grid line.');
    register('dripfeed:latent', () => app()?.getSpatialSurfaces?.().latent || null, 'Latent Dripfeed wall one shallow interval behind the live wall.');
    register('dripfeed:reading', () => readyPublication?.readingSurface || null, 'Forward Dripfeed reading surface after ready publication.');
    register('dripfeed:occluder', () => root()?.querySelector?.(`#${OCCLUDER_ID}`), 'Host-owned chamber grid lip in front of Dripfeed walls.');
  }

  function clearScene() {
    window.NCNScene?.unregisterOwner?.(OWNER);
  }

  function applyGeometry() {
    if (!active || destroyed || !isDripfeedActive()) return false;
    const element = root();
    const camera = cameraSnapshot();
    if (!element || !camera) return false;

    const controls = controlElements(element);
    const provisional = freezeRect(camera.apertureAt(camera.near + camera.cell));
    setPx(element, '--drip-chamber-control-left', provisional.left);
    setPx(element, '--drip-chamber-control-width', provisional.width);
    setPx(element, '--drip-chamber-control-top', currentRailBottom() + CONTROL_GAP);

    let next = computeGeometry(camera, {
      railBottom: currentRailBottom(),
      filterHeight: measureHeight(controls.filter, 38),
      utilityHeight: measureHeight(controls.utility, 42)
    });
    if (!next) return false;

    setPx(element, '--drip-chamber-control-left', next.controls.left);
    setPx(element, '--drip-chamber-control-width', next.controls.width);

    const corrected = computeGeometry(camera, {
      railBottom: currentRailBottom(),
      filterHeight: measureHeight(controls.filter, next.controls.filterHeight),
      utilityHeight: measureHeight(controls.utility, next.controls.utilityHeight)
    });
    if (corrected) next = corrected;

    geometry = next;
    const rect = next.aperture;
    setPx(element, '--drip-chamber-left', rect.left);
    setPx(element, '--drip-chamber-top', rect.top);
    setPx(element, '--drip-chamber-width', rect.width);
    setPx(element, '--drip-chamber-height', rect.height);
    setPx(element, '--drip-chamber-control-left', next.controls.left);
    setPx(element, '--drip-chamber-control-width', next.controls.width);
    setPx(element, '--drip-chamber-control-top', next.controls.top);
    setPx(element, '--drip-chamber-filter-height', next.controls.filterHeight);
    setPx(element, '--drip-chamber-utility-top', next.controls.utilityTop);
    setPx(element, '--drip-chamber-utility-height', next.controls.utilityHeight);
    element.style.setProperty('--drip-rear-scale', next.rearScale.toFixed(5));
    element.style.setProperty('--drip-live-z', next.liveZ.toFixed(4));
    element.style.setProperty('--drip-latent-z', next.latentZ.toFixed(4));
    element.style.setProperty('--drip-reader-z', next.readerZ.toFixed(4));
    element.dataset.chamberIntegrated = 'true';
    element.dataset.chamberOccluderStep = String(next.gridStep);

    const occluder = ensureOccluder(element);
    if (occluder) {
      occluder.hidden = false;
      occluder.dataset.lineZ = next.lineZ.toFixed(4);
    }

    window.LayeredChamber?.refresh?.();
    return true;
  }

  function wake(reason = 'dripfeed-chamber-refresh') {
    if (!active || destroyed) return false;
    if (geometryTask?.wake) {
      geometryTask.wake(reason);
      return true;
    }
    return applyGeometry();
  }

  function readingState(state) {
    const element = root();
    if (!element) return;
    element.dataset.chamberReadingState = state;
  }

  function onRootEvent(event) {
    const detail = event.detail || {};
    switch (event.type) {
      case 'dripfeed:walls-change':
      case 'dripfeed:filter-change':
      case 'dripfeed:repack':
      case 'dripfeed:restore':
      case 'dripfeed:dismiss':
        wake(event.type);
        break;
      case 'dripfeed:open-transmission-start':
        pendingOpen = Object.freeze({ token: detail.token, postId: detail.postId });
        readingState('opening');
        break;
      case 'dripfeed:open-transmission-ready':
        if (pendingOpen?.token !== detail.token || !detail.readingSurface?.isConnected) break;
        pendingOpen = null;
        readyPublication = Object.freeze({
          token: detail.token,
          postId: detail.postId,
          readingSurface: detail.readingSurface
        });
        readingState('ready');
        publishScene();
        break;
      case 'dripfeed:open-transmission-cancelled':
        if (pendingOpen?.token === detail.token) pendingOpen = null;
        if (!readyPublication) readingState('idle');
        break;
      case 'dripfeed:close-transmission':
        if (readyPublication?.token !== detail.token) break;
        readyPublication = null;
        readingState('idle');
        publishScene();
        break;
      default:
        break;
    }
  }

  function bindRootEvents() {
    const element = root();
    if (!element || rootEventsBound) return;
    rootEventsBound = true;
    [
      'dripfeed:walls-change',
      'dripfeed:filter-change',
      'dripfeed:repack',
      'dripfeed:restore',
      'dripfeed:dismiss',
      'dripfeed:open-transmission-start',
      'dripfeed:open-transmission-ready',
      'dripfeed:open-transmission-cancelled',
      'dripfeed:close-transmission'
    ].forEach(type => {
      element.addEventListener(type, onRootEvent);
      eventHandlers.set(type, onRootEvent);
    });
  }

  function unbindRootEvents() {
    const element = root();
    if (!element || !rootEventsBound) return;
    eventHandlers.forEach((handler, type) => element.removeEventListener?.(type, handler));
    eventHandlers.clear();
    rootEventsBound = false;
  }

  function activate(reason = 'activate') {
    if (destroyed) return false;
    active = true;
    bindRootEvents();
    const element = root();
    if (element) {
      element.dataset.chamberIntegrated = 'true';
      readingState(readyPublication ? 'ready' : pendingOpen ? 'opening' : 'idle');
    }
    ensureOccluder(element);
    publishScene();
    geometryTask?.resume?.(`dripfeed-chamber:${reason}`);
    wake(`dripfeed-chamber:${reason}`);
    return true;
  }

  function deactivate(reason = 'deactivate') {
    active = false;
    pendingOpen = null;
    readyPublication = null;
    geometryTask?.suspend?.();
    clearScene();

    const element = root();
    if (element) {
      readingState('idle');
      delete element.dataset.chamberIntegrated;
      delete element.dataset.chamberOccluderStep;
      const occluder = element.querySelector?.(`#${OCCLUDER_ID}`);
      if (occluder) occluder.hidden = true;
    }
    window.dispatchEvent(new CustomEvent('ncn:dripfeed-chamber-deactivated', { detail: { reason } }));
  }

  function onApplicationChange(event) {
    if (event.detail?.name === 'dripfeed') activate('application-change');
    else deactivate('application-change');
  }

  function onEnvironmentPhase(event) {
    if (event.detail?.phase === 'active' && event.detail?.next === 'dripfeed') wake('environment-ready');
  }

  function onCameraChange() {
    wake('camera-change');
  }

  function snapshot() {
    const stage = root()?.querySelector?.('[data-depth-host]') || null;
    return Object.freeze({
      active,
      destroyed,
      integrated: root()?.dataset?.chamberIntegrated === 'true',
      readingState: root()?.dataset?.chamberReadingState || 'idle',
      pendingToken: pendingOpen?.token || null,
      readyToken: readyPublication?.token || null,
      scrollTop: finite(stage?.scrollTop),
      scrollHeight: finite(stage?.scrollHeight),
      clientHeight: finite(stage?.clientHeight),
      geometry,
      planes: geometry ? Object.freeze([
        Object.freeze({ role: 'reader', z: geometry.readerZ }),
        Object.freeze({ role: 'occluder', z: geometry.lineZ }),
        Object.freeze({ role: 'live', z: geometry.liveZ }),
        Object.freeze({ role: 'latent', z: geometry.latentZ })
      ]) : Object.freeze([])
    });
  }

  function init() {
    const runtime = window.NCNViewerRuntime;
    if (runtime?.register) {
      geometryTask = runtime.register(TASK_NAME, () => {
        applyGeometry();
        return false;
      }, {
        group: 'application',
        priority: 24,
        maxFps: 60,
        wake: false
      });
    }

    window.addEventListener('resize', onCameraChange, { passive: true });
    window.addEventListener('orientationchange', onCameraChange, { passive: true });
    window.addEventListener('ncn:chamber-camera-change', onCameraChange);
    window.addEventListener('ncn:application-environment-phase', onEnvironmentPhase);
    window.addEventListener('ncn:application-change', onApplicationChange);

    if (isDripfeedActive()) activate('initial');
  }

  function destroy() {
    if (destroyed) return;
    deactivate('destroy');
    destroyed = true;
    unbindRootEvents();
    window.removeEventListener('resize', onCameraChange);
    window.removeEventListener('orientationchange', onCameraChange);
    window.removeEventListener('ncn:chamber-camera-change', onCameraChange);
    window.removeEventListener('ncn:application-environment-phase', onEnvironmentPhase);
    window.removeEventListener('ncn:application-change', onApplicationChange);
    geometryTask?.unregister?.();
    geometryTask = null;
    root()?.querySelector?.(`#${OCCLUDER_ID}`)?.remove?.();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  return Object.freeze({
    OWNER,
    computeGeometry,
    refresh: wake,
    activate,
    deactivate,
    destroy,
    getPlaneDefinitions: () => snapshot().planes.map(plane => ({ ...plane })),
    snapshot
  });
})();
