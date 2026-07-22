/*==================================================
  OPTIONAL OPTICAL PROJECTION

  Semantic article parts are rendered independently on chamber depth
  planes. The normal DOM remains the layout, interaction and
  accessibility source. Remove this file, its stylesheet and the rail
  toggle to restore the standard viewer unchanged.
==================================================*/

window.OpticalProjection = (() => {
  const STORAGE_KEY = "ncn-optical-projection";
  const ROOT_CLASS = "optical-mode";
  const CLIP_BLEED = 2;
  const DISMISS_DURATION = 190;
  const BODY_DISMISS_DURATION = 180;
  const LAYOUT_TRACK_DURATION = 520;

  const SOURCE_LIFECYCLE_CLASSES = Object.freeze([
    "entering",
    "present",
    "leaving",
    "gone",
    "energy-up",
    "energy-down"
  ]);

  const OPTICAL_LIFECYCLE_CLASSES = Object.freeze([
    "optical-absent",
    "optical-resolving",
    "optical-present",
    "optical-dismissing"
  ]);

  /* Far to near. Depth controls the shared article anchor and the chamber
     port. sizeScale controls the actual semantic object, including text,
     borders and glow; it is never cancelled by inverse compensation. */
  const SEMANTIC_PLANES = Object.freeze([
    Object.freeze({ role: "plate",         z: 5.50, sizeScale: 0.68, delay: 0,   duration: 250, glow: 0.25 }),
    Object.freeze({ role: "frame",         z: 5.30, sizeScale: 0.72, delay: 20,  duration: 290, glow: 0.48 }),
    Object.freeze({ role: "corners",       z: 5.00, sizeScale: 0.74, delay: 42,  duration: 270, glow: 0.58 }),
    Object.freeze({ role: "priority",      z: 4.70, sizeScale: 0.78, delay: 62,  duration: 260, glow: 0.78 }),
    Object.freeze({ role: "detail-labels", z: 4.30, sizeScale: 0.82, delay: 115, duration: 250, glow: 0.42 }),
    Object.freeze({ role: "detail-values", z: 4.10, sizeScale: 0.84, delay: 132, duration: 260, glow: 0.52 }),
    Object.freeze({ role: "body",          z: 3.70, sizeScale: 0.87, delay: 102, duration: 280, glow: 0.56 }),
    Object.freeze({ role: "meta",          z: 3.30, sizeScale: 0.91, delay: 88,  duration: 240, glow: 0.46 }),
    Object.freeze({ role: "tags",          z: 2.90, sizeScale: 0.97, delay: 110, duration: 250, glow: 0.62 }),
    Object.freeze({ role: "headline",      z: 2.50, sizeScale: 1.08, delay: 145, duration: 310, glow: 1.00 })
  ]);

  const BODY_ROLES = new Set(["body", "detail-labels", "detail-values"]);

  let feed = null;
  let toggle = null;
  let planeSystem = null;
  let enabled = false;
  let geometryFrame = 0;
  let structureTimer = 0;
  let observer = null;
  let resizeObserver = null;
  let layoutTrackingUntil = 0;

  const planes = new Map();
  const records = new Map();

  function cameraSnapshot() {
    return window.LayeredChamber?.getCameraSnapshot?.()
      || window.NCNChamberCamera?.snapshot?.()
      || null;
  }

  function sourceEntries() {
    if (!feed) return [];
    return [...feed.querySelectorAll(":scope > .entry:not(.panel)")];
  }

  function sourceId(entry, index = 0) {
    return entry.dataset.entryId || `optical-entry-${index}`;
  }

  function clearTimer(record, name) {
    if (!record?.[name]) return;
    window.clearTimeout(record[name]);
    record[name] = 0;
  }

  function ensurePlaneSystem() {
    if (planeSystem?.isConnected) return planeSystem;

    planeSystem = document.createElement("div");
    planeSystem.className = "optical-plane-system";
    planeSystem.setAttribute("aria-hidden", "true");
    document.body.append(planeSystem);

    SEMANTIC_PLANES.forEach((definition, index) => {
      const plane = document.createElement("div");
      plane.className = "optical-plane";
      plane.dataset.opticalRole = definition.role;
      plane.dataset.chamberDepth = definition.z.toFixed(2);
      plane.style.setProperty("--optical-plane-order", String(index));
      plane.style.setProperty("--optical-resolve-delay", `${definition.delay}ms`);
      plane.style.setProperty("--optical-resolve-duration", `${definition.duration}ms`);
      plane.style.setProperty("--optical-resolve-glow", definition.glow.toFixed(2));
      planeSystem.append(plane);
      planes.set(definition.role, {
        definition,
        element: plane,
        bounds: null,
        depthScale: 1
      });
    });

    return planeSystem;
  }

  function stabiliseProjectionObject(node) {
    node.classList.remove(...SOURCE_LIFECYCLE_CLASSES);
    node.classList.add("present");
    node.removeAttribute("id");
    node.removeAttribute("style");
    node.setAttribute("aria-hidden", "true");
    node.querySelectorAll?.("[id]").forEach(child => child.removeAttribute("id"));
  }

  function directBodyText(body) {
    if (!body) return "";
    return [...body.childNodes]
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent)
      .join("")
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
    const rect = range.getBoundingClientRect();
    range.detach?.();
    return rect.width || rect.height ? rect : null;
  }

  function articleRect(entry) {
    return entry.querySelector(".projection-plate")?.getBoundingClientRect()
      || entry.getBoundingClientRect();
  }

  function semanticSource(entry, role) {
    const plate = entry.querySelector(".projection-plate");
    const body = entry.querySelector(".body");
    const detailGrid = entry.querySelector(".mobile-inspector-detail-grid");
    const plateRect = articleRect(entry);

    switch (role) {
      case "plate":
        return plate ? {
          rect: plateRect,
          build: () => {
            const surface = document.createElement("div");
            surface.className = "optical-plate-surface";
            return surface;
          }
        } : null;

      case "frame":
      case "corners": {
        const node = entry.querySelector(`.${role}`);
        if (!node) return null;
        return {
          rect: plateRect,
          build: () => {
            const clone = node.cloneNode(true);
            stabiliseProjectionObject(clone);
            return clone;
          }
        };
      }

      case "priority":
      case "meta":
      case "tags":
      case "headline": {
        const node = entry.querySelector(`.${role}`);
        if (!node) return null;
        return {
          rect: node.getBoundingClientRect(),
          build: () => {
            const clone = node.cloneNode(true);
            stabiliseProjectionObject(clone);
            return clone;
          }
        };
      }

      case "body": {
        const text = directBodyText(body);
        const rect = directBodyTextRect(body);
        if (!text || !rect) return null;
        return {
          rect,
          build: () => {
            const clone = document.createElement("div");
            clone.className = "body optical-body-copy present";
            clone.textContent = text;
            clone.setAttribute("aria-hidden", "true");
            return clone;
          }
        };
      }

      case "detail-labels":
      case "detail-values":
        if (!detailGrid) return null;
        return {
          rect: detailGrid.getBoundingClientRect(),
          build: () => {
            const clone = detailGrid.cloneNode(true);
            clone.classList.add(
              role === "detail-labels"
                ? "optical-detail-labels"
                : "optical-detail-values"
            );
            clone.setAttribute("aria-hidden", "true");
            clone.querySelectorAll("[id]").forEach(child => child.removeAttribute("id"));
            return clone;
          }
        };

      default:
        return null;
    }
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

  function setOpticalLifecycle(node, state) {
    node.classList.remove(...OPTICAL_LIFECYCLE_CLASSES);
    node.classList.add(`optical-${state}`);
  }

  function createSemanticItem(entry, definition, state = "present") {
    const semantic = semanticSource(entry, definition.role);
    if (!semantic || !validRect(semantic.rect)) return null;

    const item = document.createElement("div");
    item.className = "optical-semantic-item";
    item.dataset.opticalRole = definition.role;
    item.dataset.opticalEntryId = entry.dataset.entryId || "";
    item.setAttribute("aria-hidden", "true");
    item.style.setProperty("--optical-item-scale", definition.sizeScale.toFixed(4));
    item.append(semantic.build());
    setOpticalLifecycle(item, state);

    return { element: item, sourceRect: semantic.rect };
  }

  function sourceSignature(entry) {
    const priority = entry.querySelector(".priority")?.className || "";
    const headline = entry.querySelector(".headline")?.textContent || "";
    const meta = entry.querySelector(".meta")?.textContent || "";
    const tags = entry.querySelector(".tags")?.textContent || "";
    const body = entry.querySelector(".body")?.textContent || "";
    return [priority, headline, meta, tags, body].join("\u241f");
  }

  function projectedPortPoints(camera, definition) {
    if (camera.aperturePointsAt) {
      return camera.aperturePointsAt(definition.z);
    }

    const aperture = camera.apertureAt(definition.z);
    return [
      { x: aperture.left, y: aperture.top },
      { x: aperture.right, y: aperture.top },
      { x: aperture.right, y: aperture.bottom },
      { x: aperture.left, y: aperture.bottom }
    ];
  }

  function planeBounds(camera, definition) {
    const points = projectedPortPoints(camera, definition);
    const expandedPoints = points.map(point => ({
      x: point.x + (point.x < camera.centreX ? -CLIP_BLEED : CLIP_BLEED),
      y: point.y + (point.y < camera.centreY ? -CLIP_BLEED : CLIP_BLEED)
    }));
    const xs = expandedPoints.map(point => point.x);
    const ys = expandedPoints.map(point => point.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const right = Math.max(...xs);
    const bottom = Math.max(...ys);

    return {
      left,
      top,
      width: right - left,
      height: bottom - top,
      points: expandedPoints
    };
  }

  function applyPlaneCamera(camera) {
    ensurePlaneSystem();

    SEMANTIC_PLANES.forEach(definition => {
      const planeRecord = planes.get(definition.role);
      if (!planeRecord) return;

      const bounds = planeBounds(camera, definition);
      const polygon = bounds.points.map(point => (
        `${(point.x - bounds.left).toFixed(2)}px ${(point.y - bounds.top).toFixed(2)}px`
      )).join(", ");

      planeRecord.bounds = bounds;
      planeRecord.depthScale = camera.scaleAt(definition.z);

      const plane = planeRecord.element;
      plane.style.left = `${bounds.left}px`;
      plane.style.top = `${bounds.top}px`;
      plane.style.width = `${bounds.width}px`;
      plane.style.height = `${bounds.height}px`;
      plane.style.clipPath = `polygon(${polygon})`;
      plane.style.setProperty("--optical-depth-scale", planeRecord.depthScale.toFixed(6));
    });
  }

  /* A common article anchor is projected at each role's Z. Local offsets are
     then retained inside that article. This yields real depth parallax without
     tearing the headline, rail and frame into unrelated screen coordinates. */
  function semanticGeometry(entry, rect, definition, planeRecord, camera) {
    const anchorRect = articleRect(entry);
    const sourceAnchorX = anchorRect.left + anchorRect.width * 0.5;
    const sourceAnchorY = anchorRect.top + anchorRect.height * 0.5;
    const localCentreX = rect.left + rect.width * 0.5 - sourceAnchorX;
    const localCentreY = rect.top + rect.height * 0.5 - sourceAnchorY;
    const depthScale = planeRecord.depthScale;
    const itemScale = definition.sizeScale;

    const projectedAnchorX = camera.centreX
      + (sourceAnchorX - camera.centreX) * depthScale;
    const projectedAnchorY = camera.centreY
      + (sourceAnchorY - camera.centreY) * depthScale;
    const roleCentreX = projectedAnchorX + localCentreX * itemScale;
    const roleCentreY = projectedAnchorY + localCentreY * itemScale;

    return {
      left: roleCentreX - rect.width * 0.5 - planeRecord.bounds.left,
      top: roleCentreY - rect.height * 0.5 - planeRecord.bounds.top,
      width: rect.width,
      height: rect.height,
      scale: itemScale
    };
  }

  function applyGeometry(itemRecord, geometry) {
    const item = itemRecord.element;
    item.style.left = `${geometry.left}px`;
    item.style.top = `${geometry.top}px`;
    item.style.width = `${geometry.width}px`;
    item.style.height = `${geometry.height}px`;
    item.style.setProperty("--optical-item-scale", geometry.scale.toFixed(4));
  }

  function updateItemGeometry(record, definition, camera) {
    const role = definition.role;
    const planeRecord = planes.get(role);
    if (!planeRecord?.bounds) return;

    const semantic = semanticSource(record.source, role);
    const existing = record.items.get(role);

    if (!semantic || !validRect(semantic.rect)) {
      existing?.element.remove();
      record.items.delete(role);
      return;
    }

    let itemRecord = existing;
    if (!itemRecord) {
      itemRecord = createSemanticItem(record.source, definition, "present");
      if (!itemRecord) return;
      planeRecord.element.append(itemRecord.element);
      record.items.set(role, itemRecord);

      if (BODY_ROLES.has(role)) {
        itemRecord.element.classList.add("optical-body-resolving");
        window.setTimeout(() => {
          itemRecord.element.classList.remove("optical-body-resolving");
        }, 420);
      }
    } else {
      itemRecord.sourceRect = semantic.rect;
    }

    applyGeometry(
      itemRecord,
      semanticGeometry(record.source, semantic.rect, definition, planeRecord, camera)
    );
  }

  function updateRecordGeometry(record, camera) {
    if (!record?.source?.isConnected || record.removed) return;
    SEMANTIC_PLANES.forEach(definition => {
      updateItemGeometry(record, definition, camera);
    });
  }

  function startResolve(record) {
    clearTimer(record, "lifecycleTimer");

    requestAnimationFrame(() => {
      record.items.forEach(item => setOpticalLifecycle(item.element, "resolving"));
      const longest = Math.max(...SEMANTIC_PLANES.map(plane => plane.delay + plane.duration));
      record.lifecycleTimer = window.setTimeout(() => {
        record.lifecycleTimer = 0;
        record.items.forEach(item => setOpticalLifecycle(item.element, "present"));
      }, longest + 40);
    });
  }

  function createRecord(source, index, camera, animate = true) {
    const id = sourceId(source, index);
    const record = {
      id,
      source,
      signature: sourceSignature(source),
      expanded: source.classList.contains("expanded"),
      items: new Map(),
      lifecycleTimer: 0,
      removalTimer: 0,
      collapseTimer: 0,
      removed: false
    };

    SEMANTIC_PLANES.forEach(definition => {
      const created = createSemanticItem(
        source,
        definition,
        animate ? "absent" : "present"
      );
      if (!created) return;
      planes.get(definition.role)?.element.append(created.element);
      record.items.set(definition.role, created);
    });

    records.set(id, record);
    updateRecordGeometry(record, camera);
    if (animate) startResolve(record);
    return record;
  }

  function rebuildRecord(record, camera) {
    record.items.forEach(item => item.element.remove());
    record.items.clear();
    record.signature = sourceSignature(record.source);
    record.expanded = record.source.classList.contains("expanded");

    SEMANTIC_PLANES.forEach(definition => {
      const created = createSemanticItem(record.source, definition, "present");
      if (!created) return;
      planes.get(definition.role)?.element.append(created.element);
      record.items.set(definition.role, created);
    });

    updateRecordGeometry(record, camera);
  }

  function dismissRecord(record) {
    if (!record || record.removed) return;
    record.removed = true;
    record.items.forEach(item => setOpticalLifecycle(item.element, "dismissing"));

    record.removalTimer = window.setTimeout(() => {
      record.removalTimer = 0;
      record.items.forEach(item => item.element.remove());
      records.delete(record.id);
    }, DISMISS_DURATION + 30);
  }

  function dismissBody(record) {
    BODY_ROLES.forEach(role => {
      const item = record.items.get(role);
      if (!item) return;
      item.element.classList.add("optical-body-dismissing");
    });

    clearTimer(record, "collapseTimer");
    record.collapseTimer = window.setTimeout(() => {
      record.collapseTimer = 0;
      BODY_ROLES.forEach(role => {
        record.items.get(role)?.element.remove();
        record.items.delete(role);
      });
    }, BODY_DISMISS_DURATION);
  }

  function handleExpansion(record, expanded) {
    if (!record || record.removed || record.expanded === expanded) return;
    record.expanded = expanded;
    beginLayoutTracking();

    if (!expanded) {
      dismissBody(record);
      return;
    }

    window.setTimeout(() => {
      if (!enabled || !record.source?.isConnected) return;
      const camera = cameraSnapshot();
      if (!camera) return;
      applyPlaneCamera(camera);
      SEMANTIC_PLANES
        .filter(definition => BODY_ROLES.has(definition.role))
        .forEach(definition => updateItemGeometry(record, definition, camera));
    }, 70);
  }

  function beginLayoutTracking(duration = LAYOUT_TRACK_DURATION) {
    layoutTrackingUntil = Math.max(
      layoutTrackingUntil,
      performance.now() + duration
    );
    planeSystem?.classList.add("optical-layout-active");
    requestGeometrySync();
  }

  function syncStructure({ animateNew = true } = {}) {
    if (!enabled || !feed) return;

    const camera = cameraSnapshot();
    if (!camera) return;
    applyPlaneCamera(camera);

    const sources = sourceEntries();
    const presentIds = new Set();

    sources.forEach((source, index) => {
      const id = sourceId(source, index);
      presentIds.add(id);
      let record = records.get(id);

      if (!record) {
        createRecord(source, index, camera, animateNew);
        return;
      }

      if (record.removed) {
        clearTimer(record, "removalTimer");
        record.removed = false;
      }

      const sourceChanged = record.source !== source;
      const signature = sourceSignature(source);
      record.source = source;

      if (sourceChanged || signature !== record.signature) {
        rebuildRecord(record, camera);
      }

      const expanded = source.classList.contains("expanded");
      if (expanded !== record.expanded) handleExpansion(record, expanded);
      updateRecordGeometry(record, camera);
    });

    records.forEach((record, id) => {
      if (!presentIds.has(id)) dismissRecord(record);
    });
  }

  function updateGeometry() {
    geometryFrame = 0;
    if (!enabled) return;

    const camera = cameraSnapshot();
    if (!camera) return;
    applyPlaneCamera(camera);
    records.forEach(record => updateRecordGeometry(record, camera));

    if (performance.now() < layoutTrackingUntil) {
      geometryFrame = requestAnimationFrame(updateGeometry);
    } else {
      planeSystem?.classList.remove("optical-layout-active");
    }
  }

  function requestGeometrySync() {
    if (!enabled || geometryFrame) return;
    geometryFrame = requestAnimationFrame(updateGeometry);
  }

  function requestStructureSync(delay = 70, options = {}) {
    if (!enabled) return;
    window.clearTimeout(structureTimer);
    structureTimer = window.setTimeout(() => {
      structureTimer = 0;
      requestAnimationFrame(() => syncStructure(options));
    }, delay);
  }

  function directEntryForMutation(mutation) {
    const target = mutation.target;
    if (!(target instanceof Element)) return null;
    if (!target.classList.contains("entry") || target.classList.contains("panel")) return null;
    if (target.parentElement !== feed) return null;
    return target;
  }

  function handleFeedMutations(mutations) {
    let structureChanged = false;

    mutations.forEach(mutation => {
      if (mutation.type === "childList" || mutation.type === "characterData") {
        structureChanged = true;
        return;
      }

      if (mutation.type !== "attributes" || mutation.attributeName !== "class") return;
      const entry = directEntryForMutation(mutation);
      if (!entry) return;

      const record = records.get(sourceId(entry));
      if (!record) {
        structureChanged = true;
        return;
      }

      const oldClasses = new Set(String(mutation.oldValue || "").split(/\s+/));
      const wasExpanded = oldClasses.has("expanded");
      const expanded = entry.classList.contains("expanded");
      if (wasExpanded !== expanded) handleExpansion(record, expanded);
    });

    if (structureChanged) requestStructureSync(75);
  }

  function setToggleState() {
    if (!toggle) return;
    toggle.setAttribute("aria-pressed", enabled ? "true" : "false");
    toggle.textContent = enabled ? "Optics On" : "Optics Off";
  }

  function enable(options = {}) {
    if (enabled) return;
    enabled = true;
    document.documentElement.classList.add(ROOT_CLASS);
    ensurePlaneSystem();
    setToggleState();
    if (options.persist !== false) localStorage.setItem(STORAGE_KEY, "on");
    syncStructure({ animateNew: true });
    beginLayoutTracking(360);
  }

  function disable(options = {}) {
    enabled = false;
    document.documentElement.classList.remove(ROOT_CLASS);

    if (geometryFrame) cancelAnimationFrame(geometryFrame);
    geometryFrame = 0;
    window.clearTimeout(structureTimer);
    structureTimer = 0;
    layoutTrackingUntil = 0;

    records.forEach(record => {
      clearTimer(record, "lifecycleTimer");
      clearTimer(record, "removalTimer");
      clearTimer(record, "collapseTimer");
    });
    records.clear();
    planes.clear();

    planeSystem?.remove();
    planeSystem = null;

    setToggleState();
    if (options.persist !== false) localStorage.setItem(STORAGE_KEY, "off");
  }

  function toggleMode() {
    if (enabled) disable();
    else enable();
  }

  function init(options = {}) {
    feed = options.feed || document.querySelector("#feed");
    toggle = options.toggle || document.querySelector("#optical-projection-toggle");
    if (!feed) return false;

    toggle?.addEventListener("click", toggleMode);
    window.addEventListener("scroll", requestGeometrySync, { passive: true });
    window.addEventListener("resize", requestGeometrySync, { passive: true });
    window.addEventListener("ncn:chamber-camera-change", requestGeometrySync);

    observer = new MutationObserver(handleFeedMutations);
    observer.observe(feed, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ["class"]
    });

    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(() => {
        beginLayoutTracking(220);
      });
      resizeObserver.observe(feed);
    }

    if (localStorage.getItem(STORAGE_KEY) === "on") enable({ persist: false });
    else disable({ persist: false });

    return true;
  }

  function refresh() {
    requestStructureSync(0, { animateNew: false });
  }

  function destroy() {
    disable({ persist: false });
    toggle?.removeEventListener("click", toggleMode);
    window.removeEventListener("scroll", requestGeometrySync);
    window.removeEventListener("resize", requestGeometrySync);
    window.removeEventListener("ncn:chamber-camera-change", requestGeometrySync);
    observer?.disconnect();
    resizeObserver?.disconnect();

    feed = null;
    toggle = null;
    observer = null;
    resizeObserver = null;
  }

  function boot() {
    init();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  return {
    init,
    enable,
    disable,
    refresh,
    destroy,
    getCameraSnapshot: cameraSnapshot,
    getPlaneDefinitions: () => SEMANTIC_PLANES.map(plane => ({ ...plane })),
    isEnabled: () => enabled
  };
})();
