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

  The changed card now powers down and resolves as one
  ordered object group. This prevents the frame from
  appearing at its resting colour before its contents.
==================================================*/

function getExpandDismissObjects(entry, affectedEntries) {
  return [
    ...getEntryCoreObjects(entry),
    ...getDisplacedProjectionObjects(affectedEntries)
  ].filter(Boolean);
}

function getExpandResolveObjects(entry) {
  return getVisibleProjectionObjects(entry);
}

function getCollapseDismissObjects(entry, affectedEntries) {
  return [
    ...getVisibleProjectionObjects(entry),
    ...getDisplacedProjectionObjects(affectedEntries)
  ].filter(Boolean);
}

function getCollapseResolveObjects(entry) {
  return getEntryCoreObjects(entry);
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
