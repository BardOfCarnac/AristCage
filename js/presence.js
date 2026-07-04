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
  const items = objects.filter(Boolean);

  if (!items.length) {
    if (typeof onComplete === "function") onComplete();
    return;
  }

  let remaining = items.length;

  function finishOne() {
    remaining -= 1;

    if (remaining <= 0 && typeof onComplete === "function") {
      onComplete();
    }
  }

  items.forEach(object => {
    object.classList.remove("present");
    object.classList.add("leaving");

    object.addEventListener("transitionend", function handler(event) {
      if (event.propertyName !== "opacity") return;

      object.removeEventListener("transitionend", handler);
      finishOne();
    });
  });
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
