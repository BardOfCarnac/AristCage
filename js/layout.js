/*==================================================
  LAYOUT
==================================================*/

let NCN_LAYOUT_TRANSITIONING = false;

function getAffectedEntries(changedEntry) {
  const changedTop = changedEntry.getBoundingClientRect().top;

  return [...document.querySelectorAll(".entry")]
    .filter(entry => {
      if (entry === changedEntry) return false;
      return entry.getBoundingClientRect().top > changedTop;
    });
}

function resolveDisplacedEntries(entries) {
  const run = () => resolve(getDisplacedProjectionObjects(entries));

  if (NCN_CONFIG.motion.reduced) {
    run();
    return;
  }

  window.setTimeout(run, NCN_CONFIG.motion.displacedResolveDelay);
}

function expandEntryLayout(entry, onComplete) {
  const entryId = entry.dataset.entryId;
  const affectedEntries = getAffectedEntries(entry);

  dismiss(getExpandDismissObjects(entry, affectedEntries), () => {
    expandEntry(entryId);
    entry.classList.add("expanded");

    requestAnimationFrame(() => {
      updateProjection();
      resolve(getExpandResolveObjects(entry));
      resolveDisplacedEntries(affectedEntries);
      if (typeof onComplete === "function") onComplete();
    });
  });
}

function collapseEntryLayout(entry, onComplete) {
  const entryId = entry.dataset.entryId;
  const affectedEntries = getAffectedEntries(entry);

  dismiss(getCollapseDismissObjects(entry, affectedEntries), () => {
    collapseEntry(entryId);
    entry.classList.remove("expanded");

    requestAnimationFrame(() => {
      updateProjection();
      resolve(getCollapseResolveObjects(entry));
      resolveDisplacedEntries(affectedEntries);
      if (typeof onComplete === "function") onComplete();
    });
  });
}

function toggleEntryLayout(changedEntry) {
  if (NCN_LAYOUT_TRANSITIONING) return;
  NCN_LAYOUT_TRANSITIONING = true;

  const entryId = changedEntry.dataset.entryId;
  const finish = () => {
    NCN_LAYOUT_TRANSITIONING = false;
  };

  if (isExpanded(entryId)) {
    collapseEntryLayout(changedEntry, finish);
    return;
  }

  const openEntry = document.querySelector(".entry.expanded:not(.panel)");

  if (openEntry && openEntry !== changedEntry) {
    collapseEntryLayout(openEntry, () => {
      expandEntryLayout(changedEntry, finish);
    });
    return;
  }

  expandEntryLayout(changedEntry, finish);
}