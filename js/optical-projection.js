/*==================================================
  PERMANENT OPTICAL ARTICLE RENDERER

  The source DOM remains the layout, interaction and accessibility layer.
  Four pooled semantic groups provide the visible chamber projection. Their
  lifecycle mirrors the canonical source-entry lifecycle rather than running
  a second independent presence engine.
==================================================*/
window.OpticalProjection = (() => {
  'use strict';

  const CLIP_BLEED = 2;
  const VIEWPORT_MARGIN = 0.85;
  const STRUCTURE_SYNC_DELAY = 80;
  const SOURCE_LIFECYCLE = ['entering', 'present', 'leaving', 'gone', 'energy-up', 'energy-down'];

  const PLANES = Object.freeze([
    Object.freeze({ role: 'structure', z: 5.1, sizeScale: 0.94, glow: 0.38 }),
    Object.freeze({ role: 'content', z: 4.0, sizeScale: 0.96, glow: 0.52 }),
    Object.freeze({ role: 'identity', z: 3.2, sizeScale: 0.99, glow: 0.62 }),
    Object.freeze({ role: 'focus', z: 2.55, sizeScale: 1.03, glow: 1 })
  ]);

  let feed = null;
  let planeSystem = null;
  let enabled = false;
  let geometryFrame = 0;
  let structureTimer = 0;
  let observer = null;
  let resizeObserver = null;

  const planeRecords = new Map();
  const articleRecords = new Map();

  function cameraSnapshot() {
    return window.NCNChamberCamera?.snapshot?.()
      || window.LayeredChamber?.getCameraSnapshot?.()
      || null;
  }

  function articleRect(entry) {
    return entry.querySelector('.projection-plate')?.getBoundingClientRect()
      || entry.getBoundingClientRect();
  }

  function validRect(rect) {
    return Boolean(rect && Number.isFinite(rect.left) && Number.isFinite(rect.top) && rect.width > 0 && rect.height > 0);
  }

  function sourceId(entry, index = 0) {
    return entry.dataset.entryId || `optical-entry-${index}`;
  }

  function sourceSignature(entry) {
    return [
      entry.querySelector('.priority')?.className || '',
      entry.querySelector('.headline')?.textContent || '',
      entry.querySelector('.meta')?.textContent || '',
      entry.querySelector('.tags')?.textContent || '',
      entry.querySelector('.body')?.textContent || '',
      entry.classList.contains('expanded') ? 'expanded' : 'collapsed'
    ].join('\u241f');
  }

  function sourceEntries() {
    if (!feed) return [];
    const margin = innerHeight * VIEWPORT_MARGIN;
    return [...feed.querySelectorAll(':scope > .entry:not(.panel)')].filter(entry => {
      if (getComputedStyle(entry).display === 'none') return false;
      const rect = entry.getBoundingClientRect();
      return rect.bottom >= -margin && rect.top <= innerHeight + margin;
    });
  }

  function ensurePlaneSystem() {
    if (planeSystem?.isConnected) return planeSystem;
    planeSystem = document.createElement('div');
    planeSystem.className = 'optical-plane-system';
    planeSystem.setAttribute('aria-hidden', 'true');
    document.body.append(planeSystem);

    PLANES.forEach((definition, index) => {
      const element = document.createElement('div');
      element.className = 'optical-plane';
      element.dataset.opticalRole = definition.role;
      element.dataset.chamberDepth = definition.z.toFixed(2);
      element.style.setProperty('--optical-plane-order', String(index));
      element.style.setProperty('--optical-resolve-glow', definition.glow.toFixed(2));
      planeSystem.append(element);
      planeRecords.set(definition.role, { definition, element, bounds: null, depthScale: 1 });
    });
    return planeSystem;
  }

  function cleanClone(node) {
    node.classList.remove(...SOURCE_LIFECYCLE);
    node.removeAttribute('id');
    node.removeAttribute('style');
    node.setAttribute('aria-hidden', 'true');
    node.querySelectorAll?.('[id]').forEach(child => child.removeAttribute('id'));
    node.querySelectorAll?.('[style]').forEach(child => child.removeAttribute('style'));
    node.querySelectorAll?.(`.${SOURCE_LIFECYCLE.join(',.')}`).forEach(child => child.classList.remove(...SOURCE_LIFECYCLE));
    return node;
  }

  function directBodyText(body) {
    if (!body) return '';
    return [...body.childNodes]
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent)
      .join('')
      .trim();
  }

  function addClone(wrapper, node, sourceRect, anchorRect, className = '') {
    if (!node) return;
    const rect = sourceRect || node.getBoundingClientRect();
    if (!validRect(rect)) return;
    const clone = cleanClone(node.cloneNode(true));
    if (className) clone.classList.add(className);
    clone.style.position = 'absolute';
    clone.style.left = `${rect.left - anchorRect.left}px`;
    clone.style.top = `${rect.top - anchorRect.top}px`;
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    wrapper.append(clone);
  }

  function buildStructure(entry, wrapper, rect) {
    const surface = document.createElement('div');
    surface.className = 'optical-plate-surface';
    surface.style.position = 'absolute';
    surface.style.inset = '0';
    wrapper.append(surface);
    addClone(wrapper, entry.querySelector('.frame'), rect, rect, 'optical-frame-copy');
    addClone(wrapper, entry.querySelector('.corners'), rect, rect, 'optical-corners-copy');
  }

  function buildContent(entry, wrapper, rect) {
    addClone(wrapper, entry.querySelector('.priority'), null, rect, 'optical-priority-copy');
    const body = entry.querySelector('.body');
    const bodyText = directBodyText(body);
    if (body && bodyText) {
      const bodyRect = body.getBoundingClientRect();
      if (validRect(bodyRect)) {
        const copy = document.createElement('div');
        copy.className = 'body optical-body-copy';
        copy.textContent = bodyText;
        copy.setAttribute('aria-hidden', 'true');
        copy.style.position = 'absolute';
        copy.style.left = `${bodyRect.left - rect.left}px`;
        copy.style.top = `${bodyRect.top - rect.top}px`;
        copy.style.width = `${bodyRect.width}px`;
        copy.style.height = `${bodyRect.height}px`;
        wrapper.append(copy);
      }
    }
    addClone(wrapper, entry.querySelector('.mobile-inspector-detail-grid'), null, rect, 'optical-detail-copy');
  }

  function buildIdentity(entry, wrapper, rect) {
    addClone(wrapper, entry.querySelector('.meta'), null, rect, 'optical-meta-copy');
    addClone(wrapper, entry.querySelector('.tags'), null, rect, 'optical-tags-copy');
  }

  function buildFocus(entry, wrapper, rect) {
    addClone(wrapper, entry.querySelector('.headline'), null, rect, 'optical-headline-copy');
  }

  function buildPlaneItem(entry, definition) {
    const rect = articleRect(entry);
    if (!validRect(rect)) return null;
    const element = document.createElement('div');
    element.className = 'optical-semantic-item';
    element.dataset.opticalRole = definition.role;
    element.dataset.opticalEntryId = entry.dataset.entryId || '';
    element.setAttribute('aria-hidden', 'true');
    element.style.width = `${rect.width}px`;
    element.style.height = `${rect.height}px`;
    element.style.setProperty('--optical-item-scale', definition.sizeScale.toFixed(4));

    if (definition.role === 'structure') buildStructure(entry, element, rect);
    if (definition.role === 'content') buildContent(entry, element, rect);
    if (definition.role === 'identity') buildIdentity(entry, element, rect);
    if (definition.role === 'focus') buildFocus(entry, element, rect);

    if (!element.childElementCount) return null;
    return { element, sourceRect: rect };
  }

  function lifecycleState(entry) {
    if (entry.classList.contains('gone')) return 'gone';
    if (entry.classList.contains('leaving') || entry.classList.contains('energy-down')) return 'leaving';
    if (entry.classList.contains('entering') || entry.classList.contains('energy-up')) return 'entering';
    return 'present';
  }

  function mirrorLifecycle(record) {
    const state = lifecycleState(record.source);
    if (record.lifecycle === state) return;
    record.lifecycle = state;
    record.items.forEach(item => {
      item.element.classList.remove(...SOURCE_LIFECYCLE);
      item.element.classList.add(state);
    });
  }

  function planeBounds(camera, definition) {
    const points = camera.aperturePointsAt(definition.z).map(point => ({
      x: point.x + (point.x < camera.centreX ? -CLIP_BLEED : CLIP_BLEED),
      y: point.y + (point.y < camera.centreY ? -CLIP_BLEED : CLIP_BLEED)
    }));
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const right = Math.max(...xs);
    const bottom = Math.max(...ys);
    return { left, top, width: right - left, height: bottom - top, points };
  }

  function applyPlaneCamera(camera) {
    ensurePlaneSystem();
    PLANES.forEach(definition => {
      const record = planeRecords.get(definition.role);
      if (!record) return;
      const bounds = planeBounds(camera, definition);
      const polygon = bounds.points.map(point => `${(point.x - bounds.left).toFixed(2)}px ${(point.y - bounds.top).toFixed(2)}px`).join(', ');
      record.bounds = bounds;
      record.depthScale = camera.scaleAt(definition.z);
      record.element.style.left = `${bounds.left}px`;
      record.element.style.top = `${bounds.top}px`;
      record.element.style.width = `${bounds.width}px`;
      record.element.style.height = `${bounds.height}px`;
      record.element.style.clipPath = `polygon(${polygon})`;
    });
  }

  function updateItemGeometry(record, definition, camera) {
    const plane = planeRecords.get(definition.role);
    const item = record.items.get(definition.role);
    if (!plane?.bounds || !item) return;
    const rect = articleRect(record.source);
    if (!validRect(rect)) return;
    item.sourceRect = rect;
    const sourceCentreX = rect.left + rect.width * 0.5;
    const sourceCentreY = rect.top + rect.height * 0.5;
    const projectedCentreX = camera.centreX + (sourceCentreX - camera.centreX) * plane.depthScale;
    const projectedCentreY = camera.centreY + (sourceCentreY - camera.centreY) * plane.depthScale;
    item.element.style.left = `${projectedCentreX - rect.width * 0.5 - plane.bounds.left}px`;
    item.element.style.top = `${projectedCentreY - rect.height * 0.5 - plane.bounds.top}px`;
    item.element.style.width = `${rect.width}px`;
    item.element.style.height = `${rect.height}px`;
    item.element.style.setProperty('--optical-item-scale', definition.sizeScale.toFixed(4));
  }

  function updateRecordGeometry(record, camera) {
    if (!record.source?.isConnected) return;
    PLANES.forEach(definition => updateItemGeometry(record, definition, camera));
    mirrorLifecycle(record);
  }

  function createRecord(source, index, camera) {
    const id = sourceId(source, index);
    const record = {
      id,
      source,
      signature: sourceSignature(source),
      lifecycle: '',
      items: new Map()
    };
    PLANES.forEach(definition => {
      const item = buildPlaneItem(source, definition);
      if (!item) return;
      planeRecords.get(definition.role)?.element.append(item.element);
      record.items.set(definition.role, item);
    });
    articleRecords.set(id, record);
    mirrorLifecycle(record);
    updateRecordGeometry(record, camera);
    return record;
  }

  function removeRecord(record) {
    record?.items.forEach(item => item.element.remove());
    if (record) articleRecords.delete(record.id);
  }

  function rebuildRecord(record, camera) {
    record.items.forEach(item => item.element.remove());
    record.items.clear();
    record.signature = sourceSignature(record.source);
    PLANES.forEach(definition => {
      const item = buildPlaneItem(record.source, definition);
      if (!item) return;
      planeRecords.get(definition.role)?.element.append(item.element);
      record.items.set(definition.role, item);
    });
    mirrorLifecycle(record);
    updateRecordGeometry(record, camera);
  }

  function syncStructure() {
    if (!enabled || !feed) return;
    const camera = cameraSnapshot();
    if (!camera) return;
    applyPlaneCamera(camera);
    const entries = sourceEntries();
    const activeIds = new Set();

    entries.forEach((source, index) => {
      const id = sourceId(source, index);
      activeIds.add(id);
      let record = articleRecords.get(id);
      if (!record) {
        createRecord(source, index, camera);
        return;
      }
      record.source = source;
      const signature = sourceSignature(source);
      if (signature !== record.signature) rebuildRecord(record, camera);
      else updateRecordGeometry(record, camera);
    });

    articleRecords.forEach(record => {
      if (!activeIds.has(record.id)) removeRecord(record);
    });
  }

  function updateGeometry() {
    geometryFrame = 0;
    if (!enabled) return;
    const camera = cameraSnapshot();
    if (!camera) return;
    applyPlaneCamera(camera);
    articleRecords.forEach(record => updateRecordGeometry(record, camera));
  }

  function requestGeometrySync() {
    if (!enabled || geometryFrame) return;
    geometryFrame = requestAnimationFrame(updateGeometry);
  }

  function requestStructureSync(delay = STRUCTURE_SYNC_DELAY) {
    if (!enabled) return;
    clearTimeout(structureTimer);
    structureTimer = setTimeout(() => {
      structureTimer = 0;
      requestAnimationFrame(syncStructure);
    }, delay);
  }

  function onScroll() {
    requestGeometrySync();
    requestStructureSync(120);
  }

  function onMutations(mutations) {
    let rebuild = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList' || mutation.type === 'characterData') {
        rebuild = true;
        break;
      }
      if (mutation.type === 'attributes') {
        const entry = mutation.target.closest?.('.entry:not(.panel)');
        const record = entry ? articleRecords.get(sourceId(entry)) : null;
        if (record && mutation.attributeName === 'class') mirrorLifecycle(record);
        else rebuild = true;
      }
    }
    if (rebuild) requestStructureSync();
    requestGeometrySync();
  }

  function enable() {
    if (enabled) return;
    enabled = true;
    document.documentElement.classList.add('optical-mode');
    ensurePlaneSystem();
    syncStructure();
  }

  function refresh() {
    requestStructureSync(0);
  }

  function destroy() {
    enabled = false;
    cancelAnimationFrame(geometryFrame);
    clearTimeout(structureTimer);
    geometryFrame = 0;
    structureTimer = 0;
    observer?.disconnect();
    resizeObserver?.disconnect();
    removeEventListener('scroll', onScroll);
    removeEventListener('resize', requestGeometrySync);
    removeEventListener('ncn:chamber-camera-change', requestGeometrySync);
    articleRecords.forEach(removeRecord);
    articleRecords.clear();
    planeRecords.clear();
    planeSystem?.remove();
    planeSystem = null;
  }

  function init(options = {}) {
    feed = options.feed || document.querySelector('#feed');
    if (!feed) return false;
    observer = new MutationObserver(onMutations);
    observer.observe(feed, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden']
    });
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(() => {
        requestGeometrySync();
        requestStructureSync(60);
      });
      resizeObserver.observe(feed);
    }
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', requestGeometrySync, { passive: true });
    addEventListener('ncn:chamber-camera-change', requestGeometrySync);
    enable();
    return true;
  }

  function boot() {
    init();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  return {
    init,
    enable,
    refresh,
    refreshGeometry: requestGeometrySync,
    destroy,
    getCameraSnapshot: cameraSnapshot,
    getPlaneDefinitions: () => PLANES.map(plane => ({ ...plane })),
    getActiveRecordCount: () => articleRecords.size,
    isEnabled: () => enabled
  };
})();
