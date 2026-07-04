/*==================================================
  LAYOUT
==================================================*/

function getAffectedEntries(changedEntry) {
  const changedTop = changedEntry.getBoundingClientRect().top;

  return [...document.querySelectorAll(".entry")]
    .filter(entry => {
      if (entry === changedEntry) return false;
      return entry.getBoundingClientRect().top > changedTop;
    });
}

function toggleEntryLayout(changedEntry) {
  const entryId = changedEntry.dataset.entryId;
  const affectedEntries = getAffectedEntries(changedEntry);
  const expanding = !isExpanded(entryId);

  dismissEntryChange(changedEntry, affectedEntries, () => {
    if (expanding) {
      expandEntry(entryId);
      changedEntry.classList.add("expanded");
    } else {
      collapseEntry(entryId);
      changedEntry.classList.remove("expanded");
    }

    requestAnimationFrame(() => {
      updateProjection();
      resolveEntryChange(changedEntry, affectedEntries);
    });
  });
}
