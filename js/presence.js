/*==================================================
  PRESENCE
==================================================*/

function resolve(objects) {
  objects.filter(Boolean).forEach((object, index) => {
    object.classList.remove("leaving");

    setTimeout(() => {
      object.classList.add("present");
    }, index * 60);
  });
}

function dismiss(objects, onComplete) {
  objects.filter(Boolean).forEach(object => {
    object.classList.remove("present");
    object.classList.add("leaving");
  });

  setTimeout(() => {
    if (typeof onComplete === "function") {
      onComplete();
    }
  }, 480);
}

/*==================================================
  ENTRY CHANGE HELPERS
==================================================*/

function getEntryChangeObjects(entry, affectedEntries) {
  return [
    entry.querySelector(".priority"),
    entry.querySelector(".body"),
    ...affectedEntries
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
    resolve([...document.querySelectorAll(".entry.expanded .body, .entry.panel .body")]);
  });
}
