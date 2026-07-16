/*==================================================
  BUFFERED CALIBRATION MARKERS
==================================================*/

(() => {
  const viewer = document.querySelector(".viewer");
  if (!viewer) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const sampleInterval = 1400;
  const deadZone = .045;
  const maxStep = .34;
  const blend = .72;

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

  const roll = document.createElement("div");
  roll.className = "attitude-instrument attitude-instrument-yaw";
  roll.setAttribute("aria-hidden", "true");
  roll.innerHTML = scaleMarkup("roll");

  viewer.append(pitch, roll);

  const pitchMarker = pitch.querySelector(".attitude-marker");
  const rollMarker = roll.querySelector(".attitude-marker");
  const latest = { pitch: 0, roll: 0 };
  const displayed = { pitch: 0, roll: 0 };
  const travel = { pitch: 0, roll: 0 };
  let baseline = null;

  function clamp(value, min = -1, max = 1) {
    return Math.min(max, Math.max(min, value));
  }

  function measureTravel() {
    travel.roll = Math.max(0, roll.clientWidth / 2 - 8);
    travel.pitch = Math.max(0, pitch.clientHeight / 2 - 8);
  }

  function inhibited(previous, raw) {
    const difference = raw - previous;
    if (Math.abs(difference) < deadZone) return previous;

    const limited = previous + clamp(difference, -maxStep, maxStep);
    return previous * (1 - blend) + limited * blend;
  }

  function sampleMarkers() {
    displayed.pitch = inhibited(displayed.pitch, latest.pitch);
    displayed.roll = inhibited(displayed.roll, latest.roll);

    const duration = reducedMotion.matches ? 0 : 850;
    pitchMarker.style.transitionDuration = `${duration}ms`;
    rollMarker.style.transitionDuration = `${duration}ms`;
    pitchMarker.style.transform = `translate3d(0, ${displayed.pitch * travel.pitch}px, 0)`;
    rollMarker.style.transform = `translate3d(${displayed.roll * travel.roll}px, 0, 0)`;
  }

  function setPointerInput(event) {
    if (event.pointerType === "touch") return;
    latest.roll = clamp((event.clientX / Math.max(1, innerWidth)) * 2 - 1);
    latest.pitch = clamp((event.clientY / Math.max(1, innerHeight)) * 2 - 1);
  }

  function setOrientationInput(event) {
    if (event.beta == null || event.gamma == null) return;

    if (!baseline) {
      baseline = { beta: event.beta, gamma: event.gamma };
    }

    /* beta is front/back pitch; gamma is left/right roll. Alpha/yaw is ignored. */
    latest.pitch = clamp((event.beta - baseline.beta) / 28);
    latest.roll = clamp((event.gamma - baseline.gamma) / 24);
  }

  async function requestOrientationPermission() {
    const requestPermission = window.DeviceOrientationEvent?.requestPermission;
    if (typeof requestPermission !== "function") return;

    try {
      await requestPermission.call(window.DeviceOrientationEvent);
    } catch {
      /* Desktop pointer input and non-permission platforms continue normally. */
    }
  }

  window.addEventListener("pointermove", setPointerInput, { passive: true });
  window.addEventListener("deviceorientation", setOrientationInput, { passive: true });
  window.addEventListener("resize", measureTravel, { passive: true });
  document.addEventListener("pointerdown", () => void requestOrientationPermission(), { once: true, passive: true });

  measureTravel();
  sampleMarkers();
  window.setInterval(sampleMarkers, sampleInterval);
})();
