/*==================================================
  OPTICAL EFFECTS CONTROLLER

  These effects are deliberately isolated from projection state. They only add
  short-lived registration and energy behaviour to objects already on screen.
==================================================*/

(() => {
  const viewer = document.querySelector(".viewer");
  const title = document.querySelector(".rail-title");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (!viewer || reduceMotion.matches) return;

  let titleJitterLocked = false;
  let scrollReleaseTimer = 0;
  let lastJitterAt = 0;

  function setTitleRegister(x = 0, y = 0) {
    document.documentElement.style.setProperty("--title-register-x", `${x}px`);
    document.documentElement.style.setProperty("--title-register-y", `${y}px`);
  }

  function runTitleJitter() {
    if (!title || titleJitterLocked) return;

    titleJitterLocked = true;
    setTitleRegister(0, -1);

    window.setTimeout(() => setTitleRegister(0, 1), 34);
    window.setTimeout(() => setTitleRegister(0, 0), 72);
    window.setTimeout(() => {
      titleJitterLocked = false;
    }, 100);
  }

  function considerScrollJitter() {
    const now = performance.now();
    if (now - lastJitterAt < 650 || Math.random() > 0.18) return;

    lastJitterAt = now;
    runTitleJitter();
  }

  function pulseEntry(entry) {
    if (!entry) return;

    entry.classList.remove("energy-pulse");
    void entry.offsetWidth;
    entry.classList.add("energy-pulse");

    window.setTimeout(() => entry.classList.remove("energy-pulse"), 300);
  }

  function runRegistrationFault() {
    if (document.hidden) return;

    viewer.classList.add("optical-registration-fault");
    window.setTimeout(() => viewer.classList.remove("optical-registration-fault"), 48);
  }

  function scheduleRegistrationFault() {
    const delay = 45000 + Math.random() * 105000;
    window.setTimeout(() => {
      runRegistrationFault();
      scheduleRegistrationFault();
    }, delay);
  }

  window.addEventListener("scroll", () => {
    considerScrollJitter();

    window.clearTimeout(scrollReleaseTimer);
    scrollReleaseTimer = window.setTimeout(() => setTitleRegister(0, 0), 120);
  }, { passive: true });

  document.addEventListener("click", event => {
    const panelButton = event.target.closest("[data-panel]");
    const option = event.target.closest(".ncn-select-option");
    const feedEntry = event.target.closest("#feed .entry:not(.panel)");

    if (panelButton) {
      const panelId = `panel-${panelButton.dataset.panel}`;
      window.requestAnimationFrame(() => {
        const panelEntry = document.querySelector(`[data-entry-id="${panelId}"]`);
        pulseEntry(panelEntry);
      });
      return;
    }

    if (option) {
      pulseEntry(option.closest(".entry"));
      return;
    }

    if (feedEntry) pulseEntry(feedEntry);
  }, true);

  scheduleRegistrationFault();
})();
