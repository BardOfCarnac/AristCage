/*==================================================
  NIGHT CITY NEWS CONFIGURATION
==================================================*/

const NCN_CONFIG = {
  motion: {
    reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    // Articles now begin resolving together. Tiny component offsets are
    // owned by projection-cohesion.css rather than one global DOM sequence.
    resolveStagger: 0,
    // Must be at least as long as the slowest energy-down animation.
    dismissDuration: 600,
    displacedResolveDelay: 180
  },
  projection: {
    mode: window.localStorage.getItem("ncn-projection-mode") || "vertical",
    origin: "feed",
    travel: 58,
    horizontalStrength: .32,
    verticalStrength: 1
  }
};

const NCN_REDUCED_MOTION_QUERY = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
);

function syncReducedMotionPreference(event) {
  NCN_CONFIG.motion.reduced = event.matches;
  document.documentElement.classList.toggle("reduced-motion", event.matches);
}

syncReducedMotionPreference(NCN_REDUCED_MOTION_QUERY);
NCN_REDUCED_MOTION_QUERY.addEventListener?.(
  "change",
  syncReducedMotionPreference
);