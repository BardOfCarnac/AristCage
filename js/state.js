/*==================================================
  APPLICATION STATE
==================================================*/

const NCN_APP_FILTER_OPTIONS = Object.freeze({
  redwire: Object.freeze({
    category: ["Business", "Community", "Crime", "Infrastructure", "Politics", "Culture"],
    area: ["City Core", "Urban Sprawl", "Industrial Fringe", "Private Enclave", "Frontier Zone"],
    priority: ["Bulletin", "Advisory", "Alert", "Warning", "Emergency"],
    sourceType: ["Corporate", "Civic Notice", "Press Report", "Eyewitness", "Scanner Traffic", "Anonymous Leak", "Underground"]
  }),
  dripfeed: Object.freeze({
    category: ["Items", "Services", "Housing", "Jobs", "Rides", "Community"],
    area: ["City Center", "Heywood", "Little Europe", "South Night City", "The Glen", "Watson", "Wellsprings"],
    priority: ["Offer", "Wanted", "Event"],
    sourceType: ["Image", "Text"]
  })
});

let NCN_FILTER_OPTIONS = NCN_APP_FILTER_OPTIONS.redwire;

const NCN_STATE = {
  activeApp: "redwire",
  activePanel: null,
  expandedEntryId: null,
  selectedEntryId: null,
  filters: createDefaultFilters(NCN_FILTER_OPTIONS)
};

function createDefaultFilters(options) {
  return {
    search: "",
    time: "Now",
    category: new Set(options.category),
    area: new Set(options.area),
    priority: new Set(options.priority),
    sourceType: new Set(options.sourceType)
  };
}

function activateApplicationState(name) {
  const next = NCN_APP_FILTER_OPTIONS[name] ? name : "redwire";
  NCN_STATE.activeApp = next;
  NCN_FILTER_OPTIONS = NCN_APP_FILTER_OPTIONS[next];
  NCN_STATE.activePanel = null;
  NCN_STATE.expandedEntryId = null;
  NCN_STATE.selectedEntryId = null;
  NCN_STATE.filters = createDefaultFilters(NCN_FILTER_OPTIONS);
}

/*==================================================
  ENTRY HELPERS
==================================================*/

function isExpanded(id) {
  return NCN_STATE.expandedEntryId === id;
}

function expandEntry(id) {
  NCN_STATE.expandedEntryId = id;
}

function collapseEntry(id) {
  if (NCN_STATE.expandedEntryId === id) {
    NCN_STATE.expandedEntryId = null;
  }
}

function clearExpandedEntry() {
  NCN_STATE.expandedEntryId = null;
}

function selectEntry(id) {
  NCN_STATE.selectedEntryId = id;
}

function clearSelectedEntry() {
  NCN_STATE.selectedEntryId = null;
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
  NCN_STATE.filters = createDefaultFilters(NCN_FILTER_OPTIONS);
}
