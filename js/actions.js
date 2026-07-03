/*==================================================
  ACTIONS
==================================================*/

document.addEventListener("click", (event) => {
  const panelButton = event.target.closest("[data-panel]");

  if (panelButton) {
    togglePanel(panelButton.dataset.panel);
    render();
    updateProjection();
    return;
  }

  const entry = event.target.closest(".entry");

  if (!entry || entry.classList.contains("panel")) return;

  toggleEntry(entry.dataset.entryId);

  render();

  requestAnimationFrame(updateProjection);
  setTimeout(updateProjection, 80);
  setTimeout(updateProjection, 180);
  setTimeout(updateProjection, 320);
});

/*==================================================
  SCROLL / RESIZE
==================================================*/

window.addEventListener("scroll", updateProjection, {
  passive: true
});

window.addEventListener("resize", updateProjection);
