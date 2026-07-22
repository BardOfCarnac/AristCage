/*==================================================
  OPTIONAL OPTICAL PROJECTION

  The optical feed uses one stable reading plane per article. Article
  parts are never split across intermediate depths; the chamber grid
  supplies the depth cue behind the complete card.
==================================================*/

window.OpticalProjection = (() => {
  const STORAGE_KEY = "ncn-optical-projection";
  const ROOT_CLASS = "optical-mode";
  const PLANE_CLASS = "optical-reading-plane";
  const CARD_CLASS = "optical-reading-card";
  const RESOLVE_DURATION = 320;
  const DISMISS_DURATION = 190;
  const LAYOUT_TRACK_DURATION = 460;

  const SOURCE_LIFECYCLE_CLASSES = Object.freeze([
    "entering",
    "present",
    "leaving",
    "gone",
    "energy-up",
    "energy-down"
  ]);

  let feed = null;
  let toggle = null;
  let plane = null;
  let enabled = false;
  let syncFrame = 0;
  let structureTimer = 0;
  let trackingUntil = 0;
  let observer = null;
  let resizeObserver = null;

  const records = new Map();

  function sourceEntries() {
    if (!feed) return [];
    return [...feed.querySelectorAll(":scope > .entry:not(.panel)")];
  }

  function sourceId(entry, index = 0) {
    return entry.dataset.entryId || `optical-entry-${index}`;
  }

  function sourceSignature(entry) {
    return [
      entry.className,
      entry.querySelector(".priority")?.className || "",
      entry.querySelector(".headline")?.textContent || "",
      entry.querySelector(".meta")?.textContent || "",
      entry.querySelector(".tags")?.textContent || "",
      entry.querySelector(".body")?.textContent || ""
    ].join("\u241f");
  }

  function clearTimer(record, name) {
    if (!record?.[name]) return;
    window.clearTimeout(record[name]);
    record[name] = 0;
  }

  function ensurePlane() {
    if (plane?.isConnected) return plane;
    plane = document.createElement("div");
    plane.className = PLANE_CLASS;
    plane.setAttribute("aria-hidden", "true");
    document.body.append(plane);
    return plane;
  }

  function stabiliseClone(clone) {
    clone.removeAttribute("id");
    clone.removeAttribute("style");
    clone.setAttribute("aria-hidden", "true");
    clone.setAttribute("inert", "");
    clone.classList.remove(...SOURCE_LIFECYCLE_CLASSES);
    clone.classList.add(CARD_CLASS, "optical-present");

    clone.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
    clone.querySelectorAll("button, input, select, textarea, a").forEach(control => {
      control.setAttribute("tabindex", "-1");
      control.setAttribute("aria-hidden", "true");
    });

    clone.querySelectorAll(".part, .priority").forEach(node => {
      node.classList.remove(...SOURCE_LIFECYCLE_CLASSES);
      node.classList.add("present");
      node.style.removeProperty("animation");
      node.style.removeProperty("transition");
      node.style.removeProperty("transform");
    });
  }

  function cloneArticle(source, animate = true) {
    const clone = source.cloneNode(true);
    stabiliseClone(clone);
    clone.dataset.opticalEntryId = source.dataset.entryId || "";

    if (animate) {
      clone.classList.remove("optical-present");
      clone.classList.add("optical-resolving");
      window.setTimeout(() => {
        if (!clone.isConnected) return;
        clone.classList.remove("optical-resolving");
        clone.classList.add("optical-present");
      }, RESOLVE_DURATION + 40);
    }

    return clone;
  }

  function sourceRect(source) {
    const rect = source.getBoundingClientRect();
    if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return null;
    if (rect.width <= 0 || rect.height <= 0) return null;
    return rect;
  }

  function applyGeometry(record) {
    if (!record?.source?.isConnected || !record.clone?.isConnected) return;
    const rect = sourceRect(record.source);
    if (!rect) return;

    const clone = record.clone;
    clone.style.left = `${rect.left}px`;
    clone.style.top = `${rect.top}px`;
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
  }

  function createRecord(source, index, animate = true) {
    const id = sourceId(source, index);
    const clone = cloneArticle(source, animate);
    ensurePlane().append(clone);

    const record = {
      id,
      source,
      clone,
      signature: sourceSignature(source),
      removalTimer: 0,
      removed: false
    };

    records.set(id, record);
    applyGeometry(record);
    return record;
  }

  function replaceClone(record, animate = false) {
    const replacement = cloneArticle(record.source, animate);
    record.clone?.replaceWith(replacement);
    record.clone = replacement;
    record.signature = sourceSignature(record.source);
    record.removed = false;
    applyGeometry(record);
  }

  function cancelRemoval(record) {
    clearTimer(record, "removalTimer");
    record.removed = false;
    record.clone?.classList.remove("optical-dismissing");
    record.clone?.classList.add("optical-present");
  }

  function dismissRecord(record) {
    if (!record || record.removed) return;
    record.removed = true;
    record.clone?.classList.remove("optical-resolving", "optical-present");
    record.clone?.classList.add("optical-dismissing");

    record.removalTimer = window.setTimeout(() => {
      record.removalTimer = 0;
      record.clone?.remove();
      records.delete(record.id);
    }, DISMISS_DURATION + 30);
  }

  function syncStructure({ animateNew = true } = {}) {
    if (!enabled || !feed) return;
    ensurePlane();

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

      const changedSource = record.source !== source;
      record.source = source;
      const signature = sourceSignature(source);

      if (changedSource || signature !== record.signature) {
        replaceClone(record, false);
      } else {
        applyGeometry(record);
      }
    });

    records.forEach((record, id) => {
      if (!presentIds.has(id)) dismissRecord(record);
    });
  }

  function updateGeometry() {
    syncFrame = 0;
    if (!enabled) return;

    records.forEach(applyGeometry);

    if (performance.now() < trackingUntil) {
      syncFrame = requestAnimationFrame(updateGeometry);
    } else {
      plane?.classList.remove("optical-layout-active");
    }
  }

  function requestGeometrySync() {
    if (!enabled || syncFrame) return;
    syncFrame = requestAnimationFrame(updateGeometry);
  }

  function beginLayoutTracking(duration = LAYOUT_TRACK_DURATION) {
    trackingUntil = Math.max(trackingUntil, performance.now() + duration);
    plane?.classList.add("optical-layout-active");
    requestGeometrySync();
  }

  function requestStructureSync(delay = 60, options = {}) {
    if (!enabled) return;
    window.clearTimeout(structureTimer);
    structureTimer = window.setTimeout(() => {
      structureTimer = 0;
      requestAnimationFrame(() => {
        syncStructure(options);
        beginLayoutTracking();
      });
    }, delay);
  }

  function handleFeedMutations(mutations) {
    let structureChanged = false;
    let layoutChanged = false;

    mutations.forEach(mutation => {
      if (mutation.type === "childList" || mutation.type === "characterData") {
        structureChanged = true;
        return;
      }

      if (mutation.type === "attributes" && mutation.attributeName === "class") {
        const target = mutation.target;
        if (
          target instanceof Element
          && target.classList.contains("entry")
          && !target.classList.contains("panel")
          && target.parentElement === feed
        ) {
          structureChanged = true;
          layoutChanged = true;
        }
      }
    });

    if (structureChanged) requestStructureSync(layoutChanged ? 40 : 70, { animateNew: false });
    if (layoutChanged) beginLayoutTracking();
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
    ensurePlane();
    setToggleState();
    if (options.persist !== false) localStorage.setItem(STORAGE_KEY, "on");
    syncStructure({ animateNew: true });
    beginLayoutTracking(RESOLVE_DURATION + 100);
  }

  function disable(options = {}) {
    enabled = false;
    document.documentElement.classList.remove(ROOT_CLASS);

    if (syncFrame) cancelAnimationFrame(syncFrame);
    syncFrame = 0;
    window.clearTimeout(structureTimer);
    structureTimer = 0;
    trackingUntil = 0;

    records.forEach(record => clearTimer(record, "removalTimer"));
    records.clear();
    plane?.remove();
    plane = null;

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
    window.addEventListener("resize", () => {
      requestGeometrySync();
      beginLayoutTracking(180);
    }, { passive: true });
    feed.addEventListener("scroll", requestGeometrySync, { passive: true });

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
        requestGeometrySync();
        beginLayoutTracking(180);
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
    feed?.removeEventListener("scroll", requestGeometrySync);
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
    getCameraSnapshot: () => window.NCNChamberCamera?.snapshot?.() || null,
    getPlaneDefinitions: () => [{ role: "reading", z: 2.5 }],
    isEnabled: () => enabled
  };
})();
