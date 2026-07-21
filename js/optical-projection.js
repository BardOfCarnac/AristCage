/*==================================================
  OPTIONAL OPTICAL PROJECTION

  Progressive enhancement for the existing feed. The module owns no
  story data or chamber geometry and can be deleted without changing
  the standard renderer.

  Each optical plane contains a complete visual copy of every live
  article. The semantic source articles remain in the normal feed and
  continue to own layout, interaction, expansion and accessibility.
==================================================*/

window.OpticalProjection = (() => {
  const STORAGE_KEY = "ncn-optical-projection";
  const ROOT_CLASS = "optical-mode";

  /* Far to near: every plane receives every article. */
  const ARTICLE_PLANES = Object.freeze([
    {
      z: -420,
      opacity: 0.11,
      structure: "#61100c",
      headline: "#861b12",
      secondary: "#9b2b17"
    },
    {
      z: -320,
      opacity: 0.13,
      structure: "#78130e",
      headline: "#a52216",
      secondary: "#b6341b"
    },
    {
      z: -230,
      opacity: 0.15,
      structure: "#941812",
      headline: "#c72d1d",
      secondary: "#d24322"
    },
    {
      z: -150,
      opacity: 0.18,
      structure: "#b41f17",
      headline: "#e34429",
      secondary: "#eb6335"
    },
    {
      z: -75,
      opacity: 0.22,
      structure: "#d72d20",
      headline: "#ff7652",
      secondary: "#ff9a5f"
    },
    {
      z: 0,
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
    feed.prepend(planeSystem);
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

  function sourceGeometry(entry, feedRect) {
    const rect = entry.getBoundingClientRect();

    return {
      top: rect.top - feedRect.top,
      left: rect.left - feedRect.left,
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
    plane.className = "optical-plane";
    plane.dataset.opticalPlane = String(index);
    plane.style.setProperty("--optical-plane-z", `${definition.z}px`);
    plane.style.setProperty("--optical-plane-opacity", String(definition.opacity));
    plane.style.setProperty("--optical-plane-structure", definition.structure);
    plane.style.setProperty("--optical-plane-headline", definition.headline);
    plane.style.setProperty("--optical-plane-secondary", definition.secondary);

    sources.forEach(({ entry, geometry }) => {
      const clone = cloneArticle(entry, geometry);
      if (clone) plane.append(clone);
    });

    return plane;
  }

  function syncPerspectiveOrigin() {
    if (!enabled || !feed) return;

    const feedRect = feed.getBoundingClientRect();
    const viewportFocus = window.innerHeight * 0.47;
    const localFocus = viewportFocus - feedRect.top;
    feed.style.setProperty("--optical-focus-y", `${localFocus}px`);
  }

  function rebuildPlanes() {
    frameRequest = 0;
    if (!enabled || !feed) return;

    const root = ensurePlaneSystem();
    const entries = sourceEntries();
    const feedRect = feed.getBoundingClientRect();
    const sources = entries.map(entry => ({
      entry,
      geometry: sourceGeometry(entry, feedRect)
    }));
    const fragment = document.createDocumentFragment();

    ARTICLE_PLANES.forEach((definition, index) => {
      fragment.append(buildPlane(definition, index, sources));
    });

    const sourceChildren = [...feed.children].filter(child => child !== root);
    const contentHeight = sourceChildren.reduce((height, child) => {
      const rect = child.getBoundingClientRect();
      return Math.max(height, rect.bottom - feedRect.top);
    }, feedRect.height);

    root.replaceChildren(fragment);
    root.style.height = `${Math.max(0, contentHeight)}px`;
    syncPerspectiveOrigin();
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
    feed?.style.removeProperty("--optical-focus-y");

    setToggleState();
    if (options.persist !== false) localStorage.setItem(STORAGE_KEY, "off");
  }

  function toggleMode() {
    if (enabled) disable();
    else enable();
  }

  function handleFeedMutations(mutations) {
    const sourceChanged = mutations.some(mutation => {
      return !planeSystem || !planeSystem.contains(mutation.target);
    });

    if (sourceChanged) requestSync();
  }

  function init(options = {}) {
    feed = options.feed || document.querySelector("#feed");
    toggle = options.toggle || document.querySelector("#optical-projection-toggle");
    if (!feed) return false;

    toggle?.addEventListener("click", toggleMode);
    window.addEventListener("scroll", syncPerspectiveOrigin, { passive: true });
    window.addEventListener("resize", requestSync, { passive: true });

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
    window.removeEventListener("scroll", syncPerspectiveOrigin);
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
