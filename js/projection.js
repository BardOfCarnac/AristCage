/*==================================================
  PROJECTION / PARALLAX
==================================================*/

const NCN_PROJECTION_MODES = new Set(["vertical", "vanishing-point"]);

function normaliseProjectionMode(mode) {
  return NCN_PROJECTION_MODES.has(mode) ? mode : "vertical";
}

function getProjectionScene() {
  const viewer = document.querySelector(".viewer");
  const feed = document.querySelector("#feed");
  const viewerRect = viewer?.getBoundingClientRect() || {
    left: 0,
    top: 0,
    width: window.innerWidth,
    height: window.innerHeight
  };
  const feedRect = feed?.getBoundingClientRect();
  const useFeedOrigin = NCN_CONFIG.projection.origin === "feed" && feedRect;

  return {
    left: viewerRect.left,
    top: viewerRect.top,
    width: Math.max(1, viewerRect.width),
    height: Math.max(1, viewerRect.height),
    vanishingX: useFeedOrigin
      ? feedRect.left + feedRect.width / 2
      : viewerRect.left + viewerRect.width / 2,
    vanishingY: viewerRect.top + viewerRect.height / 2
  };
}

function calculateVerticalProjection(anchor, depth, scene) {
  const offsetY = (anchor.y - scene.vanishingY) / scene.height;

  return {
    x: 0,
    y: offsetY * depth * NCN_CONFIG.projection.travel
  };
}

function calculateVanishingPointProjection(anchor, depth, scene) {
  const offsetX = (anchor.x - scene.vanishingX) / scene.width;
  const offsetY = (anchor.y - scene.vanishingY) / scene.height;

  return {
    x:
      offsetX *
      depth *
      NCN_CONFIG.projection.travel *
      NCN_CONFIG.projection.horizontalStrength,
    y:
      offsetY *
      depth *
      NCN_CONFIG.projection.travel *
      NCN_CONFIG.projection.verticalStrength
  };
}

function calculatePartProjection(anchor, depth, scene) {
  return NCN_CONFIG.projection.mode === "vanishing-point"
    ? calculateVanishingPointProjection(anchor, depth, scene)
    : calculateVerticalProjection(anchor, depth, scene);
}

function updateProjection() {
  const scene = getProjectionScene();

  document.querySelectorAll(".entry").forEach((entry) => {
    const rect = entry.getBoundingClientRect();
    const anchor = {
      x: rect.left + rect.width / 2,
      y: rect.top + 80
    };

    Object.keys(NCN_PROJECTION_PROFILE).forEach((partName) => {
      applyPartProjection(entry, partName, anchor, scene);
    });
  });

  document.documentElement.dataset.projectionMode = NCN_CONFIG.projection.mode;
}

function applyPartProjection(entry, partName, anchor, scene) {
  const part = entry.querySelector(`.${partName}`);
  const profile = NCN_PROJECTION_PROFILE[partName];

  if (!part || !profile) return;

  const depth = profile.depth;
  const movement = NCN_CONFIG.motion.reduced
    ? { x: 0, y: 0 }
    : calculatePartProjection(anchor, depth, scene);
  const structuralScaleX = profile.structural
    ? 0.965 + Math.min(depth, 1.1) * 0.035
    : 1;

  part.style.setProperty("--projection-x", `${movement.x}px`);
  part.style.setProperty("--projection-y", `${movement.y}px`);
  part.style.setProperty("--projection-depth", depth.toFixed(2));
  part.style.setProperty("--projection-scale-x", structuralScaleX.toFixed(4));
}

function setProjectionMode(mode, { persist = true } = {}) {
  NCN_CONFIG.projection.mode = normaliseProjectionMode(mode);

  if (persist) {
    window.localStorage.setItem(
      "ncn-projection-mode",
      NCN_CONFIG.projection.mode
    );
  }

  updateProjection();
  document.dispatchEvent(new CustomEvent("ncn:projection-mode-change", {
    detail: { mode: NCN_CONFIG.projection.mode }
  }));

  return NCN_CONFIG.projection.mode;
}

NCN_CONFIG.projection.mode = normaliseProjectionMode(
  NCN_CONFIG.projection.mode
);