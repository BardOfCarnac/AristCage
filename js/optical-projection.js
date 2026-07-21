/*==================================================
  OPTIONAL OPTICAL PROJECTION

  Progressive enhancement for the existing feed. The module owns no
  story data or chamber geometry and can be deleted without changing
  the standard renderer.

  Each chamber plane owns one semantic part of every live article.
  The normal DOM articles remain the layout, interaction and
  accessibility source.
==================================================*/

window.OpticalProjection = (() => {
  const STORAGE_KEY = "ncn-optical-projection";
  const ROOT_CLASS = "optical-mode";
  const CLIP_BLEED = 2;
  const LAYOUT_DURATION = 300;
  const DISMISS_DURATION = 190;
  const BODY_DISMISS_DURATION = 180;

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

  /* Far to near. Compensation restores part of each rear plane's apparent
     size around the article centre without cancelling its projected position. */
  const SEMANTIC_PLANES = Object.freeze([
    Object.freeze({ role: "plate",         z: 3.00, compensation: 0.82, delay: 0,   duration: 250, glow: 0.25 }),
    Object.freeze({ role: "frame",         z: 2.96, compensation: 0.72, delay: 20,  duration: 290, glow: 0.48 }),
    Object.freeze({ role: "corners",       z: 2.88, compensation: 0.62, delay: 42,  duration: 270, glow: 0.58 }),
    Object.freeze({ role: "priority",      z: 2.82, compensation: 0.48, delay: 62,  duration: 260, glow: 0.78 }),
    Object.freeze({ role: "detail-labels", z: 2.76, compensation: 0.36, delay: 115, duration: 250, glow: 0.42 }),
    Object.freeze({ role: "detail-values", z: 2.72, compensation: 0.28, delay: 132, duration: 260, glow: 0.52 }),
    Object.freeze({ role: "body",          z: 2.68, compensation: 0.18, delay: 102, duration: 280, glow: 0.56 }),
    Object.freeze({ role: "meta",          z: 2.62, compensation: 0.12, delay: 88,  duration: 240, glow: 0.46 }),
    Object.freeze({ role: "tags",          z: 2.56, compensation: 0.06, delay: 110, duration: 250, glow: 0.62 }),
    Object.freeze({ role: "headline",      z: 2.50, compensation: 0.00, delay: 145, duration: 310, glow: 1.00 })
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
  let currentAperture = null;

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
      planes.set(definition.role, plane);
    });

    return planeSystem;
  }

  function stabiliseProjectionObjects(node) {
    node.querySelectorAll(".part, .priority").forEach(object => {
      object.classList.remove(...SOURCE_LIFECYCLE_CLASSES);
      object.classList.add("present");
      object.style.removeProperty("animation");
      object.style.removeProperty("transition");
    });
  }

  function wrapBodyCopy(node) {
    const body = node.querySelector(".body");
    if (!body || body.querySelector(":scope > .optical-body-copy")) return;

    [...body.childNodes].forEach(child => {
      if (child.nodeType !== Node.TEXT_NODE || !child.textContent.trim()) return;
      const wrapper = document.createElement("span");
      wrapper.className = "optical-body-copy";
      wrapper.textContent = child.textContent;
      child.replaceWith(wrapper);
    });
  }

  function sanitiseVisualClone(node) {
    node.removeAttribute("id");
    node.setAttribute("aria-hidden", "true");
    node.setAttribute("inert", "");

    node.querySelectorAll("[id]").forEach(child => child.removeAttribute("id"));
    node.querySelectorAll("button, input, select, textarea, a").forEach(control => {
      control.setAttribute("tabindex", "-1");
      control.setAttribute("aria-hidden", "true");
    });

    wrapBodyCopy(node);
    stabiliseProjectionObjects(node);
  }

  function setOpticalLifecycle(node, state) {
    node.classList.remove(...OPTICAL_LIFECYCLE_CLASSES);
    node.classList.add(`optical-${state}`);
  }

  function sourceSignature(entry) {
    const priority = entry.querySelector(".priority")?.className || "";
    const headline = entry.querySelector(".headline")?.textContent || "";
    const meta = entry.querySelector(".meta")?.textContent || "";
    const tags = entry.querySelector(".tags")?.textContent || "";
    const body = entry.querySelector(".body")?.textContent || "";
    return [priority, headline, meta, tags, body].join("\u241f");
  }

  function cloneArticle(entry, role, state = "present") {
    const clone = entry.cloneNode(true);

    sanitiseVisualClone(clone);
    clone.classList.add("optical-plane-article");
    clone.dataset.opticalEntryId = entry.dataset.entryId || "";
    clone.dataset.opticalSemanticRole = role;
    clone.style.cssText = "";
    setOpticalLifecycle(clone, state);

    return clone;
  }

  function recordGeometry(record) {
    const rect = record.source?.getBoundingClientRect();
    if (!rect || !currentAperture) return null;

    return {
      top: rect.top - currentAperture.top,
      left: rect.left - currentAperture.left,
      width: rect.width,
      height: rect.height
    };
  }

  function applyGeometryToClone(clone, geometry, animate = false) {
    if (animate) clone.classList.add("optical-layout-transition");

    clone.style.top = `${geometry.top}px`;
    clone.style.left = `${geometry.left}px`;
    clone.style.width = `${geometry.width}px`;
    clone.style.height = `${geometry.height}px`;

    if (animate) {
      window.setTimeout(() => {
        clone.classList.remove("optical-layout-transition");
      }, LAYOUT_DURATION + 40);
    }
  }

  function updateRecordGeometry(record, animate = false) {
    if (
      !record?.source?.isConnected
      || record.pendingCollapse
      || record.pendingExpansion
    ) return;

    const geometry = recordGeometry(record);
    if (!geometry) return;

    record.clones.forEach(clone => {
      applyGeometryToClone(clone, geometry, animate);
    });
  }

  function startResolve(record) {
    clearTimer(record, "lifecycleTimer");

    requestAnimationFrame(() => {
      record.clones.forEach(clone => setOpticalLifecycle(clone, "resolving"));
      const longest = Math.max(...SEMANTIC_PLANES.map(plane => plane.delay + plane.duration));
      record.lifecycleTimer = window.setTimeout(() => {
        record.lifecycleTimer = 0;
        record.clones.forEach(clone => setOpticalLifecycle(clone, "present"));
      }, longest + 40);
    });
  }

  function createRecord(source, index, animate = true) {
    const id = sourceId(source, index);
    const record = {
      id,
      source,
      signature: sourceSignature(source),
      expanded: source.classList.contains("expanded"),
      clones: new Map(),
      lifecycleTimer: 0,
      removalTimer: 0,
      expansionTimer: 0,
      collapseTimer: 0,
      pendingExpansion: false,
      pendingCollapse: false,
      removed: false
    };

    SEMANTIC_PLANES.forEach(definition => {
      const clone = cloneArticle(source, definition.role, animate ? "absent" : "present");
      planes.get(definition.role)?.append(clone);
      record.clones.set(definition.role, clone);
    });

    records.set(id, record);
    updateRecordGeometry(record, false);
    if (animate) startResolve(record);
    return record;
  }

  function replaceRecordClones(record) {
    const replacements = new Map();

    SEMANTIC_PLANES.forEach(definition => {
      const oldClone = record.clones.get(definition.role);
      const clone = cloneArticle(record.source, definition.role, "present");
      oldClone?.replaceWith(clone);
      if (!oldClone) planes.get(definition.role)?.append(clone);
      replacements.set(definition.role, clone);
    });

    record.clones = replacements;
    record.signature = sourceSignature(record.source);
    record.expanded = record.source.classList.contains("expanded");
    record.pendingExpansion = false;
    record.pendingCollapse = false;
    updateRecordGeometry(record, false);
  }

  function cancelRemoval(record) {
    clearTimer(record, "removalTimer");
    record.removed = false;
    record.clones.forEach(clone => setOpticalLifecycle(clone, "present"));
  }

  function dismissRecord(record) {
    if (!record || record.removed) return;
    record.removed = true;
    record.clones.forEach(clone => setOpticalLifecycle(clone, "dismissing"));

    record.removalTimer = window.setTimeout(() => {
      record.removalTimer = 0;
      record.clones.forEach(clone => clone.remove());
      records.delete(record.id);
    }, DISMISS_DURATION + 30);
  }

  function setExpandedClass(record, expanded) {
    record.expanded = expanded;
    record.clones.forEach(clone => clone.classList.toggle("expanded", expanded));
  }

  function bodyClones(record) {
    return [...BODY_ROLES]
      .map(role => record.clones.get(role))
      .filter(Boolean);
  }

  function resolveBody(record) {
    bodyClones(record).forEach(clone => {
      clone.classList.remove("optical-body-dismissing");
      clone.classList.add("optical-body-resolving");
    });

    window.setTimeout(() => {
      bodyClones(record).forEach(clone => clone.classList.remove("optical-body-resolving"));
    }, 420);
  }

  function dismissBody(record) {
    bodyClones(record).forEach(clone => {
      clone.classList.remove("optical-body-resolving");
      clone.classList.add("optical-body-dismissing");
    });
  }

  function handleExpansion(record, expanded) {
    if (!record || record.removed || record.expanded === expanded) return;

    clearTimer(record, "expansionTimer");
    clearTimer(record, "collapseTimer");

    if (expanded) {
      record.pendingCollapse = false;
      record.pendingExpansion = true;
      record.expansionTimer = window.setTimeout(() => {
        record.expansionTimer = 0;
        setExpandedClass(record, true);
        record.pendingExpansion = false;
        updateRecordGeometry(record, true);
        resolveBody(record);
      }, 55);
      return;
    }

    record.pendingExpansion = false;
    record.pendingCollapse = true;
    dismissBody(record);
    record.collapseTimer = window.setTimeout(() => {
      record.collapseTimer = 0;
      setExpandedClass(record, false);
      bodyClones(record).forEach(clone => clone.classList.remove("optical-body-dismissing"));
      record.pendingCollapse = false;
      updateRecordGeometry(record, true);
    }, BODY_DISMISS_DURATION);
  }

  function projectedPoints(camera) {
    const points = camera.nearAperturePoints;
    if (Array.isArray(points) && points.length === 4) return points;

    const aperture = camera.nearAperture;
    return [
      { x: aperture.left, y: aperture.top },
      { x: aperture.right, y: aperture.top },
      { x: aperture.right, y: aperture.bottom },
      { x: aperture.left, y: aperture.bottom }
    ];
  }

  function applyCamera(camera) {
    const root = ensurePlaneSystem();
    const aperture = camera.nearAperture;
    const points = projectedPoints(camera);
    const bounds = {
      left: aperture.left - CLIP_BLEED,
      top: aperture.top - CLIP_BLEED,
      width: aperture.width + CLIP_BLEED * 2,
      height: aperture.height + CLIP_BLEED * 2
    };

    currentAperture = bounds;

    root.style.setProperty("--optical-camera-x", `${camera.centreX}px`);
    root.style.setProperty("--optical-camera-y", `${camera.centreY}px`);
    root.style.setProperty("--optical-aperture-left", `${bounds.left}px`);
    root.style.setProperty("--optical-aperture-top", `${bounds.top}px`);
    root.style.setProperty("--optical-aperture-width", `${bounds.width}px`);
    root.style.setProperty("--optical-aperture-height", `${bounds.height}px`);

    const clipPoints = points.map(point => ({
      x: point.x + (point.x < camera.centreX ? -CLIP_BLEED : CLIP_BLEED),
      y: point.y + (point.y < camera.centreY ? -CLIP_BLEED : CLIP_BLEED)
    }));
    const polygon = clipPoints.map(point => {
      const x = point.x - bounds.left;
      const y = point.y - bounds.top;
      return `${x.toFixed(2)}px ${y.toFixed(2)}px`;
    }).join(", ");
    root.style.setProperty("--optical-aperture-clip", `polygon(${polygon})`);

    SEMANTIC_PLANES.forEach(definition => {
      const plane = planes.get(definition.role);
      if (!plane) return;

      const projectedScale = camera.scaleAt(definition.z);
      const apparentScale = projectedScale
        + (1 - projectedScale) * definition.compensation;
      const compensationScale = apparentScale / projectedScale;

      plane.style.setProperty("--optical-plane-scale", projectedScale.toFixed(6));
      plane.style.setProperty("--optical-apparent-scale", apparentScale.toFixed(6));
      plane.style.setProperty("--optical-compensation-scale", compensationScale.toFixed(6));
    });
  }

  function syncStructure({ animateNew = true } = {}) {
    if (!enabled || !feed) return;

    const camera = cameraSnapshot();
    if (!camera) return;
    applyCamera(camera);

    const sources = sourceEntries();
    const presentIds = new Set();

    sources.forEach((source, index) => {
      const id = sourceId(source, index);
      presentIds.add(id);
      let record = records.get(id);

      if (!record) {
        createRecord(source, index, animateNew);
        return;
      }

      if (record.removed) cancelRemoval(record);

      const sourceChanged = record.source !== source;
      const signature = sourceSignature(source);
      record.source = source;

      if (sourceChanged || signature !== record.signature) {
        replaceRecordClones(record);
      }

      const expanded = source.classList.contains("expanded");
      if (expanded !== record.expanded) handleExpansion(record, expanded);
      else updateRecordGeometry(record, false);
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
    applyCamera(camera);
    records.forEach(record => updateRecordGeometry(record, false));
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

  function directEntryForMutation(record) {
    const target = record.target;
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

      const id = sourceId(entry);
      const record = records.get(id);
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
  }

  function disable(options = {}) {
    enabled = false;
    document.documentElement.classList.remove(ROOT_CLASS);

    if (geometryFrame) cancelAnimationFrame(geometryFrame);
    geometryFrame = 0;
    window.clearTimeout(structureTimer);
    structureTimer = 0;

    records.forEach(record => {
      clearTimer(record, "lifecycleTimer");
      clearTimer(record, "removalTimer");
      clearTimer(record, "expansionTimer");
      clearTimer(record, "collapseTimer");
    });
    records.clear();
    planes.clear();

    planeSystem?.remove();
    planeSystem = null;
    currentAperture = null;

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
      resizeObserver = new ResizeObserver(requestGeometrySync);
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
