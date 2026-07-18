/*==================================================
  OPTIONAL OPTICAL PROJECTION

  Progressive enhancement for the existing feed. The module owns no
  story data and can be deleted without changing the standard renderer.
==================================================*/

window.OpticalProjection = (() => {
  const STORAGE_KEY = "ncn-optical-projection";
  const ROOT_CLASS = "optical-mode";
  const VISIBLE_RANGE = 2.8;

  const paths = {
    plate:    { x: r => -4 * r + 1.5 * r * r,  y: r =>  3 * r - 1.2 * r * r, z: -8,  rx: r => -0.12 * r, ry: r =>  0.3 * r },
    frame:    { x: r =>  8 * r - 2.8 * r * r,  y: r => -4 * r + 1.5 * r * r, z:  0,  rx: r => -0.25 * r, ry: r => -0.7 * r },
    corners:  { x: r =>  6 * r - 2.1 * r * r,  y: r => -3 * r + 1.2 * r * r, z:  5,  rx: r => -0.2 * r,  ry: r => -0.5 * r },
    priority: { x: r => -6 * r + 1.4 * r * r,  y: r =>  6 * r - 2.2 * r * r, z:  9,  rx: r =>  0.2 * r,  ry: r =>  0.9 * r },
    tags:     { x: r => 11 * r + 1.8 * r * r,  y: r =>  8 * r - 3.1 * r * r, z: 15,  rx: r => -0.4 * r,  ry: r =>  1.15 * r },
    headline: { x: r => -15 * r - 2.2 * r * r, y: r => -10 * r + 3.7 * r * r, z: 26,  rx: r => -0.6 * r,  ry: r => -1.4 * r }
  };

  let feed = null;
  let chamber = null;
  let toggle = null;
  let enabled = false;
  let frameRequest = 0;
  let observer = null;
  let resizeObserver = null;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const mix = (a, b, amount) => Math.round(a + (b - a) * amount);

  function chamberMarkup() {
    return `
      <div class="optical-chamber" aria-hidden="true">
        <div class="optical-chamber__rear"></div>
        <div class="optical-chamber__wall optical-chamber__wall--left"></div>
        <div class="optical-chamber__wall optical-chamber__wall--right"></div>
        <div class="optical-chamber__floor"></div>
        <div class="optical-chamber__beam"></div>
        <div class="optical-chamber__projector"></div>
        <div class="optical-chamber__focus"></div>
      </div>`;
  }

  function createChamber() {
    if (chamber) return chamber;
    document.body.insertAdjacentHTML("afterbegin", chamberMarkup());
    chamber = document.querySelector(".optical-chamber");
    return chamber;
  }

  function colourPhase(distance) {
    const resolve = clamp(1 - distance / 2.25, 0, 1);
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

  function incomingDepth(relative) {
    if (relative >= 0) return 0;
    return Math.pow(clamp(-relative / 2.25, 0, 1), 2.35);
  }

  function clearEntry(entry) {
    entry.style.removeProperty("--optical-opacity");
    entry.style.removeProperty("--optical-main");
    entry.style.removeProperty("--optical-secondary");
    entry.style.removeProperty("--optical-energy");
    entry.style.removeProperty("transform");
    entry.style.removeProperty("z-index");

    entry.querySelector(".projection-plate")?.style.removeProperty("transform");
    Object.keys(paths).forEach(name => {
      entry.querySelector(`.${name}`)?.style.removeProperty("transform");
    });
  }

  function clearAllEntries() {
    feed?.querySelectorAll(".entry:not(.panel)").forEach(clearEntry);
  }

  function updateEntry(entry, viewportFocus, spacing) {
    if (entry.classList.contains("expanded")) {
      clearEntry(entry);
      return;
    }

    const rect = entry.getBoundingClientRect();
    const centre = rect.top + rect.height / 2;
    const relative = (centre - viewportFocus) / spacing;
    const distance = Math.abs(relative);

    if (distance > VISIBLE_RANGE) {
      entry.style.setProperty("--optical-opacity", "0");
      return;
    }

    const incoming = incomingDepth(relative);
    const depth = Math.pow(distance, 1.18) * 115 + incoming * 980;
    const scale = 1 - incoming * 0.22;
    const opacity = 1 - clamp(distance / VISIBLE_RANGE, 0, 1) * 0.7;
    const phase = colourPhase(distance);

    entry.style.setProperty("--optical-opacity", opacity.toFixed(3));
    entry.style.setProperty("--optical-main", phase.main);
    entry.style.setProperty("--optical-secondary", phase.secondary);
    entry.style.setProperty("--optical-energy", phase.energy.toFixed(3));
    entry.style.transform = `translate3d(${incoming * -24}px, 0, ${-depth}px) rotateX(${clamp(relative * -0.72, -3.2, 3.2)}deg) scale(${scale})`;
    entry.style.zIndex = String(1000 - Math.round(distance * 100));

    const plate = entry.querySelector(".projection-plate");
    if (plate) {
      plate.style.transform = `translate3d(${-4 * relative}px, ${3 * relative}px, -8px)`;
    }

    Object.entries(paths).forEach(([name, path], index) => {
      const part = entry.querySelector(`.${name}`);
      if (!part) return;

      const deepFan = incoming * (index - 2.5) * 24;
      const deepLift = incoming * (index % 2 ? 16 : -16);
      const x = path.x(relative) + deepFan;
      const y = path.y(relative) + deepLift;
      const z = path.z - incoming * (index * 38 + 28);
      const rx = path.rx(relative) + incoming * (index - 2) * 1.8;
      const ry = path.ry(relative) + incoming * (index - 2.5) * 3.2;

      part.style.transform = `translate3d(${x}px, ${y}px, ${z}px) rotateX(${rx}deg) rotateY(${ry}deg)`;
    });
  }

  function update() {
    frameRequest = 0;
    if (!enabled || !feed) return;

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
    createChamber();
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

    createChamber();
    toggle?.addEventListener("click", toggleMode);

    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate, { passive: true });

    observer = new MutationObserver(requestUpdate);
    observer.observe(feed, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

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
    chamber?.remove();

    feed = null;
    chamber = null;
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
