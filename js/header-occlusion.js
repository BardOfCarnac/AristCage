/*==================================================
  POSITIONAL HEADER OCCLUSION
==================================================*/

(() => {
  const zone = document.querySelector(".rail-occlusion");
  const feed = document.querySelector("#feed");

  if (!zone || !feed) return;

  let framePending = false;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function clearEntry(entry) {
    entry.classList.remove("occlusion-active");
    entry.style.removeProperty("--occlusion-progress");
  }

  function updateOcclusion() {
    framePending = false;

    if (document.documentElement.classList.contains("occlusion-effect-off")) {
      feed.querySelectorAll(".entry.occlusion-active").forEach(clearEntry);
      return;
    }

    const zoneRect = zone.getBoundingClientRect();
    const zoneHeight = Math.max(1, zoneRect.height);

    feed.querySelectorAll(".entry").forEach(entry => {
      const rect = entry.getBoundingClientRect();
      const isCrossingZone = rect.top < zoneRect.bottom && rect.bottom > zoneRect.top;

      if (!isCrossingZone) {
        clearEntry(entry);
        return;
      }

      const progress = clamp((zoneRect.bottom - rect.top) / zoneHeight, 0, 1);

      entry.classList.add("occlusion-active");
      entry.style.setProperty("--occlusion-progress", progress.toFixed(4));
    });
  }

  function requestUpdate() {
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(updateOcclusion);
  }

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate, { passive: true });

  new MutationObserver(requestUpdate).observe(feed, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"]
  });

  requestUpdate();
})();
