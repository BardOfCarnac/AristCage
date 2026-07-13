/*==================================================
  TRANSITION LOCKS
==================================================*/

let NCN_FILTER_TRANSITIONING = false;
let NCN_PANEL_TRANSITIONING = false;

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

async function transitionFilteredFeed(updateState, form = null) {
  if (NCN_FILTER_TRANSITIONING || NCN_LAYOUT_TRANSITIONING || NCN_PANEL_TRANSITIONING) return;
  NCN_FILTER_TRANSITIONING = true;

  try {
    await glowDown(getResultProjectionObjects());

    updateState();
    clearExpandedEntry();

    if (form) syncFilterFormFromState(form);

    renderResultsOnly();
    await waitForLayout();
    updateProjection();

    await glowUp(getResultProjectionObjects());
  } finally {
    NCN_FILTER_TRANSITIONING = false;
  }
}

function applyFilterForm(form) {
  const formData = new FormData(form);

  return transitionFilteredFeed(() => {
    NCN_STATE.filters.search = String(formData.get("search") || "");
    NCN_STATE.filters.time = String(formData.get("time") || "Now");

    ["category", "area", "priority", "sourceType"].forEach(group => {
      NCN_STATE.filters[group] = new Set(formData.getAll(group).map(String));
    });
  }, form);
}

/*==================================================
  PANEL ACTIONS
==================================================*/

async function transitionPanel(name) {
  if (NCN_PANEL_TRANSITIONING || NCN_FILTER_TRANSITIONING || NCN_LAYOUT_TRANSITIONING) return;
  NCN_PANEL_TRANSITIONING = true;

  try {
    const currentPanel = feed.querySelector(".entry.panel");

    if (currentPanel) {
      await glowDown(getVisibleProjectionObjects(currentPanel));
    }

    togglePanel(name);
    const nextPanel = renderPanelOnly();

    await waitForLayout();
    updateProjection();

    if (nextPanel) {
      await glowUp(getVisibleProjectionObjects(nextPanel));
    }
  } finally {
    NCN_PANEL_TRANSITIONING = false;
  }
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
  transitionFilteredFeed(resetFilters, filterForm);
});

document.addEventListener("click", event => {
  const panelButton = event.target.closest("[data-panel]");

  if (panelButton) {
    transitionPanel(panelButton.dataset.panel);
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