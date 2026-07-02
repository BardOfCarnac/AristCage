/*==================================================
  PROJECTION / PARALLAX
==================================================*/

function updateProjection() {
  document.querySelectorAll(".entry").forEach((entry) => {
    const rect = entry.getBoundingClientRect();

    const anchor = rect.top + 80;
    const offset = (anchor - window.innerHeight / 2) / window.innerHeight;

    applyPartProjection(entry, "frame", offset);
    applyPartProjection(entry, "priority", offset);
    applyPartProjection(entry, "meta", offset);
    applyPartProjection(entry, "headline", offset);
    applyPartProjection(entry, "tags", offset);
    applyPartProjection(entry, "body", offset);
  });
}

function applyPartProjection(entry, partName, offset) {
  const part = entry.querySelector(`.${partName}`);
  const profile = NCN_PROJECTION_PROFILE[partName];

  if (!part || !profile) return;

  const movement = offset * profile.scrollFactor * 58;

  part.style.setProperty("--projection-y", `${movement}px`);
}
