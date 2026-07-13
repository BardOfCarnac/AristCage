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
  const bodyClass = isPanel ? "body panel-body" : "part body gone";

  return `
<article
  class="entry ${expanded ? "expanded" : ""} ${isPanel ? "panel" : ""}"
  data-entry-id="${escapeHTML(entry.id)}"
>
  <div class="projection-plate">
    <div class="part frame gone"></div>
    <div class="part corners gone" aria-hidden="true">
      <i class="corner corner-tl"></i>
      <i class="corner corner-tr"></i>
      <i class="corner corner-bl"></i>
      <i class="corner corner-br"></i>
    </div>
    <div class="part priority priority-${Number(entry.priority) || 1} gone"></div>

    <div class="entry-content">
      <div class="part meta gone">${escapeHTML(entry.meta)}</div>
      <h2 class="part headline gone">${escapeHTML(entry.headline)}</h2>
      <div class="part tags gone">${escapeHTML(entry.tags)}</div>

      <div class="expansion-zone">
        <div class="${bodyClass}">${body}</div>
      </div>
    </div>
  </div>
</article>
`;
}

/*==================================================
  PROJECTED CONTROL MARKUP
==================================================*/

function controlId(prefix, name) {
  return `ncn-${prefix}-${name}`;
}

function ncnSelectMarkup(name, label, values, selectedValue = values[0], prefix = "control") {
  const id = controlId(prefix, name);

  return `
<div class="control-row panel-control gone">
  <span class="control-label" id="${id}-label">${escapeHTML(label)}</span>
  <div class="ncn-select" data-name="${escapeHTML(name)}" data-mode="single">
    <input class="ncn-select-input" type="hidden" name="${escapeHTML(name)}" value="${escapeHTML(selectedValue)}">
    <button
      class="ncn-select-trigger"
      type="button"
      aria-haspopup="listbox"
      aria-expanded="false"
      aria-labelledby="${id}-label ${id}-value"
    >
      <span class="ncn-select-value" id="${id}-value">${escapeHTML(selectedValue)}</span>
      <span class="ncn-select-caret" aria-hidden="true"></span>
    </button>
    <div class="ncn-select-menu" role="listbox" aria-labelledby="${id}-label">
      ${values.map(value => `
        <button
          class="ncn-select-option"
          type="button"
          role="option"
          tabindex="-1"
          data-value="${escapeHTML(value)}"
          aria-selected="${value === selectedValue ? "true" : "false"}"
        >${escapeHTML(value)}</button>
      `).join("")}
    </div>
  </div>
</div>`;
}

function multiSelectSummary(values, selected) {
  if (selected.size === values.length) return `All ${values.length}`;
  if (!selected.size) return "None";
  if (selected.size === 1) return [...selected][0];
  return `${selected.size} selected`;
}

function ncnMultiSelectMarkup(name, label, values, selectedValues, prefix = "filter") {
  const id = controlId(prefix, name);
  const selected = new Set(selectedValues);

  return `
<div class="control-row panel-control gone">
  <span class="control-label" id="${id}-label">${escapeHTML(label)}</span>
  <div class="ncn-select ncn-multiselect" data-name="${escapeHTML(name)}" data-mode="multiple" data-total="${values.length}">
    <button
      class="ncn-select-trigger"
      type="button"
      aria-haspopup="listbox"
      aria-expanded="false"
      aria-labelledby="${id}-label ${id}-value"
    >
      <span class="ncn-select-value" id="${id}-value">${escapeHTML(multiSelectSummary(values, selected))}</span>
      <span class="ncn-select-caret" aria-hidden="true"></span>
    </button>
    <div class="ncn-select-menu" role="listbox" aria-multiselectable="true" aria-labelledby="${id}-label">
      ${values.map(value => {
        const checked = selected.has(value);
        return `
        <div class="ncn-select-option-wrap">
          <input
            class="ncn-select-input ncn-multi-input"
            type="checkbox"
            name="${escapeHTML(name)}"
            value="${escapeHTML(value)}"
            ${checked ? "checked" : ""}
            tabindex="-1"
            aria-hidden="true"
          >
          <button
            class="ncn-select-option"
            type="button"
            role="option"
            tabindex="-1"
            data-value="${escapeHTML(value)}"
            aria-selected="${checked ? "true" : "false"}"
          >${escapeHTML(value)}</button>
        </div>`;
      }).join("")}
    </div>
  </div>
</div>`;
}

