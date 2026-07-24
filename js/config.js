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
    travel: 58
  },
  dripfeed: {
    // Set these to the deployed Supabase Edge Function URLs when the live
    // Unsplash application is connected. Empty values keep the local demo
    // image search available without exposing an API key in the browser.
    unsplashSearchEndpoint: "",
    unsplashTrackEndpoint: ""
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
