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

  if (expanding) {
    dismissForExpand(changedEntry, affectedEntries, () => {
      expandEntry(entryId);
      changedEntry.classList.add("expanded");

      requestAnimationFrame(() => {
        updateProjection();
        resolveExpandedBody(changedEntry);

        setTimeout(() => {
          resolveDisplacedEntries(affectedEntries);
        }, 180);
      });
    });

    return;
  }

  dismissForCollapse(changedEntry, affectedEntries, () => {
    collapseEntry(entryId);
    changedEntry.classList.remove("expanded");

    requestAnimationFrame(() => {
      updateProjection();
      resolveCollapsedEntry(changedEntry);

      setTimeout(() => {
        resolveDisplacedEntries(affectedEntries);
      }, 180);
    });
  });
}
