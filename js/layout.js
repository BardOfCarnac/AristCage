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
  const body = changedEntry.querySelector(".body");
  const priority = changedEntry.querySelector(".priority");
  const affectedEntries = getAffectedEntries(changedEntry);
  const expanding = !isExpanded(entryId);

  if (expanding) {
    dismiss([priority, ...affectedEntries], () => {
      expandEntry(entryId);
      changedEntry.classList.add("expanded");

      requestAnimationFrame(() => {
        updateProjection();

        resolve([priority, body]);
        resolve(affectedEntries);
      });
    });

    return;
  }

  dismiss([body, priority], () => {
    dismiss(affectedEntries, () => {
      collapseEntry(entryId);
      changedEntry.classList.remove("expanded");

      requestAnimationFrame(() => {
        updateProjection();

        resolve([priority]);
        resolve(affectedEntries);
      });
    });
  });
}
