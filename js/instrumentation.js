/*==================================================
  PROJECTION INSTRUMENTATION
==================================================*/

(() => {
  const viewer = document.querySelector(".viewer");
  if (!viewer) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function scaleMarkup(axis) {
    const values = [-30, -20, -10, 0, 10, 20, 30];
    const ticks = Array.from({ length: 25 }, (_, index) => {
      const position = (index / 24) * 100;
      const major = index % 4 === 0;
      return `<i class="attitude-tick ${major ? "major" : ""}" style="${axis === "pitch" ? "top" : "left"}:${position}%"></i>`;
    }).join("");

    const labels = values.map((value, index) => {
      const position = (index / (values.length - 1)) * 100;
      return `<span class="attitude-label" style="${axis === "pitch" ? "top" : "left"}:${position}%">${value}</span>`;
    }).join("");

    return `<div class="attitude-scale">${ticks}${labels}</div><i class="attitude-marker" aria-hidden="true"></i>`;
  }

  const pitch = document.createElement("div");
  pitch.className = "attitude-instrument attitude-instrument-pitch";
  pitch.setAttribute("aria-hidden", "true");
  pitch.innerHTML = scaleMarkup("pitch");

  const yaw = document.createElement("div");
  yaw.className = "attitude-instrument attitude-instrument-yaw";
  yaw.setAttribute("aria-hidden", "true");
  yaw.innerHTML = scaleMarkup("yaw");

  viewer.append(pitch, yaw);

  const pitchMarker = pitch.querySelector(".attitude-marker");
  const yawMarker = yaw.querySelector(".attitude-marker");

  const target = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };
  let frame = 0;

  function clamp(value, min = -1, max = 1) {
    return Math.min(max, Math.max(min, value));
  }

  function setPointerTarget(event) {
    target.x = clamp((event.clientX / window.innerWidth) * 2 - 1);
    target.y = clamp((event.clientY / window.innerHeight) * 2 - 1);
  }

  function setOrientationTarget(event) {
    if (event.gamma == null || event.beta == null) return;
    target.x = clamp(event.gamma / 30);
    target.y = clamp((event.beta - 45) / 35);
  }

  function renderMarkers() {
    const follow = reducedMotion.matches ? 1 : .16;
    current.x += (target.x - current.x) * follow;
    current.y += (target.y - current.y) * follow;

    yawMarker.style.transform = `translate3d(${current.x * 50}%, 0, 0)`;
    pitchMarker.style.transform = `translate3d(0, ${current.y * 50}%, 0)`;

    const unsettled = Math.abs(target.x - current.x) > .001 || Math.abs(target.y - current.y) > .001;
    frame = unsettled ? requestAnimationFrame(renderMarkers) : 0;
  }

  function requestRender() {
    if (!frame) frame = requestAnimationFrame(renderMarkers);
  }

  window.addEventListener("pointermove", event => {
    if (event.pointerType === "touch") return;
    setPointerTarget(event);
    requestRender();
  }, { passive: true });

  window.addEventListener("deviceorientation", event => {
    setOrientationTarget(event);
    requestRender();
  }, { passive: true });

  /* While a selector is open, the first press outside it dismisses the selector
     and is consumed. This prevents the same press reaching stories underneath. */
  function syncSelectorLock() {
    document.querySelectorAll(".selector-owner").forEach(node => node.classList.remove("selector-owner"));
    const open = document.querySelector(".ncn-select.is-open");
    document.body.classList.toggle("selector-input-locked", Boolean(open));
    open?.closest(".panel-control")?.classList.add("selector-owner");
  }

  new MutationObserver(syncSelectorLock).observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["class"]
  });

  document.addEventListener("pointerdown", event => {
    const open = document.querySelector(".ncn-select.is-open");
    if (!open || open.contains(event.target)) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (typeof closeNCNSelect === "function") {
      void closeNCNSelect(open);
    }
  }, true);

  syncSelectorLock();
})();
