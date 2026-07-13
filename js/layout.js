/*==================================================
  PROJECTION TRANSACTION ENGINE

  Visible objects never move. A transaction dismisses every
  changing projection, commits the new layout while those
  projections are gone, then resolves the final scene.
==================================================*/

let NCN_PROJECTION_TRANSITIONING = false;

function waitForLayout() {
  return new Promise(resolvePromise => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolvePromise);
    });
  });
}

function readProjectionObjects(source) {
  const objects = typeof source === "function" ? source() : source;
  return [...new Set((objects || []).filter(Boolean))];
}

function transactionTracingEnabled() {
  return document.documentElement.classList.contains("diagnostics-on");
}

function traceTransaction(name, phase, objects = null) {
  if (!transactionTracingEnabled()) return;

  if (objects) {
    console.info(`[NCN transaction:${name}] ${phase}: ${objects.length} objects`);
  } else {
    console.info(`[NCN transaction:${name}] ${phase}`);
  }
}

async function runProjectionTransaction({
  name = "unnamed",
  keep = [],
  dismiss = [],
  commit = () => {},
  resolve = []
}) {
  if (NCN_PROJECTION_TRANSITIONING) return false;
  NCN_PROJECTION_TRANSITIONING = true;

  try {
    const keepObjects = readProjectionObjects(keep);
    const dismissObjects = readProjectionObjects(dismiss)
      .filter(object => !keepObjects.includes(object));

    traceTransaction(name, "KEEP", keepObjects);
    showImmediately(keepObjects);

    traceTransaction(name, "DISMISS", dismissObjects);
    await glowDown(dismissObjects);

    traceTransaction(name, "COMMIT");
    await commit();
    await waitForLayout();
    updateProjection();
    showImmediately(readProjectionObjects(keep));

    const resolveObjects = readProjectionObjects(resolve)
      .filter(object => !readProjectionObjects(keep).includes(object));

    traceTransaction(name, "RESOLVE", resolveObjects);
    await glowUp(resolveObjects);
    traceTransaction(name, "DONE");
    return true;
  } finally {
    NCN_PROJECTION_TRANSITIONING = false;
  }
}

/*==================================================
  ARTICLE GEOMETRY
==================================================*/

function getStoryEntries() {
  return [...feed.querySelectorAll(".entry:not(.panel)")];
}

function getEntriesBelow(entry, excludedEntry = null) {
  const entryTop = entry.getBoundingClientRect().top;

  return getStoryEntries().filter(candidate => {
    if (candidate === entry || candidate === excludedEntry) return false;
    return candidate.getBoundingClientRect().top > entryTop;
  });
}

function getRenderedEntry(entryId) {
  return feed.querySelector(
    `.entry[data-entry-id="${CSS.escape(entryId)}"]`
  );
}

/*==================================================
  ARTICLE TRANSACTIONS
==================================================*/

async function expandArticleWithProjection(entry) {
  if (!entry || entry.classList.contains("expanded")) return;

  const entryId = entry.dataset.entryId;
  const affectedEntries = getEntriesBelow(entry);

  await runProjectionTransaction({
    name: `expand:${entryId}`,
    keep: () => getEntryIdentityObjects(entry),
    dismiss: () => [
      ...getEntryStructureObjects(entry),
      ...getProjectionObjectsForEntries(affectedEntries)
    ],
    commit: () => {
      hideImmediately(getEntryBodyObjects(entry));
      expandEntry(entryId);
      entry.classList.add("expanded");
    },
    resolve: () => [
      ...getEntryStructureObjects(entry),
      ...getEntryBodyObjects(entry),
      ...getProjectionObjectsForEntries(affectedEntries)
    ]
  });
}

async function collapseArticleWithProjection(entry) {
  if (!entry || !entry.classList.contains("expanded")) return;

  const entryId = entry.dataset.entryId;
  const affectedEntries = getEntriesBelow(entry);

  await runProjectionTransaction({
    name: `collapse:${entryId}`,
    keep: () => getEntryIdentityObjects(entry),
    dismiss: () => [
      ...getEntryStructureObjects(entry),
      ...getEntryBodyObjects(entry),
      ...getProjectionObjectsForEntries(affectedEntries)
    ],
    commit: () => {
      collapseEntry(entryId);
      entry.classList.remove("expanded");
    },
    resolve: () => [
      ...getEntryStructureObjects(entry),
      ...getProjectionObjectsForEntries(affectedEntries)
    ]
  });
}

async function switchArticleWithProjection(openEntry, nextEntry) {
  if (!openEntry || !nextEntry || openEntry === nextEntry) return;

  const openId = openEntry.dataset.entryId;
  const nextId = nextEntry.dataset.entryId;
  const openTop = openEntry.getBoundingClientRect().top;
  const nextTop = nextEntry.getBoundingClientRect().top;
  const anchorEntry = nextTop < openTop ? nextEntry : openEntry;
  const keepEntry = nextTop < openTop ? nextEntry : openEntry;
  const affectedEntries = getEntriesBelow(anchorEntry);

  await runProjectionTransaction({
    name: `switch:${openId}->${nextId}`,
    keep: () => getEntryIdentityObjects(keepEntry),
    dismiss: () => [
      ...getEntryStructureObjects(anchorEntry),
      ...(anchorEntry === openEntry ? getEntryBodyObjects(openEntry) : []),
      ...getProjectionObjectsForEntries(affectedEntries)
    ],
    commit: () => {
      hideImmediately(getEntryBodyObjects(nextEntry));
      collapseEntry(openId);
      openEntry.classList.remove("expanded");
      expandEntry(nextId);
      nextEntry.classList.add("expanded");
    },
    resolve: () => {
      const currentOpen = getRenderedEntry(openId);
      const currentNext = getRenderedEntry(nextId);
      const currentAffected = getEntriesBelow(
        nextTop < openTop ? currentNext : currentOpen
      );

      return [
        ...getEntryStructureObjects(currentOpen),
        ...getEntryStructureObjects(currentNext),
        ...getEntryBodyObjects(currentNext),
        ...getProjectionObjectsForEntries(currentAffected)
      ];
    }
  });
}

async function toggleEntryLayout(changedEntry) {
  if (NCN_PROJECTION_TRANSITIONING) return;

  const entryId = changedEntry.dataset.entryId;

  if (isExpanded(entryId)) {
    await collapseArticleWithProjection(changedEntry);
    return;
  }

  const openEntry = feed.querySelector(".entry.expanded:not(.panel)");

  if (openEntry && openEntry !== changedEntry) {
    await switchArticleWithProjection(openEntry, changedEntry);
    return;
  }

  await expandArticleWithProjection(changedEntry);
}
