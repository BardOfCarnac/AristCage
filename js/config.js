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
  dripfeed: {
    // A single provider-neutral proxy can serve both routes by reading the
    // `provider` query/body field. Empty values keep deterministic mock
    // providers active without exposing any API key in the browser.
    imageSearchEndpoint: "",
    imageTrackEndpoint: "",

    // Provider-specific endpoints override the shared endpoints when needed.
    // Unsplash requires hotlinked URLs and a selection/download event.
    unsplashSearchEndpoint: "",
    unsplashTrackEndpoint: "",

    // Pexels uses its own API key and attribution/usage rules. It does not use
    // the Unsplash download event; the track endpoint is reserved for a future
    // provider-specific action if the backend ever needs one.
    pexelsSearchEndpoint: "",
    pexelsTrackEndpoint: ""
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
