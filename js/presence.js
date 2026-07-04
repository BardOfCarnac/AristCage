/*==================================================
  PRESENCE
==================================================*/

const GLOW_DOWN_TIME = 700;
const FADE_OUT_TIME = 480;
const RESOLVE_STAGGER = 60;

function resolve(objects) {
  const items = objects.filter(Boolean);

  items.forEach((object, index) => {
    setTimeout(() => {
      object.classList.remove("leaving", "energy-down", "energy-up");
      object.classList.add("present");

      requestAnimationFrame(() => {
        object.classList.add("energy-up");
      });
    }, index * RESOLVE_STAGGER);
  });
}

function dismiss(objects, onComplete) {
  const items = objects.filter(Boolean);

  if (!items.length) {
    if (typeof onComplete === "function") onComplete();
    return;
  }

  items.forEach(object => {
    object.classList.remove("energy-up");
    object.classList.add("energy-down");
  });

  setTimeout(() => {
    items.forEach(object => {
      object.classList.remove("present");
      object.classList.add("leaving");
    });

    setTimeout(() => {
      items.forEach(object => {
        object.classList.remove("energy-down");
      });

      if (typeof onComplete === "function") {
        onComplete();
      }
    }, FADE_OUT_TIME);
  }, GLOW_DOWN_TIME);
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
