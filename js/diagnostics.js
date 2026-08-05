/*==================================================
  PRODUCTION DIAGNOSTICS

  Activation gestures remain available, but the diagnostics interface and live
  viewport listeners exist only while diagnostics are enabled. The archived
  DOM-parallax profile is deliberately absent; current diagnostics report the
  shared chamber camera and active Optical semantic planes.
==================================================*/

const NCN_DIAGNOSTICS_KEY = "ncn-diagnostics";

let diagnosticsPanel;
let diagnosticsToggle;
let diagnosticsLiveEntry;
let diagnosticsLiveScroll;
let diagnosticsCameraNear;
let diagnosticsCameraCell;
let diagnosticsCameraFocal;
let diagnosticsCameraAperture;
let diagnosticsOpticalLayers;
let diagnosticsLiveListenersBound = false;
let diagnosticsPanelHidden = false;
let diagnosticsTransition = Promise.resolve();
let diagnosticMarkTapCount = 0;
let diagnosticMarkTapTimer;

function diagnosticsEnabledFromEnvironment() {
  const query = new URLSearchParams(window.location.search);
  if (query.get("debug") === "1") return true;
  if (query.get("debug") === "0") return false;
  return window.localStorage.getItem(NCN_DIAGNOSTICS_KEY) === "1";
}

function energySpectrumMarkup() {
  return Array.from({ length: 11 }, (_, index) => `
    <div class="diagnostics-swatch">
      <div class="diagnostics-colour" style="background: var(--energy-${index})"></div>
      <span>${index}</span>
    </div>
  `).join("");
}

function opticalLayerDefinitions() {
  return window.OpticalProjection?.getPlaneDefinitions?.() || [];
}

function opticalLayerMarkup(layer, camera) {
  const scale = camera?.scaleAt?.(layer.z);

  return `
    <div class="diagnostics-layer">
      <strong>${String(layer.role || "plane")}</strong>
      <span class="diagnostics-value">Z ${Number(layer.z).toFixed(2)}</span>
      <span class="diagnostics-value">S ${Number(scale || 0).toFixed(4)}</span>
    </div>
  `;
}

function cameraSnapshot() {
  return window.NCNChamberCamera?.snapshot?.()
    || window.LayeredChamber?.getCameraSnapshot?.()
    || null;
}

function opticalLayerListMarkup(camera = cameraSnapshot()) {
  const layers = opticalLayerDefinitions();
  if (!layers.length) {
    return `<div class="diagnostics-value">No optical panes</div>`;
  }
  return layers.map(layer => opticalLayerMarkup(layer, camera)).join("");
}

