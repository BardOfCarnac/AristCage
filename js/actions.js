/*==================================================
  FILTER ACTIONS
==================================================*/

function getResultProjectionObjects() {
  return [...document.querySelectorAll(".entry:not(.panel)")]
    .flatMap(getVisibleProjectionObjects)
    .filter(Boolean);
}

function syncFilterFormFromState(form) {
  const search = form.elements.search;
  const time = form.elements.time;

  if (search) search.value = NCN_STATE.filters.search;

  if (time) {
    [...time].forEach(input => {
      input.checked = input.value === NCN_STATE.filters.time;
    });
  }

  ["category", "area", "priority", "sourceType"].forEach(group => {
    form.querySelectorAll(`[name="${group}"]`).forEach(input => {
      input.checked = NCN_STATE.filters[group].has(input.value);
    });
  });
}

function transitionFilteredFeed(updateState) {
  const currentObjects = getResultProjectionObjects();

  dismiss(currentObjects, () => {
    updateState();
    clearExpandedEntry();
    renderResultsOnly();
    updateProjection();
    resolve(getResultProjectionObjects());
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
  resetFilters();
  syncFilterFormFromState(filterForm);
  transitionFilteredFeed(() => {});
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