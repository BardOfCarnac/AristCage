/*==================================================
  PRESENCE
==================================================*/

function resolve(objects) {
  Projection.resolve(objects);
}

function reveal(objects) {
  Projection.reveal(objects);
}

function dismiss(objects, onComplete) {
  Projection.dismiss(objects, onComplete);
}

function glowDown(objects) {
  const items = objects.filter(Boolean);
  return new Promise(resolvePromise => {
    Projection.dismiss(items, resolvePromise);
  });
}

function glowUp(objects) {
  const items = objects.filter(Boolean);
  Projection.resolve(items);

  if (NCN_CONFIG.motion.reduced || !items.length) {
    return Promise.resolve();
  }

  const delay = NCN_CONFIG.motion.dismissDuration
    + Math.max(0, items.length - 1) * NCN_CONFIG.motion.resolveStagger;

  return new Promise(resolvePromise => {
    window.setTimeout(resolvePromise, delay);
  });
}

function showImmediately(objects) {
  Projection.reveal(objects.filter(Boolean));
}

function cleanProjectionObjects(objects) {
  objects.filter(Boolean).forEach(object => Projection.clean(object));
}

/*==================================================
  PROJECTION GROUPS
==================================================*/

function getEntryIdentityObjects(entry) {
  return [
    entry.querySelector(".meta"),
    entry.querySelector(".headline"),
    entry.querySelector(".tags")
  ].filter(Boolean);
}

function getEntryStructureObjects(entry) {
  return [
    entry.querySelector(".frame"),
    entry.querySelector(".corners"),
    entry.querySelector(".priority")
  ].filter(Boolean);
}

function getEntryBodyObjects(entry) {
  return [entry.querySelector(".body")].filter(Boolean);
}

function getVisibleProjectionObjects(entry) {
  const objects = [
    ...getEntryIdentityObjects(entry),
    ...getEntryStructureObjects(entry)
  ];

  if (entry.classList.contains("expanded") || entry.classList.contains("panel")) {
    objects.push(...getEntryBodyObjects(entry));
  }

  return objects;
}

/*==================================================
  INITIAL / IMMEDIATE LOAD
==================================================*/

function activatePresence(immediate = false) {
  const objects = [...document.querySelectorAll(".entry")]
    .flatMap(getVisibleProjectionObjects);

  if (immediate) {
    showImmediately(objects);
    return;
  }

  resolve(objects);
}
