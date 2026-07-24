/*==================================================
  APPLICATION EFFECTS CONTROLLER

  Short-lived faults and interaction pulses are optional profile modules.
  Applications that request an empty chamber inherit none of these behaviours.
==================================================*/

window.NCNEffects = (() => {
  const viewer = document.querySelector(".viewer");
  const title = document.querySelector(".rail-title");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const lifecycle = window.NCNViewerLifecycle;

  const profile = {
    ambient: false,
    interaction: false
  };

  let titleJitterLocked = false;
  let scrollReleaseTimer = 0;
  let registrationTimer = 0;
  let lastJitterAt = 0;

  function ambientAllowed(priority = lifecycle?.PRIORITY?.ambient || 10) {
    return profile.ambient
      && !reduceMotion.matches
      && !document.hidden
      && (lifecycle?.allows?.("minor-effect", priority) ?? true);
  }

  function interactionAllowed(priority = lifecycle?.PRIORITY?.interaction || 40) {
    return profile.interaction
      && !reduceMotion.matches
      && !document.hidden
      && (lifecycle?.allows?.("minor-effect", priority) ?? true);
  }

  function setTitleRegister(x = 0, y = 0) {
    document.documentElement.style.setProperty("--title-register-x", `${x}px`);
    document.documentElement.style.setProperty("--title-register-y", `${y}px`);
  }

  function clearTransientEffects() {
    setTitleRegister(0, 0);
    viewer?.classList.remove("optical-registration-fault");
    titleJitterLocked = false;
  }

  function runTitleJitter(options = {}) {
    if (!title || titleJitterLocked || (!options.force && !ambientAllowed())) return false;
    titleJitterLocked = true;
    setTitleRegister(0, -1);
    window.setTimeout(() => setTitleRegister(0, 1), 34);
    window.setTimeout(() => setTitleRegister(0, 0), 72);
    window.setTimeout(() => { titleJitterLocked = false; }, 100);
    return true;
  }

  function pulseEntry(entry, options = {}) {
    if (!entry || (!options.force && !interactionAllowed())) return false;
    entry.classList.remove("energy-pulse");
    void entry.offsetWidth;
    entry.classList.add("energy-pulse");
    window.setTimeout(() => entry.classList.remove("energy-pulse"), 300);
    return true;
  }

  function runRegistrationFault(options = {}) {
    if (!viewer || (!options.force && !ambientAllowed())) return false;
    viewer.classList.add("optical-registration-fault");
    window.setTimeout(() => viewer.classList.remove("optical-registration-fault"), 48);
    return true;
  }

  function scheduleRegistrationFault() {
    window.clearTimeout(registrationTimer);
    registrationTimer = 0;
    if (!profile.ambient || reduceMotion.matches) return;
    const delay = 45000 + Math.random() * 105000;
    registrationTimer = window.setTimeout(() => {
      registrationTimer = 0;
      runRegistrationFault();
      scheduleRegistrationFault();
    }, delay);
  }

  function setProfile(next = {}) {
    profile.ambient = Boolean(next.ambient) && !reduceMotion.matches;
    profile.interaction = Boolean(next.interaction) && !reduceMotion.matches;
    if (!profile.ambient) {
      window.clearTimeout(registrationTimer);
      registrationTimer = 0;
      clearTransientEffects();
    } else {
      scheduleRegistrationFault();
    }
  }

  window.addEventListener("scroll", () => {
    const now = performance.now();
    if (now - lastJitterAt >= 650 && Math.random() <= 0.18 && ambientAllowed()) {
      lastJitterAt = now;
      runTitleJitter();
    }
    window.clearTimeout(scrollReleaseTimer);
    scrollReleaseTimer = window.setTimeout(() => setTitleRegister(0, 0), 120);
  }, { passive: true });

  document.addEventListener("click", event => {
    const panelButton = event.target.closest("[data-panel]");
    const option = event.target.closest(".ncn-select-option");
    const feedEntry = event.target.closest("#feed .entry:not(.panel)");

    if (panelButton) {
      const panelId = `panel-${panelButton.dataset.panel}`;
      requestAnimationFrame(() => {
        pulseEntry(document.querySelector(`[data-entry-id="${panelId}"]`));
      });
      return;
    }
    if (option) {
      pulseEntry(option.closest(".entry"));
      return;
    }
    if (feedEntry) pulseEntry(feedEntry);
  }, true);

  window.addEventListener("ncn:lifecycle-change", event => {
    if (event.detail?.next === lifecycle?.STATES?.REALIGNING) clearTransientEffects();
  });

  reduceMotion.addEventListener?.("change", event => {
    if (event.matches) setProfile({ ambient: false, interaction: false });
  });

  return Object.freeze({
    pulseEntry,
    titleJitter: runTitleJitter,
    registrationFault: runRegistrationFault,
    clear: clearTransientEffects,
    setProfile,
    setAmbientEnabled(enabled) {
      setProfile({ ambient: enabled, interaction: profile.interaction });
    },
    snapshot: () => Object.freeze({ ...profile })
  });
})();
