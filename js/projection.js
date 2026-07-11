/*==================================================
  PROJECTION / PARALLAX
==================================================*/

function updateProjection() {
  document.querySelectorAll(".entry").forEach((entry) => {
    const rect = entry.getBoundingClientRect();
    const anchor = rect.top + 80;
    const offset = NCN_CONFIG.motion.reduced
      ? 0
      : (anchor - window.innerHeight / 2) / window.innerHeight;

    Object.keys(NCN_PROJECTION_PROFILE).forEach((partName) => {
      applyPartProjection(entry, partName, offset);
    });
  });
}

function applyPartProjection(entry, partName, offset) {
  const part = entry.querySelector(`.${partName}`);
  const profile = NCN_PROJECTION_PROFILE[partName];

  if (!part || !profile) return;

  const depth = profile.depth;
  const movement = offset * depth * NCN_CONFIG.projection.travel;
  const structuralScale = profile.structural
    ? 0.99 + Math.min(depth, 1.1) * 0.01
    : 1;

  part.style.setProperty("--projection-y", `${movement}px`);
  part.style.setProperty("--projection-depth", depth.toFixed(2));
  part.style.setProperty("--projection-scale", structuralScale.toFixed(4));
}