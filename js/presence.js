/*==================================================
  PRESENCE
==================================================*/

function resolve(objects) {
  Projection.resolve(objects);
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
    entry.querySelector(".priority"),
    entry.querySelector(".meta"),
    entry.querySelector(".headline"),
    entry.querySelector(".tags")
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
    entry.querySelector(".priority"),
    ...getDisplacedProjectionObjects(affectedEntries)
  ].filter(Boolean);
}

function getExpandResolveObjects(entry) {
  return [
    entry.querySelector(".priority"),
    getEntryBodyObject(entry)
  ].filter(Boolean);
}

function getCollapseDismissObjects(entry, affectedEntries) {
  return [
    entry.querySelector(".priority"),
    getEntryBodyObject(entry),
    ...getDisplacedProjectionObjects(affectedEntries)
  ].filter(Boolean);
}

function getCollapseResolveObjects(entry) {
  return [
    entry.querySelector(".priority")
  ].filter(Boolean);
}

/*==================================================
  INITIAL LOAD
==================================================*/

function activatePresence() {
  resolve(
    [...document.querySelectorAll(".entry")]
      .flatMap(getVisibleProjectionObjects)
  );
}
