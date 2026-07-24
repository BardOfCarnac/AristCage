/*==================================================
  PROJECTION ENGINE V4

  Projection owns canonical visibility. The active visual renderer receives
  the same semantic lifecycle directly; it does not infer it from the DOM.
==================================================*/

const ProjectionRenderer = (() => {
  let renderer = null;

  function register(candidate) {
    renderer = candidate || null;
    renderer?.refreshLifecycle?.();
    return () => {
      if (renderer === candidate) renderer = null;
    };
  }

  function notify(object, state) {
    if (!object || !renderer?.transitionObject) return;
    renderer.transitionObject(object, state);
  }

  function refresh() {
    renderer?.refreshLifecycle?.();
  }

  return { register, notify, refresh };
})();

window.NCNProjectionRenderer = ProjectionRenderer;

const Projection = (() => {
  const lifecycleClasses = [
    "entering",
    "present",
    "leaving",
    "gone",
    "energy-up",
    "energy-down"
  ];

  const activeTransitions = new WeakMap();

  function uniqueObjects(objects = []) {
    return [...new Set(objects.filter(Boolean))];
  }

  function cancelTransition(object) {
    const cancel = activeTransitions.get(object);
    if (cancel) cancel();
    activeTransitions.delete(object);
  }

  function clean(object) {
    if (!object) return;
    cancelTransition(object);
    object.classList.remove(...lifecycleClasses);
  }

  function setState(object, state, classes) {
    if (!object) return;
    clean(object);
    object.classList.add(...classes);
    ProjectionRenderer.notify(object, state);
  }

  function show(object) {
    setState(object, "present", ["present"]);
  }

  function hide(object) {
    setState(object, "gone", ["gone"]);
  }

  function animationFallbackMs(object) {
    const style = getComputedStyle(object);
    const durations = style.animationDuration.split(",").map(parseTime);
    const delays = style.animationDelay.split(",").map(parseTime);
    const count = Math.max(durations.length, delays.length, 1);
    let longest = 0;

    for (let index = 0; index < count; index += 1) {
      longest = Math.max(
        longest,
        (durations[index % durations.length] || 0) +
        (delays[index % delays.length] || 0)
      );
    }

    return Math.max(longest + 120, 900);
  }

  function parseTime(value) {
    const text = String(value || "0s").trim();
    if (text.endsWith("ms")) return parseFloat(text) || 0;
    if (text.endsWith("s")) return (parseFloat(text) || 0) * 1000;
    return 0;
  }

  function waitForAnimation(object) {
    if (NCN_CONFIG.motion.reduced) return Promise.resolve();

    return new Promise(resolvePromise => {
      let settled = false;
      let fallbackTimer;

      const finish = () => {
        if (settled) return;
        settled = true;
        object.removeEventListener("animationend", onAnimationEnd);
        object.removeEventListener("animationcancel", onAnimationEnd);
        window.clearTimeout(fallbackTimer);
        activeTransitions.delete(object);
        resolvePromise();
      };

      const onAnimationEnd = event => {
        if (event.target === object) finish();
      };

      object.addEventListener("animationend", onAnimationEnd);
      object.addEventListener("animationcancel", onAnimationEnd);
      fallbackTimer = window.setTimeout(finish, animationFallbackMs(object));
      activeTransitions.set(object, finish);
    });
  }

  async function transitionObjectToGone(object) {
    if (!object) return;

    setState(object, "leaving", ["leaving", "energy-down"]);
    await waitForAnimation(object);

    object.classList.remove("leaving", "energy-down");
    object.classList.add("gone");
    ProjectionRenderer.notify(object, "gone");
  }

  async function transitionObjectToPresent(object, delay = 0) {
    if (!object) return;

    if (!NCN_CONFIG.motion.reduced && delay > 0) {
      await new Promise(resolvePromise => window.setTimeout(resolvePromise, delay));
    }

    setState(object, "entering", ["entering"]);

    await new Promise(resolvePromise => {
      requestAnimationFrame(() => {
        object.classList.remove("entering");
        object.classList.add("energy-up");
        ProjectionRenderer.notify(object, "entering");
        resolvePromise();
      });
    });

    await waitForAnimation(object);
    object.classList.remove("energy-up");
    object.classList.add("present");
    ProjectionRenderer.notify(object, "present");
  }

  async function glowDown(objects) {
    const items = uniqueObjects(objects);
    await Promise.all(items.map(transitionObjectToGone));
  }

  async function glowUp(objects) {
    const items = uniqueObjects(objects);
    const stagger = NCN_CONFIG.motion.reduced
      ? 0
      : NCN_CONFIG.motion.resolveStagger;

    await Promise.all(
      items.map((object, index) =>
        transitionObjectToPresent(object, index * stagger)
      )
    );
  }

  function reveal(objects) {
    uniqueObjects(objects).forEach(show);
  }

  function conceal(objects) {
    uniqueObjects(objects).forEach(hide);
  }

  function resolve(objects) {
    void glowUp(objects);
  }

  function dismiss(objects, onComplete) {
    glowDown(objects).then(() => {
      if (typeof onComplete === "function") onComplete();
    });
  }

  return {
    clean,
    show,
    hide,
    reveal,
    conceal,
    glowDown,
    glowUp,
    resolve,
    dismiss
  };
})();
