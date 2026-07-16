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

const NCN_SELECTOR_VALUE_TRANSITIONS = new WeakSet();

function waitForSelectorValueFade(duration = 130) {
  return new Promise(resolve => window.setTimeout(resolve, duration));
}

function uniqueSelectorNodes(nodes) {
  return [...new Set(nodes.filter(Boolean))];
}

async function transitionSelectorValue(control, affectedOptions, commit) {
  if (!control || NCN_SELECTOR_VALUE_TRANSITIONS.has(control)) return false;

  const valueNode = control.querySelector(".ncn-select-value");
  const nodes = uniqueSelectorNodes([valueNode, ...affectedOptions]);

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    commit();
    return true;
  }

  NCN_SELECTOR_VALUE_TRANSITIONS.add(control);
  nodes.forEach(node => node.classList.add("selector-value-dismissing"));
  await waitForSelectorValueFade(125);

  commit();

  nodes.forEach(node => {
    node.classList.remove("selector-value-dismissing");
    node.classList.add("selector-value-resolving");
  });

  /* Force the fully absent state to paint before resolving. */
  void control.offsetWidth;
  requestAnimationFrame(() => {
    nodes.forEach(node => node.classList.remove("selector-value-resolving"));
  });

  await waitForSelectorValueFade(155);
  NCN_SELECTOR_VALUE_TRANSITIONS.delete(control);
  return true;
}

/* Single-choice selectors remain open. The old selected option, new selected
   option and trigger summary fully dismiss before their new state resolves. */
setSingleNCNSelectValue = async function setSingleNCNSelectValuePersistent(control, option) {
  const value = option.dataset.value || option.textContent.trim();
  const input = control.querySelector(".ncn-select-input[type='hidden']");
  const previous = control.querySelector(".ncn-select-option[aria-selected='true']");

  const changed = await transitionSelectorValue(control, [previous, option], () => {
    if (input) {
      input.value = value;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    refreshNCNSelect(control);
  });

  if (changed) option.focus();
};

/* Multi-choice selectors use the same full dismiss/resolve transaction without
   closing the menu or blanking unrelated options. */
toggleMultiNCNSelectValue = async function toggleMultiNCNSelectValueProjected(control, option) {
  const input = getMultiInputForOption(option);
  if (!input) return;

  const changed = await transitionSelectorValue(control, [option], () => {
    input.checked = !input.checked;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    refreshNCNSelect(control);
  });

  if (changed) option.focus();
};

activateNCNSelectOption = async function activateNCNSelectOptionProjected(control, option) {
  if (!control || !option || NCN_SELECTOR_VALUE_TRANSITIONS.has(control)) return;

  if (isMultipleNCNSelect(control)) {
    await toggleMultiNCNSelectValue(control, option);
  } else {
    await setSingleNCNSelectValue(control, option);
  }
};
