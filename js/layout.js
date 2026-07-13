/*==================================================
  SLOT LAYOUT ENGINE

  One slot is half the minimum collapsed article height.
  Every entry receives an explicit start and whole-number span.
==================================================*/

let NCN_LAYOUT_TRANSITIONING = false;

function waitForLayout() {
  return new Promise(resolvePromise => {
    requestAnimationFrame(() => requestAnimationFrame(resolvePromise));
  });
}

function getSlotHeight() {
  const raw = getComputedStyle(feed).getPropertyValue("--slot-height");
  return Math.max(1, parseFloat(raw) || 46);
}

function getSlotEntries() {
  return [...feed.querySelectorAll(".entry")];
}

function captureSlotAllocation(entries = getSlotEntries()) {
  const allocation = new Map();

  entries.forEach(entry => {
    allocation.set(entry.dataset.entryId, {
      start: Number(entry.dataset.slotStart || 0),
      span: Number(entry.dataset.slotSpan || 0)
    });
  });

  return allocation;
}

function measureEntrySpan(entry, expanded) {
  const slotHeight = getSlotHeight();
  const wasExpanded = entry.classList.contains("expanded");
  const oldStart = entry.style.getPropertyValue("--slot-start");
  const oldSpan = entry.style.getPropertyValue("--slot-span");

  entry.classList.add("slot-measuring");
  entry.classList.toggle("expanded", expanded || entry.classList.contains("panel"));
  entry.style.removeProperty("--slot-start");
  entry.style.removeProperty("--slot-span");

  const plate = entry.querySelector(".projection-plate");
  const measuredHeight = Math.ceil(plate?.scrollHeight || entry.scrollHeight || slotHeight * 2);
  const span = Math.max(2, Math.ceil((measuredHeight + 12) / slotHeight));

  entry.classList.toggle("expanded", wasExpanded);
  entry.classList.remove("slot-measuring");

  if (oldStart) entry.style.setProperty("--slot-start", oldStart);
  if (oldSpan) entry.style.setProperty("--slot-span", oldSpan);

  return span;
}

function calculateSlotAllocation(expandedOverrides = new Map()) {
  const allocation = new Map();
  let nextStart = 1;

  getSlotEntries().forEach(entry => {
    const id = entry.dataset.entryId;
    const expanded = expandedOverrides.has(id)
      ? expandedOverrides.get(id)
      : entry.classList.contains("expanded") || entry.classList.contains("panel");
    const span = measureEntrySpan(entry, expanded);

    allocation.set(id, { start: nextStart, span });
    nextStart += span;
  });

  return allocation;
}

function commitSlotAllocation(allocation) {
  getSlotEntries().forEach(entry => {
    const slot = allocation.get(entry.dataset.entryId);
    if (!slot) return;

    entry.dataset.slotStart = String(slot.start);
    entry.dataset.slotSpan = String(slot.span);
    entry.style.setProperty("--slot-start", String(slot.start));
    entry.style.setProperty("--slot-span", String(slot.span));
  });
}

function getChangedSlotEntries(before, after) {
  return getSlotEntries().filter(entry => {
    const id = entry.dataset.entryId;
    const oldSlot = before.get(id);
    const newSlot = after.get(id);

    if (!oldSlot || !newSlot) return true;
    return oldSlot.start !== newSlot.start || oldSlot.span !== newSlot.span;
  });
}

function getSlotProjectionObjects(entries) {
  return entries.flatMap(getVisibleProjectionObjects).filter(Boolean);
}

function setExpandedState(entry, expanded) {
  const id = entry.dataset.entryId;

  if (expanded) {
    expandEntry(id);
    entry.classList.add("expanded");
  } else {
    collapseEntry(id);
    entry.classList.remove("expanded");
  }
}

async function applySlotTransaction(expandedOverrides) {
  const before = captureSlotAllocation();
  const after = calculateSlotAllocation(expandedOverrides);
  const changedEntries = getChangedSlotEntries(before, after);
  const oldObjects = getSlotProjectionObjects(changedEntries);

  await glowDown(oldObjects);

  expandedOverrides.forEach((expanded, id) => {
    const entry = feed.querySelector(`.entry[data-entry-id="${CSS.escape(id)}"]`);
    if (entry) setExpandedState(entry, expanded);
  });

  commitSlotAllocation(after);
  await waitForLayout();
  updateProjection();

  changedEntries.forEach(entry => {
    showImmediately(getEntryIdentityObjects(entry));
  });

  await glowUp(getSlotProjectionObjects(changedEntries));
}

function initializeSlotLayout() {
  commitSlotAllocation(calculateSlotAllocation());
}

async function toggleEntryLayout(changedEntry) {
  if (NCN_LAYOUT_TRANSITIONING || NCN_FILTER_TRANSITIONING || NCN_PANEL_TRANSITIONING) return;
  NCN_LAYOUT_TRANSITIONING = true;

  try {
    const overrides = new Map();
    const changedId = changedEntry.dataset.entryId;
    const currentlyExpanded = isExpanded(changedId);
    const openEntry = feed.querySelector(".entry.expanded:not(.panel)");

    if (openEntry && openEntry !== changedEntry) {
      overrides.set(openEntry.dataset.entryId, false);
    }

    overrides.set(changedId, !currentlyExpanded);
    await applySlotTransaction(overrides);
  } finally {
    NCN_LAYOUT_TRANSITIONING = false;
  }
}
