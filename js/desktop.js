/*==================================================
  DESKTOP INSPECTOR
==================================================*/

(() => {
  const inspector = document.querySelector("#desktop-inspector");
  const desktopQuery = window.matchMedia("(min-width: 980px)");

  if (!inspector) return;

  function isDesktop() {
    return desktopQuery.matches;
  }

  function selectedStory() {
    return NCN_ENTRIES.find(entry => entry.id === NCN_STATE.expandedEntryId) || null;
  }

  function markActiveEntry() {
    feed.querySelectorAll(".entry:not(.panel)").forEach(entry => {
      entry.classList.toggle(
        "active",
        entry.dataset.entryId === NCN_STATE.expandedEntryId
      );
    });
  }

  function inspectorProjectionObjects() {
    const entry = inspector.querySelector(".entry");
    return entry ? getVisibleProjectionObjects(entry) : [];
  }

  function inspectorMarkup() {
    if (NCN_STATE.activePanel) {
      return entryMarkup(createPanelEntry(NCN_STATE.activePanel));
    }

    const story = selectedStory();

    if (!story) {
      return `<div class="inspector-placeholder">Select a transmission</div>`;
    }

    return entryMarkup(story);
  }

  function commitInspector() {
    inspector.innerHTML = inspectorMarkup();

    const entry = inspector.querySelector(".entry");
    if (!entry) return;

    entry.classList.add("expanded", "active");
    hideImmediately(getVisibleProjectionObjects(entry));
  }

  async function renderInspector() {
    if (!isDesktop()) return;

    const oldObjects = inspectorProjectionObjects();

    await runProjectionTransaction({
      name: "desktop-inspector",
      dismiss: oldObjects,
      commit: commitInspector,
      resolve: inspectorProjectionObjects
    });

    markActiveEntry();
  }

  async function selectStory(entryId) {
    if (NCN_STATE.expandedEntryId === entryId && !NCN_STATE.activePanel) return;

    NCN_STATE.activePanel = null;
    NCN_STATE.expandedEntryId = entryId;
    markActiveEntry();
    await renderInspector();
  }

  async function selectPanel(panelName) {
    NCN_STATE.activePanel = panelName;
    await renderInspector();
  }

  function chooseInitialStory() {
    if (NCN_STATE.activePanel || selectedStory()) return;
    const firstVisible = getVisibleEntries()[0];
    if (firstVisible) NCN_STATE.expandedEntryId = firstVisible.id;
  }

  document.addEventListener("click", event => {
    if (!isDesktop()) return;

    const panelButton = event.target.closest("[data-panel]");

    if (panelButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void selectPanel(panelButton.dataset.panel);
      return;
    }

    if (event.target.closest("form, button, input, select, textarea, label, summary, details")) {
      return;
    }

    const entry = event.target.closest("#feed .entry:not(.panel)");
    if (!entry) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    void selectStory(entry.dataset.entryId);
  }, true);

  new MutationObserver(() => {
    if (!isDesktop()) return;

    const visibleIds = new Set(getVisibleEntries().map(entry => entry.id));

    if (!NCN_STATE.activePanel && !visibleIds.has(NCN_STATE.expandedEntryId)) {
      NCN_STATE.expandedEntryId = getVisibleEntries()[0]?.id || null;
      void renderInspector();
      return;
    }

    markActiveEntry();
  }).observe(feed, { childList: true, subtree: true });

  desktopQuery.addEventListener("change", event => {
    render();
    updateProjection();
    activatePresence(true);

    if (event.matches) {
      chooseInitialStory();
      commitInspector();
      showImmediately(inspectorProjectionObjects());
      markActiveEntry();
    } else {
      inspector.innerHTML = "";
    }
  });

  if (isDesktop()) {
    chooseInitialStory();
    commitInspector();
    showImmediately(inspectorProjectionObjects());
    markActiveEntry();
  }
})();
