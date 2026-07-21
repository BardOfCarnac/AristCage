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

  /* Far to near. Every pane contains the same article list, but only
     the semantic role assigned to that pane remains visible. The
     complete article spans one chamber cell. */
  const SEMANTIC_PLANES = Object.freeze([
    Object.freeze({ role: "frame",    z: 3.0 }),
    Object.freeze({ role: "corners",  z: 2.9 }),
    Object.freeze({ role: "priority", z: 2.8 }),
    Object.freeze({ role: "context",  z: 2.7 }),
    Object.freeze({ role: "headline", z: 2.6 }),
    Object.freeze({ role: "body",     z: 2.5 })
  ]);

  let feed = null;
  let toggle = null;
  let planeSystem = null;
  let enabled = false;
  let frameRequest = 0;
  let observer = null;
  let resizeObserver = null;

  function cameraSnapshot() {
    return window.LayeredChamber?.getCameraSnapshot?.()
      || window.NCNChamberCamera?.snapshot?.()
      || null;
  }

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

  function paneLocalGeometry(geometry, aperture) {
    return {
      top: geometry.top - aperture.top,
      left: geometry.left - aperture.left,
      width: geometry.width,
      height: geometry.height
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

  function buildPlane(definition, index, sources, camera) {
    const plane = document.createElement("div");
    const scale = camera.scaleAt(definition.z);
    const aperture = camera.nearAperture;

    plane.className = "optical-plane";
    plane.dataset.opticalRole = definition.role;
    plane.dataset.chamberDepth = definition.z.toFixed(2);
    plane.style.setProperty("--optical-plane-scale", scale.toFixed(6));
    plane.style.setProperty("--optical-plane-order", String(index));
    plane.style.setProperty("--optical-pane-left", `${aperture.left}px`);
    plane.style.setProperty("--optical-pane-top", `${aperture.top}px`);
    plane.style.setProperty("--optical-pane-width", `${aperture.width}px`);
    plane.style.setProperty("--optical-pane-height", `${aperture.height}px`);

    sources.forEach(({ entry, geometry }) => {
      plane.append(cloneArticle(
        entry,
        paneLocalGeometry(geometry, aperture)
      ));
    });

    return plane;
  }

  function rebuildPlanes() {
    frameRequest = 0;
    if (!enabled || !feed) return;

    const camera = cameraSnapshot();
    if (!camera) return;

    const root = ensurePlaneSystem();
    const sources = sourceEntries().map(entry => ({
      entry,
      geometry: sourceGeometry(entry)
    }));
    const fragment = document.createDocumentFragment();

    SEMANTIC_PLANES.forEach((definition, index) => {
      fragment.append(buildPlane(definition, index, sources, camera));
    });

    root.replaceChildren(fragment);
    root.style.setProperty("--optical-camera-x", `${camera.centreX}px`);
    root.style.setProperty("--optical-camera-y", `${camera.centreY}px`);
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
    window.addEventListener("ncn:chamber-camera-change", requestSync);

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
    window.removeEventListener("ncn:chamber-camera-change", requestSync);
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
