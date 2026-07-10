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

function render() {
  const output = [];

  if (NCN_STATE.activePanel) {
    output.push(createPanelEntry(NCN_STATE.activePanel));
  }

  output.push(...NCN_ENTRIES);

  feed.innerHTML = output
    .map(entryMarkup)
    .join("");
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
  PANEL
==================================================*/

function createPanelEntry(type) {
  const filterPanel = {
    id: "panel-filter",
    type: "panel",
    priority: 3,
    headline: "Refine Local Feed",
    meta: "Filter Mode",
    tags: "Time // Source // Priority",
    body: `
<div class="panel-fields">
  <button type="button">Now</button>
  <button type="button">Street</button>
  <button type="button">Corp</button>
  <button type="button">Combat Zone</button>
</div>
`
  };

  const submitPanel = {
    id: "panel-submit",
    type: "panel",
    priority: 4,
    headline: "Transmit Signal",
    meta: "Submission",
    tags: "Headline // Body",
    body: `
<div class="panel-fields">
  <input placeholder="Headline">
  <textarea placeholder="Signal body"></textarea>
  <button type="button">Transmit</button>
</div>
`
  };

  return type === "filter" ? filterPanel : submitPanel;
}
