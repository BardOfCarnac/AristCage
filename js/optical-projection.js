/*==================================================
  PERMANENT OPTICAL ARTICLE RENDERER

  The established Optical display is treated as a protected visual contract:
  ten semantic objects retain their original depths, scales, resolve timing,
  glow and three-port mapping. The permanent runtime adds only lifecycle
  delivery, batched geometry, viewport pooling and aligned interaction.
==================================================*/
window.OpticalProjection = (() => {
  'use strict';

  const CLIP_BLEED = 2;
  const VIEWPORT_MARGIN = 0.85;
  const MAX_POOL_SIZE = 12;

  const SOURCE_LIFECYCLE = Object.freeze([
    'entering', 'present', 'leaving', 'gone', 'energy-up', 'energy-down'
  ]);

  const OPTICAL_LIFECYCLE = Object.freeze([
    'optical-absent', 'optical-resolving', 'optical-present', 'optical-dismissing'
  ]);

  const SEMANTIC_PLANES = Object.freeze([
    Object.freeze({ role: 'plate',         z: 5.50, sizeScale: 0.68, delay: 0,   duration: 250, glow: 0.25 }),
    Object.freeze({ role: 'frame',         z: 5.30, sizeScale: 0.72, delay: 20,  duration: 290, glow: 0.48 }),
    Object.freeze({ role: 'corners',       z: 5.00, sizeScale: 0.74, delay: 42,  duration: 270, glow: 0.58 }),
    Object.freeze({ role: 'priority',      z: 4.70, sizeScale: 0.78, delay: 62,  duration: 260, glow: 0.78 }),
    Object.freeze({ role: 'detail-labels', z: 4.30, sizeScale: 0.82, delay: 115, duration: 250, glow: 0.42 }),
    Object.freeze({ role: 'detail-values', z: 4.10, sizeScale: 0.84, delay: 132, duration: 260, glow: 0.52 }),
    Object.freeze({ role: 'body',          z: 3.70, sizeScale: 0.87, delay: 102, duration: 280, glow: 0.56 }),
    Object.freeze({ role: 'meta',          z: 3.30, sizeScale: 0.91, delay: 88,  duration: 240, glow: 0.46 }),
    Object.freeze({ role: 'tags',          z: 2.90, sizeScale: 0.97, delay: 110, duration: 250, glow: 0.62 }),
    Object.freeze({ role: 'headline',      z: 2.50, sizeScale: 1.08, delay: 145, duration: 310, glow: 1.00 })
  ]);

  const BODY_ROLES = Object.freeze(['body', 'detail-labels', 'detail-values']);

  const ROLE_SOURCE_SELECTOR = Object.freeze({
    plate: '.frame',
    frame: '.frame',
    corners: '.corners',
    priority: '.priority',
    'detail-labels': '.body',
    'detail-values': '.body',
    body: '.body',
    meta: '.meta',
    tags: '.tags',
    headline: '.headline'
  });

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
    return window.LayeredChamber?.getCameraSnapshot?.()
      || window.NCNChamberCamera?.snapshot?.()
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

  function copyRect(rect) {
    if (!validRect(rect)) return null;
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right ?? rect.left + rect.width,
      bottom: rect.bottom ?? rect.top + rect.height,
      width: rect.width,
      height: rect.height
    };
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

  function directBodyText(body) {
    if (!body) return '';
    return [...body.childNodes]
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent)
      .join('')
      .trim();
  }

  function directBodyTextRect(body) {
    if (!body) return null;
    const nodes = [...body.childNodes]
      .filter(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (!nodes.length) return null;

    const range = document.createRange();
    range.setStartBefore(nodes[0]);
    range.setEndAfter(nodes[nodes.length - 1]);
    const rect = copyRect(range.getBoundingClientRect());
    range.detach?.();
    return rect;
  }

  function sourceSignature(entry) {
    return [
      stableClassName(entry.querySelector('.priority')),
      entry.querySelector('.headline')?.textContent || '',
      entry.querySelector('.meta')?.textContent || '',
      entry.querySelector('.tags')?.textContent || '',
      entry.querySelector('.body')?.textContent || ''
    ].join('\u241f');
  }

  function rectWithinMargin(rect) {
    if (!rect) return false;
    const margin = innerHeight * VIEWPORT_MARGIN;
    return rect.bottom >= -margin && rect.top <= innerHeight + margin;
  }

  function shouldRender(entry) {
    if (!entry?.isConnected || entry.classList.contains('panel')) return false;
    if (getComputedStyle(entry).display === 'none') return false;
    return rectWithinMargin(copyRect(entry.getBoundingClientRect()));
  }

  function ensurePlaneSystem() {
    if (planeSystem?.isConnected) return planeSystem;

    planeSystem = document.createElement('div');
    planeSystem.className = 'optical-plane-system';
    planeSystem.setAttribute('aria-hidden', 'true');
    document.body.append(planeSystem);

    SEMANTIC_PLANES.forEach((definition, index) => {
      const element = document.createElement('div');
      element.className = 'optical-plane';
      element.dataset.opticalRole = definition.role;
      element.dataset.chamberDepth = definition.z.toFixed(2);
      element.style.setProperty('--optical-plane-order', String(index));
      element.style.setProperty('--optical-resolve-delay', `${definition.delay}ms`);
      element.style.setProperty('--optical-resolve-duration', `${definition.duration}ms`);
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
      hitTarget: document.createElement('div'),
      pooled: false
    };

    SEMANTIC_PLANES.forEach(definition => {
      const element = document.createElement('div');
      element.className = 'optical-semantic-item optical-absent';
      element.dataset.opticalRole = definition.role;
      element.style.display = 'none';
      planeRecords.get(definition.role)?.element.append(element);
      record.items.set(definition.role, {
        definition,
        element,
        lifecycle: 'absent',
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
    record.pooled = false;

    record.items.forEach(item => {
      item.element.dataset.opticalEntryId = id;
      item.element.style.display = 'block';
      item.screenBounds = null;
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
    record.pooled = true;

    record.items.forEach(item => {
      item.element.replaceChildren();
      item.element.classList.remove(
        ...OPTICAL_LIFECYCLE,
        'optical-keyboard-focus',
        'optical-hover'
      );
      item.element.classList.add('optical-absent');
      item.element.style.display = 'none';
      item.lifecycle = 'absent';
      item.screenBounds = null;
    });

    record.hitTarget.style.display = 'none';
    record.hitTarget.removeAttribute('data-optical-entry-id');

    if (recordPool.length < MAX_POOL_SIZE) recordPool.push(record);
    else {
      record.items.forEach(item => item.element.remove());
      record.hitTarget.remove();
    }
  }

  function measureNode(node) {
    return node ? copyRect(node.getBoundingClientRect()) : null;
  }

  function measureEntry(entry) {
    const anchor = copyRect(articleRect(entry));
    if (!anchor) return null;

    const frame = entry.querySelector('.frame');
    const corners = entry.querySelector('.corners');
    const priority = entry.querySelector('.priority');
    const body = entry.querySelector('.body');
    const details = entry.querySelector('.mobile-inspector-detail-grid');
    const meta = entry.querySelector('.meta');
    const tags = entry.querySelector('.tags');
    const headline = entry.querySelector('.headline');

    const semantic = {
      plate: { rect: anchor, node: null, kind: 'plate' },
      frame: { rect: anchor, node: frame, kind: 'clone' },
      corners: { rect: anchor, node: corners, kind: 'clone' },
      priority: { rect: measureNode(priority), node: priority, kind: 'clone' },
      'detail-labels': { rect: measureNode(details), node: details, kind: 'detail-labels' },
      'detail-values': { rect: measureNode(details), node: details, kind: 'detail-values' },
      body: { rect: directBodyTextRect(body), node: body, kind: 'body', text: directBodyText(body) },
      meta: { rect: measureNode(meta), node: meta, kind: 'clone' },
      tags: { rect: measureNode(tags), node: tags, kind: 'clone' },
      headline: { rect: measureNode(headline), node: headline, kind: 'clone' }
    };

    return {
      entry,
      anchor,
      signature: sourceSignature(entry),
      semantic
    };
  }

  function buildSemanticNode(definition, measurement) {
    const semantic = measurement.semantic[definition.role];
    if (!semantic) return null;

    if (semantic.kind === 'plate') {
      const surface = document.createElement('div');
      surface.className = 'optical-plate-surface';
      return surface;
    }

    if (semantic.kind === 'body') {
      if (!semantic.text) return null;
      const body = document.createElement('div');
      body.className = 'body optical-body-copy present';
      body.textContent = semantic.text;
      body.setAttribute('aria-hidden', 'true');
      return body;
    }

    if (!semantic.node) return null;
    const clone = cleanClone(semantic.node.cloneNode(true));
    if (semantic.kind === 'detail-labels') clone.classList.add('optical-detail-labels');
    if (semantic.kind === 'detail-values') clone.classList.add('optical-detail-values');
    return clone;
  }

  function rebuildRecordContent(record, measurement) {
    SEMANTIC_PLANES.forEach(definition => {
      const item = record.items.get(definition.role);
      if (!item) return;
      item.element.replaceChildren();
      const child = buildSemanticNode(definition, measurement);
      if (child) item.element.append(child);
    });
    record.signature = measurement.signature;
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
    SEMANTIC_PLANES.forEach(definition => {
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
      record.element.style.setProperty('--optical-depth-scale', record.depthScale.toFixed(6));
    });
  }

  function semanticGeometry(anchorRect, semanticRect, definition, plane, camera) {
    const sourceAnchorX = anchorRect.left + anchorRect.width * 0.5;
    const sourceAnchorY = anchorRect.top + anchorRect.height * 0.5;
    const localCentreX = semanticRect.left + semanticRect.width * 0.5 - sourceAnchorX;
    const localCentreY = semanticRect.top + semanticRect.height * 0.5 - sourceAnchorY;
    const projectedAnchorX = camera.centreX
      + (sourceAnchorX - camera.centreX) * plane.depthScale;
    const projectedAnchorY = camera.centreY
      + (sourceAnchorY - camera.centreY) * plane.depthScale;
    const roleCentreX = projectedAnchorX + localCentreX * definition.sizeScale;
    const roleCentreY = projectedAnchorY + localCentreY * definition.sizeScale;

    return {
      left: roleCentreX - semanticRect.width * 0.5 - plane.bounds.left,
      top: roleCentreY - semanticRect.height * 0.5 - plane.bounds.top,
      width: semanticRect.width,
      height: semanticRect.height,
      centreX: roleCentreX,
      centreY: roleCentreY,
      scale: definition.sizeScale
    };
  }

  function applyItemGeometry(record, measurement, definition, camera) {
    const plane = planeRecords.get(definition.role);
    const item = record.items.get(definition.role);
    const semantic = measurement.semantic[definition.role];
    if (!plane?.bounds || !item) return;

    if (!semantic?.rect || !item.element.childElementCount) {
      item.element.style.display = 'none';
      item.screenBounds = null;
      return;
    }

    const geometry = semanticGeometry(
      measurement.anchor,
      semantic.rect,
      definition,
      plane,
      camera
    );

    item.element.style.display = 'block';
    item.element.style.left = `${geometry.left}px`;
    item.element.style.top = `${geometry.top}px`;
    item.element.style.width = `${geometry.width}px`;
    item.element.style.height = `${geometry.height}px`;
    item.element.style.setProperty('--optical-item-scale', geometry.scale.toFixed(4));

    const scaledWidth = geometry.width * geometry.scale;
    const scaledHeight = geometry.height * geometry.scale;
    item.screenBounds = {
      left: geometry.centreX - scaledWidth * 0.5,
      top: geometry.centreY - scaledHeight * 0.5,
      right: geometry.centreX + scaledWidth * 0.5,
      bottom: geometry.centreY + scaledHeight * 0.5
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
    if (measurement.signature !== record.signature) rebuildRecordContent(record, measurement);
    SEMANTIC_PLANES.forEach(definition => {
      applyItemGeometry(record, measurement, definition, camera);
    });
    applyHitGeometry(record);
    syncRecordLifecycle(record);
    syncFocus(record);
  }

  function nodeLifecycle(node) {
    if (!node) return 'absent';
    if (node.classList.contains('leaving') || node.classList.contains('energy-down')) return 'dismissing';
    if (node.classList.contains('entering') || node.classList.contains('energy-up')) return 'resolving';
    if (node.classList.contains('gone')) return 'absent';
    return 'present';
  }

  function roleLifecycle(entry, role) {
    const selector = ROLE_SOURCE_SELECTOR[role];
    return nodeLifecycle(selector ? entry.querySelector(selector) : null);
  }

  function setItemLifecycle(item, state) {
    if (!item || item.lifecycle === state) return;
    item.lifecycle = state;
    item.element.classList.remove(...OPTICAL_LIFECYCLE);
    item.element.classList.add(`optical-${state}`);
  }

  function syncRoleLifecycle(record, role) {
    if (!record?.source) return;
    setItemLifecycle(record.items.get(role), roleLifecycle(record.source, role));
  }

  function syncRecordLifecycle(record) {
    SEMANTIC_PLANES.forEach(definition => syncRoleLifecycle(record, definition.role));
  }

  function rolesForObject(object) {
    if (object.matches?.('.frame')) return ['plate', 'frame'];
    if (object.matches?.('.corners')) return ['corners'];
    if (object.matches?.('.priority')) return ['priority'];
    if (object.matches?.('.body')) return BODY_ROLES;
    if (object.matches?.('.meta')) return ['meta'];
    if (object.matches?.('.tags')) return ['tags'];
    if (object.matches?.('.headline')) return ['headline'];
    return [];
  }

  function transitionObject(object) {
    const roles = rolesForObject(object);
    const entry = object?.closest?.('.entry:not(.panel)');
    if (!roles.length || !entry) return;

    let record = articleRecords.get(sourceId(entry));
    if (!record && shouldRender(entry)) {
      nearEntries.add(entry);
      record = acquireRecord(entry);
      requestGeometrySync();
    }
    if (record) roles.forEach(role => syncRoleLifecycle(record, role));
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
      if (!measurement || !rectWithinMargin(measurement.anchor)) {
        releaseRecord(record);
        return;
      }
      measured.push({ record, measurement });
    });

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
      if (mutation.type === 'childList' || mutation.type === 'characterData') structureChanged = true;
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
    getPlaneDefinitions: () => SEMANTIC_PLANES.map(plane => ({ ...plane })),
    getActiveRecordCount: () => articleRecords.size,
    getPoolSize: () => recordPool.length,
    isEnabled: () => enabled
  };
})();
