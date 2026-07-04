/*==================================================
  PRESENCE
==================================================*/

function resolve(objects) {
  objects.filter(Boolean).forEach((object, index) => {
    object.classList.remove("leaving", "energy-down");

    setTimeout(() => {
      object.classList.add("present", "energy-up");
    }, index * 60);
  });
}

function dismiss(objects, onComplete) {
  objects.filter(Boolean).forEach(object => {
    object.classList.remove("energy-up");
    object.classList.add("energy-down", "leaving");
  });

  setTimeout(() => {
    objects.filter(Boolean).forEach(object => {
      object.classList.remove("present");
    });

    if (typeof onComplete === "function") {
      onComplete();
    }
  }, 520);
}

/*==================================================
  ENTRY CHANGE HELPERS
==================================================*/

function getEntryProjectionObjects(entry) {
  return [
    entry,
    entry.querySelector(".priority"),
    entry.querySelector(".body")
  ].filter(Boolean);
}

function getEntryChangeObjects(entry, affectedEntries) {
  return [
    entry.querySelector(".priority"),
    entry.querySelector(".body"),
    ...affectedEntries.flatMap(getEntryProjectionObjects)
  ].filter(Boolean);
}

function dismissEntryChange(entry, affectedEntries, onComplete) {
  dismiss(getEntryChangeObjects(entry, affectedEntries), onComplete);
}

function resolveEntryChange(entry, affectedEntries) {
  resolve(getEntryChangeObjects(entry, affectedEntries));
}

/*==================================================
  INITIAL LOAD
==================================================*/

function activatePresence() {
  resolve([...document.querySelectorAll(".entry")]);

  requestAnimationFrame(() => {
    resolve([
      ...document.querySelectorAll(".priority"),
      ...document.querySelectorAll(".entry.expanded .body, .entry.panel .body")
    ]);
  });
}
