/*==================================================
  VELOCITY-AWARE CALIBRATION MARKERS
==================================================*/

(() => {
  const viewer = document.querySelector(".viewer");
  if (!viewer) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const sampleInterval = 1750;
  const deadZone = .04;
  const maxStep = .38;

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
  const previousSample = { pitch: 0, roll: 0 };
  const displayed = { pitch: 0, roll: 0 };
  const travel = { pitch: 0, roll: 0 };
  let baseline = null;

  const clamp = (value, min = -1, max = 1) => Math.min(max, Math.max(min, value));

  function measureTravel() {
    travel.roll = Math.max(0, roll.clientWidth / 2 - 8);
    travel.pitch = Math.max(0, pitch.clientHeight / 2 - 8);
  }

  function calculateAxis(axis) {
    const rawDelta = latest[axis] - previousSample[axis];
    const speed = Math.min(1, Math.abs(rawDelta) / .42);
    previousSample[axis] = latest[axis];

    const desiredDelta = latest[axis] - displayed[axis];
    if (Math.abs(desiredDelta) < deadZone) {
      return { value: displayed[axis], speed };
    }

    const limited = clamp(desiredDelta, -maxStep, maxStep);
    const response = .52 + speed * .34;
    return {
      value: clamp(displayed[axis] + limited * response),
      speed
    };
  }

  function moveMarker(marker, axis, result) {
    const duration = reducedMotion.matches ? 0 : Math.round(1220 - result.speed * 470);
    const overshoot = reducedMotion.matches ? 0 : Math.sign(result.value - displayed[axis]) * result.speed * .018;
    const firstTarget = clamp(result.value + overshoot);
    const distance = firstTarget * travel[axis];

    marker.style.transitionDuration = `${duration}ms`;
    marker.style.transitionTimingFunction = result.speed > .55
      ? "cubic-bezier(.18,.72,.24,1.06)"
      : "cubic-bezier(.24,.62,.28,1)";
    marker.style.transform = axis === "pitch"
      ? `translate3d(0, ${distance}px, 0)`
      : `translate3d(${distance}px, 0, 0)`;

    if (overshoot) {
      window.setTimeout(() => {
        marker.style.transitionDuration = "220ms";
        marker.style.transitionTimingFunction = "cubic-bezier(.2,.7,.3,1)";
        const settled = result.value * travel[axis];
        marker.style.transform = axis === "pitch"
          ? `translate3d(0, ${settled}px, 0)`
          : `translate3d(${settled}px, 0, 0)`;
      }, Math.max(0, duration - 180));
    }
  }

  function sampleMarkers() {
    const nextPitch = calculateAxis("pitch");
    const nextRoll = calculateAxis("roll");
    moveMarker(pitchMarker, "pitch", nextPitch);
    moveMarker(rollMarker, "roll", nextRoll);
    displayed.pitch = nextPitch.value;
    displayed.roll = nextRoll.value;
  }

  function setPointerInput(event) {
    if (event.pointerType === "touch") return;
    latest.roll = clamp((event.clientX / Math.max(1, innerWidth)) * 2 - 1);
    latest.pitch = clamp((event.clientY / Math.max(1, innerHeight)) * 2 - 1);
  }

  function setOrientationInput(event) {
    if (event.beta == null || event.gamma == null) return;
    if (!baseline) baseline = { beta: event.beta, gamma: event.gamma };
    latest.pitch = clamp((event.beta - baseline.beta) / 28);
    latest.roll = clamp((event.gamma - baseline.gamma) / 24);
  }

  async function requestOrientationPermission() {
    const requestPermission = window.DeviceOrientationEvent?.requestPermission;
    if (typeof requestPermission !== "function") return;
    try { await requestPermission.call(window.DeviceOrientationEvent); } catch {}
  }

  window.addEventListener("pointermove", setPointerInput, { passive: true });
  window.addEventListener("deviceorientation", setOrientationInput, { passive: true });
  window.addEventListener("resize", measureTravel, { passive: true });
  document.addEventListener("pointerdown", () => void requestOrientationPermission(), { once: true, passive: true });

  measureTravel();
  sampleMarkers();
  window.setInterval(sampleMarkers, sampleInterval);
})();