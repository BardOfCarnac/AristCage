/*==================================================
  SELECTOR + FILTER CORRECTIONS
==================================================*/

/* An empty filter dimension means unrestricted. Start the filter panel visually
   empty instead of presenting every option as selected. */
Object.keys(NCN_FILTER_OPTIONS).forEach(key => {
  NCN_STATE.filters[key] = new Set();
});

multiSelectSummary = function multiSelectSummaryEmpty(values, selected) {
  if (!selected.size) return "Empty";
  if (selected.size === values.length) return `All ${values.length}`;
  if (selected.size === 1) return [...selected][0];
  return `${selected.size} selected`;
};

getNCNMultiSelectSummary = function getNCNMultiSelectSummaryEmpty(control) {
  const checked = [...control.querySelectorAll(".ncn-multi-input:checked")];
  const total = Number(control.dataset.total) || control.querySelectorAll(".ncn-multi-input").length;

  if (!checked.length) return "Empty";
  if (checked.length === total) return `All ${total}`;
  if (checked.length === 1) return checked[0].value;
  return `${checked.length} selected`;
};

/* Opening a selector only dismisses the other controls in its own panel. News
   articles and the desktop inspector remain present. */
getSelectorSceneObjects = function getPanelSelectorSceneObjects(control) {
  const activeRow = control?.closest(".panel-control");
  const panel = control?.closest(".entry.panel");

  return panel
    ? [...panel.querySelectorAll(".panel-control")].filter(object => object !== activeRow)
    : [];
};

const originalEntryMatchesFilters = entryMatchesFilters;
entryMatchesFilters = function entryMatchesOptionalFilters(entry) {
  const filters = NCN_STATE.filters;
  const searchText = `${entry.headline} ${entry.body} ${entry.meta} ${entry.tags}`.toLowerCase();

  if (filters.category.size && !filters.category.has(entry.category)) return false;
  if (filters.area.size && !filters.area.has(entry.area)) return false;
  if (filters.priority.size && !filters.priority.has(entry.priorityLabel)) return false;
  if (filters.sourceType.size && !filters.sourceType.has(entry.sourceType)) return false;

  if (filters.time === "Now" && entry.timeScope !== "Now") return false;
  if (filters.time === "Last Day" && !["Now", "Last Day"].includes(entry.timeScope)) return false;

  return searchText.includes(filters.search.trim().toLowerCase());
};

resetFilters = function resetFiltersToEmpty() {
  NCN_STATE.filters.search = "";
  NCN_STATE.filters.time = "Now";

  Object.keys(NCN_FILTER_OPTIONS).forEach(key => {
    NCN_STATE.filters[key] = new Set();
  });
};
