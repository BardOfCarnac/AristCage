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
    <div class="card-field"></div>
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
    tags: "Category // Area // Priority // Source // Time",
    body: `
<form class="panel-fields panel-form" aria-label="Feed filters">
  <fieldset class="panel-section">
    <legend>Search</legend>
    <input type="search" name="search" placeholder="Search headlines and reports">
  </fieldset>

  <div class="panel-grid">
    <fieldset class="panel-section">
      <legend>Category</legend>
      <label><input type="checkbox" checked> Business</label>
      <label><input type="checkbox" checked> Community</label>
      <label><input type="checkbox" checked> Crime</label>
      <label><input type="checkbox" checked> Infrastructure</label>
      <label><input type="checkbox" checked> Politics</label>
      <label><input type="checkbox" checked> Culture</label>
    </fieldset>

    <fieldset class="panel-section">
      <legend>Area</legend>
      <label><input type="checkbox" checked> City Core</label>
      <label><input type="checkbox" checked> Urban Sprawl</label>
      <label><input type="checkbox" checked> Industrial Fringe</label>
      <label><input type="checkbox" checked> Private Enclave</label>
      <label><input type="checkbox" checked> Frontier Zone</label>
    </fieldset>

    <fieldset class="panel-section">
      <legend>Priority</legend>
      <label><input type="checkbox" checked> Bulletin</label>
      <label><input type="checkbox" checked> Advisory</label>
      <label><input type="checkbox" checked> Alert</label>
      <label><input type="checkbox" checked> Warning</label>
      <label><input type="checkbox" checked> Emergency</label>
    </fieldset>

    <fieldset class="panel-section">
      <legend>Source</legend>
      <label><input type="checkbox" checked> Corporate</label>
      <label><input type="checkbox" checked> Civic Notice</label>
      <label><input type="checkbox" checked> Press Report</label>
      <label><input type="checkbox" checked> Eyewitness</label>
      <label><input type="checkbox" checked> Scanner Traffic</label>
      <label><input type="checkbox" checked> Anonymous Leak</label>
      <label><input type="checkbox" checked> Underground</label>
    </fieldset>
  </div>

  <fieldset class="panel-section panel-section-inline">
    <legend>Time</legend>
    <label><input type="radio" name="time" checked> Now</label>
    <label><input type="radio" name="time"> Last Day</label>
    <label><input type="radio" name="time"> All Time</label>
  </fieldset>

  <div class="panel-actions">
    <button type="button">Apply Filters</button>
    <button type="reset" class="secondary-action">Reset</button>
  </div>
</form>
`
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
    <label class="field-label">
      Headline
      <input name="headline" placeholder="Headline" required>
    </label>
    <label class="field-label">
      Signal body
      <textarea name="body" placeholder="Body text"></textarea>
    </label>
  </fieldset>

  <div class="panel-grid compact-grid">
    <label class="field-label">
      Category
      <select name="category">
        <option>Business</option>
        <option>Community</option>
        <option>Crime</option>
        <option>Infrastructure</option>
        <option>Politics</option>
        <option>Culture</option>
      </select>
    </label>

    <label class="field-label">
      Area
      <select name="area">
        <option>City Core</option>
        <option>Urban Sprawl</option>
        <option>Industrial Fringe</option>
        <option>Private Enclave</option>
        <option>Frontier Zone</option>
      </select>
    </label>

    <label class="field-label">
      Source type
      <select name="sourceType">
        <option>Corporate</option>
        <option>Civic Notice</option>
        <option>Press Report</option>
        <option>Eyewitness</option>
        <option>Scanner Traffic</option>
        <option>Anonymous Leak</option>
        <option>Underground</option>
      </select>
    </label>

    <label class="field-label">
      Priority
      <select name="priority">
        <option>Bulletin</option>
        <option>Advisory</option>
        <option>Alert</option>
        <option>Warning</option>
        <option>Emergency</option>
      </select>
    </label>
  </div>

  <label class="field-label">
    Source
    <input name="source" placeholder="Name, outlet, scanner or anonymous handle">
  </label>

  <div class="panel-actions">
    <button type="button">Transmit</button>
    <span class="panel-note">Submission transport is not connected yet.</span>
  </div>
</form>
`
  };

  return type === "filter" ? filterPanel : submitPanel;
}