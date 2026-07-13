/*==================================================
  PRESENCE AND PROJECTION GROUPS
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
  return Projection.glowDown(objects);
}

function glowUp(objects) {
  return Projection.glowUp(objects);
}

function showImmediately(objects) {
  Projection.reveal(objects);
}

function hideImmediately(objects) {
  Projection.conceal(objects);
}

function cleanProjectionObjects(objects) {
  [...new Set(objects.filter(Boolean))].forEach(object => Projection.clean(object));
}

/*==================================================
  PROJECTION GROUPS
==================================================*/

function isRenderedProjectionObject(object) {
  return Boolean(object) && getComputedStyle(object).display !== "none";
}

function getEntryIdentityObjects(entry) {
  if (!entry) return [];

  return [
    entry.querySelector(".meta"),
    entry.querySelector(".headline"),
    entry.querySelector(".tags")
  ].filter(Boolean);
}

function getEntryStructureObjects(entry) {
  if (!entry) return [];

  return [
    entry.querySelector(".frame"),
    entry.querySelector(".corners"),
    entry.querySelector(".priority")
  ].filter(Boolean);
}

function getPanelControlObjects(entry) {
  const body = entry?.querySelector(".body");
  if (!body) return [];

  // The panel body is only a layout container. Its controls are independent
  // projection objects and must not inherit generic article .part behaviour.
  Projection.clean(body);
  body.classList.remove("part");
  body.style.opacity = "";

  const controls = [
    ...body.querySelectorAll(
      ".control-row, .control-block, .control-actions"
    )
  ];

  controls.forEach(control => {
    control.classList.remove("part");
    control.classList.add("panel-control");
  });

  return controls;
}

function getEntryBodyObjects(entry) {
  if (!entry) return [];

  if (entry.classList.contains("panel")) {
    return getPanelControlObjects(entry);
  }

  return [entry.querySelector(".body")].filter(Boolean);
}

function getVisibleProjectionObjects(entry) {
  if (!entry) return [];

  const objects = [
    ...getEntryIdentityObjects(entry),
    ...getEntryStructureObjects(entry)
  ];

  if (entry.classList.contains("expanded") || entry.classList.contains("panel")) {
    objects.push(...getEntryBodyObjects(entry));
  }

  return objects.filter(isRenderedProjectionObject);
}

function getProjectionObjectsForEntries(entries) {
  return [...new Set(
    entries.flatMap(getVisibleProjectionObjects).filter(Boolean)
  )];
}

/*==================================================
  INITIAL LOAD
==================================================*/

function activatePresence(immediate = false) {
  const objects = getProjectionObjectsForEntries([
    ...document.querySelectorAll(".entry")
  ]);

  if (immediate) {
    showImmediately(objects);
    return;
  }

  resolve(objects);
}
