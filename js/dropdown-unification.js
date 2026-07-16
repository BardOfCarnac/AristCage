/*==================================================
  DROPDOWN VISUAL UNIFICATION

  Submit uses single-select controls. Their current value already appears in
  the trigger, so the matching option is hidden while the menu is open.
  Filter multi-select controls are intentionally unchanged.
==================================================*/

function syncSubmitCurrentOption(control) {
  if (!control?.closest(".submit-form") || control.dataset.mode !== "single") {
    return;
  }

  control.querySelectorAll(".ncn-select-option").forEach(option => {
    const current = option.getAttribute("aria-selected") === "true";
    option.dataset.currentValue = String(current);
    option.hidden = current;
  });
}

function syncAllSubmitCurrentOptions(root = document) {
  root.querySelectorAll(".submit-form .ncn-select[data-mode='single']")
    .forEach(syncSubmitCurrentOption);
}

const baseRefreshNCNSelect = refreshNCNSelect;
refreshNCNSelect = function refreshNCNSelectUnified(control) {
  baseRefreshNCNSelect(control);
  syncSubmitCurrentOption(control);
};

const baseOpenNCNSelect = openNCNSelect;
openNCNSelect = async function openNCNSelectUnified(control) {
  syncSubmitCurrentOption(control);
  await baseOpenNCNSelect(control);

  if (control?.closest(".submit-form")) {
    control.querySelector(".ncn-select-option:not([hidden])")?.focus();
  }
};

const baseMoveNCNSelectFocus = moveNCNSelectFocus;
moveNCNSelectFocus = function moveNCNSelectFocusUnified(control, direction) {
  if (!control?.closest(".submit-form")) {
    baseMoveNCNSelectFocus(control, direction);
    return;
  }

  const options = [...control.querySelectorAll(".ncn-select-option:not([hidden])")];
  if (!options.length) return;

  const current = options.indexOf(document.activeElement);
  const next = current < 0
    ? 0
    : (current + direction + options.length) % options.length;

  options[next]?.focus();
};

syncAllSubmitCurrentOptions();
