/*==================================================
  DRIPFEED CHAMBER INTEGRATION

  Host-owned placement for Dripfeed's published live, latent and reading
  surfaces. Dripfeed owns membership, packing and presentation; Integration
  owns the shared foreground controls, fixed article bands and cleanup.
==================================================*/
window.NCNDripfeedChamber = (() => {
  'use strict';

  const OWNER = 'integration:dripfeed-chamber';
  const TASK_NAME = 'dripfeed:chamber-geometry';
  const OCCLUDER_ID = 'dripfeed-chamber-occluder';
  const CONTROL_GAP = 2;
  const OCCLUSION_GAP = 12;
  const LIVE_LINE_STEP = 1;
  const LATENT_LINE_STEP = 2;
  const PLANE_GAP_CELLS = 0.005;
  const READER_OFFSET_CELLS = 0.08;

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

  function readerTarget(publication = readyPublication) {
    return publication?.readerTarget
      || publication?.readingSurface?.closest?.('[data-reader-target]')
      || null;
  }

  function readerCard(publication = readyPublication) {
    return publication?.readerCard
      || (publication?.readingSurface?.matches?.('.reader-card') ? publication.readingSurface : null)
      || readerTarget(publication)?.querySelector?.('.reader-card')
      || null;
  }

  function releaseReaderPlacement(publication = readyPublication) {
    const target = readerTarget(publication);
    const card = readerCard(publication);
    let released = false;
    if (target?.style) {
      target.style.removeProperty?.('width');
      target.style.removeProperty?.('max-height');
      target.style.removeProperty?.('transform-origin');
      target.style.removeProperty?.('align-self');
      delete target.dataset.chamberReaderFit;
      delete target.dataset.chamberReaderLayoutWidth;
      delete target.dataset.chamberReaderMaxHeight;
      released = true;
    }
    if (card?.style) {
      card.style.removeProperty?.('max-height');
      delete card.dataset.chamberReaderFit;
      delete card.dataset.chamberReaderMaxHeight;
      released = true;
    }
    return released;
  }

  function stylePixels(styles, property) {
    const value = styles?.getPropertyValue?.(property) || styles?.[property] || 0;
    return Math.max(0, finite(parseFloat(value)));
  }

  function fitReaderPlacement(publication, scale) {
    const target = readerTarget(publication);
    const card = readerCard(publication);
    const overlay = target?.closest?.('.reader-overlay') || target?.parentElement || null;
    if (!target?.style || !card?.style || !overlay) return false;

    releaseReaderPlacement(publication);

    let overlayStyles = null;
    try { overlayStyles = getComputedStyle(overlay); } catch (error) {}
    const contentWidth = Math.max(1,
      finite(overlay.clientWidth, window.innerWidth)
      - stylePixels(overlayStyles, 'padding-left')
      - stylePixels(overlayStyles, 'padding-right'));
    const contentHeight = Math.max(1,
      finite(overlay.clientHeight, window.innerHeight - currentRailBottom())
      - stylePixels(overlayStyles, 'padding-top')
      - stylePixels(overlayStyles, 'padding-bottom'));
    const safeScale = Math.max(0.0001, finite(scale, 1));
    const naturalWidth = Math.max(1,
      finite(target.offsetWidth, finite(target.getBoundingClientRect?.().width) / safeScale));
    const visualWidth = Math.min(naturalWidth, contentWidth);
    const layoutWidth = visualWidth / safeScale;
    const layoutMaxHeight = contentHeight / safeScale;

    target.style.setProperty('width', `${layoutWidth}px`);
    target.style.setProperty('transform-origin', '50% 0');
    target.style.setProperty('align-self', 'start');
    card.style.setProperty('max-height', `${layoutMaxHeight}px`);
    target.dataset.chamberReaderFit = 'contained';
    target.dataset.chamberReaderLayoutWidth = layoutWidth.toFixed(3);
    target.dataset.chamberReaderMaxHeight = layoutMaxHeight.toFixed(3);
    card.dataset.chamberReaderFit = 'contained';
    card.dataset.chamberReaderMaxHeight = layoutMaxHeight.toFixed(3);
    return true;
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

  function planeProjection(camera, z, referenceZ, aperture, verticalOrigin = 'top') {
    const referenceScale = Math.max(0.0001, finite(camera.scaleAt(referenceZ), 1));
    const scale = Math.max(0.0001, finite(camera.scaleAt(z), referenceScale)) / referenceScale;
    const projectedWidth = aperture.width * scale;
    const projectedHeight = aperture.height * scale;
    const x = (aperture.width - projectedWidth) * 0.5;
    const y = verticalOrigin === 'centre'
      ? (aperture.height - projectedHeight) * 0.5
      : 0;

    return Object.freeze({
      z,
      scale,
      x,
      y,
      rect: freezeRect({
        left: aperture.left + x,
        top: aperture.top + y,
        right: aperture.left + x + projectedWidth,
        bottom: aperture.top + y + projectedHeight,
        width: projectedWidth,
        height: projectedHeight
      })
    });
  }

  function computeGeometry(camera, metrics = {}) {
    if (!camera?.apertureAt || !camera?.scaleAt) return null;

    const near = Math.max(0.001, finite(camera.near, 2.5));
    const cell = Math.max(0.001, finite(camera.cell, 0.5));
    const viewportWidth = Math.max(1, finite(camera.width, window.innerWidth));
    const viewportHeight = Math.max(1, finite(camera.height, window.innerHeight));
    const railBottom = Math.max(0, finite(metrics.railBottom));
    const filterHeight = Math.max(0, finite(metrics.filterHeight, 32));
    const utilityHeight = Math.max(0, finite(metrics.utilityHeight, 42));
    const controlTop = railBottom + CONTROL_GAP;
    const utilityTop = controlTop + filterHeight + CONTROL_GAP;
    const controlsBottom = utilityTop + utilityHeight;

    // The shared rail already owns the title at the same foreground position as
    // RedWire. Controls remain screen-space UI beneath it; article placement is
    // fixed to the first two chamber bands and never selected by viewport fit.
    const lineZ = near + cell * LIVE_LINE_STEP;
    const liveZ = lineZ + cell * PLANE_GAP_CELLS;
    const latentZ = near + cell * LATENT_LINE_STEP + cell * PLANE_GAP_CELLS;
    const readerZ = near + cell * READER_OFFSET_CELLS;

    const stageTop = clamp(controlsBottom, 0, Math.max(0, viewportHeight - 1));
    const aperture = freezeRect({
      left: 0,
      top: stageTop,
      right: viewportWidth,
      bottom: viewportHeight,
      width: viewportWidth,
      height: Math.max(1, viewportHeight - stageTop)
    });

    const live = planeProjection(camera, liveZ, lineZ, aperture);
    const latent = planeProjection(camera, latentZ, lineZ, aperture);
    const reader = planeProjection(camera, readerZ, lineZ, aperture, 'centre');
    const wallGutter = clamp(viewportWidth * 0.0065, 5, 10);
    const leadingClearance = OCCLUSION_GAP;

    return Object.freeze({
      depthConvention: 'smaller-positive-z-is-nearer',
      lineZ,
      gridStep: LIVE_LINE_STEP,
      aperture,
      wallGutter,
      leadingClearance,
      calibration: Object.freeze({
        placement: 'shared-fixed-bands',
        liveBand: LIVE_LINE_STEP,
        latentBand: LATENT_LINE_STEP,
        liveGapCells: PLANE_GAP_CELLS,
        readerOffsetCells: READER_OFFSET_CELLS
      }),
      controls: Object.freeze({
        top: controlTop,
        filterHeight,
        utilityTop,
        utilityHeight,
        bottom: controlsBottom,
        left: 0,
        width: viewportWidth
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
    register('dripfeed:controls', () => surfaces().controls[0] || null, 'Foreground Dripfeed filter controls beneath the shared title rail.');
    register('dripfeed:depth-host', () => surfaces().depthHost, 'Viewport-clipped host for fixed Dripfeed article bands.');
    register('dripfeed:live', () => surfaces().live, 'Live Dripfeed wall on the first chamber band.');
    register('dripfeed:latent', () => surfaces().latent, 'Latent Dripfeed wall on the second chamber band.');
    register('dripfeed:reading', () => readyPublication?.readingSurface || null, 'Ready-gated foreground reading surface.');
    register('dripfeed:occluder', () => root()?.querySelector?.(`#${OCCLUDER_ID}`), 'Host-owned first-band chamber lip.');
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

    // The overlay already centres the reader. Keep translation at zero and
    // inversely fit its layout box before applying the foreground scale, so the
    // transformed card and controls remain inside the rail-safe viewport.
    setPx(element, '--drip-reader-x', 0);
    setPx(element, '--drip-reader-y', 0);
    element.style.setProperty('--drip-reader-scale', reader.scale.toFixed(6));
    fitReaderPlacement(readyPublication, reader.scale);
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
    setPx(element, '--drip-chamber-control-left', 0);
    setPx(element, '--drip-chamber-control-width', finite(camera.width, window.innerWidth));
    setPx(element, '--drip-chamber-control-top', currentRailBottom() + CONTROL_GAP);

    let next = computeGeometry(camera, {
      railBottom: currentRailBottom(),
      filterHeight: measureHeight(filter, 32),
      utilityHeight: measureHeight(utility, 42)
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
    element.dataset.chamberPlacement = next.calibration.placement;
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
        const target = detail.readingSurface.closest?.('[data-reader-target]') || null;
        const card = detail.readingSurface.matches?.('.reader-card')
          ? detail.readingSurface
          : target?.querySelector?.('.reader-card') || null;
        if (!target || !card) break;
        readyPublication = Object.freeze({
          token: detail.token,
          postId: detail.postId,
          readingSurface: detail.readingSurface,
          readerTarget: target,
          readerCard: card
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
        releaseReaderPlacement(readyPublication);
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
    releaseReaderPlacement(readyPublication);
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
      delete element.dataset.chamberPlacement;
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
