/*==================================================
  DESKTOP MODE

  Desktop selection is deliberately separate from mobile
  expansion. The feed remains compact while a dedicated
  inspector owns the selected story, Filter or Submit view.
==================================================*/

(() => {
  const inspector = document.querySelector("#desktop-inspector");
  const desktopQuery = window.matchMedia("(min-width: 601px)");

  if (!inspector) return;

  function isDesktop() {
    return desktopQuery.matches;
  }

  function selectedStory() {
    return NCN_ENTRIES.find(entry => entry.id === NCN_STATE.selectedEntryId) || null;
  }

  function inspectorProjectionObjects() {
    const entry = inspector.querySelector(".entry");
    return entry ? getVisibleProjectionObjects(entry) : [];
  }

  function ensureSelection() {
    const visible = getVisibleEntries();
    const visibleIds = new Set(visible.map(entry => entry.id));

    if (!visibleIds.has(NCN_STATE.selectedEntryId)) {
      selectEntry(visible[0]?.id || null);
    }
  }

  function markFeedSelection() {
    feed.querySelectorAll(".entry:not(.panel)").forEach(entry => {
      entry.classList.remove("expanded");
      entry.classList.toggle(
        "active",
        !NCN_STATE.activePanel && entry.dataset.entryId === NCN_STATE.selectedEntryId
      );
    });
  }

  function storyInspectorMarkup(story) {
    if (!story) {
      return `<div class="inspector-placeholder">Select a transmission</div>`;
    }

    const priorityName = String(story.priorityLabel || "Bulletin").toLowerCase();
    const isDripfeed = story.app === "dripfeed";
    const saved = isDripfeed && (window.DripfeedApp?.isSaved?.(story.id) || false);
    const seen = isDripfeed && (window.DripfeedApp?.isSeen?.(story.id) || false);

    return `
<article class="entry inspector-entry active expanded ${isDripfeed ? "dripfeed-entry" : "redwire-entry"} ${saved ? "dripfeed-saved" : ""} ${seen ? "dripfeed-seen" : ""}" data-entry-id="inspector-${escapeHTML(story.id)}" data-application="${escapeHTML(story.app || NCN_STATE.activeApp)}">
  <div class="projection-plate">
    ${entryFrameMarkup(story)}
    <div class="part corners gone" aria-hidden="true">
      <i class="corner corner-tl"></i>
      <i class="corner corner-tr"></i>
      <i class="corner corner-bl"></i>
      <i class="corner corner-br"></i>
    </div>
    <div class="part priority priority-${Number(story.priority) || 1} priority-${priorityName} gone"></div>

    <div class="entry-content">
      <div class="part meta gone">${escapeHTML(story.meta)}</div>
      <h2 class="part headline gone">${escapeHTML(story.headline)}</h2>
      <div class="part tags gone">${entryTagsMarkup(story)}</div>

      <div class="part body gone">
        <p>${escapeHTML(story.body || "No further details available.")}</p>
        ${detailGridMarkup(story, "inspector-detail-grid")}
        ${dripfeedTerminalActions(story)}
      </div>
    </div>
  </div>
</article>`;
  }

  function inspectorMarkup() {
    if (NCN_STATE.activePanel) {
      return entryMarkup(createPanelEntry(NCN_STATE.activePanel));
    }

    return storyInspectorMarkup(selectedStory());
  }

  function commitInspector() {
    inspector.innerHTML = inspectorMarkup();

    const entry = inspector.querySelector(".entry");
    if (!entry) return;

    entry.classList.add("expanded");
    hideImmediately(getVisibleProjectionObjects(entry));
  }

  async function changeDesktopView({ entryId = NCN_STATE.selectedEntryId, panel = null } = {}) {
    if (!isDesktop() || NCN_PROJECTION_TRANSITIONING) return;

    const oldInspectorObjects = inspectorProjectionObjects();

    await runProjectionTransaction({
      name: panel ? `desktop-panel:${panel}` : `desktop-story:${entryId}`,
      dismiss: oldInspectorObjects,
      commit: () => {
        NCN_STATE.activePanel = panel;
        if (entryId) selectEntry(entryId);

        markFeedSelection();
        commitInspector();
      },
      resolve: inspectorProjectionObjects
    });
  }

  document.addEventListener("click", event => {
    if (!isDesktop()) return;

    const panelButton = event.target.closest("[data-panel]");

    if (panelButton) {
      event.preventDefault();
      event.stopImmediatePropagation();

      const requested = panelButton.dataset.panel;
      const nextPanel = NCN_STATE.activePanel === requested ? null : requested;
      void changeDesktopView({ panel: nextPanel });
      return;
    }

    if (event.target.closest("form, button, input, select, textarea, label, summary, details, a")) {
      return;
    }

    const entry = event.target.closest("#feed .entry:not(.panel)");
    if (!entry) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (
      !NCN_STATE.activePanel &&
      entry.dataset.entryId === NCN_STATE.selectedEntryId
    ) {
      return;
    }

    void changeDesktopView({ entryId: entry.dataset.entryId, panel: null });
  }, true);

  new MutationObserver(() => {
    if (!isDesktop()) return;

    const previousSelection = NCN_STATE.selectedEntryId;
    ensureSelection();
    markFeedSelection();

    if (previousSelection !== NCN_STATE.selectedEntryId && !NCN_STATE.activePanel) {
      commitInspector();
      showImmediately(inspectorProjectionObjects());
    }
  }).observe(feed, { childList: true, subtree: true });

  window.addEventListener("ncn:application-change", () => {
    if (!isDesktop()) return;
    ensureSelection();
    markFeedSelection();
    commitInspector();
    showImmediately(inspectorProjectionObjects());
  });

  desktopQuery.addEventListener("change", event => {
    render();
    updateProjection();
    activatePresence(true);

    if (event.matches) {
      ensureSelection();
      markFeedSelection();
      commitInspector();
      showImmediately(inspectorProjectionObjects());
    } else {
      inspector.innerHTML = "";
      feed.querySelectorAll(".entry.active").forEach(entry => entry.classList.remove("active"));
    }
  });

  if (isDesktop()) {
    ensureSelection();
    markFeedSelection();
    commitInspector();
    showImmediately(inspectorProjectionObjects());
  }
})();
