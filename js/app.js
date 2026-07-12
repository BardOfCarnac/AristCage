/*==================================================
  NIGHT CITY NEWS
  APPLICATION ENTRY POINT
==================================================*/

function updateRailHeight() {
  const rail = document.querySelector(".rail");
  if (!rail) return;

  document.documentElement.style.setProperty(
    "--rail-height",
    `${Math.ceil(rail.getBoundingClientRect().height)}px`
  );
}

function watchRailHeight() {
  const rail = document.querySelector(".rail");
  if (!rail) return;

  updateRailHeight();

  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(updateRailHeight);
    observer.observe(rail);
  } else {
    window.addEventListener("resize", updateRailHeight);
  }
}

function boot() {
  render();
  updateProjection();
  activatePresence();
  watchRailHeight();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}