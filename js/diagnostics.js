/*==================================================
  PROJECTION DIAGNOSTICS

  The activation gestures are always available, but the diagnostics UI and
  live viewport listeners are created only while diagnostics are enabled.
==================================================*/

const NCN_DIAGNOSTICS_KEY = "ncn-diagnostics";
const NCN_DIAGNOSTIC_LAYERS = [
  { name: "Header", depth: 1.25 },
  { name: "Headline", profile: "headline" },
  { name: "Meta", profile: "meta" },
  { name: "Tags", profile: "tags" },
  { name: "Body", profile: "body" },
  { name: "Corners", profile: "corners" },
  { name: "Priority", profile: "priority" },
  { name: "Frame", profile: "frame" }
];

let diagnosticsPanel;
let diagnosticsToggle;
let diagnosticsLiveEntry;
let diagnosticsLiveOffset;
let diagnosticsLiveScroll;
let diagnosticsCameraNear;
let diagnosticsCameraCell;
let diagnosticsCameraFocal;
let diagnosticsCameraAperture;
let diagnosticsOpticalLayers;
let diagnosticsLiveListenersBound = false;
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

function diagnosticLayerMarkup(layer) {
  const profile = layer.profile ? NCN_PROJECTION_PROFILE[layer.profile] : null;
  const depth = profile?.depth ?? layer.depth;
  const scaleX = profile?.structural
    ? 0.965 + Math.min(depth, 1.1) * 0.035
    : 1;

  return `
    <div class="diagnostics-layer">
      <strong>${layer.name}</strong>
      <span class="diagnostics-value">D ${Number(depth).toFixed(2)}</span>
      <span class="diagnostics-value">X ${scaleX.toFixed(4)}</span>
    </div>
  `;
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
  return window.LayeredChamber?.getCameraSnapshot?.()
    || window.NCNChamberCamera?.snapshot?.()
    || null;
}

function opticalLayerListMarkup(camera = cameraSnapshot()) {
  const layers = opticalLayerDefinitions();
  if (!layers.length) return `<div class="diagnostics-value">No optical panes</div>`;
  return layers.map(layer => opticalLayerMarkup(layer, camera)).join("");
}

function ensureDiagnosticsInterface() {
  if (diagnosticsPanel) return;

  const camera = cameraSnapshot();
  const panel = document.createElement("aside");
  panel.className = "diagnostics-panel";
  panel.setAttribute("aria-label", "Projection diagnostics");
  panel.innerHTML = `
    <div class="diagnostics-title"><span>Projection Diagnostics</span><span>DEV</span></div>
    <section class="diagnostics-section">
      <div class="diagnostics-heading">Energy spectrum 0–10</div>
      <div class="diagnostics-spectrum">${energySpectrumMarkup()}</div>
    </section>
    <section class="diagnostics-section">
      <div class="diagnostics-heading">DOM projection profile · D depth / X horizontal scale</div>
      <div class="diagnostics-layer-list">${NCN_DIAGNOSTIC_LAYERS.map(diagnosticLayerMarkup).join("")}</div>
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
        <div><span>Offset</span><strong data-debug-offset>0.000</strong></div>
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
  toggle.addEventListener("click", toggleDiagnostics);

  document.body.append(panel, toggle);
  diagnosticsPanel = panel;
  diagnosticsToggle = toggle;
  diagnosticsLiveEntry = panel.querySelector("[data-debug-entry]");
  diagnosticsLiveOffset = panel.querySelector("[data-debug-offset]");
  diagnosticsLiveScroll = panel.querySelector("[data-debug-scroll]");
  diagnosticsCameraNear = panel.querySelector("[data-debug-camera-near]");
  diagnosticsCameraCell = panel.querySelector("[data-debug-camera-cell]");
  diagnosticsCameraFocal = panel.querySelector("[data-debug-camera-focal]");
  diagnosticsCameraAperture = panel.querySelector("[data-debug-camera-aperture]");
  diagnosticsOpticalLayers = panel.querySelector("[data-debug-optical-layers]");
}

function findDiagnosticEntry() {
  const viewportCentre = window.innerHeight / 2;
  let closest = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  document.querySelectorAll(".entry:not(.panel)").forEach((entry) => {
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
  if (!document.documentElement.classList.contains("diagnostics-on") || !diagnosticsPanel) return;

  const entry = findDiagnosticEntry();
  const rect = entry?.getBoundingClientRect();
  const anchor = rect ? rect.top + 80 : window.innerHeight / 2;
  const offset = (anchor - window.innerHeight / 2) / window.innerHeight;

  diagnosticsLiveEntry.textContent = entry?.dataset.entryId || "—";
  diagnosticsLiveOffset.textContent = offset.toFixed(3);
  diagnosticsLiveScroll.textContent = Math.round(window.scrollY).toString();
  updateCameraDiagnostics();
}

function bindDiagnosticsLiveListeners() {
  if (diagnosticsLiveListenersBound) return;
  window.addEventListener("scroll", updateDiagnosticsLiveValues, { passive: true });
  window.addEventListener("resize", updateDiagnosticsLiveValues);
  window.addEventListener("ncn:chamber-camera-change", updateDiagnosticsLiveValues);
  diagnosticsLiveListenersBound = true;
}

function unbindDiagnosticsLiveListeners() {
  if (!diagnosticsLiveListenersBound) return;
  window.removeEventListener("scroll", updateDiagnosticsLiveValues);
  window.removeEventListener("resize", updateDiagnosticsLiveValues);
  window.removeEventListener("ncn:chamber-camera-change", updateDiagnosticsLiveValues);
  diagnosticsLiveListenersBound = false;
}

function setDiagnosticsEnabled(enabled) {
  if (enabled) {
    ensureDiagnosticsInterface();
    document.documentElement.classList.add("diagnostics-on");
    diagnosticsToggle.textContent = "Dev on";
    window.localStorage.setItem(NCN_DIAGNOSTICS_KEY, "1");
    bindDiagnosticsLiveListeners();
    updateDiagnosticsLiveValues();
    return;
  }

  document.documentElement.classList.remove("diagnostics-on");
  if (diagnosticsToggle) diagnosticsToggle.textContent = "Dev off";
  window.localStorage.setItem(NCN_DIAGNOSTICS_KEY, "0");
  unbindDiagnosticsLiveListeners();
}

function toggleDiagnostics() {
  setDiagnosticsEnabled(!document.documentElement.classList.contains("diagnostics-on"));
}

function bindDiagnosticsActivationTriggers() {
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "d") {
      event.preventDefault();
      toggleDiagnostics();
    }
  });

  document.querySelector(".rail-mark")?.addEventListener("click", () => {
    diagnosticMarkTapCount += 1;
    window.clearTimeout(diagnosticMarkTapTimer);

    if (diagnosticMarkTapCount >= 3) {
      diagnosticMarkTapCount = 0;
      toggleDiagnostics();
      return;
    }

    diagnosticMarkTapTimer = window.setTimeout(() => {
      diagnosticMarkTapCount = 0;
    }, 650);
  });
}

bindDiagnosticsActivationTriggers();

if (diagnosticsEnabledFromEnvironment()) {
  setDiagnosticsEnabled(true);
}
