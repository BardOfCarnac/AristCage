/*==================================================
  PROJECTION MODE CONTROLS

  A visible rail control provides direct comparison between the established
  vertical projection and the experimental vanishing-point geometry. The same
  control is also mirrored inside Projection Diagnostics when that panel is
  enabled.
==================================================*/

(() => {
  const buttons = new Set();
  let diagnosticSection;

  function currentMode() {
    return NCN_CONFIG.projection.mode === "vanishing-point"
      ? "vanishing-point"
      : "vertical";
  }

  function modeLabel(mode = currentMode()) {
    return mode === "vanishing-point"
      ? "Perspective"
      : "Regular";
  }

  function syncControls() {
    const mode = currentMode();

    buttons.forEach((button) => {
      button.textContent = modeLabel(mode);
      button.setAttribute(
        "aria-label",
        `Projection view: ${modeLabel(mode)}. Activate to switch view.`
      );
      button.setAttribute(
        "aria-pressed",
        String(mode === "vanishing-point")
      );
      button.dataset.projectionMode = mode;
    });
  }

  function toggleMode() {
    const nextMode = currentMode() === "vanishing-point"
      ? "vertical"
      : "vanishing-point";

    setProjectionMode(nextMode);
    syncControls();
  }

  function registerButton(button) {
    if (!button || buttons.has(button)) return;
    buttons.add(button);
    button.addEventListener("click", toggleMode);
    syncControls();
  }

  function mountRailControl() {
    const actions = document.querySelector(".rail-actions");
    if (!actions || actions.querySelector("[data-projection-mode-toggle]")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "projection-mode-toggle";
    button.setAttribute("data-projection-mode-toggle", "");

    actions.prepend(button);
    registerButton(button);
  }

  function mountDiagnosticControl() {
    if (diagnosticSection) return true;

    const panel = document.querySelector(".diagnostics-panel");
    if (!panel) return false;

    const section = document.createElement("section");
    section.className = "diagnostics-section";
    section.innerHTML = `
      <div class="diagnostics-heading">Projection geometry</div>
      <div class="projection-mode-control">
        <span>View</span>
        <button type="button" data-projection-mode-toggle></button>
      </div>
      <div class="projection-mode-note">
        Regular preserves the established vertical projection. Perspective adds
        horizontal movement toward the viewer's vanishing point.
      </div>`;

    panel.insertBefore(section, panel.firstElementChild?.nextElementSibling || null);
    diagnosticSection = section;
    registerButton(section.querySelector("[data-projection-mode-toggle]"));
    return true;
  }

  mountRailControl();

  if (!mountDiagnosticControl()) {
    const observer = new MutationObserver(() => {
      mountRailControl();
      if (!mountDiagnosticControl()) return;
      observer.disconnect();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  document.addEventListener("ncn:projection-mode-change", syncControls);
})();
