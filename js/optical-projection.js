/*==================================================
  OPTIONAL OPTICAL PROJECTION

  Progressive enhancement for the existing feed. The module owns no
  story data or chamber geometry and can be deleted without changing
  the standard renderer.
==================================================*/

window.OpticalProjection = (() => {
  const STORAGE_KEY = "ncn-optical-projection";
  const ROOT_CLASS = "optical-mode";
  const VISIBLE_RANGE = 3.2;

  /* Every article receives one synchronized visual layer on every plane. */
  const ARTICLE_PLANES = Object.freeze([
    { z: 0,    opacity: 1.00 },
    { z: -90,  opacity: 0.13 },
    { z: -180, opacity: 0.10 },
    { z: -270, opacity: 0.08 },
    { z: -360, opacity: 0.06 },
    { z: -450, opacity: 0.04 }
  ]);

  let feed = null;
  let toggle = null;
  let enabled = false;
  let frameRequest = 0;
  let observer = null;
  let resizeObserver = null;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const mix = (a, b, amount) => Math.round(a + (b - a) * amount);

  function colourPhase(distance) {
    const resolve = clamp(1 - distance / 2.5, 0, 1);
    let red;
    let green;
    let blue;

    if (resolve < 0.52) {
      const amount = resolve / 0.52;
      red = mix(92, 255, amount);
      green = mix(12, 58, amount);
      blue = mix(8, 22, amount);
    } else {
      const amount = (resolve - 0.52) / 0.48;
      red = 255;
      green = mix(58, 248, amount);
      blue = mix(22, 239, amount);
    }

    return {
      main: `rgb(${red}, ${green}, ${blue})`,
      secondary: `rgb(255, ${mix(65, 172, resolve)}, ${mix(28, 105, resolve)})`,
      energy: 0.12 + resolve * 0.82
    };
  }

  function sanitiseVisualClone(layer) {
    layer.removeAttribute("id");
    layer.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
    layer.querySelectorAll("button, input, select, textarea, a").forEach(node => {
      node.setAttribute("tabindex", "-1");
      node.setAttribute("aria-hidden", "true");
    });
  }

  function buildEntryLayers(entry) {
    if (entry.querySelector(":scope > .optical-article-stack")) return;

    const source = entry.querySelector(":scope > .projection-plate");
    if (!source) return;

    source.classList.add("optical-article-source");

    const stack = document.createElement("div");
    stack.className = "optical-article-stack";
    stack.setAttribute("aria-hidden", "true");

    ARTICLE_PLANES.forEach((plane, index) => {
      const layer = source.cloneNode(true);
      layer.classList.remove("optical-article-source");
      layer.classList.add("optical-article-layer");
      layer.dataset.opticalPlane = String(index);
      layer.style.setProperty("--optical-layer-z", `${plane.z}px`);
      layer.style.setProperty("--optical-layer-opacity", String(plane.opacity));
      sanitiseVisualClone(layer);
      stack.append(layer);
    });

    entry.append(stack);
  }

  function buildAllEntryLayers() {
    feed?.querySelectorAll(".entry:not(.panel)").forEach(buildEntryLayers);
  }

  function removeEntryLayers(entry) {
    entry.querySelector(":scope > .optical-article-stack")?.remove();
    entry.querySelector(":scope > .optical-article-source")?.classList.remove("optical-article-source");
  }

  function clearEntry(entry) {
    entry.style.removeProperty("--optical-opacity");
    entry.style.removeProperty("--optical-main");
    entry.style.removeProperty("--optical-secondary");
    entry.style.removeProperty("--optical-energy");
    entry.style.removeProperty("transform");
    entry.style.removeProperty("z-index");
  }

  function clearAllEntries() {
    feed?.querySelectorAll(".entry:not(.panel)").forEach(clearEntry);
  }

  function removeAllEntryLayers() {
    feed?.querySelectorAll(".entry:not(.panel)").forEach(removeEntryLayers);
  }

  function updateEntry(entry, viewportFocus, spacing) {
    buildEntryLayers(entry);

    const rect = entry.getBoundingClientRect();
    const centre = rect.top + rect.height / 2;
    const relative = (centre - viewportFocus) / spacing;
    const distance = Math.abs(relative);

    if (distance > VISIBLE_RANGE) {
      entry.style.setProperty("--optical-opacity", "0");
      return;
    }

    const opacity = 1 - clamp(distance / VISIBLE_RANGE, 0, 1) * 0.72;
    const phase = colourPhase(distance);
    const tilt = clamp(relative * -0.35, -1.4, 1.4);
    const travel = clamp(relative * -7, -20, 20);

    entry.style.setProperty("--optical-opacity", opacity.toFixed(3));
    entry.style.setProperty("--optical-main", phase.main);
    entry.style.setProperty("--optical-secondary", phase.secondary);
    entry.style.setProperty("--optical-energy", phase.energy.toFixed(3));
    entry.style.transform = `translate3d(0, ${travel}px, 0) rotateX(${tilt}deg)`;
    entry.style.zIndex = String(1000 - Math.round(distance * 100));
  }

  function update() {
    frameRequest = 0;
    if (!enabled || !feed) return;

    buildAllEntryLayers();

    const railHeight = document.querySelector(".rail")?.getBoundingClientRect().height || 0;
    const usableHeight = Math.max(window.innerHeight - railHeight, 320);
    const viewportFocus = railHeight + usableHeight * 0.43;
    const firstEntry = feed.querySelector(".entry:not(.panel)");
    const spacing = Math.max((firstEntry?.getBoundingClientRect().height || 104) + 12, 116);

    feed.querySelectorAll(".entry:not(.panel)").forEach(entry => {
      updateEntry(entry, viewportFocus, spacing);
    });
  }

  function requestUpdate() {
    if (!enabled || frameRequest) return;
    frameRequest = requestAnimationFrame(update);
  }

  function setToggleState() {
    if (!toggle) return;
    toggle.setAttribute("aria-pressed", enabled ? "true" : "false");
    toggle.textContent = enabled ? "Optics On" : "Optics Off";
  }

  function enable(options = {}) {
    enabled = true;
    document.documentElement.classList.add(ROOT_CLASS);
    buildAllEntryLayers();
    setToggleState();
    if (options.persist !== false) localStorage.setItem(STORAGE_KEY, "on");
    requestUpdate();
  }

  function disable(options = {}) {
    enabled = false;
    document.documentElement.classList.remove(ROOT_CLASS);
    if (frameRequest) cancelAnimationFrame(frameRequest);
    frameRequest = 0;
    clearAllEntries();
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

    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate, { passive: true });

    observer = new MutationObserver(requestUpdate);
    observer.observe(feed, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });

    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(requestUpdate);
      resizeObserver.observe(feed);
    }

    if (localStorage.getItem(STORAGE_KEY) === "on") enable({ persist: false });
    else disable({ persist: false });

    return true;
  }

  function refresh() {
    requestUpdate();
  }

  function destroy() {
    disable({ persist: false });
    toggle?.removeEventListener("click", toggleMode);
    window.removeEventListener("scroll", requestUpdate);
    window.removeEventListener("resize", requestUpdate);
    observer?.disconnect();
    resizeObserver?.disconnect();
    removeAllEntryLayers();

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
