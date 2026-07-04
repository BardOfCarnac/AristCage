/*==================================================
  PRESENCE
==================================================*/

function resolve(objects) {
  objects.forEach((object, index) => {
    object.classList.remove("leaving");

    setTimeout(() => {
      object.classList.add("present");
    }, index * 60);
  });
}

function dismiss(objects, onComplete) {
  objects.forEach(object => {
    object.classList.remove("present");
    object.classList.add("leaving");
  });

  setTimeout(() => {
    if (typeof onComplete === "function") {
      onComplete();
    }
  }, 520);
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
