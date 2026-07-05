/*==================================================
  PROJECTION ENGINE
==================================================*/

const Projection = (() => {

  const RESOLVE_STAGGER = 60;
  const DISMISS_TIME = 450;

  const lifecycleClasses = [
    "entering",
    "present",
    "leaving",
    "gone",
    "energy-up",
    "energy-down"
  ];

  function clean(object) {
    object.classList.remove(...lifecycleClasses);
  }

  function enter(object) {
    if (!object) return;

    object.classList.remove("leaving", "gone", "energy-down");
    object.classList.add("entering", "present");

    requestAnimationFrame(() => {
      object.classList.remove("entering");
      object.classList.add("energy-up");
    });
  }

  function leave(object) {
    if (!object) return;

    object.classList.remove("entering", "energy-up", "present");
    object.classList.add("leaving", "energy-down");
  }

  function resolve(objects) {
    const items = objects.filter(Boolean);

    items.forEach((object, index) => {
      setTimeout(() => {
        enter(object);
      }, index * RESOLVE_STAGGER);
    });
  }

  function dismiss(objects, onComplete) {
    const items = objects.filter(Boolean);

    if (!items.length) {
      if (typeof onComplete === "function") onComplete();
      return;
    }

    items.forEach(leave);

    setTimeout(() => {
      items.forEach(object => {
        object.classList.remove("leaving", "energy-down");
        object.classList.add("gone");
      });

      if (typeof onComplete === "function") onComplete();
    }, DISMISS_TIME);
  }

  return {
    clean,
    enter,
    leave,
    resolve,
    dismiss
  };

})();
