/*==================================================
  OPAQUE CHAMBER VIEW CONTROL

  The chamber is independent of page scroll. Pointer or
  device orientation moves the rear plane strongly and
  reveals only one wall from each opposing pair.
==================================================*/

(() => {
  const chamber = document.querySelector(".chamber");
  if (!chamber) return;

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarsePointerQuery = window.matchMedia("(hover: none) and (pointer: coarse)");
  const DEAD_ZONE = 0.035;
  const EASING = 0.24;

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
      targetX = clamp(x, -1, 1);
      targetY = clamp(y, -1, 1);
    }

    ensureAnimation();
  }

  function updateVisibleWalls(x, y) {
    chamber.classList.toggle("show-left", x < -DEAD_ZONE);
    chamber.classList.toggle("show-right", x > DEAD_ZONE);

    /* Positive Y means the top of the cavity is exposed;
       the opposing bottom wall is therefore outside the view. */
    chamber.classList.toggle("show-top", y > DEAD_ZONE);
    chamber.classList.toggle("show-bottom", y < -DEAD_ZONE);
  }

  function renderFrame() {
    animationFrame = 0;
    currentX += (targetX - currentX) * EASING;
    currentY += (targetY - currentY) * EASING;

    if (Math.abs(targetX - currentX) < 0.001) currentX = targetX;
    if (Math.abs(targetY - currentY) < 0.001) currentY = targetY;

    chamber.style.setProperty("--view-x", currentX.toFixed(4));
    chamber.style.setProperty("--view-y", currentY.toFixed(4));
    updateVisibleWalls(currentX, currentY);

    if (currentX !== targetX || currentY !== targetY) {
      animationFrame = requestAnimationFrame(renderFrame);
    }
  }

  function ensureAnimation() {
    if (!animationFrame) animationFrame = requestAnimationFrame(renderFrame);
  }

  function handlePointerMove(event) {
    if (coarsePointerQuery.matches || motionQuery.matches) return;

    const x = ((event.clientX / window.innerWidth) - 0.5) * 2;
    const y = ((event.clientY / window.innerHeight) - 0.5) * 2;
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

    /* Roughly eighteen degrees of physical tilt reaches full chamber travel. */
    setTarget(gammaDelta / 18, betaDelta / 18);
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
      console.info("NCN chamber orientation unavailable.", error);
    }
  }

  function resetView() {
    orientationBaseline = null;
    setTarget(0, 0);
  }

  window.addEventListener("pointermove", handlePointerMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", handlePointerLeave);
  document.addEventListener("pointerdown", startOrientation, { once: true, passive: true });
  window.addEventListener("orientationchange", resetView);
  window.addEventListener("resize", resetView);

  motionQuery.addEventListener?.("change", resetView);
  coarsePointerQuery.addEventListener?.("change", resetView);

  resetView();
})();
