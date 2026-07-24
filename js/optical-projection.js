/*==================================================
  PERMANENT OPTICAL ARTICLE RENDERER

  Four semantic groups provide the visible article. Projection lifecycle is
  delivered directly by ProjectionRenderer. Source DOM remains the layout,
  interaction and accessibility authority.
==================================================*/
window.OpticalProjection = (() => {
  'use strict';

  const CLIP_BLEED = 2;
  const VIEWPORT_MARGIN = 0.85;
  const MAX_POOL_SIZE = 12;
  const SOURCE_LIFECYCLE = ['entering', 'present', 'leaving', 'gone', 'energy-up', 'energy-down'];
  const RENDER_LIFECYCLE = ['entering', 'present', 'leaving', 'gone'];

  const PLANES = Object.freeze([
    Object.freeze({ role: 'structure', z: 5.1, sizeScale: 0.94, glow: 0.38 }),
    Object.freeze({ role: 'content', z: 4.0, sizeScale: 0.96, glow: 0.52 }),
    Object.freeze({ role: 'identity', z: 3.2, sizeScale: 0.99, glow: 0.62 }),
    Object.freeze({ role: 'focus', z: 2.55, sizeScale: 1.03, glow: 1 })
  ]);

  const ROLE_SELECTORS = Object.freeze({
    structure: ['.frame', '.corners', '.priority'],
    content: ['.body'],
    identity: ['.meta', '.tags'],
    focus: ['.headline']
  });

  const PART_KEYS = Object.freeze([
    'frame', 'corners', 'priority', 'body', 'details', 'meta', 'tags', 'headline'
  ]);

  let feed = null;
  let planeSystem = null;
  let hitLayer = null;
  let enabled = false;
  let initialized = false;
  let geometryFrame = 0;
  let structureTimer = 0;
  let observer = null;
  let resizeObserver = null;
  let intersectionObserver = null;
  let unregisterRenderer = null;

  const planeRecords = new Map();
  const articleRecords = new Map();
  const recordPool = [];
  const observedEntries = new Set();
  const nearEntries = new Set();

  function cameraSnapshot() {
    return window.NCNChamberCamera?.snapshot?.()
      || window.LayeredChamber?.getCameraSnapshot?.()
      || null;
  }

  function validRect(rect) {
    return Boolean(
      rect
      && Number.isFinite(rect.left)
      && Number.isFinite(rect.top)
      && rect.width > 0
      && rect.height > 0
    );
  }

  function articleRect(entry) {
    return entry.querySelector('.projection-plate')?.getBoundingClientRect()
      || entry.getBoundingClientRect();
  }

  function sourceId(entry) {
    return entry?.dataset.entryId || '';
  }

  function stableClassName(node) {
    if (!node) return '';
    return [...node.classList]
      .filter(name => !SOURCE_LIFECYCLE.includes(name))
      .sort()
      .join(' ');
  }

  function sourceSignature(entry) {
    return [
      stableClassName(entry.querySelector('.priority')),
      entry.querySelector('.headline')?.textContent || '',
      entry.querySelector('.meta')?.textContent || '',
      entry.querySelector('.tags')?.textContent || '',
      directBodyText(entry.querySelector('.body'))
    ].join('\u241f');
  }

  function directBodyText(body) {
    if (!body) return '';
    return [...body.childNodes]
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent)
      .join('')
      .trim();
  }

  function rectWithinMargin(rect) {
    const margin = innerHeight * VIEWPORT_MARGIN;
    return rect.bottom >= -margin && rect.top <= innerHeight + margin;
  }

  function shouldRender(entry) {
    if (!entry?.isConnected || entry.classList.contains('panel')) return false;
    if (getComputedStyle(entry).display === 'none') return false;
    const rect = entry.getBoundingClientRect();
    return rectWithinMargin(rect);
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
      planeRecords.set(definition.role, {
        definition,
        element,
        bounds: null,
        depthScale: 1
      });
    });

    hitLayer = document.createElement('div');
    hitLayer.className = 'optical-hit-layer';
    planeSystem.append(hitLayer);
    return planeSystem;
  }

  function cleanClone(node) {
    node.classList.remove(...SOURCE_LIFECYCLE);
    node.removeAttribute('id');
    node.removeAttribute('style');
    node.setAttribute('aria-hidden', 'true');
    node.querySelectorAll?.('[id]').forEach(child => child.removeAttribute('id'));
    node.querySelectorAll?.('[style]').forEach(child => child.removeAttribute('style'));
    node.querySelectorAll?.(`.${SOURCE_LIFECYCLE.join(',.')}`)
      .forEach(child => child.classList.remove(...SOURCE_LIFECYCLE));
    return node;
  }

  function createRecordShell() {
    ensurePlaneSystem();
    const record = {
      id: '',
      source: null,
      signature: '',
      items: new Map(),
      refs: {},
      hitTarget: document.createElement('div'),
      pooled: false
    };

    PLANES.forEach(definition => {
      const element = document.createElement('div');
      element.className = 'optical-semantic-item gone';
      element.dataset.opticalRole = definition.role;
      element.style.display = 'none';
      planeRecords.get(definition.role)?.element.append(element);
      record.items.set(definition.role, {
        definition,
        element,
        lifecycle: 'gone',
        screenBounds: null
      });
    });

    record.hitTarget.className = 'optical-hit-target';
    record.hitTarget.setAttribute('aria-hidden', 'true');
    record.hitTarget.style.display = 'none';
    hitLayer.append(record.hitTarget);

    record.hitTarget.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      record.source?.click();
    });

    record.hitTarget.addEventListener('pointerenter', () => setHover(record, true));
    record.hitTarget.addEventListener('pointerleave', () => setHover(record, false));
    return record;
  }

  function acquireRecord(entry) {
    const id = sourceId(entry);
    if (!id) return null;

    let record = articleRecords.get(id);
    if (record) {
      record.source = entry;
      return record;
    }

    record = recordPool.pop() || createRecordShell();
    record.id = id;
    record.source = entry;
    record.signature = '';
    record.refs = {};
    record.pooled = false;

    record.items.forEach(item => {
      item.element.dataset.opticalEntryId = id;
      item.element.style.display = 'block';
    });

    record.hitTarget.dataset.opticalEntryId = id;
    record.hitTarget.style.display = 'block';
    articleRecords.set(id, record);
    syncRecordLifecycle(record);
    syncFocus(record);
    return record;
  }

  function releaseRecord(record) {
    if (!record || record.pooled) return;
    articleRecords.delete(record.id);
    record.id = '';
    record.source = null;
    record.signature = '';
    record.refs = {};
    record.pooled = true;

    record.items.forEach(item => {
      item.element.replaceChildren();
      item.element.classList.remove(...RENDER_LIFECYCLE, 'optical-keyboard-focus', 'optical-hover');
      item.element.classList.add('gone');
      item.element.style.display = 'none';
      item.lifecycle = 'gone';
      item.screenBounds = null;
    });

    record.hitTarget.style.display = 'none';
    record.hitTarget.removeAttribute('data-optical-entry-id');

    if (recordPool.length < MAX_POOL_SIZE) {
      recordPool.push(record);
    } else {
      record.items.forEach(item => item.element.remove());
      record.hitTarget.remove();
    }
  }

  function measureNode(node) {
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return validRect(rect)
      ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
      : null;
  }

  function measureEntry(entry) {
    const rect = articleRect(entry);
    if (!validRect(rect)) return null;

    const nodes = {
      frame: entry.querySelector('.frame'),
      corners: entry.querySelector('.corners'),
      priority: entry.querySelector('.priority'),
      body: entry.querySelector('.body'),
      details: entry.querySelector('.mobile-inspector-detail-grid'),
      meta: entry.querySelector('.meta'),
      tags: entry.querySelector('.tags'),
      headline: entry.querySelector('.headline')
    };

    const parts = {};
    PART_KEYS.forEach(key => {
      parts[key] = {
        node: nodes[key],
        rect: measureNode(nodes[key])
      };
    });

    return {
      entry,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      signature: sourceSignature(entry),
      bodyText: directBodyText(nodes.body),
      parts
    };
  }

  function makeClone(node, className) {
    if (!node) return null;
    const clone = cleanClone(node.cloneNode(true));
    if (className) clone.classList.add(className);
    clone.style.position = 'absolute';
    return clone;
  }

  function rebuildRecordContent(record, measurement) {
    record.items.forEach(item => item.element.replaceChildren());
    record.refs = {};

    const structure = record.items.get('structure')?.element;
    const content = record.items.get('content')?.element;
    const identity = record.items.get('identity')?.element;
    const focus = record.items.get('focus')?.element;

    const plate = document.createElement('div');
    plate.className = 'optical-plate-surface';
    plate.style.position = 'absolute';
    plate.style.inset = '0';
    structure?.append(plate);
    record.refs.plate = plate;

    record.refs.frame = makeClone(measurement.parts.frame.node, 'optical-frame-copy');
    record.refs.corners = makeClone(measurement.parts.corners.node, 'optical-corners-copy');
    record.refs.priority = makeClone(measurement.parts.priority.node, 'optical-priority-copy');
    [record.refs.frame, record.refs.corners, record.refs.priority].filter(Boolean)
      .forEach(node => structure?.append(node));

    if (measurement.bodyText) {
      const body = document.createElement('div');
      body.className = 'body optical-body-copy';
      body.textContent = measurement.bodyText;
      body.setAttribute('aria-hidden', 'true');
      body.style.position = 'absolute';
      content?.append(body);
      record.refs.body = body;
    }

    record.refs.details = makeClone(measurement.parts.details.node, 'optical-detail-copy');
    if (record.refs.details) content?.append(record.refs.details);

    record.refs.meta = makeClone(measurement.parts.meta.node, 'optical-meta-copy');
    record.refs.tags = makeClone(measurement.parts.tags.node, 'optical-tags-copy');
    [record.refs.meta, record.refs.tags].filter(Boolean)
      .forEach(node => identity?.append(node));

    record.refs.headline = makeClone(measurement.parts.headline.node, 'optical-headline-copy');
    if (record.refs.headline) focus?.append(record.refs.headline);

    record.signature = measurement.signature;
  }

  function positionClone(clone, partRect, anchorRect) {
    if (!clone || !partRect) {
      if (clone) clone.style.display = 'none';
      return;
    }

    clone.style.display = 'block';
    clone.style.left = `${partRect.left - anchorRect.left}px`;
    clone.style.top = `${partRect.top - anchorRect.top}px`;
    clone.style.width = `${partRect.width}px`;
    clone.style.height = `${partRect.height}px`;
  }

  function updateChildGeometry(record, measurement) {
    const rect = measurement.rect;
    positionClone(record.refs.frame, measurement.parts.frame.rect, rect);
    positionClone(record.refs.corners, measurement.parts.corners.rect, rect);
    positionClone(record.refs.priority, measurement.parts.priority.rect, rect);
    positionClone(record.refs.body, measurement.parts.body.rect, rect);
    positionClone(record.refs.details, measurement.parts.details.rect, rect);
    positionClone(record.refs.meta, measurement.parts.meta.rect, rect);
    positionClone(record.refs.tags, measurement.parts.tags.rect, rect);
    positionClone(record.refs.headline, measurement.parts.headline.rect, rect);
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
      const polygon = bounds.points
        .map(point => `${(point.x - bounds.left).toFixed(2)}px ${(point.y - bounds.top).toFixed(2)}px`)
        .join(', ');
      record.bounds = bounds;
      record.depthScale = camera.scaleAt(definition.z);
      record.element.style.left = `${bounds.left}px`;
      record.element.style.top = `${bounds.top}px`;
      record.element.style.width = `${bounds.width}px`;
      record.element.style.height = `${bounds.height}px`;
      record.element.style.clipPath = `polygon(${polygon})`;
    });
  }

  function applyItemGeometry(record, measurement, definition, camera) {
    const plane = planeRecords.get(definition.role);
    const item = record.items.get(definition.role);
    if (!plane?.bounds || !item) return;

    const rect = measurement.rect;
    const sourceCentreX = rect.left + rect.width * 0.5;
    const sourceCentreY = rect.top + rect.height * 0.5;
    const projectedCentreX = camera.centreX
      + (sourceCentreX - camera.centreX) * plane.depthScale;
    const projectedCentreY = camera.centreY
      + (sourceCentreY - camera.centreY) * plane.depthScale;

    item.element.style.left = `${projectedCentreX - rect.width * 0.5 - plane.bounds.left}px`;
    item.element.style.top = `${projectedCentreY - rect.height * 0.5 - plane.bounds.top}px`;
    item.element.style.width = `${rect.width}px`;
    item.element.style.height = `${rect.height}px`;
    item.element.style.setProperty('--optical-item-scale', definition.sizeScale.toFixed(4));

    const scaledWidth = rect.width * definition.sizeScale;
    const scaledHeight = rect.height * definition.sizeScale;
    item.screenBounds = {
      left: projectedCentreX - scaledWidth * 0.5,
      top: projectedCentreY - scaledHeight * 0.5,
      right: projectedCentreX + scaledWidth * 0.5,
      bottom: projectedCentreY + scaledHeight * 0.5
    };
  }

  function applyHitGeometry(record) {
    const bounds = [...record.items.values()]
      .map(item => item.screenBounds)
      .filter(Boolean);
    if (!bounds.length) {
      record.hitTarget.style.display = 'none';
      return;
    }

    const padding = 5;
    const left = Math.min(...bounds.map(value => value.left)) - padding;
    const top = Math.min(...bounds.map(value => value.top)) - padding;
    const right = Math.max(...bounds.map(value => value.right)) + padding;
    const bottom = Math.max(...bounds.map(value => value.bottom)) + padding;

    record.hitTarget.style.display = 'block';
    record.hitTarget.style.left = `${left}px`;
    record.hitTarget.style.top = `${top}px`;
    record.hitTarget.style.width = `${right - left}px`;
    record.hitTarget.style.height = `${bottom - top}px`;
  }

  function applyMeasurement(record, measurement, camera) {
    if (measurement.signature !== record.signature) {
      rebuildRecordContent(record, measurement);
    }

    updateChildGeometry(record, measurement);
    PLANES.forEach(definition => applyItemGeometry(record, measurement, definition, camera));
    applyHitGeometry(record);
    syncRecordLifecycle(record);
    syncFocus(record);
  }

  function nodeLifecycle(node) {
    if (!node) return 'gone';
    if (node.classList.contains('leaving') || node.classList.contains('energy-down')) return 'leaving';
    if (node.classList.contains('entering') || node.classList.contains('energy-up')) return 'entering';
    if (node.classList.contains('gone')) return 'gone';
    return 'present';
  }

  function roleLifecycle(entry, role) {
    const states = ROLE_SELECTORS[role]
      .map(selector => entry.querySelector(selector))
      .filter(Boolean)
      .map(nodeLifecycle);

    if (!states.length) return 'gone';
    if (states.includes('leaving')) return 'leaving';
    if (states.includes('entering')) return 'entering';
    if (states.every(state => state === 'gone')) return 'gone';
    return 'present';
  }

  function setItemLifecycle(item, state) {
    if (!item || item.lifecycle === state) return;
    item.lifecycle = state;
    item.element.classList.remove(...RENDER_LIFECYCLE);
    item.element.classList.add(state);
  }

  function syncRoleLifecycle(record, role) {
    if (!record?.source) return;
    setItemLifecycle(record.items.get(role), roleLifecycle(record.source, role));
  }

  function syncRecordLifecycle(record) {
    PLANES.forEach(definition => syncRoleLifecycle(record, definition.role));
  }

  function roleForObject(object) {
    if (object.matches?.('.frame, .corners, .priority')) return 'structure';
    if (object.matches?.('.body')) return 'content';
    if (object.matches?.('.meta, .tags')) return 'identity';
    if (object.matches?.('.headline')) return 'focus';
    return null;
  }

  function transitionObject(object) {
    const role = roleForObject(object);
    const entry = object?.closest?.('.entry:not(.panel)');
    if (!role || !entry) return;

    let record = articleRecords.get(sourceId(entry));
    if (!record && shouldRender(entry)) {
      nearEntries.add(entry);
      record = acquireRecord(entry);
      requestGeometrySync();
    }
    if (record) syncRoleLifecycle(record, role);
  }

  function refreshLifecycle() {
    articleRecords.forEach(syncRecordLifecycle);
  }

  function setHover(record, active) {
    record?.items.forEach(item => item.element.classList.toggle('optical-hover', active));
  }

  function syncFocus(record) {
    const active = Boolean(record?.source?.matches?.(':focus-visible, :focus-within'));
    record?.items.forEach(item => {
      item.element.classList.toggle('optical-keyboard-focus', active);
    });
  }

  function updateGeometry() {
    geometryFrame = 0;
    if (!enabled) return;
    const camera = cameraSnapshot();
    if (!camera || !camera.width || !camera.height) return;

    const measured = [];
    articleRecords.forEach(record => {
      if (!record.source?.isConnected) {
        releaseRecord(record);
        return;
      }
      const measurement = measureEntry(record.source);
      const measuredRect = measurement
        ? {
            ...measurement.rect,
            right: measurement.rect.left + measurement.rect.width,
            bottom: measurement.rect.top + measurement.rect.height
          }
        : null;
      if (!measurement || !rectWithinMargin(measuredRect)) {
        releaseRecord(record);
        return;
      }
      measured.push({ record, measurement });
    });

    /* All layout reads are complete before any projection writes begin. */
    applyPlaneCamera(camera);
    measured.forEach(({ record, measurement }) => {
      applyMeasurement(record, measurement, camera);
    });
  }

  function requestGeometrySync() {
    if (!enabled || geometryFrame) return;
    geometryFrame = requestAnimationFrame(updateGeometry);
  }

  function activateEntry(entry) {
    if (!entry?.isConnected || entry.classList.contains('panel')) return;
    nearEntries.add(entry);
    acquireRecord(entry);
    requestGeometrySync();
  }

  function deactivateEntry(entry) {
    nearEntries.delete(entry);
    const record = articleRecords.get(sourceId(entry));
    if (record) releaseRecord(record);
  }

  function syncEntryAccessibility(entry) {
    if (!entry || entry.classList.contains('panel')) return;
    entry.setAttribute('role', 'button');
    entry.tabIndex = 0;
    entry.setAttribute(
      'aria-expanded',
      entry.classList.contains('expanded') ? 'true' : 'false'
    );
  }

  function observeEntry(entry) {
    if (observedEntries.has(entry) || entry.classList.contains('panel')) return;
    syncEntryAccessibility(entry);
    observedEntries.add(entry);
    intersectionObserver?.observe(entry);
    if (!intersectionObserver && shouldRender(entry)) activateEntry(entry);
  }

  function syncObservedEntries() {
    if (!feed) return;
    const current = new Set(feed.querySelectorAll(':scope > .entry:not(.panel)'));

    current.forEach(observeEntry);

    observedEntries.forEach(entry => {
      if (current.has(entry) && entry.isConnected) return;
      intersectionObserver?.unobserve(entry);
      observedEntries.delete(entry);
      deactivateEntry(entry);
    });

    if (intersectionObserver) {
      current.forEach(entry => {
        if (nearEntries.has(entry)) acquireRecord(entry);
      });
    }
  }

  function syncStructure() {
    structureTimer = 0;
    if (!enabled || !feed) return;
    syncObservedEntries();
    requestGeometrySync();
  }

  function requestStructureSync(delay = 60) {
    if (!enabled) return;
    clearTimeout(structureTimer);
    structureTimer = setTimeout(syncStructure, delay);
  }

  function onMutations(mutations) {
    let structureChanged = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList') structureChanged = true;
      if (mutation.type === 'characterData') structureChanged = true;
      if (mutation.type === 'attributes') {
        const entry = mutation.target.closest?.('.entry:not(.panel)');
        const record = entry ? articleRecords.get(sourceId(entry)) : null;
        if (entry && mutation.attributeName === 'class') {
          syncEntryAccessibility(entry);
          if (record) syncRecordLifecycle(record);
        }
      }
    }
    if (structureChanged) requestStructureSync();
    requestGeometrySync();
  }

  function onFocusChange(event) {
    const entry = event.target.closest?.('.entry:not(.panel)');
    if (!entry) return;
    const record = articleRecords.get(sourceId(entry));
    if (record) requestAnimationFrame(() => syncFocus(record));
  }

  function onKeyDown(event) {
    const entry = event.target.closest?.('.entry:not(.panel)');
    if (!entry || event.target !== entry) return;
    if (!['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    entry.click();
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

  function connectRendererBridge() {
    if (unregisterRenderer || !window.NCNProjectionRenderer?.register) return;
    unregisterRenderer = window.NCNProjectionRenderer.register({
      transitionObject,
      refreshLifecycle
    });
  }

  function init(options = {}) {
    if (initialized) return true;
    feed = options.feed || document.querySelector('#feed');
    if (!feed) return false;
    initialized = true;

    intersectionObserver = 'IntersectionObserver' in window
      ? new IntersectionObserver(entries => {
          entries.forEach(result => {
            if (result.isIntersecting) activateEntry(result.target);
            else deactivateEntry(result.target);
          });
        }, { root: null, rootMargin: '85% 0px 85% 0px', threshold: 0 })
      : null;

    observer = new MutationObserver(onMutations);
    observer.observe(feed, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden']
    });

    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(requestGeometrySync);
      resizeObserver.observe(feed);
    }

    addEventListener('scroll', requestGeometrySync, { passive: true });
    addEventListener('resize', requestGeometrySync, { passive: true });
    addEventListener('ncn:chamber-camera-change', requestGeometrySync);
    feed.addEventListener('focusin', onFocusChange);
    feed.addEventListener('focusout', onFocusChange);
    feed.addEventListener('keydown', onKeyDown);

    document.fonts?.ready?.then(() => requestGeometrySync());
    connectRendererBridge();
    enable();
    return true;
  }

  function destroy() {
    enabled = false;
    initialized = false;
    cancelAnimationFrame(geometryFrame);
    clearTimeout(structureTimer);
    geometryFrame = 0;
    structureTimer = 0;
    observer?.disconnect();
    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    removeEventListener('scroll', requestGeometrySync);
    removeEventListener('resize', requestGeometrySync);
    removeEventListener('ncn:chamber-camera-change', requestGeometrySync);
    feed?.removeEventListener('focusin', onFocusChange);
    feed?.removeEventListener('focusout', onFocusChange);
    feed?.removeEventListener('keydown', onKeyDown);
    articleRecords.forEach(releaseRecord);
    articleRecords.clear();
    recordPool.splice(0).forEach(record => {
      record.items.forEach(item => item.element.remove());
      record.hitTarget.remove();
    });
    observedEntries.clear();
    nearEntries.clear();
    planeRecords.clear();
    planeSystem?.remove();
    planeSystem = null;
    hitLayer = null;
    unregisterRenderer?.();
    unregisterRenderer = null;
    feed = null;
  }

  function boot() {
    init();
  }

  connectRendererBridge();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  return {
    init,
    enable,
    refresh,
    refreshGeometry: requestGeometrySync,
    refreshLifecycle,
    transitionObject,
    destroy,
    connectRendererBridge,
    getCameraSnapshot: cameraSnapshot,
    getPlaneDefinitions: () => PLANES.map(plane => ({ ...plane })),
    getActiveRecordCount: () => articleRecords.size,
    getPoolSize: () => recordPool.length,
    isEnabled: () => enabled
  };
})();
