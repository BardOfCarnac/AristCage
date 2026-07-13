/*==================================================
  FILTER ACTIONS
==================================================*/

function getResultEntries() {
  return [...feed.querySelectorAll(".entry:not(.panel)")];
}

function getResultProjectionObjects() {
  return getProjectionObjectsForEntries(getResultEntries());
}

function getFeedProjectionObjects() {
  return getProjectionObjectsForEntries([
    ...feed.querySelectorAll(".entry")
  ]);
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
  const panel = feed.querySelector(".entry.panel");

  await runProjectionTransaction({
    name: "filter-results",
    keep: () => panel ? getVisibleProjectionObjects(panel) : [],
    dismiss: getResultProjectionObjects,
    commit: () => {
      updateState();
      clearExpandedEntry();

      if (form) syncFilterFormFromState(form);
      renderResultsOnly();
    },
    resolve: getResultProjectionObjects
  });
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
  await runProjectionTransaction({
    name: `panel:${name}`,
    dismiss: getFeedProjectionObjects,
    commit: () => {
      togglePanel(name);
      renderPanelOnly();
    },
    resolve: getFeedProjectionObjects
  });
}

/*==================================================
  EVENTS
==================================================*/

document.addEventListener("submit", event => {
  const filterForm = event.target.closest(".filter-form");
  if (!filterForm) return;

  event.preventDefault();
  void applyFilterForm(filterForm);
});

document.addEventListener("reset", event => {
  const filterForm = event.target.closest(".filter-form");
  if (!filterForm) return;

  event.preventDefault();
  void transitionFilteredFeed(resetFilters, filterForm);
});

document.addEventListener("click", event => {
  const panelButton = event.target.closest("[data-panel]");

  if (panelButton) {
    void transitionPanel(panelButton.dataset.panel);
    return;
  }

  if (event.target.closest("form, button, input, select, textarea, label, summary, details")) {
    return;
  }

  const entry = event.target.closest(".entry");

  if (!entry || entry.classList.contains("panel")) return;
  void toggleEntryLayout(entry);
});

/*==================================================
  SCROLL / RESIZE
==================================================*/

window.addEventListener("scroll", updateProjection, {
  passive: true
});

window.addEventListener("resize", updateProjection);
