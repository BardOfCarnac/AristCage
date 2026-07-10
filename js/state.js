/*==================================================
  APPLICATION STATE
==================================================*/

const NCN_FILTER_OPTIONS = {
  category: ["Business", "Community", "Crime", "Infrastructure", "Politics", "Culture"],
  area: ["City Core", "Urban Sprawl", "Industrial Fringe", "Private Enclave", "Frontier Zone"],
  priority: ["Bulletin", "Advisory", "Alert", "Warning", "Emergency"],
  sourceType: ["Corporate", "Civic Notice", "Press Report", "Eyewitness", "Scanner Traffic", "Anonymous Leak", "Underground"]
};

const NCN_STATE = {
  activePanel: null,
  expandedEntries: new Set(),
  filters: {
    search: "",
    time: "Now",
    category: new Set(NCN_FILTER_OPTIONS.category),
    area: new Set(NCN_FILTER_OPTIONS.area),
    priority: new Set(NCN_FILTER_OPTIONS.priority),
    sourceType: new Set(NCN_FILTER_OPTIONS.sourceType)
  }
};

/*==================================================
  ENTRY HELPERS
==================================================*/

function isExpanded(id) {
  return NCN_STATE.expandedEntries.has(id);
}

function expandEntry(id) {
  NCN_STATE.expandedEntries.add(id);
}

function collapseEntry(id) {
  NCN_STATE.expandedEntries.delete(id);
}

function toggleEntry(id) {
  if (isExpanded(id)) {
    collapseEntry(id);
  } else {
    expandEntry(id);
  }
}

/*==================================================
  PANELS
==================================================*/

function togglePanel(name) {
  NCN_STATE.activePanel = NCN_STATE.activePanel === name ? null : name;
}

/*==================================================
  FILTERING
==================================================*/

function entryMatchesFilters(entry) {
  const filters = NCN_STATE.filters;
  const searchText = `${entry.headline} ${entry.body} ${entry.meta} ${entry.tags}`.toLowerCase();

  if (!filters.category.has(entry.category)) return false;
  if (!filters.area.has(entry.area)) return false;
  if (!filters.priority.has(entry.priorityLabel)) return false;
  if (!filters.sourceType.has(entry.sourceType)) return false;

  if (filters.time === "Now" && entry.timeScope !== "Now") return false;
  if (filters.time === "Last Day" && !["Now", "Last Day"].includes(entry.timeScope)) return false;

  return searchText.includes(filters.search.trim().toLowerCase());
}

function getVisibleEntries() {
  return NCN_ENTRIES.filter(entryMatchesFilters);
}

function resetFilters() {
  NCN_STATE.filters.search = "";
  NCN_STATE.filters.time = "Now";

  Object.entries(NCN_FILTER_OPTIONS).forEach(([key, values]) => {
    NCN_STATE.filters[key] = new Set(values);
  });
}
