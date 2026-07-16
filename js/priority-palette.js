/*==================================================
  PRIORITY ENERGY PALETTE
==================================================*/

(() => {
  const feed = document.querySelector("#feed");
  if (!feed) return;

  const PRIORITY_CLASSES = [
    "priority-bulletin",
    "priority-advisory",
    "priority-alert",
    "priority-warning",
    "priority-emergency",
    "priority-panel-filter",
    "priority-panel-submit"
  ];

  const PANEL_PRIORITIES = {
    "panel-filter": "priority-panel-filter",
    "panel-submit": "priority-panel-submit"
  };

  function priorityClass(label = "") {
    const normalized = String(label).trim().toLowerCase();

    return PRIORITY_CLASSES.includes(`priority-${normalized}`)
      ? `priority-${normalized}`
      : "priority-bulletin";
  }

  function priorityClassForEntry(entry) {
    const id = entry.dataset.entryId;

    if (PANEL_PRIORITIES[id]) {
      return PANEL_PRIORITIES[id];
    }

    const label = NCN_ENTRIES.find(item => item.id === id)?.priorityLabel || "Bulletin";
    return priorityClass(label);
  }

  function applyPriorityPalette(root = feed) {
    root.querySelectorAll(".entry").forEach(entry => {
      const rail = entry.querySelector(".priority");
      if (!rail) return;

      rail.classList.remove(...PRIORITY_CLASSES);
      rail.classList.add(priorityClassForEntry(entry));
    });
  }

  new MutationObserver(() => applyPriorityPalette()).observe(feed, {
    childList: true,
    subtree: true
  });

  applyPriorityPalette();
})();
