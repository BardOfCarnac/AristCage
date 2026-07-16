/*==================================================
  PR 55 — MOBILE STORY DETAIL PARITY
==================================================*/

(() => {
  function detailRow(label, value) {
    return `
      <div class="detail-label">${escapeHTML(label)}</div>
      <div class="detail-value">${escapeHTML(value || "—")}</div>`;
  }

  function detailMarkup(story) {
    return `
      <div class="mobile-story-details" aria-label="Transmission details">
        ${detailRow("Category", story.category)}
        ${detailRow("Area", story.area)}
        ${detailRow("Source type", story.sourceType)}
        ${detailRow("Priority", story.priorityLabel)}
        ${detailRow("Time scope", story.timeScope)}
      </div>`;
  }

  function enhanceStory(entry) {
    if (!entry || entry.classList.contains("panel")) return;
    if (entry.querySelector(".mobile-story-details")) return;

    const story = NCN_ENTRIES.find(item => item.id === entry.dataset.entryId);
    const body = entry.querySelector(".expansion-zone > .body");

    if (!story || !body) return;
    body.insertAdjacentHTML("beforeend", detailMarkup(story));
  }

  function enhanceAll(root = document) {
    root.querySelectorAll?.("#feed .entry:not(.panel)").forEach(enhanceStory);
  }

  enhanceAll();

  new MutationObserver(records => {
    records.forEach(record => {
      record.addedNodes.forEach(node => {
        if (!(node instanceof Element)) return;
        if (node.matches("#feed .entry:not(.panel)")) enhanceStory(node);
        enhanceAll(node);
      });
    });
  }).observe(document.querySelector("#feed"), {
    childList: true,
    subtree: true
  });
})();
