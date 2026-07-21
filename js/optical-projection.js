/*==================================================
  OPTIONAL OPTICAL PROJECTION

  Progressive enhancement for the existing feed. The module owns no
  story data or chamber geometry and can be deleted without changing
  the standard renderer.

  Each optical plane contains a complete visual copy of every live
  article. The semantic source articles remain in the normal feed and
  continue to own layout, interaction, expansion and accessibility.

  Camera rule: article planes use the same world-depth model as the
  layered chamber. No independent CSS perspective or vanishing point
  is created here.
==================================================*/

window.OpticalProjection = (() => {
  const STORAGE_KEY = "ncn-optical-projection";
  const ROOT_CLASS = "optical-mode";

  /* Mirrors the chamber's current near plane and half-cell grid. */
  const CHAMBER_CAMERA = Object.freeze({
    near: 2.5,
    cell: 0.5,
    centreX: () => window.innerWidth * 0.5,
    centreY: () => window.innerHeight * 0.5
  });

  /*
    Far to near. Each depth is a real chamber-world Z value.
    The screen scale for a plane is therefore near / z.
  */
  const ARTICLE_PLANES = Object.freeze([
    {
      z: 7.5,
      opacity: 0.08,
      structure: "#5d0d0a",
      headline: "#7c1510",
      secondary: "#922316"
    },
    {
      z: 6.5,
      opacity: 0.10,
      structure: "#74110d",
      headline: "#991c14",
      secondary: "#ad2d19"
    },
    {
      z: 5.5,
      opacity: 0.12,
      structure: "#8e1711",
      headline: "#bb281b",
      secondary: "#ca3c20"
    },
    {
      z: 4.5,
      opacity: 0.15,
      structure: "#ad2018",
      headline: "#dd3b27",
      secondary: "#e8542d"
    },
    {
      z: 3.5,
      opacity: 0.20,
      structure: "#d42c21",
      headline: "#ff6d4d",
      secondary: "#ff9259"
    },
    {
      z: 2.5,
      opacity: 1,
      structure: "var(--red)",
      headline: "var(--white)",
      secondary: "var(--amber)"
    }
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
    syncScroll();
    return planeSystem;
  }

  function sanitiseVisualClone(node) {
    node.removeAttribute("id");
    node.querySelectorAll("[id]").forEach(child => child.removeAttribute("id"));
    node.querySelectorAll("button, input, select, textarea, a").forEach(control => {
      control.setAttribute("tabindex", "-1");
      control.setAttribute("aria-hidden", "true");
    });
  }

  function documentGeometry(entry) {
    const rect = entry.getBoundingClientRect();

    return {
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
      width: rect.width,
      height: rect.height
    };
  }

  function cloneArticle(entry, geometry) {
    const sourcePlate = entry.querySelector(":scope > .projection-plate");
    if (!sourcePlate) return null;

    const article = document.createElement("div");
    article.className = `optical-plane-article${entry.classList.contains("expanded") ? " expanded" : ""}`;
    article.dataset.entryId = entry.dataset.entryId || "";
    article.setAttribute("inert", "");
    article.style.top = `${geometry.top}px`;
    article.style.left = `${geometry.left}px`;
    article.style.width = `${geometry.width}px`;
    article.style.height = `${geometry.height}px`;

    const plate = sourcePlate.cloneNode(true);
    sanitiseVisualClone(plate);
    article.append(plate);

    return article;
  }

  function buildPlane(definition, index, sources) {
    const plane = document.createElement("div");
    const content = document.createElement("div");
    const scale = CHAMBER_CAMERA.near / definition.z;

    plane.className = "optical-plane";
    plane.dataset.opticalPlane = String(index);
    plane.dataset.chamberDepth = definition.z.toFixed(2);
    plane.style.setProperty("--optical-plane-scale", scale.toFixed(6));
    plane.style.setProperty("--optical-plane-opacity", String(definition.opacity));
    plane.style.setProperty("--optical-plane-structure", definition.structure);
    plane.style.setProperty("--optical-plane-headline", definition.headline);
    plane.style.setProperty("--optical-plane-secondary", definition.secondary);

    content.className = "optical-plane-content";

    sources.forEach(({ entry, geometry }) => {
      const clone = cloneArticle(entry, geometry);
      if (clone) content.append(clone);
    });

    plane.append(content);
    return plane;
  }

  function syncCameraOrigin() {
    if (!planeSystem) return;

    planeSystem.style.setProperty("--optical-camera-x", `${CHAMBER_CAMERA.centreX()}px`);
    planeSystem.style.setProperty("--optical-camera-y", `${CHAMBER_CAMERA.centreY()}px`);
  }

  function syncScroll() {
    if (!planeSystem) return;

    planeSystem.style.setProperty("--optical-scroll-x", `${-window.scrollX}px`);
    planeSystem.style.setProperty("--optical-scroll-y", `${-window.scrollY}px`);
  }

  function rebuildPlanes() {
    frameRequest = 0;
    if (!enabled || !feed) return;

    const root = ensurePlaneSystem();
    const sources = sourceEntries().map(entry => ({
      entry,
      geometry: documentGeometry(entry)
    }));
    const fragment = document.createDocumentFragment();

    ARTICLE_PLANES.forEach((definition, index) => {
      fragment.append(buildPlane(definition, index, sources));
    });

    root.replaceChildren(fragment);
    syncCameraOrigin();
    syncScroll();
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

  function handleFeedMutations() {
    requestSync();
  }

  function handleScroll() {
    if (!enabled) return;
    syncScroll();
  }

  function handleResize() {
    if (!enabled) return;
    syncCameraOrigin();
    requestSync();
  }

  function init(options = {}) {
    feed = options.feed || document.querySelector("#feed");
    toggle = options.toggle || document.querySelector("#optical-projection-toggle");
    if (!feed) return false;

    toggle?.addEventListener("click", toggleMode);
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize, { passive: true });

    observer = new MutationObserver(handleFeedMutations);
    observer.observe(feed, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class"]
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
    window.removeEventListener("scroll", handleScroll);
    window.removeEventListener("resize", handleResize);
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
