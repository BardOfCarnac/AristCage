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

function getEntryIdentityObjects(entry) {
  return [
    entry.querySelector(".meta"),
    entry.querySelector(".headline")
  ].filter(Boolean);
}

function getEntryChangingObjects(entry) {
  return [
    entry.querySelector(".frame"),
    entry.querySelector(".priority"),
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

  The headline and metadata form the persistent story
  identity. They stay visible while the card frame,
  priority, tags and body power down and rebuild around
  them. Displaced stories still use the full projection
  lifecycle while moving into their new positions.
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
  INITIAL LOAD
==================================================*/

function activatePresence() {
  resolve(
    [...document.querySelectorAll(".entry")]
      .flatMap(getVisibleProjectionObjects)
  );
}
