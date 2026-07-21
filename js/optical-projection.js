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

  const CHAMBER_CAMERA = Object.freeze({
    near: 2.5,
    centreX: () => window.innerWidth * 0.5,
    centreY: () => window.innerHeight * 0.5
  });

  /* Far to near. Every plane contains the same article list, but only
     the semantic role assigned to that plane remains visible. */
  const SEMANTIC_PLANES = Object.freeze([
    { role: "frame",    z: 5.0 },
    { role: "corners",  z: 4.5 },
    { role: "priority", z: 4.0 },
    { role: "context",  z: 3.5 },
    { role: "headline", z: 3.0 },
    { role: "body",     z: 2.5 }
  ]);

  let feed = null;
  let toggle = null;
  let planeSystem = null;
  let enabled = false;
  let frameRequest = 0;
  let observer = null;
  let resizeObserver = null;

  function sourceEntries() {
    if (!feed) return [];
    return [...feed.querySelectorAll(":scope > .entry:not(.panel)")];
  }

  function ensurePlaneSystem() {
    if (planeSystem?.isConnected) return planeSystem;

    planeSystem = document.createElement("div");
    planeSystem.className = "optical-plane-system";
    planeSystem.setAttribute("aria-hidden", "true");
    document.body.append(planeSystem);
    return planeSystem;
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
  }

  function sourceGeometry(entry) {
    const rect = entry.getBoundingClientRect();

    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height
    };
  }

  /*
    A chamber plane is scaled by near / z around the chamber centre.
    Pre-expanding each clone by the inverse scale makes all semantic
    parts assemble at the exact source article position when viewed
    straight on. A later camera-origin shift can then reveal parallax
    without changing the underlying article layout.
  */
  function compensatedGeometry(geometry, scale) {
    const centreX = CHAMBER_CAMERA.centreX();
    const centreY = CHAMBER_CAMERA.centreY();

    return {
      left: centreX + (geometry.left - centreX) / scale,
      top: centreY + (geometry.top - centreY) / scale,
      width: geometry.width / scale,
      height: geometry.height / scale
    };
  }

  function cloneArticle(entry, geometry) {
    const clone = entry.cloneNode(true);

    sanitiseVisualClone(clone);
    clone.classList.add("optical-plane-article");
    clone.style.cssText = "";
    clone.style.top = `${geometry.top}px`;
    clone.style.left = `${geometry.left}px`;
    clone.style.width = `${geometry.width}px`;
    clone.style.height = `${geometry.height}px`;

    return clone;
  }

  function buildPlane(definition, index, sources) {
    const plane = document.createElement("div");
    const scale = CHAMBER_CAMERA.near / definition.z;

    plane.className = "optical-plane";
    plane.dataset.opticalRole = definition.role;
    plane.dataset.chamberDepth = definition.z.toFixed(2);
    plane.style.setProperty("--optical-plane-scale", scale.toFixed(6));
    plane.style.setProperty("--optical-plane-order", String(index));

    sources.forEach(({ entry, geometry }) => {
      plane.append(cloneArticle(entry, compensatedGeometry(geometry, scale)));
    });

    return plane;
  }

  function syncCameraOrigin() {
    if (!planeSystem) return;

    planeSystem.style.setProperty("--optical-camera-x", `${CHAMBER_CAMERA.centreX()}px`);
    planeSystem.style.setProperty("--optical-camera-y", `${CHAMBER_CAMERA.centreY()}px`);
  }

  function rebuildPlanes() {
    frameRequest = 0;
    if (!enabled || !feed) return;

    const root = ensurePlaneSystem();
    const sources = sourceEntries().map(entry => ({
      entry,
      geometry: sourceGeometry(entry)
    }));
    const fragment = document.createDocumentFragment();

    SEMANTIC_PLANES.forEach((definition, index) => {
      fragment.append(buildPlane(definition, index, sources));
    });

    root.replaceChildren(fragment);
    syncCameraOrigin();
  }

  function requestSync() {
    if (!enabled || frameRequest) return;
    frameRequest = requestAnimationFrame(rebuildPlanes);
  }

  function setToggleState() {
    if (!toggle) return;
    toggle.setAttribute("aria-pressed", enabled ? "true" : "false");
    toggle.textContent = enabled ? "Optics On" : "Optics Off";
  }

  function enable(options = {}) {
    enabled = true;
    document.documentElement.classList.add(ROOT_CLASS);
    ensurePlaneSystem();
    setToggleState();
    if (options.persist !== false) localStorage.setItem(STORAGE_KEY, "on");
    requestSync();
  }

  function disable(options = {}) {
    enabled = false;
    document.documentElement.classList.remove(ROOT_CLASS);

    if (frameRequest) cancelAnimationFrame(frameRequest);
    frameRequest = 0;

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
    window.addEventListener("scroll", requestSync, { passive: true });
    window.addEventListener("resize", requestSync, { passive: true });

    observer = new MutationObserver(requestSync);
    observer.observe(feed, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style"]
    });

    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(requestSync);
      resizeObserver.observe(feed);
    }

    if (localStorage.getItem(STORAGE_KEY) === "on") enable({ persist: false });
    else disable({ persist: false });

    return true;
  }

  function refresh() {
    requestSync();
  }

  function destroy() {
    disable({ persist: false });
    toggle?.removeEventListener("click", toggleMode);
    window.removeEventListener("scroll", requestSync);
    window.removeEventListener("resize", requestSync);
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
    isEnabled: () => enabled
  };
})();
