/*==================================================
  PRIORITY SIGNAL PALETTE
==================================================*/

(() => {
  const feed = document.querySelector("#feed");
  if (!feed) return;

  const PRIORITY_CLASSES = [
    "priority-bulletin",
    "priority-advisory",
    "priority-alert",
    "priority-warning",
    "priority-emergency"
  ];

  const PANEL_PRIORITIES = {
    "panel-filter": "Alert",
    "panel-submit": "Warning"
  };

  function priorityClass(label = "") {
    const normalized = String(label).trim().toLowerCase();

    return PRIORITY_CLASSES.includes(`priority-${normalized}`)
      ? `priority-${normalized}`
      : "priority-bulletin";
  }

  function priorityLabelForEntry(entry) {
    const id = entry.dataset.entryId;

    if (PANEL_PRIORITIES[id]) {
      return PANEL_PRIORITIES[id];
    }

    return NCN_ENTRIES.find(item => item.id === id)?.priorityLabel || "Bulletin";
  }

  function applyPriorityPalette(root = feed) {
    root.querySelectorAll(".entry").forEach(entry => {
      const rail = entry.querySelector(".priority");
      if (!rail) return;

      rail.classList.remove(...PRIORITY_CLASSES);
      rail.classList.add(priorityClass(priorityLabelForEntry(entry)));
    });
  }

  new MutationObserver(() => applyPriorityPalette()).observe(feed, {
    childList: true,
    subtree: true
  });

  applyPriorityPalette();
})();
