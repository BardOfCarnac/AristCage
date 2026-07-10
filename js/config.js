/*==================================================
  NIGHT CITY NEWS CONFIGURATION
==================================================*/

const NCN_CONFIG = {
  motion: {
    reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    resolveStagger: 60,
    dismissDuration: 450,
    displacedResolveDelay: 180
  },
  projection: {
    travel: 58
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
