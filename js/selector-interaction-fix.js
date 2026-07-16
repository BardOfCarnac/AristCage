/*==================================================
  SELECTOR INTERACTION FIX
==================================================*/

function previewPanelButtonState(name) {
  const requestedPanel = NCN_STATE.activePanel === name ? null : name;

  document.querySelectorAll("[data-panel]").forEach(button => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.panel === requestedPanel)
    );
  });
}

/* Physical controls respond on press, before the projection transaction ends. */
document.addEventListener("pointerdown", event => {
  const button = event.target.closest("[data-panel]");
  if (!button) return;
  previewPanelButtonState(button.dataset.panel);
}, true);

/* Single-choice selectors now behave like projected control banks: choosing a
   value updates the projection but leaves the menu open until explicitly closed. */
setSingleNCNSelectValue = async function setSingleNCNSelectValuePersistent(control, option) {
  const value = option.dataset.value || option.textContent.trim();
  const input = control.querySelector(".ncn-select-input[type='hidden']");

  if (input) {
    input.value = value;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  refreshNCNSelect(control);
  option.classList.remove("selection-pulse");
  void option.offsetWidth;
  option.classList.add("selection-pulse");
  option.focus();
};
