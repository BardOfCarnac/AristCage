/*==================================================
  PROJECTION DIAGNOSTICS

  Enable with ?debug=1, Ctrl/Cmd+Shift+D, or triple-tap
  the NCN mark. The preference is retained locally.
==================================================*/

const NCN_DIAGNOSTICS_KEY = "ncn-diagnostics";
const NCN_DIAGNOSTIC_LAYERS = [
  { name: "Header", depth: 32, parallax: 0 },
  { name: "Headline", profile: "headline" },
  { name: "Meta", profile: "meta" },
  { name: "Priority", profile: "priority" },
  { name: "Tags", profile: "tags" },
  { name: "Body", profile: "body" },
  { name: "Frame", profile: "frame" },
  { name: "Backing field", depth: -24, parallax: 0 },
  { name: "Chamber", depth: -48, parallax: 0 }
];

let diagnosticsPanel;
let diagnosticsLiveEntry;
let diagnosticsLiveOffset;
let diagnosticsLiveScroll;
let diagnosticMarkTapCount = 0;
let diagnosticMarkTapTimer;

function diagnosticsEnabledFromEnvironment() {
  const query = new URLSearchParams(window.location.search);
  if (query.get("debug") === "1") return true;
  if (query.get("debug") === "0") return false;
  return window.localStorage.getItem(NCN_DIAGNOSTICS_KEY) === "1";
}

function setDiagnosticsEnabled(enabled) {
  document.documentElement.classList.toggle("diagnostics-on", enabled);
  window.localStorage.setItem(NCN_DIAGNOSTICS_KEY, enabled ? "1" : "0");
  if (enabled) updateDiagnosticsLiveValues();
}

function toggleDiagnostics() {
  setDiagnosticsEnabled(
    !document.documentElement.classList.contains("diagnostics-on")
  );
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
  const parallax = profile?.scrollFactor ?? layer.parallax;

  return `
    <div class="diagnostics-layer">
      <strong>${layer.name}</strong>
      <span class="diagnostics-value">Z ${depth}</span>
      <span class="diagnostics-value">P ${Number(parallax).toFixed(2)}</span>
    </div>
  `;
}

function createDiagnosticsInterface() {
  const panel = document.createElement("aside");
  panel.className = "diagnostics-panel";
  panel.setAttribute("aria-label", "Projection diagnostics");
  panel.innerHTML = `
    <div class="diagnostics-title">
      <span>Projection Diagnostics</span>
      <span>DEV</span>
    </div>

    <section class="diagnostics-section">
      <div class="diagnostics-heading">Energy spectrum 0–10</div>
      <div class="diagnostics-spectrum">${energySpectrumMarkup()}</div>
    </section>

    <section class="diagnostics-section">
      <div class="diagnostics-heading">Layer stack · Z depth / P parallax</div>
      <div class="diagnostics-layer-list">
        ${NCN_DIAGNOSTIC_LAYERS.map(diagnosticLayerMarkup).join("")}
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
    </section>
  `;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "diagnostics-toggle";
  toggle.textContent = "Dev off";
  toggle.addEventListener("click", toggleDiagnostics);

  document.body.append(panel, toggle);

  diagnosticsPanel = panel;
  diagnosticsLiveEntry = panel.querySelector("[data-debug-entry]");
  diagnosticsLiveOffset = panel.querySelector("[data-debug-offset]");
  diagnosticsLiveScroll = panel.querySelector("[data-debug-scroll]");
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

function updateDiagnosticsLiveValues() {
  if (!document.documentElement.classList.contains("diagnostics-on")) return;
  if (!diagnosticsPanel) return;

  const entry = findDiagnosticEntry();
  const rect = entry?.getBoundingClientRect();
  const anchor = rect ? rect.top + 80 : window.innerHeight / 2;
  const offset = (anchor - window.innerHeight / 2) / window.innerHeight;

  diagnosticsLiveEntry.textContent = entry?.dataset.entryId || "—";
  diagnosticsLiveOffset.textContent = offset.toFixed(3);
  diagnosticsLiveScroll.textContent = Math.round(window.scrollY).toString();
}

function bindDiagnosticsTriggers() {
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

  window.addEventListener("scroll", updateDiagnosticsLiveValues, { passive: true });
  window.addEventListener("resize", updateDiagnosticsLiveValues);
}

createDiagnosticsInterface();
bindDiagnosticsTriggers();
setDiagnosticsEnabled(diagnosticsEnabledFromEnvironment());
