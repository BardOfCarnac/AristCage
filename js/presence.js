/*==================================================
  PRESENCE
==================================================*/

function resolve(objects) {
  objects.filter(Boolean).forEach((object, index) => {
    object.classList.remove("leaving", "energy-down", "energy-up");

    setTimeout(() => {
      object.classList.add("present", "energy-up");
    }, index * 60);
  });
}

function dismiss(objects, onComplete) {
  const items = objects.filter(Boolean);

  items.forEach(object => {
    object.classList.remove("energy-up");
    object.classList.add("energy-down");
  });

  setTimeout(() => {
    items.forEach(object => {
      object.classList.remove("present", "energy-down");
      object.classList.add("leaving");
    });

    if (typeof onComplete === "function") {
      onComplete();
    }
  }, 520);
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
  return entries
    .flatMap(getVisibleProjectionObjects)
    .filter(Boolean);
}

function dismissEntryChange(entry, affectedEntries, onComplete) {
  dismiss([
    entry.querySelector(".priority"),
    ...getDisplacedProjectionObjects(affectedEntries)
  ], onComplete);
}

function resolveEntryBody(entry) {
  resolve([
    entry.querySelector(".priority"),
    getEntryBodyObject(entry)
  ]);
}

function resolveDisplacedEntries(affectedEntries) {
  resolve(getDisplacedProjectionObjects(affectedEntries));
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
