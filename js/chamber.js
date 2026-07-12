/*==================================================
  SHALLOW CHAMBER VIEW CONTROL

  The chamber is independent of page scroll. Desktop pointer
  movement and mobile device orientation adjust only the view
  angle of the fixed cavity behind the projected feed.
==================================================*/

(() => {
  const chamber = document.querySelector(".chamber");
  if (!chamber) return;

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarsePointerQuery = window.matchMedia("(hover: none) and (pointer: coarse)");
  const MAX_VIEW = 4;
  const EASING = 0.14;

  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let animationFrame = 0;
  let orientationStarted = false;
  let orientationBaseline = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function setTarget(x, y) {
    if (motionQuery.matches) {
      targetX = 0;
      targetY = 0;
    } else {
      targetX = clamp(x, -MAX_VIEW, MAX_VIEW);
      targetY = clamp(y, -MAX_VIEW, MAX_VIEW);
    }

    ensureAnimation();
  }

  function renderFrame() {
    animationFrame = 0;
    currentX += (targetX - currentX) * EASING;
    currentY += (targetY - currentY) * EASING;

    if (Math.abs(targetX - currentX) < 0.002) currentX = targetX;
    if (Math.abs(targetY - currentY) < 0.002) currentY = targetY;

    chamber.style.setProperty("--chamber-view-x", currentX.toFixed(3));
    chamber.style.setProperty("--chamber-view-y", currentY.toFixed(3));

    if (currentX !== targetX || currentY !== targetY) {
      animationFrame = requestAnimationFrame(renderFrame);
    }
  }

  function ensureAnimation() {
    if (!animationFrame) animationFrame = requestAnimationFrame(renderFrame);
  }

  function handlePointerMove(event) {
    if (coarsePointerQuery.matches || motionQuery.matches) return;

    const x = ((event.clientX / window.innerWidth) - 0.5) * MAX_VIEW * 2;
    const y = ((event.clientY / window.innerHeight) - 0.5) * MAX_VIEW * 2;
    setTarget(x, y);
  }

  function handlePointerLeave() {
    if (!coarsePointerQuery.matches) setTarget(0, 0);
  }

  function handleOrientation(event) {
    if (motionQuery.matches || event.beta == null || event.gamma == null) return;

    if (!orientationBaseline) {
      orientationBaseline = {
        beta: event.beta,
        gamma: event.gamma
      };
    }

    const gammaDelta = event.gamma - orientationBaseline.gamma;
    const betaDelta = event.beta - orientationBaseline.beta;

    setTarget(gammaDelta * 0.18, betaDelta * 0.12);
  }

  async function startOrientation() {
    if (orientationStarted || !coarsePointerQuery.matches || motionQuery.matches) return;
    orientationStarted = true;

    try {
      if (
        typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function"
      ) {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== "granted") return;
      }

      window.addEventListener("deviceorientation", handleOrientation, true);
    } catch (error) {
      // Pointer/static fallback remains available when orientation access fails.
      console.info("NCN chamber orientation unavailable.", error);
    }
  }

  function resetView() {
    orientationBaseline = null;
    setTarget(0, 0);
  }

  window.addEventListener("pointermove", handlePointerMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", handlePointerLeave);

  // Mobile browsers may require a user gesture before orientation access.
  document.addEventListener("pointerdown", startOrientation, { once: true, passive: true });

  window.addEventListener("orientationchange", resetView);
  window.addEventListener("resize", resetView);

  motionQuery.addEventListener?.("change", resetView);
  coarsePointerQuery.addEventListener?.("change", resetView);

  resetView();
})();
