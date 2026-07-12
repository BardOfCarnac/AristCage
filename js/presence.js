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

  Headline and classification tags are persistent story
  identity. They remain visible while the structural frame,
  corners, priority bar and body change around them.
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
  INITIAL LOAD / IMMEDIATE SETTLE
==================================================*/

function activatePresence() {
  resolve(
    [...document.querySelectorAll(".entry")]
      .flatMap(getVisibleProjectionObjects)
  );
}

function settlePresence() {
  [...document.querySelectorAll(".entry")]
    .flatMap(getVisibleProjectionObjects)
    .forEach(object => {
      object.classList.remove(
        "entering",
        "leaving",
        "energy-up",
        "energy-down",
        "gone"
      );
      object.classList.add("present");
    });
}
