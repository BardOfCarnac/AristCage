/*==================================================
  NCN PROJECTED CONTROLS
==================================================*/

const NCN_SELECTOR_SCENES = new WeakMap();
let NCN_SELECTOR_TRANSITIONING = false;

function waitForSelectorAnimation(duration = 360) {
  return new Promise(resolve => window.setTimeout(resolve, duration));
}

function uniqueObjects(objects) {
  return [...new Set(objects.filter(Boolean))];
}

function getSelectorSceneObjects(control) {
  const activeRow = control?.closest(".panel-control");
  const panel = control?.closest(".entry.panel");

  const otherControls = panel
    ? [...panel.querySelectorAll(".panel-control")].filter(object => object !== activeRow)
    : [];

  const feedObjects = typeof getProjectionObjectsForEntries === "function"
    ? getProjectionObjectsForEntries([
        ...document.querySelectorAll("#feed .entry:not(.panel)")
      ])
    : [];

  return uniqueObjects([
    ...otherControls,
    ...feedObjects
  ]);
}

function sizeNCNSelectMenu(control) {
  const trigger = control?.querySelector(".ncn-select-trigger");
  if (!trigger) return;

  const rect = trigger.getBoundingClientRect();
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  const availableBelow = Math.max(120, viewportHeight - rect.bottom - 16);
  const availableAbove = Math.max(120, rect.top - 16);
  const openUp = availableBelow < 190 && availableAbove > availableBelow;

  control.classList.toggle("opens-up", openUp);
  control.style.setProperty(
    "--selector-max-height",
    `${Math.min(330, openUp ? availableAbove : availableBelow)}px`
  );
}

async function closeNCNSelect(control, { restoreFocus = false } = {}) {
  if (!control || !control.classList.contains("is-open")) return;

  const trigger = control.querySelector(".ncn-select-trigger");
  const sceneObjects = NCN_SELECTOR_SCENES.get(control) || [];

  NCN_SELECTOR_TRANSITIONING = true;
  control.classList.remove("selector-resolving");
  control.classList.add("selector-closing");

  await waitForSelectorAnimation(250);

  control.classList.remove(
    "is-open",
    "opens-up",
    "selector-visible",
    "selector-closing"
  );
  control.style.removeProperty("--selector-max-height");
  trigger?.setAttribute("aria-expanded", "false");

  if (sceneObjects.length && typeof glowUp === "function") {
    await glowUp(sceneObjects);
  }

  NCN_SELECTOR_SCENES.delete(control);
  NCN_SELECTOR_TRANSITIONING = false;

  if (restoreFocus) trigger?.focus();
}

async function closeAllNCNSelects(except = null) {
  const openControls = [
    ...document.querySelectorAll(".ncn-select.is-open")
  ].filter(control => control !== except);

  for (const control of openControls) {
    await closeNCNSelect(control);
  }
}

async function openNCNSelect(control) {
  if (!control || NCN_SELECTOR_TRANSITIONING) return;

  const alreadyOpen = document.querySelector(".ncn-select.is-open");
  if (alreadyOpen && alreadyOpen !== control) {
    await closeNCNSelect(alreadyOpen);
  }

  NCN_SELECTOR_TRANSITIONING = true;

  const sceneObjects = getSelectorSceneObjects(control);
  NCN_SELECTOR_SCENES.set(control, sceneObjects);

  if (sceneObjects.length && typeof glowDown === "function") {
    await glowDown(sceneObjects);
  }

  sizeNCNSelectMenu(control);

  const trigger = control.querySelector(".ncn-select-trigger");
  const options = getNCNSelectOptions(control);

  options.forEach((option, index) => {
    option.style.setProperty("--selector-option-index", index);
  });

  control.classList.add("is-open", "selector-resolving");
  trigger?.setAttribute("aria-expanded", "true");

  requestAnimationFrame(() => {
    requestAnimationFrame(() => control.classList.add("selector-visible"));
  });

  await waitForSelectorAnimation(360 + Math.min(options.length, 8) * 28);

  control.classList.remove("selector-resolving");
  NCN_SELECTOR_TRANSITIONING = false;

  const selected = control.querySelector(".ncn-select-option[aria-selected='true']");
  const first = control.querySelector(".ncn-select-option");
  (selected || first)?.focus();
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

function getNCNMultiSelectSummary(control) {
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

    if (valueNode) valueNode.textContent = getNCNMultiSelectSummary(control);
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

async function setSingleNCNSelectValue(control, option) {
  const value = option.dataset.value || option.textContent.trim();
  const input = control.querySelector(".ncn-select-input[type='hidden']");

  if (input) {
    input.value = value;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  refreshNCNSelect(control);
  await closeNCNSelect(control, { restoreFocus: true });
}

function toggleMultiNCNSelectValue(control, option) {
  const input = getMultiInputForOption(option);
  if (!input) return;

  input.checked = !input.checked;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  refreshNCNSelect(control);

  option.classList.remove("selection-pulse");
  void option.offsetWidth;
  option.classList.add("selection-pulse");
  option.focus();
}

async function activateNCNSelectOption(control, option) {
  if (!control || !option) return;

  if (isMultipleNCNSelect(control)) {
    toggleMultiNCNSelectValue(control, option);
  } else {
    await setSingleNCNSelectValue(control, option);
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
    void (control.classList.contains("is-open")
      ? closeNCNSelect(control)
      : openNCNSelect(control));
    return;
  }

  const option = event.target.closest(".ncn-select-option");

  if (option) {
    void activateNCNSelectOption(option.closest(".ncn-select"), option);
    return;
  }

  if (!event.target.closest(".ncn-select")) {
    void closeAllNCNSelects();
  }
});

document.addEventListener("keydown", event => {
  const control = event.target.closest(".ncn-select");

  if (event.key === "Escape") {
    const openControl = control?.classList.contains("is-open")
      ? control
      : document.querySelector(".ncn-select.is-open");

    if (openControl) {
      event.preventDefault();
      void closeNCNSelect(openControl, { restoreFocus: true });
    }
    return;
  }

  if (!control) return;

  const trigger = event.target.closest(".ncn-select-trigger");
  const option = event.target.closest(".ncn-select-option");

  if (trigger && ["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
    event.preventDefault();
    void openNCNSelect(control);
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
    void activateNCNSelectOption(control, option);
  } else if (event.key === "Tab") {
    void closeNCNSelect(control);
  }
});

window.addEventListener("resize", () => {
  const openControl = document.querySelector(".ncn-select.is-open");
  if (openControl) sizeNCNSelectMenu(openControl);
});