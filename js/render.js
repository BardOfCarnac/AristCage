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

function safeImageSource(value = "") {
  const source = String(value || "").trim();
  if (source.startsWith("data:image/svg+xml")) return source;

  try {
    const url = new URL(source, window.location.href);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function safeExternalLink(value = "") {
  try {
    const url = new URL(String(value || ""), window.location.href);
    return ["https:", "http:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function dripfeedAttributionMarkup(entry) {
  if (entry.app !== "dripfeed" || entry.image?.provider !== "unsplash") return "";
  const photographerURL = safeExternalLink(entry.image.photographer?.url);
  const unsplashURL = safeExternalLink(entry.image.unsplashUrl || "https://unsplash.com/");
  const photographer = escapeHTML(entry.image.photographer?.name || "Unsplash photographer");
  return `<span class="dripfeed-credit">Photo: <a href="${escapeHTML(photographerURL)}" target="_blank" rel="noopener">${photographer}</a> / <a href="${escapeHTML(unsplashURL)}" target="_blank" rel="noopener">Unsplash</a></span>`;
}

function entryTagsMarkup(entry) {
  return `${escapeHTML(entry.tags)}${dripfeedAttributionMarkup(entry)}`;
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

function entryDetailPairs(entry) {
  if (entry.app === "dripfeed") {
    return [
      ["Listing", entry.priorityLabel],
      ["Category", entry.category],
      ["District", entry.district || entry.area],
      ["Poster", entry.posterAlias],
      ["Value", entry.valueLabel],
      ["Contact", entry.contactMethod],
      ["State", String(entry.publicationState || "live").toUpperCase()],
      ["Expiry", dripfeedExpiryLabel(entry.expiresAt, entry.publicationState)]
    ];
  }

  return [
    ["Category", entry.category],
    ["Area", entry.area],
    ["Source type", entry.sourceType],
    ["Priority", entry.priorityLabel],
    ["Time scope", entry.timeScope]
  ];
}

function detailGridMarkup(entry, className = "mobile-inspector-detail-grid") {
  return `
    <div class="${escapeHTML(className)}">
      ${entryDetailPairs(entry).map(([label, value]) => `
        <div class="detail-label">${escapeHTML(label)}</div>
        <div class="detail-value">${escapeHTML(value || "—")}</div>
      `).join("")}
    </div>`;
}

function mobileInspectorDetails(entry) {
  if (entry.type === "panel") return "";
  return detailGridMarkup(entry);
}

function dripfeedTerminalActions(entry) {
  if (entry.app !== "dripfeed") return "";

  const saved = window.DripfeedApp?.isSaved?.(entry.id) || false;
  const seen = window.DripfeedApp?.isSeen?.(entry.id) || false;

  return `
    ${entry.image?.provider === "unsplash" ? `<div class="dripfeed-credit-detail">${dripfeedAttributionMarkup(entry)}</div>` : ""}
    <div class="dripfeed-entry-actions" aria-label="Terminal actions">
      <button type="button" data-drip-action="save" data-entry-id="${escapeHTML(entry.id)}" aria-pressed="${saved}">${saved ? "Saved" : "Save"}</button>
      <button type="button" data-drip-action="seen" data-entry-id="${escapeHTML(entry.id)}" aria-pressed="${seen}">${seen ? "Seen" : "Mark seen"}</button>
    </div>`;
}

function entryFrameMarkup(entry) {
  if (entry.app !== "dripfeed") {
    return `<div class="part frame gone"></div>`;
  }

  const imageSource = safeImageSource(entry.image?.url);
  const code = NCN_DRIPFEED_CATEGORY_CODES[entry.category] || "DF";

  return `
    <div class="part frame dripfeed-frame ${imageSource ? "has-image" : "text-plate"} gone" data-drip-code="${escapeHTML(code)}">
      ${imageSource ? `<img class="dripfeed-card-image" src="${escapeHTML(imageSource)}" alt="" loading="lazy" decoding="async">` : ""}
      <span class="dripfeed-image-wash" aria-hidden="true"></span>
    </div>`;
}

function entryBodyMarkup(entry, includeMobileDetails = true) {
  const details = includeMobileDetails ? mobileInspectorDetails(entry) : "";
  return `${escapeHTML(entry.body)}${details}${dripfeedTerminalActions(entry)}`;
}

function entryMarkup(entry) {
  const isPanel = entry.type === "panel";
  const expanded = isPanel || isExpanded(entry.id);
  const isDripfeed = entry.app === "dripfeed";
  const saved = isDripfeed && (window.DripfeedApp?.isSaved?.(entry.id) || false);
  const seen = isDripfeed && (window.DripfeedApp?.isSeen?.(entry.id) || false);
  const body = isPanel
    ? entry.body
    : entryBodyMarkup(entry, true);
  const bodyClass = isPanel ? "body panel-body" : "part body gone";
  const stateClasses = [
    isDripfeed ? "dripfeed-entry" : "redwire-entry",
    saved ? "dripfeed-saved" : "",
    seen ? "dripfeed-seen" : "",
    isDripfeed ? `publication-${entry.publicationState || "live"}` : ""
  ].filter(Boolean).join(" ");

  return `
<article
  class="entry ${expanded ? "expanded" : ""} ${isPanel ? "panel" : ""} ${stateClasses}"
  data-entry-id="${escapeHTML(entry.id)}"
  data-application="${escapeHTML(entry.app || NCN_STATE.activeApp)}"
>
  <div class="projection-plate">
    ${entryFrameMarkup(entry)}
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
      <div class="part tags gone">${entryTagsMarkup(entry)}</div>

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
    inputClass = "",
    maxlength = ""
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
    ${maxlength ? `maxlength="${Number(maxlength)}"` : ""}
    ${required ? "required" : ""}
  >
</label>`;
}

function controlTextareaMarkup(name, label, placeholder = "", options = {}) {
  return `
<label class="control-block panel-control gone">
  <span class="control-label">${escapeHTML(label)}</span>
  <textarea class="control-textarea ${escapeHTML(options.inputClass || "")}" name="${escapeHTML(name)}" placeholder="${escapeHTML(placeholder)}" ${options.maxlength ? `maxlength="${Number(options.maxlength)}"` : ""}></textarea>
</label>`;
}

/*==================================================
  PANEL
==================================================*/

function createDripfeedPanelEntry(type) {
  const filterPanel = {
    id: "panel-filter",
    app: "dripfeed",
    type: "panel",
    priority: 3,
    headline: "Sort the Dripfeed",
    meta: "Classified routing",
    tags: "Category // District // Listing // Format // Time",
    body: `
<form class="panel-fields panel-form filter-form ncn-control-panel" aria-label="Dripfeed filters">
  <div class="control-stack">
    ${controlInputMarkup("search", "Search", {
      type: "search",
      value: NCN_STATE.filters.search,
      placeholder: "Listings, posters and districts"
    })}
    ${ncnMultiSelectMarkup("category", "Category", NCN_FILTER_OPTIONS.category, NCN_STATE.filters.category)}
    ${ncnMultiSelectMarkup("area", "District", NCN_FILTER_OPTIONS.area, NCN_STATE.filters.area)}
    ${ncnMultiSelectMarkup("priority", "Listing", NCN_FILTER_OPTIONS.priority, NCN_STATE.filters.priority)}
    ${ncnMultiSelectMarkup("sourceType", "Format", NCN_FILTER_OPTIONS.sourceType, NCN_STATE.filters.sourceType)}
    ${ncnSelectMarkup("time", "Lifecycle", ["Now", "Last Day", "All Time"], NCN_STATE.filters.time, "filter")}
  </div>
  <div class="panel-actions control-actions panel-control gone">
    <button type="submit">Apply route</button>
    <button type="reset" class="secondary-action">Reset</button>
    <span class="panel-note filter-status">SAVED and SEEN remain private to this terminal.</span>
  </div>
</form>`
  };

  const submitPanel = {
    id: "panel-submit",
    app: "dripfeed",
    type: "panel",
    priority: 4,
    headline: "Place a classified",
    meta: "Dripfeed public transmission",
    tags: "Details // Image // Review",
    body: `
<form class="panel-fields panel-form ncn-control-panel dripfeed-submit-form" data-drip-step="1" aria-label="Place a classified">
  <div class="dripfeed-step-indicator panel-control gone" aria-label="Submission progress">
    <span data-drip-step-marker="1">01 Details</span>
    <span data-drip-step-marker="2">02 Image</span>
    <span data-drip-step-marker="3">03 Review</span>
  </div>

  <section class="dripfeed-form-step" data-drip-step-panel="1">
    <div class="control-stack">
      ${ncnSelectMarkup("listingType", "Listing", ["Offer", "Wanted", "Event"], "Offer", "drip-submit")}
      ${ncnSelectMarkup("category", "Category", NCN_FILTER_OPTIONS.category, NCN_FILTER_OPTIONS.category[0], "drip-submit")}
      ${controlInputMarkup("title", "Headline", { placeholder: "What are you offering or seeking?", required: true, maxlength: 90 })}
      ${controlInputMarkup("posterAlias", "Name / handle", { placeholder: "Public poster name", required: true, maxlength: 40 })}
      ${ncnSelectMarkup("district", "District", NCN_FILTER_OPTIONS.area, NCN_FILTER_OPTIONS.area[0], "drip-submit")}
      ${controlInputMarkup("valueLabel", "Price / compensation", { placeholder: "€$180, FREE, SWAP, NAME PRICE", required: true, maxlength: 40 })}
      ${controlInputMarkup("contactMethod", "Contact", { placeholder: "Public contact instruction", required: true, maxlength: 70 })}
      ${ncnSelectMarkup("expiryDays", "Expiry", ["1 day", "3 days", "7 days", "14 days"], "3 days", "drip-submit")}
    </div>
    ${controlTextareaMarkup("body", "Details", "Condition, timings, restrictions and useful context", { maxlength: 520 })}
    <div class="panel-actions control-actions panel-control gone">
      <button type="button" data-drip-step-next="2">Choose image</button>
    </div>
  </section>

  <section class="dripfeed-form-step" data-drip-step-panel="2">
    <div class="dripfeed-image-tabs panel-control gone" role="tablist" aria-label="Image source">
      <button type="button" class="active" data-drip-image-source="unsplash">Search Unsplash</button>
      <button type="button" data-drip-image-source="url">Image URL</button>
      <button type="button" data-drip-image-source="none">Text only</button>
    </div>
    <div class="dripfeed-image-source panel-control gone active" data-drip-image-panel="unsplash">
      <div class="dripfeed-unsplash-search">
        <input class="control-input" type="search" name="unsplashQuery" value="neon city" maxlength="80" aria-label="Search Unsplash">
        <button type="button" data-drip-unsplash-search>Search</button>
      </div>
      <p class="panel-note">Images remain on Unsplash’s CDN. Selecting one records the required attribution and selection endpoint.</p>
      <div class="dripfeed-photo-state" data-drip-photo-state>Search to choose an image.</div>
      <div class="dripfeed-photo-results" data-drip-photo-results></div>
    </div>
    <div class="dripfeed-image-source panel-control gone" data-drip-image-panel="url">
      ${controlInputMarkup("customImageUrl", "Public HTTPS image URL", { type: "url", placeholder: "https://…" })}
      <p class="panel-note">Use an image you own or have permission to publish.</p>
    </div>
    <div class="dripfeed-image-source panel-control gone" data-drip-image-panel="none">
      <p class="panel-note">A category plate will be projected instead of an image.</p>
    </div>
    <div class="dripfeed-selected-image panel-control gone" data-drip-selected-image hidden></div>
    <label class="dripfeed-rights panel-control gone">
      <input type="checkbox" name="imageSafeguard">
      <span>I will not use a real person’s image to falsely identify them or imply criminal, sexual, medical or defamatory conduct.</span>
    </label>
    <div class="panel-actions control-actions panel-control gone">
      <button type="button" class="secondary-action" data-drip-step-next="1">Back</button>
      <button type="button" data-drip-step-next="3">Review</button>
    </div>
  </section>

  <section class="dripfeed-form-step" data-drip-step-panel="3">
    <div class="dripfeed-review panel-control gone" data-drip-review>
      <span class="panel-note">Complete the classified details to generate a review.</span>
    </div>
    <div class="panel-actions control-actions panel-control gone">
      <button type="button" class="secondary-action" data-drip-step-next="2">Back</button>
      <button type="submit">Transmit classified</button>
      <span class="panel-note">No account. SAVED and SEEN remain terminal-local.</span>
    </div>
  </section>
</form>`
  };

  return type === "filter" ? filterPanel : submitPanel;
}

function createPanelEntry(type) {
  if (NCN_STATE.activeApp === "dripfeed") {
    return createDripfeedPanelEntry(type);
  }

  const filterPanel = {
    id: "panel-filter",
    app: "redwire",
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
    app: "redwire",
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