function updateApplicationDiagnostics() {
  if (!diagnosticsPanel) return;
  const current = window.NCNApplications?.current?.()
    || NCN_STATE.activeApp
    || "redwire";
  diagnosticsPanel.querySelectorAll("[data-debug-app]").forEach(button => {
    const active = button.dataset.debugApp === current;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const readout = diagnosticsPanel.querySelector("[data-debug-current-app]");
  if (readout) readout.textContent = current.toUpperCase();
}

function updateRendererDiagnostics() {
  if (!diagnosticsPanel) return;
  const opticalEnabled = window.OpticalProjection?.isEnabled?.() === true;
  const rangefinderEnabled = document.documentElement.classList.contains(
    "heuristic-rangefinder-active"
  );

  diagnosticsPanel.querySelectorAll("[data-debug-renderer]").forEach(button => {
    const active = button.dataset.debugRenderer === "optical"
      ? opticalEnabled
      : rangefinderEnabled;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function ensureDiagnosticsInterface() {
  if (diagnosticsPanel) return;

  const camera = cameraSnapshot();
  const panel = document.createElement("aside");
  panel.className = "diagnostics-panel";
  panel.setAttribute("aria-label", "Production diagnostics");
  panel.innerHTML = `
    <div class="diagnostics-title">
      <span>Production Diagnostics</span>
      <span class="diagnostics-title-actions">
        <span>DEV</span>
        <button type="button" data-debug-disable-diagnostics>Exit &amp; restore</button>
      </span>
    </div>
    <section class="diagnostics-section diagnostics-application-section">
      <div class="diagnostics-heading">Terminal application · temporary launcher bypass</div>
      <div class="diagnostics-app-switch" role="group" aria-label="Terminal application">
        <button type="button" data-debug-app="redwire">RedWire</button>
        <button type="button" data-debug-app="dripfeed">Dripfeed</button>
      </div>
      <div class="diagnostics-app-readout">Mounted: <strong data-debug-current-app>REDWIRE</strong></div>
    </section>
    <section class="diagnostics-section diagnostics-renderer-section">
      <div class="diagnostics-heading">Development-only renderer controls</div>
      <div class="diagnostics-app-switch" role="group" aria-label="Renderer controls">
        <button type="button" data-debug-renderer="optical" aria-pressed="false">Optical</button>
        <button type="button" data-debug-renderer="rangefinder" aria-pressed="false">Rangefinder</button>
      </div>
      <div class="diagnostics-value">The archived Chamber Lab and DOM parallax viewer are not installed.</div>
    </section>
    <section class="diagnostics-section">
      <div class="diagnostics-heading">Energy spectrum 0–10</div>
      <div class="diagnostics-spectrum">${energySpectrumMarkup()}</div>
    </section>
    <section class="diagnostics-section">
      <div class="diagnostics-heading">Optical semantic panes · Z chamber depth / S camera scale</div>
      <div class="diagnostics-layer-list" data-debug-optical-layers>${opticalLayerListMarkup(camera)}</div>
    </section>
    <section class="diagnostics-section">
      <div class="diagnostics-heading">Shared chamber camera</div>
      <div class="diagnostics-live">
        <div><span>Near</span><strong data-debug-camera-near>—</strong></div>
        <div><span>Cell</span><strong data-debug-camera-cell>—</strong></div>
        <div><span>Focal</span><strong data-debug-camera-focal>—</strong></div>
        <div><span>Aperture</span><strong data-debug-camera-aperture>—</strong></div>
      </div>
    </section>
    <section class="diagnostics-section">
      <div class="diagnostics-heading">Live viewport values</div>
      <div class="diagnostics-live">
        <div><span>Entry</span><strong data-debug-entry>—</strong></div>
        <div><span>Scroll Y</span><strong data-debug-scroll>0</strong></div>
      </div>
    </section>
    <section class="diagnostics-section">
      <div class="diagnostics-heading">Axis reference</div>
      <div class="diagnostics-axis" aria-label="X Y Z axis reference">
        <i class="diagnostics-axis-x"></i>
        <span class="diagnostics-axis-label x">X</span>
        <span class="diagnostics-axis-label y">Y</span>
        <span class="diagnostics-axis-label z">Z</span>
      </div>
    </section>`;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "diagnostics-toggle";
  toggle.addEventListener("click", () => { void toggleDiagnostics(); });

  panel.querySelectorAll("[data-debug-app]").forEach(button => {
    button.addEventListener("click", () => {
      void window.NCNApplications?.switchTo?.(button.dataset.debugApp);
    });
  });

  panel.querySelector('[data-debug-renderer="optical"]')?.addEventListener("click", () => {
    if (window.OpticalProjection?.isEnabled?.()) {
      window.OpticalProjection.disable({ persist: false });
    } else {
      window.OpticalProjection?.enable?.({ persist: false });
    }
    updateRendererDiagnostics();
  });

  panel.querySelector('[data-debug-renderer="rangefinder"]')?.addEventListener("click", () => {
    if (document.documentElement.classList.contains("heuristic-rangefinder-active")) {
      window.HeuristicRangefinder?.disable?.();
    } else {
      window.HeuristicRangefinder?.enable?.();
    }
    updateRendererDiagnostics();
  });

  panel.querySelector("[data-debug-disable-diagnostics]")?.addEventListener("click", () => {
    void setDiagnosticsEnabled(false);
  });

  document.body.append(panel, toggle);
  diagnosticsPanel = panel;
  diagnosticsToggle = toggle;
  diagnosticsLiveEntry = panel.querySelector("[data-debug-entry]");
  diagnosticsLiveScroll = panel.querySelector("[data-debug-scroll]");
  diagnosticsCameraNear = panel.querySelector("[data-debug-camera-near]");
  diagnosticsCameraCell = panel.querySelector("[data-debug-camera-cell]");
  diagnosticsCameraFocal = panel.querySelector("[data-debug-camera-focal]");
  diagnosticsCameraAperture = panel.querySelector("[data-debug-camera-aperture]");
  diagnosticsOpticalLayers = panel.querySelector("[data-debug-optical-layers]");
  updateApplicationDiagnostics();
  updateRendererDiagnostics();
}

function setDiagnosticsPanelHidden(hidden) {
  const active = document.documentElement.classList.contains("diagnostics-on");
  diagnosticsPanelHidden = active && Boolean(hidden);
  document.documentElement.classList.toggle(
    "diagnostics-panel-hidden",
    diagnosticsPanelHidden
  );
  diagnosticsPanel?.setAttribute("aria-hidden", String(diagnosticsPanelHidden));
  if (diagnosticsToggle) {
    diagnosticsToggle.textContent = diagnosticsPanelHidden
      ? "Dev show"
      : active
        ? "Dev hide"
        : "Dev off";
  }
  return diagnosticsPanelHidden;
}

function toggleDiagnosticsPanel() {
  return setDiagnosticsPanelHidden(!diagnosticsPanelHidden);
}

function findDiagnosticEntry() {
  const viewportCentre = window.innerHeight / 2;
  let closest = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  document.querySelectorAll(".entry:not(.panel)").forEach(entry => {
    const rect = entry.getBoundingClientRect();
    const centre = rect.top + rect.height / 2;
    const distance = Math.abs(centre - viewportCentre);
    if (distance < closestDistance) {
      closest = entry;
      closestDistance = distance;
    }
  });

  return closest;
}

function updateCameraDiagnostics() {
  if (!diagnosticsPanel) return;

  const camera = cameraSnapshot();
  if (!camera) {
    diagnosticsCameraNear.textContent = "—";
    diagnosticsCameraCell.textContent = "—";
    diagnosticsCameraFocal.textContent = "—";
    diagnosticsCameraAperture.textContent = "—";
    diagnosticsOpticalLayers.innerHTML = opticalLayerListMarkup(null);
    return;
  }

  diagnosticsCameraNear.textContent = camera.near.toFixed(2);
  diagnosticsCameraCell.textContent = camera.cell.toFixed(2);
  diagnosticsCameraFocal.textContent = `${Math.round(camera.focalLength)} px`;
  diagnosticsCameraAperture.textContent = `${Math.round(camera.nearAperture.width)} × ${Math.round(camera.nearAperture.height)}`;
  diagnosticsOpticalLayers.innerHTML = opticalLayerListMarkup(camera);
}

function updateDiagnosticsLiveValues() {
  if (!document.documentElement.classList.contains("diagnostics-on")
    || !diagnosticsPanel) return;

  const entry = findDiagnosticEntry();
  diagnosticsLiveEntry.textContent = entry?.dataset.entryId || "—";
  diagnosticsLiveScroll.textContent = Math.round(window.scrollY).toString();
  updateCameraDiagnostics();
  updateApplicationDiagnostics();
  updateRendererDiagnostics();
}

function bindDiagnosticsLiveListeners() {
  if (diagnosticsLiveListenersBound) return;
  window.addEventListener("scroll", updateDiagnosticsLiveValues, { passive: true });
  window.addEventListener("resize", updateDiagnosticsLiveValues);
  window.addEventListener("ncn:chamber-camera-change", updateDiagnosticsLiveValues);
  window.addEventListener("ncn:application-change", updateDiagnosticsLiveValues);
  diagnosticsLiveListenersBound = true;
}

function unbindDiagnosticsLiveListeners() {
  if (!diagnosticsLiveListenersBound) return;
  window.removeEventListener("scroll", updateDiagnosticsLiveValues);
  window.removeEventListener("resize", updateDiagnosticsLiveValues);
  window.removeEventListener("ncn:chamber-camera-change", updateDiagnosticsLiveValues);
  window.removeEventListener("ncn:application-change", updateDiagnosticsLiveValues);
  diagnosticsLiveListenersBound = false;
}

async function commitDiagnosticsEnabled(enabled) {
  if (enabled) {
    ensureDiagnosticsInterface();
    document.documentElement.classList.add("diagnostics-on");
    setDiagnosticsPanelHidden(false);
    window.localStorage.setItem(NCN_DIAGNOSTICS_KEY, "1");
    bindDiagnosticsLiveListeners();
    updateDiagnosticsLiveValues();
    await Promise.resolve(window.NCNDevPanel?.setDiagnosticsActive?.(true));
    return true;
  }

  await Promise.resolve(window.NCNDevPanel?.setDiagnosticsActive?.(false));
  document.documentElement.classList.remove("diagnostics-on");
  setDiagnosticsPanelHidden(false);
  window.localStorage.setItem(NCN_DIAGNOSTICS_KEY, "0");
  unbindDiagnosticsLiveListeners();
  return false;
}

function setDiagnosticsEnabled(enabled) {
  diagnosticsTransition = diagnosticsTransition.then(() => (
    commitDiagnosticsEnabled(Boolean(enabled))
  ));
  return diagnosticsTransition;
}

function toggleDiagnostics() {
  if (document.documentElement.classList.contains("diagnostics-on")) {
    return Promise.resolve(toggleDiagnosticsPanel());
  }
  return setDiagnosticsEnabled(true);
}

function bindDiagnosticsActivationTriggers() {
  document.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey)
      && event.shiftKey
      && event.key.toLowerCase() === "d") {
      event.preventDefault();
      void toggleDiagnostics();
    }
  });

  document.querySelector(".rail-mark")?.addEventListener("click", () => {
    diagnosticMarkTapCount += 1;
    window.clearTimeout(diagnosticMarkTapTimer);

    if (diagnosticMarkTapCount >= 3) {
      diagnosticMarkTapCount = 0;
      void toggleDiagnostics();
      return;
    }

    diagnosticMarkTapTimer = window.setTimeout(() => {
      diagnosticMarkTapCount = 0;
    }, 650);
  });
}

bindDiagnosticsActivationTriggers();

if (diagnosticsEnabledFromEnvironment()) {
  void setDiagnosticsEnabled(true);
}
