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
  objects.filter(Boolean).forEach(object => {
    object.classList.remove("energy-up");
    object.classList.add("leaving", "energy-down");
  });

  setTimeout(() => {
    objects.filter(Boolean).forEach(object => {
      object.classList.remove("present", "leaving", "energy-down");
    });

    if (typeof onComplete === "function") {
      onComplete();
    }
  }, 520);
}

/*==================================================
  PROJECTION OBJECT HELPERS
==================================================*/

function getVisibleProjectionObjects(entry) {
  const objects = [
    entry.querySelector(".frame"),
    entry.querySelector(".priority"),
    entry.querySelector(".meta"),
    entry.querySelector(".headline"),
    entry.querySelector(".tags")
  ];

  if (entry.classList.contains("expanded") || entry.classList.contains("panel")) {
    objects.push(entry.querySelector(".body"));
  }

  return objects.filter(Boolean);
}

function getEntryChangeObjects(entry, affectedEntries) {
  return [
    entry.querySelector(".priority"),
    entry.querySelector(".body"),
    ...affectedEntries.flatMap(getVisibleProjectionObjects)
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
  resolve(
    [...document.querySelectorAll(".entry")]
      .flatMap(getVisibleProjectionObjects)
  );
}
