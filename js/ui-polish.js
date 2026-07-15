/*==================================================
  UI POLISH CONTROLLER

  Panel changes own the complete selector-to-panel transition. Open selectors
  are cleared before the panel transaction so their private scene restoration
  cannot overlap the panel's glow-down / glow-up cycle.
==================================================*/

let NCN_PENDING_PANEL = null;

function clearOpenSelectorsForPanelChange() {
  document.querySelectorAll(".ncn-select.is-open").forEach(control => {
    const trigger = control.querySelector(".ncn-select-trigger");

    control.classList.remove(
      "is-open",
      "opens-up",
      "selector-resolving",
      "selector-visible",
      "selector-closing"
    );
    control.style.removeProperty("--selector-max-height");
    trigger?.setAttribute("aria-expanded", "false");

    if (typeof NCN_SELECTOR_SCENES !== "undefined") {
      NCN_SELECTOR_SCENES.delete(control);
    }
  });

  if (typeof NCN_SELECTOR_TRANSITIONING !== "undefined") {
    NCN_SELECTOR_TRANSITIONING = false;
  }
}

transitionPanel = async function transitionPanelPolished(name) {
  if (NCN_PROJECTION_TRANSITIONING) {
    NCN_PENDING_PANEL = name;
    return false;
  }

  clearOpenSelectorsForPanelChange();

  const completed = await runProjectionTransaction({
    name: `panel:${name}`,
    dismiss: getFeedProjectionObjects,
    commit: () => {
      setRequestedPanel(name);
      renderPanelOnly();
    },
    resolve: getFeedProjectionObjects
  });

  const pending = NCN_PENDING_PANEL;
  NCN_PENDING_PANEL = null;

  if (pending) {
    await transitionPanel(pending);
  }

  return completed;
};
