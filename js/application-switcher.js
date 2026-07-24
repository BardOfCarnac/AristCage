/*==================================================
  TERMINAL APPLICATION SWITCHER

  RedWire and Dripfeed are independent applications mounted into the same
  chamber, feed host, inspector and optical projection infrastructure. The
  temporary switch is intentionally exposed only through diagnostics.js.
==================================================*/

window.NCNApplications = (() => {
  const SESSION_KEY = "ncn-terminal-application";
  const profiles = Object.freeze({
    redwire: Object.freeze({
      name: "redwire",
      mark: "NCN",
      title: "Night City News",
      version: "14.07.2045 / v1.0",
      filterLabel: "Filter",
      submitLabel: "Submit",
      documentTitle: "Night City News"
    }),
    dripfeed: Object.freeze({
      name: "dripfeed",
      mark: "DF",
      title: "Dripfeed Classifieds",
      version: "14.07.2045 / DF 0.8 / APP 02",
      filterLabel: "Browse",
      submitLabel: "+ Transmit",
      documentTitle: "Dripfeed // Night City News Terminal"
    })
  });

  function profile(name) {
    return profiles[name] || profiles.redwire;
  }

  function entriesFor(name) {
    return name === "dripfeed"
      ? window.DripfeedApp.entries()
      : NCN_REDWIRE_ENTRIES.map(entry => ({ ...entry }));
  }

  function updateChrome(name) {
    const current = profile(name);
    const mark = document.querySelector(".rail-mark");
    const title = document.querySelector(".rail-title strong");
    const version = document.querySelector(".rail-title span");
    const filterButton = document.querySelector('[data-panel="filter"]');
    const submitButton = document.querySelector('[data-panel="submit"]');

    document.documentElement.dataset.ncnApp = current.name;
    document.body.dataset.ncnApp = current.name;
    document.title = current.documentTitle;
    if (mark) mark.textContent = current.mark;
    if (title) title.textContent = current.title;
    if (version) version.textContent = current.version;
    if (filterButton) filterButton.textContent = current.filterLabel;
    if (submitButton) submitButton.textContent = current.submitLabel;
  }

  function commitApplication(name) {
    const next = profile(name).name;
    activateApplicationState(next);
    NCN_ENTRIES.splice(0, NCN_ENTRIES.length, ...entriesFor(next));
    updateChrome(next);
    render();
    syncPanelButtons();
    updateProjection();
    window.OpticalProjection?.refresh?.();
    window.sessionStorage.setItem(SESSION_KEY, next);
    window.dispatchEvent(new CustomEvent("ncn:application-change", {
      detail: { name: next, reason: "switch" }
    }));
  }

  async function switchTo(name, options = {}) {
    const next = profile(name).name;
    if (next === NCN_STATE.activeApp && options.force !== true) return false;

    if (options.animate === false || !feed?.children.length) {
      commitApplication(next);
      activatePresence(true);
      return true;
    }

    return runProjectionTransaction({
      name: `application:${NCN_STATE.activeApp}->${next}`,
      dismiss: getFeedProjectionObjects,
      commit: () => commitApplication(next),
      resolve: getFeedProjectionObjects
    });
  }

  function initialApplication() {
    const query = new URLSearchParams(window.location.search).get("app");
    if (profiles[query]) return query;
    const session = window.sessionStorage.getItem(SESSION_KEY);
    return profiles[session] ? session : "redwire";
  }

  const initial = initialApplication();
  if (initial !== "redwire") switchTo(initial, { animate: false, force: true });
  else updateChrome("redwire");

  return {
    switchTo,
    current: () => NCN_STATE.activeApp,
    profiles: () => Object.values(profiles).map(item => ({ ...item }))
  };
})();
