/*==================================================
  ROOT
==================================================*/

const feed = document.querySelector("#feed");

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

    const expanded =
        entry.type === "panel" ||
        isExpanded(entry.id);

    return `

<article
    class="entry present ${expanded ? "expanded" : ""} ${entry.type === "panel" ? "panel" : ""}"
    data-entry-id="${entry.id}">

    <div class="part priority priority-${entry.priority}"></div>

    <div class="projection-plate">

        <div class="part frame"></div>

        <div class="entry-content">

            <div class="part meta">
                ${entry.meta}
            </div>

            <h2 class="part headline">
                ${entry.headline}
            </h2>

            <div class="part tags">
                ${entry.tags}
            </div>

        </div>

    </div>

    <div class="expansion-zone">

        <div class="part body">
            ${entry.body}
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

    return type === "filter"
        ? filterPanel
        : submitPanel;

}
