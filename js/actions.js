/*==================================================
  FILTER ACTIONS
==================================================*/

function transitionFilteredFeed(updateState) {
  const currentObjects = [...document.querySelectorAll(".entry")]
    .flatMap(getVisibleProjectionObjects)
    .filter(Boolean);

  dismiss(currentObjects, () => {
    updateState();
    clearExpandedEntry();
    render();
    updateProjection();
    activatePresence();
  });
}

function applyFilterForm(form) {
  const formData = new FormData(form);

  transitionFilteredFeed(() => {
    NCN_STATE.filters.search = String(formData.get("search") || "");
    NCN_STATE.filters.time = String(formData.get("time") || "Now");

    ["category", "area", "priority", "sourceType"].forEach(group => {
      NCN_STATE.filters[group] = new Set(formData.getAll(group).map(String));
    });
  });
}

/*==================================================
  ACTIONS
==================================================*/

document.addEventListener("submit", event => {
  const filterForm = event.target.closest(".filter-form");
  if (!filterForm) return;

  event.preventDefault();
  applyFilterForm(filterForm);
});

document.addEventListener("reset", event => {
  const filterForm = event.target.closest(".filter-form");
  if (!filterForm) return;

  event.preventDefault();
  transitionFilteredFeed(resetFilters);
});

document.addEventListener("click", event => {
  const panelButton = event.target.closest("[data-panel]");

  if (panelButton) {
    togglePanel(panelButton.dataset.panel);
    render();
    updateProjection();
    activatePresence();
    return;
  }

  if (event.target.closest("form, button, input, select, textarea, label, summary, details")) {
    return;
  }

  const entry = event.target.closest(".entry");

  if (!entry || entry.classList.contains("panel")) return;

  toggleEntryLayout(entry);
});

/*==================================================
  SCROLL / RESIZE
==================================================*/

window.addEventListener("scroll", updateProjection, {
  passive: true
});

window.addEventListener("resize", updateProjection);
