/*==================================================
  PROJECTION ENGINE V2 — ARTICLE LAYOUT

  Identity remains illuminated on the changing card.
  Entries displaced by its geometry glow down before
  reflow and resolve only after reaching the new layout.
==================================================*/

let NCN_LAYOUT_TRANSITIONING = false;

function waitForLayout() {
  return new Promise(resolvePromise => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolvePromise);
    });
  });
}

function setEntryTransitionState(entry, state) {
  entry.dataset.transitionState = state;
}

function stabilizeEntryIdentity(entry) {
  showImmediately(getEntryIdentityObjects(entry));
}

function getAffectedEntries(changedEntry, excludedEntry = null) {
  const changedTop = changedEntry.getBoundingClientRect().top;

  return [...feed.querySelectorAll(".entry:not(.panel)")].filter(entry => {
    if (entry === changedEntry || entry === excludedEntry) return false;
    return entry.getBoundingClientRect().top > changedTop;
  });
}

function getAffectedProjectionObjects(entries) {
  return entries.flatMap(getVisibleProjectionObjects).filter(Boolean);
}

async function openArticle(entry) {
  if (!entry || entry.classList.contains("expanded")) return;

  const entryId = entry.dataset.entryId;
  const structure = getEntryStructureObjects(entry);
  const body = getEntryBodyObjects(entry);
  const affectedEntries = getAffectedEntries(entry);
  const affectedObjects = getAffectedProjectionObjects(affectedEntries);

  setEntryTransitionState(entry, "opening");
  stabilizeEntryIdentity(entry);
  cleanProjectionObjects([...structure, ...body, ...affectedObjects]);
  showImmediately([...structure, ...affectedObjects]);

  await glowDown([...structure, ...affectedObjects]);

  expandEntry(entryId);
  entry.classList.add("expanded");

  await waitForLayout();
  updateProjection();
  stabilizeEntryIdentity(entry);

  await glowUp([...structure, ...body, ...affectedObjects]);
  setEntryTransitionState(entry, "open");
}

async function closeArticle(entry, excludedEntry = null) {
  if (!entry || !entry.classList.contains("expanded")) return;

  const entryId = entry.dataset.entryId;
  const structure = getEntryStructureObjects(entry);
  const body = getEntryBodyObjects(entry);
  const affectedEntries = getAffectedEntries(entry, excludedEntry);
  const affectedObjects = getAffectedProjectionObjects(affectedEntries);

  setEntryTransitionState(entry, "closing");
  stabilizeEntryIdentity(entry);
  cleanProjectionObjects([...structure, ...body, ...affectedObjects]);
  showImmediately([...structure, ...body, ...affectedObjects]);

  await glowDown([...structure, ...body, ...affectedObjects]);

  collapseEntry(entryId);
  entry.classList.remove("expanded");

  await waitForLayout();
  updateProjection();
  stabilizeEntryIdentity(entry);

  await glowUp([...structure, ...affectedObjects]);
  setEntryTransitionState(entry, "closed");
}

async function switchArticle(openEntry, nextEntry) {
  if (!openEntry || !nextEntry || openEntry === nextEntry) return;

  stabilizeEntryIdentity(nextEntry);
  showImmediately(getVisibleProjectionObjects(nextEntry));

  await closeArticle(openEntry, nextEntry);
  await waitForLayout();

  stabilizeEntryIdentity(nextEntry);
  showImmediately(getVisibleProjectionObjects(nextEntry));
  await openArticle(nextEntry);
}

async function toggleEntryLayout(changedEntry) {
  if (NCN_LAYOUT_TRANSITIONING || NCN_FILTER_TRANSITIONING) return;
  NCN_LAYOUT_TRANSITIONING = true;

  try {
    const entryId = changedEntry.dataset.entryId;

    if (isExpanded(entryId)) {
      await closeArticle(changedEntry);
      return;
    }

    const openEntry = feed.querySelector(".entry.expanded:not(.panel)");

    if (openEntry && openEntry !== changedEntry) {
      await switchArticle(openEntry, changedEntry);
      return;
    }

    await openArticle(changedEntry);
  } finally {
    NCN_LAYOUT_TRANSITIONING = false;
  }
}
