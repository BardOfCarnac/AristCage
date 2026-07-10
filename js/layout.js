/*==================================================
  LAYOUT
==================================================*/

const NCN_TRANSITIONING_ENTRIES = new WeakSet();

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

function toggleEntryLayout(changedEntry) {
  if (NCN_TRANSITIONING_ENTRIES.has(changedEntry)) return;

  NCN_TRANSITIONING_ENTRIES.add(changedEntry);

  const entryId = changedEntry.dataset.entryId;
  const affectedEntries = getAffectedEntries(changedEntry);
  const expanding = !isExpanded(entryId);

  const finish = () => {
    NCN_TRANSITIONING_ENTRIES.delete(changedEntry);
  };

  if (expanding) {
    dismiss(getExpandDismissObjects(changedEntry, affectedEntries), () => {
      expandEntry(entryId);
      changedEntry.classList.add("expanded");

      requestAnimationFrame(() => {
        updateProjection();
        resolve(getExpandResolveObjects(changedEntry));
        resolveDisplacedEntries(affectedEntries);
        finish();
      });
    });

    return;
  }

  dismiss(getCollapseDismissObjects(changedEntry, affectedEntries), () => {
    collapseEntry(entryId);
    changedEntry.classList.remove("expanded");

    requestAnimationFrame(() => {
      updateProjection();
      resolve(getCollapseResolveObjects(changedEntry));
      resolveDisplacedEntries(affectedEntries);
      finish();
    });
  });
}