function controlInputMarkup(name, label, options = {}) {
  const {
    type = "text",
    value = "",
    placeholder = "",
    required = false,
    inputClass = ""
  } = options;

  return `
<label class="control-row control-row-input panel-control gone">
  <span class="control-label">${escapeHTML(label)}</span>
  <input
    class="control-input ${escapeHTML(inputClass)}"
    type="${escapeHTML(type)}"
    name="${escapeHTML(name)}"
    value="${escapeHTML(value)}"
    placeholder="${escapeHTML(placeholder)}"
    ${required ? "required" : ""}
  >
</label>`;
}

function controlTextareaMarkup(name, label, placeholder = "") {
  return `
<label class="control-block panel-control gone">
  <span class="control-label">${escapeHTML(label)}</span>
  <textarea class="control-textarea" name="${escapeHTML(name)}" placeholder="${escapeHTML(placeholder)}"></textarea>
</label>`;
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
<form class="panel-fields panel-form filter-form ncn-control-panel" aria-label="Feed filters">
  <div class="control-stack">
    ${controlInputMarkup("search", "Search", {
      type: "search",
      value: NCN_STATE.filters.search,
      placeholder: "Headlines and reports"
    })}
    ${ncnMultiSelectMarkup("category", "Category", NCN_FILTER_OPTIONS.category, NCN_STATE.filters.category)}
    ${ncnMultiSelectMarkup("area", "Area", NCN_FILTER_OPTIONS.area, NCN_STATE.filters.area)}
    ${ncnMultiSelectMarkup("priority", "Priority", NCN_FILTER_OPTIONS.priority, NCN_STATE.filters.priority)}
    ${ncnMultiSelectMarkup("sourceType", "Source", NCN_FILTER_OPTIONS.sourceType, NCN_STATE.filters.sourceType)}
    ${ncnSelectMarkup("time", "Time", ["Now", "Last Day", "All Time"], NCN_STATE.filters.time, "filter")}
  </div>
  <div class="panel-actions control-actions panel-control gone">
    <button type="submit">Apply Filters</button>
    <button type="reset" class="secondary-action">Reset</button>
    <span class="panel-note filter-status">Selections remain local until applied.</span>
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
<form class="panel-fields panel-form submit-form ncn-control-panel" aria-label="Submit report">
  <div class="control-stack">
    ${controlInputMarkup("headline", "Headline", {
      placeholder: "Transmission headline",
      required: true
    })}
    ${ncnSelectMarkup("category", "Category", NCN_FILTER_OPTIONS.category, NCN_FILTER_OPTIONS.category[0], "submit")}
    ${ncnSelectMarkup("area", "Area", NCN_FILTER_OPTIONS.area, NCN_FILTER_OPTIONS.area[0], "submit")}
    ${ncnSelectMarkup("sourceType", "Source type", NCN_FILTER_OPTIONS.sourceType, NCN_FILTER_OPTIONS.sourceType[0], "submit")}
    ${ncnSelectMarkup("priority", "Priority", NCN_FILTER_OPTIONS.priority, NCN_FILTER_OPTIONS.priority[0], "submit")}
    ${controlInputMarkup("source", "Source", {
      placeholder: "Name, outlet, scanner or handle"
    })}
  </div>
  ${controlTextareaMarkup("body", "Signal body", "Body text")}
  <div class="panel-actions control-actions panel-control gone">
    <button type="button">Transmit</button>
    <span class="panel-note">Submission transport is not connected yet.</span>
  </div>
</form>`
  };

  return type === "filter" ? filterPanel : submitPanel;
}
