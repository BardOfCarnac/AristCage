/*==================================================
  NCN PROJECTED SELECT CONTROLS
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

function setNCNSelectValue(control, option) {
  if (!control || !option) return;

  const value = option.dataset.value || option.textContent.trim();
  const input = control.querySelector("input[type='hidden']");
  const valueNode = control.querySelector(".ncn-select-value");

  if (input) {
    input.value = value;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  if (valueNode) valueNode.textContent = value;

  control.querySelectorAll(".ncn-select-option").forEach(item => {
    item.setAttribute("aria-selected", item === option ? "true" : "false");
  });

  closeNCNSelect(control, { restoreFocus: true });
}

function moveNCNSelectFocus(control, direction) {
  const options = [...control.querySelectorAll(".ncn-select-option")];
  if (!options.length) return;

  const current = options.indexOf(document.activeElement);
  const next = current < 0
    ? 0
    : (current + direction + options.length) % options.length;

  options[next].focus();
}

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
    setNCNSelectValue(option.closest(".ncn-select"), option);
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
    control.querySelector(".ncn-select-option")?.focus();
  } else if (event.key === "End") {
    event.preventDefault();
    [...control.querySelectorAll(".ncn-select-option")].at(-1)?.focus();
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    setNCNSelectValue(control, option);
  } else if (event.key === "Tab") {
    closeNCNSelect(control);
  }
});
