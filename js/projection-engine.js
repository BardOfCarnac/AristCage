/*==================================================
  PROJECTION ENGINE
==================================================*/

const Projection = (() => {
  const lifecycleClasses = [
    "entering",
    "present",
    "leaving",
    "gone",
    "energy-up",
    "energy-down"
  ];

  const timers = new WeakMap();

  function clearTimer(object) {
    const timer = timers.get(object);
    if (timer) window.clearTimeout(timer);
    timers.delete(object);
  }

  function schedule(object, callback, delay) {
    clearTimer(object);

    if (NCN_CONFIG.motion.reduced || delay <= 0) {
      callback();
      return;
    }

    const timer = window.setTimeout(() => {
      timers.delete(object);
      callback();
    }, delay);

    timers.set(object, timer);
  }

  function clean(object) {
    if (!object) return;
    clearTimer(object);
    object.classList.remove(...lifecycleClasses);
  }

  function show(object) {
    if (!object) return;
    clean(object);
    object.classList.add("present");
  }

  function enter(object) {
    if (!object) return;

    clearTimer(object);
    object.classList.remove("leaving", "gone", "energy-down");
    object.classList.add("entering", "present");

    requestAnimationFrame(() => {
      object.classList.remove("entering");
      object.classList.add("energy-up");
    });
  }

  function leave(object) {
    if (!object) return;

    clearTimer(object);
    object.classList.remove("entering", "energy-up", "present");
    object.classList.add("leaving", "energy-down");
  }

  function resolve(objects) {
    const items = objects.filter(Boolean);
    const stagger = NCN_CONFIG.motion.reduced
      ? 0
      : NCN_CONFIG.motion.resolveStagger;

    items.forEach((object, index) => {
      schedule(object, () => enter(object), index * stagger);
    });
  }

  function reveal(objects) {
    objects.filter(Boolean).forEach(show);
  }

  function dismiss(objects, onComplete) {
    const items = objects.filter(Boolean);

    if (!items.length) {
      if (typeof onComplete === "function") onComplete();
      return;
    }

    items.forEach(leave);

    const finish = () => {
      items.forEach(object => {
        clearTimer(object);
        object.classList.remove("leaving", "energy-down");
        object.classList.add("gone");
      });

      if (typeof onComplete === "function") onComplete();
    };

    if (NCN_CONFIG.motion.reduced) {
      finish();
      return;
    }

    window.setTimeout(finish, NCN_CONFIG.motion.dismissDuration);
  }

  return {
    clean,
    show,
    enter,
    leave,
    resolve,
    reveal,
    dismiss
  };
})();