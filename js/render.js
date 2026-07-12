/*==================================================
  ROOT
==================================================*/

const feed = document.querySelector("#feed");

/*==================================================
  SAFE OUTPUT
==================================================*/

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/*==================================================
  RENDER
==================================================*/

function visibleEntryMarkup() {
  const visibleEntries = getVisibleEntries();

  return visibleEntries.length
    ? visibleEntries.map(entryMarkup).join("")
    : `<div class="empty-state">No transmissions match the current filter.</div>`;
}

function render() {
  const panelMarkup = NCN_STATE.activePanel
    ? entryMarkup(createPanelEntry(NCN_STATE.activePanel))
    : "";

  feed.innerHTML = panelMarkup + visibleEntryMarkup();
}

function renderResultsOnly() {
  feed.querySelectorAll(".entry:not(.panel), .empty-state").forEach(node => node.remove());
  feed.insertAdjacentHTML("beforeend", visibleEntryMarkup());
}

function renderPanelOnly() {
  feed.querySelector(".entry.panel")?.remove();

  if (!NCN_STATE.activePanel) return null;

  feed.insertAdjacentHTML(
    "afterbegin",
    entryMarkup(createPanelEntry(NCN_STATE.activePanel))
  );

  return feed.querySelector(".entry.panel");
}

/*==================================================
  ENTRY
==================================================*/

function entryMarkup(entry) {
  const isPanel = entry.type === "panel";
  const expanded = isPanel || isExpanded(entry.id);
  const body = isPanel ? entry.body : escapeHTML(entry.body);

  return `
<article
  class="entry ${expanded ? "expanded" : ""} ${isPanel ? "panel" : ""}"
  data-entry-id="${escapeHTML(entry.id)}"
>
  <div class="projection-plate">
    <div class="part frame"></div>
    <div class="part corners" aria-hidden="true">
      <i class="corner corner-tl"></i>
      <i class="corner corner-tr"></i>
      <i class="corner corner-bl"></i>
      <i class="corner corner-br"></i>
    </div>
    <div class="part priority priority-${Number(entry.priority) || 1}"></div>

    <div class="entry-content">
      <div class="part meta">${escapeHTML(entry.meta)}</div>
      <h2 class="part headline">${escapeHTML(entry.headline)}</h2>
      <div class="part tags">${escapeHTML(entry.tags)}</div>

      <div class="expansion-zone">
        <div class="part body">${body}</div>
      </div>
    </div>
  </div>
</article>
`;
}

/*==================================================
  FILTER MARKUP
==================================================*/

function filterChecks(group, values) {
  const selected = NCN_STATE.filters[group];

  return values.map(value => `
    <label>
      <input
        type="checkbox"
        name="${escapeHTML(group)}"
        value="${escapeHTML(value)}"
        ${selected.has(value) ? "checked" : ""}
      >
      ${escapeHTML(value)}
    </label>
  `).join("");
}

function selectedCount(group) {
  return NCN_STATE.filters[group].size;
}

function filterGroup(group, label) {
  const values = NCN_FILTER_OPTIONS[group];

  return `
<details class="filter-group">
  <summary>
    <span>${escapeHTML(label)}</span>
    <span class="filter-count">${selectedCount(group)}/${values.length}</span>
  </summary>
  <div class="filter-options">
    ${filterChecks(group, values)}
  </div>
</details>
`;
}

/*==================================================
  PANEL
==================================================*/

function createPanelEntry(type) {
  const filterPanel = {
    id: "panel-filter",
    type: "panel",
    priority: 3,
    headline: "Refine Local Feed",
    meta: "Filter Mode",
    tags: "Category // Area // Priority // Source // Time",
    body: `
<form class="panel-fields panel-form filter-form" aria-label="Feed filters">
  <label class="field-label filter-search">
    Search
    <input type="search" name="search" value="${escapeHTML(NCN_STATE.filters.search)}" placeholder="Search headlines and reports">
  </label>
  <div class="filter-groups">
    ${filterGroup("category", "Category")}
    ${filterGroup("area", "Area")}
    ${filterGroup("priority", "Priority")}
    ${filterGroup("sourceType", "Source")}
  </div>
  <fieldset class="panel-section panel-section-inline filter-time">
    <legend>Time</legend>
    ${["Now", "Last Day", "All Time"].map(value => `
      <label><input type="radio" name="time" value="${value}" ${NCN_STATE.filters.time === value ? "checked" : ""}>${value}</label>
    `).join("")}
  </fieldset>
  <div class="panel-actions">
    <button type="submit">Apply Filters</button>
    <button type="reset" class="secondary-action">Reset</button>
  </div>
</form>`
  };

  const submitPanel = {
    id: "panel-submit",
    type: "panel",
    priority: 4,
    headline: "Transmit Signal",
    meta: "Submission",
    tags: "Headline // Classification // Source // Body",
    body: `
<form class="panel-fields panel-form" aria-label="Submit report">
  <fieldset class="panel-section">
    <legend>Report</legend>
    <label class="field-label">Headline<input name="headline" placeholder="Headline" required></label>
    <label class="field-label">Signal body<textarea name="body" placeholder="Body text"></textarea></label>
  </fieldset>
  <div class="panel-grid compact-grid">
    <label class="field-label">Category<select name="category">${NCN_FILTER_OPTIONS.category.map(value => `<option>${value}</option>`).join("")}</select></label>
    <label class="field-label">Area<select name="area">${NCN_FILTER_OPTIONS.area.map(value => `<option>${value}</option>`).join("")}</select></label>
    <label class="field-label">Source type<select name="sourceType">${NCN_FILTER_OPTIONS.sourceType.map(value => `<option>${value}</option>`).join("")}</select></label>
    <label class="field-label">Priority<select name="priority">${NCN_FILTER_OPTIONS.priority.map(value => `<option>${value}</option>`).join("")}</select></label>
  </div>
  <label class="field-label">Source<input name="source" placeholder="Name, outlet, scanner or anonymous handle"></label>
  <div class="panel-actions">
    <button type="button">Transmit</button>
    <span class="panel-note">Submission transport is not connected yet.</span>
  </div>
</form>`
  };

  return type === "filter" ? filterPanel : submitPanel;
}
