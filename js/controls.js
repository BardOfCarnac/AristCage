/*==================================================
  NCN PROJECTED CONTROLS
==================================================*/

function closeNCNSelect(control, { restoreFocus = false } = {}) {
  if (!control || !control.classList.contains("is-open")) return;

  control.classList.remove("is-open");

  const trigger = control.querySelector(".ncn-select-trigger");
  trigger?.setAttribute("aria-expanded", "false");

  if (restoreFocus) trigger?.focus();
}

function closeAllNCNSelects(except = null) {
  document.querySelectorAll(".ncn-select.is-open").forEach(control => {
    if (control !== except) closeNCNSelect(control);
  });
}

function openNCNSelect(control) {
  if (!control) return;

  closeAllNCNSelects(control);
  control.classList.add("is-open");

  const trigger = control.querySelector(".ncn-select-trigger");
  trigger?.setAttribute("aria-expanded", "true");

  const selected = control.querySelector(".ncn-select-option[aria-selected='true']");
  const first = control.querySelector(".ncn-select-option");
  requestAnimationFrame(() => (selected || first)?.focus());
}

function isMultipleNCNSelect(control) {
  return control?.dataset.mode === "multiple";
}

function getNCNSelectOptions(control) {
  return [...control.querySelectorAll(".ncn-select-option")];
}

function getMultiInputForOption(option) {
  return option.closest(".ncn-select-option-wrap")?.querySelector(".ncn-multi-input") || null;
}

function multiSelectSummary(control) {
  const checked = [...control.querySelectorAll(".ncn-multi-input:checked")];
  const total = Number(control.dataset.total) || control.querySelectorAll(".ncn-multi-input").length;

  if (checked.length === total) return `All ${total}`;
  if (!checked.length) return "None";
  if (checked.length === 1) return checked[0].value;
  return `${checked.length} selected`;
}

function refreshNCNSelect(control) {
  if (!control) return;

  const valueNode = control.querySelector(".ncn-select-value");
  const options = getNCNSelectOptions(control);

  if (isMultipleNCNSelect(control)) {
    options.forEach(option => {
      const input = getMultiInputForOption(option);
      option.setAttribute("aria-selected", input?.checked ? "true" : "false");
    });

    if (valueNode) valueNode.textContent = multiSelectSummary(control);
    return;
  }

  const input = control.querySelector(".ncn-select-input[type='hidden']");
  const selectedValue = input?.value || "";

  options.forEach(option => {
    option.setAttribute(
      "aria-selected",
      option.dataset.value === selectedValue ? "true" : "false"
    );
  });

  if (valueNode) valueNode.textContent = selectedValue;
}

function syncNCNControls(root = document) {
  root.querySelectorAll(".ncn-select").forEach(refreshNCNSelect);
}

function setSingleNCNSelectValue(control, option) {
  const value = option.dataset.value || option.textContent.trim();
  const input = control.querySelector(".ncn-select-input[type='hidden']");

  if (input) {
    input.value = value;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  refreshNCNSelect(control);
  closeNCNSelect(control, { restoreFocus: true });
}

function toggleMultiNCNSelectValue(control, option) {
  const input = getMultiInputForOption(option);
  if (!input) return;

  input.checked = !input.checked;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  refreshNCNSelect(control);
  option.focus();
}

function activateNCNSelectOption(control, option) {
  if (!control || !option) return;

  if (isMultipleNCNSelect(control)) {
    toggleMultiNCNSelectValue(control, option);
  } else {
    setSingleNCNSelectValue(control, option);
  }
}

function moveNCNSelectFocus(control, direction) {
  const options = getNCNSelectOptions(control);
  if (!options.length) return;

  const current = options.indexOf(document.activeElement);
  const next = current < 0
    ? 0
    : (current + direction + options.length) % options.length;

  options[next].focus();
}

/*==================================================
  EVENTS
==================================================*/

document.addEventListener("click", event => {
  const trigger = event.target.closest(".ncn-select-trigger");

  if (trigger) {
    const control = trigger.closest(".ncn-select");
    control.classList.contains("is-open")
      ? closeNCNSelect(control)
      : openNCNSelect(control);
    return;
  }

  const option = event.target.closest(".ncn-select-option");

  if (option) {
    activateNCNSelectOption(option.closest(".ncn-select"), option);
    return;
  }

  if (!event.target.closest(".ncn-select")) closeAllNCNSelects();
});

document.addEventListener("keydown", event => {
  const control = event.target.closest(".ncn-select");

  if (event.key === "Escape") {
    const openControl = control?.classList.contains("is-open")
      ? control
      : document.querySelector(".ncn-select.is-open");

    if (openControl) {
      event.preventDefault();
      closeNCNSelect(openControl, { restoreFocus: true });
    }
    return;
  }

  if (!control) return;

  const trigger = event.target.closest(".ncn-select-trigger");
  const option = event.target.closest(".ncn-select-option");

  if (trigger && ["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
    event.preventDefault();
    openNCNSelect(control);
    return;
  }

  if (!option) return;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveNCNSelectFocus(control, 1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    moveNCNSelectFocus(control, -1);
  } else if (event.key === "Home") {
    event.preventDefault();
    getNCNSelectOptions(control)[0]?.focus();
  } else if (event.key === "End") {
    event.preventDefault();
    getNCNSelectOptions(control).at(-1)?.focus();
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    activateNCNSelectOption(control, option);
  } else if (event.key === "Tab") {
    closeNCNSelect(control);
  }
});
