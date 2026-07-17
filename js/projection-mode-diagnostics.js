/*==================================================
  PROJECTION MODE DIAGNOSTIC CONTROL

  This control is mounted only inside the existing diagnostics panel. The
  production interface remains unchanged while the two geometries are compared.
==================================================*/

(() => {
  let control;
  let button;

  function modeLabel(mode = NCN_CONFIG.projection.mode) {
    return mode === "vanishing-point"
      ? "Vanishing point"
      : "Vertical";
  }

  function syncControl() {
    if (!button) return;

    const mode = NCN_CONFIG.projection.mode;
    button.textContent = modeLabel(mode);
    button.setAttribute(
      "aria-pressed",
      String(mode === "vanishing-point")
    );
  }

  function toggleMode() {
    const nextMode = NCN_CONFIG.projection.mode === "vanishing-point"
      ? "vertical"
      : "vanishing-point";

    setProjectionMode(nextMode);
    syncControl();
  }

  function mountControl() {
    if (control) return true;

    const panel = document.querySelector(".diagnostics-panel");
    if (!panel) return false;

    const section = document.createElement("section");
    section.className = "diagnostics-section";
    section.innerHTML = `
      <div class="diagnostics-heading">Projection geometry</div>
      <div class="projection-mode-control">
        <span>Mode</span>
        <button type="button" data-projection-mode-toggle></button>
      </div>
      <div class="projection-mode-note">
        Vertical preserves the existing centre-line spread. Vanishing point adds
        a restrained horizontal component around the centre of the viewer.
      </div>`;

    panel.insertBefore(section, panel.firstElementChild?.nextElementSibling || null);
    control = section;
    button = section.querySelector("[data-projection-mode-toggle]");
    button.addEventListener("click", toggleMode);
    syncControl();
    return true;
  }

  if (!mountControl()) {
    const observer = new MutationObserver(() => {
      if (!mountControl()) return;
      observer.disconnect();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  document.addEventListener("ncn:projection-mode-change", syncControl);
})();