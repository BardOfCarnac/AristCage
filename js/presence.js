/*==================================================
  PRESENCE
==================================================*/

function resolve(objects) {
  Projection.resolve(objects);
}

function reveal(objects) {
  Projection.reveal(objects);
}

function dismiss(objects, onComplete) {
  Projection.dismiss(objects, onComplete);
}

/*==================================================
  PROJECTION OBJECT HELPERS
==================================================*/

function getEntryCoreObjects(entry) {
  return [
    entry.querySelector(".frame"),
    entry.querySelector(".corners"),
    entry.querySelector(".priority"),
    entry.querySelector(".meta"),
    entry.querySelector(".headline"),
    entry.querySelector(".tags")
  ].filter(Boolean);
}

function getEntryChangingObjects(entry) {
  return [
    entry.querySelector(".frame"),
    entry.querySelector(".corners"),
    entry.querySelector(".priority")
  ].filter(Boolean);
}

function getEntryBodyObject(entry) {
  return entry.querySelector(".body");
}

function getVisibleProjectionObjects(entry) {
  const objects = getEntryCoreObjects(entry);

  if (entry.classList.contains("expanded") || entry.classList.contains("panel")) {
    objects.push(getEntryBodyObject(entry));
  }

  return objects.filter(Boolean);
}

function getDisplacedProjectionObjects(entries) {
  return entries.flatMap(getVisibleProjectionObjects).filter(Boolean);
}

/*==================================================
  ENTRY CHANGE GROUPS
==================================================*/

function getExpandDismissObjects(entry, affectedEntries) {
  return [
    ...getEntryChangingObjects(entry),
    ...getDisplacedProjectionObjects(affectedEntries)
  ].filter(Boolean);
}

function getExpandResolveObjects(entry) {
  return [
    ...getEntryChangingObjects(entry),
    getEntryBodyObject(entry)
  ].filter(Boolean);
}

function getCollapseDismissObjects(entry, affectedEntries) {
  return [
    ...getEntryChangingObjects(entry),
    getEntryBodyObject(entry),
    ...getDisplacedProjectionObjects(affectedEntries)
  ].filter(Boolean);
}

function getCollapseResolveObjects(entry) {
  return getEntryChangingObjects(entry);
}

/*==================================================
  INITIAL / IMMEDIATE LOAD
==================================================*/

function activatePresence(immediate = false) {
  const objects = [...document.querySelectorAll(".entry")]
    .flatMap(getVisibleProjectionObjects);

  if (immediate) {
    reveal(objects);
    return;
  }

  resolve(objects);
}