/*==================================================
  DRIPFEED CHAMBER INTEGRATION

  Host-owned placement for Dripfeed's published live, latent and reading
  surfaces. Dripfeed owns membership, packing and presentation; Integration
  owns the camera-relative planes, aperture, foreground clearance and cleanup.
==================================================*/
window.NCNDripfeedChamber = (() => {
  'use strict';

  const OWNER = 'integration:dripfeed-chamber';
  const TASK_NAME = 'dripfeed:chamber-geometry';
  const OCCLUDER_ID = 'dripfeed-chamber-occluder';
  const MAX_GRID_STEPS = 14;
  const VIEWPORT_MARGIN = 8;
  const CONTROL_GAP = 4;
  const OCCLUSION_GAP = 8;
  const MIN_APERTURE_HEIGHT = 250;
  const LIVE_PLANE_GAP_CELLS = 0.005;
  const LATENT_PLANE_GAP_CELLS = 0.26;

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

  function adapter() {
    return window.NCNDripfeed || null;
  }

  function surfaces() {
    return adapter()?.getSpatialSurfaces?.() || Object.freeze({
      depthHost: null,
      live: null,
      latent: null,
      reading: null,
      controls: Object.freeze([])
    });
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

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
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

  function measureHeight(element, fallback) {
    const rectHeight = finite(element?.getBoundingClientRect?.().height);
    return Math.max(0, rectHeight || finite(element?.offsetHeight) || fallback);
  }

  function layoutMetrics(element, aperture, wallGutter) {
    let columns = 3;
    let gap = 8;
    try {
      const styles = getComputedStyle(element);
      columns = Math.max(1, Math.floor(finite(styles.getPropertyValue('--cols'), 3)));
      gap = Math.max(0, finite(parseFloat(styles.getPropertyValue('--gap')), 8));
    } catch (error) {}
    const contentWidth = Math.max(1, aperture.width - wallGutter * 2);
    const unit = Math.max(24, (contentWidth - gap * (columns - 1)) / columns);
    return Object.freeze({ columns, gap, unit, contentWidth });
  }

  function planeProjection(camera, z, aperture) {
    const rect = freezeRect(camera.apertureAt(z));
    const scale = aperture.width > 0 ? rect.width / aperture.width : 1;
    return Object.freeze({
      z,
      rect,
      scale,
      x: rect.left - aperture.left,
      y: rect.top - aperture.top
    });
  }

  function computeGeometry(camera, metrics = {}) {
    if (!camera?.apertureAt || !camera?.scaleAt) return null;

    const near = Math.max(0.001, finite(camera.near, 2.5));
    const cell = Math.max(0.001, finite(camera.cell, 0.5));
    const viewportWidth = Math.max(1, finite(camera.width, window.innerWidth));
    const viewportHeight = Math.max(1, finite(camera.height, window.innerHeight));
    const railBottom = Math.max(0, finite(metrics.railBottom));
    const filterHeight = Math.max(0, finite(metrics.filterHeight, 28));
    const utilityHeight = Math.max(0, finite(metrics.utilityHeight, 38));
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
      const fitsViewport = aperture.left >= -VIEWPORT_MARGIN
        && aperture.right <= viewportWidth + VIEWPORT_MARGIN
        && aperture.top >= VIEWPORT_MARGIN
        && aperture.bottom <= viewportHeight - VIEWPORT_MARGIN;
      if (fitsViewport && aperture.height >= MIN_APERTURE_HEIGHT) {
        chosen = candidate;
        break;
      }
    }

    chosen ||= fallback;
    if (!chosen) return null;

    // Keep the live wall immediately behind the occluding chamber line. This is
    // the nearest truthful camera plane: it increases apparent proximity without
    // applying an unreported CSS scale or allowing the cards to cross the grid.
    const liveZ = chosen.lineZ + cell * LIVE_PLANE_GAP_CELLS;
    const latentZ = liveZ + cell * LATENT_PLANE_GAP_CELLS;
    const readerZ = Math.max(near + cell * 0.04, chosen.lineZ - cell * 0.58);
    const live = planeProjection(camera, liveZ, chosen.aperture);
    const latent = planeProjection(camera, latentZ, chosen.aperture);
    const reader = planeProjection(camera, readerZ, chosen.aperture);
    const wallGutter = clamp(viewportWidth * 0.0065, 5, 10);
    const leadingClearance = Math.max(
      0,
      (controlsBottom + OCCLUSION_GAP - live.rect.top) / Math.max(0.001, live.scale) - wallGutter
    );

    return Object.freeze({
      depthConvention: 'smaller-positive-z-is-nearer',
      lineZ: chosen.lineZ,
      gridStep: chosen.step,
      aperture: chosen.aperture,
      wallGutter,
      leadingClearance,
      calibration: Object.freeze({
        liveGapCells: LIVE_PLANE_GAP_CELLS,
        latentGapCells: LATENT_PLANE_GAP_CELLS
      }),
      controls: Object.freeze({
        top: controlTop,
        filterHeight,
        utilityTop,
        utilityHeight,
        bottom: controlsBottom,
        left: chosen.aperture.left,
        width: chosen.aperture.width
      }),
      planes: Object.freeze({ live, latent, reader })
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
    if (!scene?.register || !active) return;
    const register = (name, resolver, description) => scene.register(name, resolver, {
      owner: OWNER,
      replace: true,
      writable: false,
      description
    });
    register('dripfeed:controls', () => surfaces().controls[0] || null, 'Foreground Dripfeed filter controls.');
    register('dripfeed:depth-host', () => surfaces().depthHost, 'Transparent chamber aperture hosting Dripfeed surfaces.');
    register('dripfeed:live', () => surfaces().live, 'Camera-projected live Dripfeed wall.');
    register('dripfeed:latent', () => surfaces().latent, 'Camera-projected latent Dripfeed wall.');
    register('dripfeed:reading', () => readyPublication?.readingSurface || null, 'Ready-gated camera-projected reading surface.');
    register('dripfeed:occluder', () => root()?.querySelector?.(`#${OCCLUDER_ID}`), 'Host-owned chamber grid lip.');
  }

  function clearScene() {
    window.NCNScene?.unregisterOwner?.(OWNER);
  }

  function applyPlaneVariables(element, next) {
    const { live, latent, reader } = next.planes;
    setPx(element, '--drip-live-x', live.x);
    setPx(element, '--drip-live-y', live.y);
    element.style.setProperty('--drip-live-scale', live.scale.toFixed(6));
    setPx(element, '--drip-latent-x', latent.x);
    setPx(element, '--drip-latent-y', latent.y);
    element.style.setProperty('--drip-latent-scale', latent.scale.toFixed(6));
    setPx(element, '--drip-reader-x', 0);
    setPx(element, '--drip-reader-y', 0);
    element.style.setProperty('--drip-reader-scale', reader.scale.toFixed(6));
  }

  function applyGeometry() {
    if (!active || destroyed || !isDripfeedActive()) return false;
    const element = root();
    const camera = cameraSnapshot();
    const publication = surfaces();
    if (!element || !camera || !publication.depthHost || !publication.live || !publication.latent) return false;

    const controls = publication.controls;
    const filter = controls[0] || null;
    const utility = controls[1] || null;
    const provisional = freezeRect(camera.apertureAt(camera.near + camera.cell));
    setPx(element, '--drip-chamber-control-left', provisional.left);
    setPx(element, '--drip-chamber-control-width', provisional.width);
    setPx(element, '--drip-chamber-control-top', currentRailBottom() + CONTROL_GAP);

    let next = computeGeometry(camera, {
      railBottom: currentRailBottom(),
      filterHeight: measureHeight(filter, 28),
      utilityHeight: measureHeight(utility, 38)
    });
    if (!next) return false;

    setPx(element, '--drip-chamber-control-left', next.controls.left);
    setPx(element, '--drip-chamber-control-width', next.controls.width);
    setPx(element, '--drip-chamber-control-top', next.controls.top);
    setPx(element, '--drip-chamber-utility-top', next.controls.utilityTop);

    const corrected = computeGeometry(camera, {
      railBottom: currentRailBottom(),
      filterHeight: measureHeight(filter, next.controls.filterHeight),
      utilityHeight: measureHeight(utility, next.controls.utilityHeight)
    });
    if (corrected) next = corrected;

    const layout = layoutMetrics(element, next.aperture, next.wallGutter);
    geometry = Object.freeze({ ...next, layout });
    next = geometry;
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
    setPx(element, '--drip-wall-gutter', next.wallGutter);
    setPx(element, '--drip-leading-clearance', next.leadingClearance);
    setPx(element, '--unit', next.layout.unit);
    applyPlaneVariables(element, next);

    element.dataset.chamberIntegrated = 'true';
    element.dataset.chamberOccluderStep = String(next.gridStep);
    publication.depthHost.dataset.geometryOwner = OWNER;
    publication.live.dataset.planeZ = next.planes.live.z.toFixed(4);
    publication.latent.dataset.planeZ = next.planes.latent.z.toFixed(4);
    if (publication.reading) publication.reading.dataset.planeZ = next.planes.reader.z.toFixed(4);

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
    if (element) element.dataset.chamberReadingState = state;
  }

  function onRootEvent(event) {
    if (!active || destroyed) return;
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
        wake('reader-ready');
        break;
      case 'dripfeed:open-transmission-cancelled':
        if (pendingOpen?.token !== detail.token) break;
        pendingOpen = null;
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

  const ROOT_EVENTS = Object.freeze([
    'dripfeed:walls-change',
    'dripfeed:filter-change',
    'dripfeed:repack',
    'dripfeed:restore',
    'dripfeed:dismiss',
    'dripfeed:open-transmission-start',
    'dripfeed:open-transmission-ready',
    'dripfeed:open-transmission-cancelled',
    'dripfeed:close-transmission'
  ]);

  function bindRootEvents() {
    const element = root();
    if (!element || rootEventsBound) return;
    rootEventsBound = true;
    ROOT_EVENTS.forEach(type => {
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

  function claimGeometry() {
    return adapter()?.claimGeometryOwnership?.(OWNER) !== false;
  }

  function releaseGeometry() {
    adapter()?.releaseGeometryOwnership?.(OWNER);
  }

  function activate(reason = 'activate') {
    if (destroyed) return false;
    claimGeometry();
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
    unbindRootEvents();
    pendingOpen = null;
    readyPublication = null;
    geometryTask?.suspend?.();
    clearScene();

    const publication = surfaces();
    if (publication.depthHost) delete publication.depthHost.dataset.geometryOwner;
    const element = root();
    if (element) {
      readingState('idle');
      delete element.dataset.chamberIntegrated;
      delete element.dataset.chamberOccluderStep;
      const occluder = element.querySelector?.(`#${OCCLUDER_ID}`);
      if (occluder) occluder.hidden = true;
    }
    releaseGeometry();
    window.dispatchEvent(new CustomEvent('ncn:dripfeed-chamber-deactivated', { detail: { reason } }));
  }

  function onApplicationChange(event) {
    if (event.detail?.name === 'dripfeed') activate('application-change');
    else deactivate('application-change');
  }

  function onEnvironmentPhase(event) {
    if (event.detail?.phase === 'empty' && event.detail?.next === 'dripfeed') {
      claimGeometry();
      return;
    }
    if (event.detail?.phase === 'active' && event.detail?.next === 'dripfeed') {
      if (!active && isDripfeedActive()) activate('environment-ready');
      else wake('environment-ready');
    }
  }

  function onCameraChange() {
    wake('camera-change');
  }

  function renderedPlane(element) {
    if (!element?.isConnected) return null;
    const rect = freezeRect(element.getBoundingClientRect());
    let transform = '';
    try { transform = getComputedStyle(element).transform; } catch (error) {}
    return Object.freeze({ rect, transform });
  }

  function snapshot() {
    const publication = surfaces();
    return Object.freeze({
      active,
      destroyed,
      integrated: root()?.dataset?.chamberIntegrated === 'true',
      readingState: root()?.dataset?.chamberReadingState || 'idle',
      pendingToken: pendingOpen?.token || null,
      readyToken: readyPublication?.token || null,
      rootEventsBound,
      adapter: adapter()?.snapshot?.() || null,
      scrollTop: finite(publication.depthHost?.scrollTop),
      scrollHeight: finite(publication.depthHost?.scrollHeight),
      clientHeight: finite(publication.depthHost?.clientHeight),
      geometry,
      planes: geometry ? Object.freeze([
        Object.freeze({ role: 'reader', z: geometry.planes.reader.z, scale: geometry.planes.reader.scale }),
        Object.freeze({ role: 'occluder', z: geometry.lineZ, scale: 1 }),
        Object.freeze({ role: 'live', z: geometry.planes.live.z, scale: geometry.planes.live.scale }),
        Object.freeze({ role: 'latent', z: geometry.planes.latent.z, scale: geometry.planes.latent.scale })
      ]) : Object.freeze([]),
      rendered: Object.freeze({
        live: renderedPlane(publication.live),
        latent: renderedPlane(publication.latent),
        reading: renderedPlane(publication.reading)
      })
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