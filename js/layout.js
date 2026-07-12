/*==================================================
  PROJECTION ENGINE V2 — ARTICLE LAYOUT

  Identity remains illuminated. Only the changing card's
  structure/body participates in an open or close lifecycle.
  Neighbouring cards are allowed to reflow without fading.
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

async function openArticle(entry) {
  if (!entry || entry.classList.contains("expanded")) return;

  const entryId = entry.dataset.entryId;
  const structure = getEntryStructureObjects(entry);
  const body = getEntryBodyObjects(entry);

  setEntryTransitionState(entry, "opening");
  stabilizeEntryIdentity(entry);
  cleanProjectionObjects([...structure, ...body]);
  showImmediately(structure);

  await glowDown(structure);

  expandEntry(entryId);
  entry.classList.add("expanded");

  await waitForLayout();
  updateProjection();
  stabilizeEntryIdentity(entry);

  await glowUp([...structure, ...body]);
  setEntryTransitionState(entry, "open");
}

async function closeArticle(entry) {
  if (!entry || !entry.classList.contains("expanded")) return;

  const entryId = entry.dataset.entryId;
  const structure = getEntryStructureObjects(entry);
  const body = getEntryBodyObjects(entry);

  setEntryTransitionState(entry, "closing");
  stabilizeEntryIdentity(entry);
  cleanProjectionObjects([...structure, ...body]);
  showImmediately([...structure, ...body]);

  await glowDown([...structure, ...body]);

  collapseEntry(entryId);
  entry.classList.remove("expanded");

  await waitForLayout();
  updateProjection();
  stabilizeEntryIdentity(entry);

  await glowUp(structure);
  setEntryTransitionState(entry, "closed");
}

async function switchArticle(openEntry, nextEntry) {
  if (!openEntry || !nextEntry || openEntry === nextEntry) return;

  stabilizeEntryIdentity(nextEntry);
  showImmediately(getEntryStructureObjects(nextEntry));

  await closeArticle(openEntry);
  await waitForLayout();

  stabilizeEntryIdentity(nextEntry);
  showImmediately(getEntryStructureObjects(nextEntry));
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

    const openEntry = document.querySelector(".entry.expanded:not(.panel)");

    if (openEntry && openEntry !== changedEntry) {
      await switchArticle(openEntry, changedEntry);
      return;
    }

    await openArticle(changedEntry);
  } finally {
    NCN_LAYOUT_TRANSITIONING = false;
  }
}
