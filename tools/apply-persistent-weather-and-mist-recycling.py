from pathlib import Path


def replace_once(path, old, new):
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one anchor, found {count}: {old[:120]!r}")
    file_path.write_text(text.replace(old, new, 1))


def replace_all(path, old, new, expected):
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f"{path}: expected {expected} anchors, found {count}: {old[:120]!r}")
    file_path.write_text(text.replace(old, new))


# Separate hiding the diagnostics panel from ending diagnostics and restoring profiles.
replace_once(
    "js/diagnostics.js",
    "let diagnosticsLiveListenersBound = false;\nlet diagnosticsTransition = Promise.resolve();",
    "let diagnosticsLiveListenersBound = false;\nlet diagnosticsPanelHidden = false;\nlet diagnosticsTransition = Promise.resolve();"
)
replace_once(
    "js/diagnostics.js",
    '    <div class="diagnostics-title"><span>Projection Diagnostics</span><span>DEV</span></div>',
    '''    <div class="diagnostics-title">
      <span>Projection Diagnostics</span>
      <span class="diagnostics-title-actions">
        <span>DEV</span>
        <button type="button" data-debug-disable-diagnostics>Exit &amp; restore</button>
      </span>
    </div>'''
)
replace_once(
    "js/diagnostics.js",
    '  toggle.addEventListener("click", () => { void toggleDiagnostics(); });',
    '''  toggle.addEventListener("click", () => {
    if (document.documentElement.classList.contains("diagnostics-on")) toggleDiagnosticsPanel();
    else void setDiagnosticsEnabled(true);
  });'''
)
replace_once(
    "js/diagnostics.js",
    '''  panel.querySelectorAll("[data-debug-app]").forEach(button => {
    button.addEventListener("click", () => {
      void window.NCNApplications?.switchTo?.(button.dataset.debugApp);
    });
  });

  document.body.append(panel, toggle);''',
    '''  panel.querySelectorAll("[data-debug-app]").forEach(button => {
    button.addEventListener("click", () => {
      void window.NCNApplications?.switchTo?.(button.dataset.debugApp);
    });
  });
  panel.querySelector("[data-debug-disable-diagnostics]")?.addEventListener("click", () => {
    void setDiagnosticsEnabled(false);
  });

  document.body.append(panel, toggle);'''
)
replace_once(
    "js/diagnostics.js",
    '''  updateApplicationDiagnostics();
}

function findDiagnosticEntry() {''',
    '''  updateApplicationDiagnostics();
}

function setDiagnosticsPanelHidden(hidden) {
  const active = document.documentElement.classList.contains("diagnostics-on");
  diagnosticsPanelHidden = active && Boolean(hidden);
  document.documentElement.classList.toggle("diagnostics-panel-hidden", diagnosticsPanelHidden);
  diagnosticsPanel?.setAttribute("aria-hidden", String(diagnosticsPanelHidden));
  if (diagnosticsToggle) diagnosticsToggle.textContent = diagnosticsPanelHidden ? "Dev show" : active ? "Dev hide" : "Dev off";
  return diagnosticsPanelHidden;
}

function toggleDiagnosticsPanel() {
  return setDiagnosticsPanelHidden(!diagnosticsPanelHidden);
}

function findDiagnosticEntry() {'''
)
replace_once(
    "js/diagnostics.js",
    '''async function commitDiagnosticsEnabled(enabled) {
  if (enabled) {
    ensureDiagnosticsInterface();
    document.documentElement.classList.add("diagnostics-on");
    diagnosticsToggle.textContent = "Dev on";
    window.localStorage.setItem(NCN_DIAGNOSTICS_KEY, "1");
    bindDiagnosticsLiveListeners();
    updateDiagnosticsLiveValues();
    await Promise.resolve(window.NCNDevPanel?.setDiagnosticsActive?.(true));
    return true;
  }

  await Promise.resolve(window.NCNDevPanel?.setDiagnosticsActive?.(false));
  document.documentElement.classList.remove("diagnostics-on");
  if (diagnosticsToggle) diagnosticsToggle.textContent = "Dev off";
  window.localStorage.setItem(NCN_DIAGNOSTICS_KEY, "0");
  unbindDiagnosticsLiveListeners();
  return false;
}''',
    '''async function commitDiagnosticsEnabled(enabled) {
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
}'''
)

# Hide the panel and temporary outlines while preserving the active diagnostic session.
replace_once(
    "css/diagnostics.css",
    '''html.diagnostics-on .diagnostics-panel,
html.diagnostics-on .diagnostics-toggle {
  display: block;
}
''',
    '''html.diagnostics-on .diagnostics-panel,
html.diagnostics-on .diagnostics-toggle {
  display: block;
}

html.diagnostics-on.diagnostics-panel-hidden .diagnostics-panel {
  display: none;
}
'''
)
replace_once(
    "css/diagnostics.css",
    '''.diagnostics-title {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  color: var(--white);
  font-weight: 600;
  letter-spacing: .16em;
  text-transform: uppercase;
}
''',
    '''.diagnostics-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  color: var(--white);
  font-weight: 600;
  letter-spacing: .16em;
  text-transform: uppercase;
}

.diagnostics-title-actions {
  display: flex;
  align-items: center;
  gap: 7px;
}

.diagnostics-title-actions button {
  padding: 5px 7px;
  border: 1px solid rgba(255, 80, 50, .48);
  background: rgba(255, 50, 25, .06);
  color: rgba(255, 205, 150, .82);
  font: 600 .48rem/1 var(--font-main);
  letter-spacing: .08em;
  text-transform: uppercase;
}
'''
)
replace_all(
    "css/diagnostics.css",
    "html.diagnostics-on .card-field",
    "html.diagnostics-on:not(.diagnostics-panel-hidden) .card-field",
    1
)
for selector in [".frame", ".priority", ".meta", ".headline", ".tags", ".body", ".rail", ".chamber"]:
    replace_once(
        "css/diagnostics.css",
        f"html.diagnostics-on {selector}",
        f"html.diagnostics-on:not(.diagnostics-panel-hidden) {selector}"
    )

# Recycle mist through the boundary actually crossed instead of respawning every bank in a far/off-side corner.
replace_once(
    "departments/weather/weather-module.js",
    '''      heavyMistPrimePending: false,
      heavyMistPrimeCount: 0
    };''',
    '''      heavyMistPrimePending: false,
      heavyMistPrimeCount: 0,
      mistRecycleCount: 0,
      mistVisibleBanks: 0,
      mistMinimumVisibleBanks: null
    };'''
)
replace_once(
    "departments/weather/weather-module.js",
    '''    function updateMistBank(bank, deltaSeconds, bounds, settings) {
      if (!bank.active) return;
      bank.age += deltaSeconds;
      const wave = Math.sin(state.elapsedMs * 0.00034 * bank.speed + bank.phase);
      const wave2 = Math.sin(state.elapsedMs * 0.00021 + bank.phase2);
      const sideSpeed = settings.drift * 0.22;
      const depthSpeed = settings.depthFlow * 0.28;
      bank.x += (sideSpeed * bank.speed + wave * 0.035 * settings.turbulence + bank.bias * 0.006) * deltaSeconds;
      bank.z += (depthSpeed * bank.speed + wave2 * 0.025 * settings.turbulence) * deltaSeconds;
      const xLimit = bounds.halfWidth + bank.width * 1.4;
      if (bank.x > xLimit || bank.x < -xLimit || bank.z < bounds.near + 0.08 || bank.z > bounds.far + 0.2) {
        resetMistBank(bank, bounds, false);
      }
    }
''',
    '''    function mistBankVisible(bank, bounds) {
      if (!bank.active) return false;
      const halfVisibleWidth = bank.width * 0.58;
      const halfVisibleDepth = bank.depth * 0.30;
      return bank.x + halfVisibleWidth >= -bounds.halfWidth
        && bank.x - halfVisibleWidth <= bounds.halfWidth
        && bank.z + halfVisibleDepth >= bounds.near
        && bank.z - halfVisibleDepth <= bounds.far;
    }

    function updateMistCoverage(bounds, target) {
      const visible = particles.mist.reduce((count, bank) => count + (mistBankVisible(bank, bounds) ? 1 : 0), 0);
      state.mistVisibleBanks = visible;
      if (target > 0) {
        state.mistMinimumVisibleBanks = state.mistMinimumVisibleBanks === null
          ? visible
          : Math.min(state.mistMinimumVisibleBanks, visible);
      } else state.mistMinimumVisibleBanks = null;
      return visible;
    }

    function recycleMistBank(bank, bounds, crossedX, crossedZ) {
      const previousX = bank.x;
      const previousZ = bank.z;
      const xLimit = bounds.halfWidth + bank.width * 1.4;
      const nearLimit = bounds.near + 0.08;
      const farLimit = bounds.far + 0.2;
      resetMistBank(bank, bounds, true);

      if (crossedX) {
        bank.x = previousX > xLimit
          ? -bounds.halfWidth + bank.width * 0.18
          : bounds.halfWidth - bank.width * 0.18;
      } else bank.x = clamp(previousX, -bounds.halfWidth, bounds.halfWidth);

      if (crossedZ) {
        bank.z = previousZ < nearLimit
          ? bounds.far - bank.depth * 0.18
          : bounds.near + 0.12 + bank.depth * 0.18;
      } else bank.z = clamp(previousZ, bounds.near + 0.08, bounds.far - 0.08);

      state.mistRecycleCount += 1;
    }

    function updateMistBank(bank, deltaSeconds, bounds, settings) {
      if (!bank.active) return;
      bank.age += deltaSeconds;
      const wave = Math.sin(state.elapsedMs * 0.00034 * bank.speed + bank.phase);
      const wave2 = Math.sin(state.elapsedMs * 0.00021 + bank.phase2);
      const sideSpeed = settings.drift * 0.22;
      const depthSpeed = settings.depthFlow * 0.28;
      bank.x += (sideSpeed * bank.speed + wave * 0.035 * settings.turbulence + bank.bias * 0.006) * deltaSeconds;
      bank.z += (depthSpeed * bank.speed + wave2 * 0.025 * settings.turbulence) * deltaSeconds;
      const xLimit = bounds.halfWidth + bank.width * 1.4;
      const crossedX = bank.x > xLimit || bank.x < -xLimit;
      const crossedZ = bank.z < bounds.near + 0.08 || bank.z > bounds.far + 0.2;
      if (crossedX || crossedZ) recycleMistBank(bank, bounds, crossedX, crossedZ);
    }
'''
)
replace_once(
    "departments/weather/weather-module.js",
    '''    function deactivateAll(resetSequence = false) {
      TYPES.forEach(type => particles[type].forEach(particle => { particle.active = false; particle.age = 0; }));
      if (resetSequence) {
        state.spawnSerial = 0;
        state.elapsedMs = 0;
        random = seededRandom(state.seed);
      }
    }''',
    '''    function deactivateAll(resetSequence = false) {
      TYPES.forEach(type => particles[type].forEach(particle => { particle.active = false; particle.age = 0; }));
      state.mistVisibleBanks = 0;
      state.mistMinimumVisibleBanks = null;
      if (resetSequence) {
        state.spawnSerial = 0;
        state.elapsedMs = 0;
        state.mistRecycleCount = 0;
        random = seededRandom(state.seed);
      }
    }'''
)
replace_once(
    "departments/weather/weather-module.js",
    '''      particles.mist.forEach(bank => updateMistBank(bank, deltaSeconds, scene.bounds, settings));
      ["dust", "rain"].forEach(type => particles[type].forEach(particle => updateParticle(particle, deltaSeconds, scene.bounds)));
      render(intensity, scene, settings, frame);''',
    '''      particles.mist.forEach(bank => updateMistBank(bank, deltaSeconds, scene.bounds, settings));
      updateMistCoverage(scene.bounds, counts.mist);
      ["dust", "rain"].forEach(type => particles[type].forEach(particle => updateParticle(particle, deltaSeconds, scene.bounds)));
      render(intensity, scene, settings, frame);'''
)
replace_once(
    "departments/weather/weather-module.js",
    '''          approvedMist: APPROVED_MIST,
          effectiveDepthFlow: Object.freeze({''',
    '''          approvedMist: APPROVED_MIST,
          mistField: Object.freeze({
            recycled: state.mistRecycleCount,
            visibleBanks: state.mistVisibleBanks,
            minimumVisibleBanks: state.mistMinimumVisibleBanks
          }),
          effectiveDepthFlow: Object.freeze({'''
)

# Prove long-running mist remains populated and the old corner-respawn path cannot return.
replace_once(
    "departments/weather/tests/weather-module.node.test.js",
    '''  for (const forbidden of ['requestAnimationFrame', 'setInterval', 'Math.random', 'querySelector', 'window.NCNEffects', 'dispatchEvent']) {
    assert.equal(source.includes(forbidden), false, `forbidden token: ${forbidden}`);
  }
''',
    '''  for (const forbidden of ['requestAnimationFrame', 'setInterval', 'Math.random', 'querySelector', 'window.NCNEffects', 'dispatchEvent']) {
    assert.equal(source.includes(forbidden), false, `forbidden token: ${forbidden}`);
  }
  assert.equal(source.includes('bank.x = -bounds.halfWidth - bank.width'), false,
    'mist recycling must not move every expired bank into an off-screen corner');
  assert.ok(source.includes('recycleMistBank'), 'Weather must own an explicit mist-bank recycling path');
'''
)
replace_once(
    "departments/weather/tests/weather-module.node.test.js",
    '''  const renders = renderCounts();
  assert.ok(renders.radial > 0, 'approved mist banks must draw radial puffs');

  weather.applyProfile({ enabled: true, preset: 'heavy-mist', intensity: 0.92, seed: 2045 });''',
    '''  const renders = renderCounts();
  assert.ok(renders.radial > 0, 'approved mist banks must draw radial puffs');

  runtime.step(64, 2400);
  const sustainedMist = weather.snapshot();
  assert.ok(sustainedMist.diagnostics.mistField.recycled > 0,
    'a long-running mist field must recycle banks rather than rely on its initial population');
  assert.ok(sustainedMist.diagnostics.mistField.visibleBanks >= Math.floor(sustainedMist.particles.mist * 0.70),
    'recycled mist must keep most banks intersecting the visible chamber');
  assert.ok(sustainedMist.diagnostics.mistField.minimumVisibleBanks >= Math.floor(sustainedMist.particles.mist * 0.55),
    'mist coverage must not progressively drain during sustained runtime');

  weather.applyProfile({ enabled: true, preset: 'heavy-mist', intensity: 0.92, seed: 2045 });'''
)

# Mounted proof: hiding keeps the laboratory active; only explicit exit restores the profile.
replace_once(
    "tests/dev-panel-browser.mjs",
    '''  return page.evaluate(() => ({
    rootClass: document.documentElement.classList.contains("diagnostics-on"),
    preview: document.documentElement.dataset.devEnvironmentPreview || null,''',
    '''  return page.evaluate(() => ({
    rootClass: document.documentElement.classList.contains("diagnostics-on"),
    panelHidden: document.documentElement.classList.contains("diagnostics-panel-hidden"),
    preview: document.documentElement.dataset.devEnvironmentPreview || null,'''
)
replace_once(
    "tests/dev-panel-browser.mjs",
    '''async function verifyDisabledCleanup(page, viewportName, application, baseline) {
  await page.locator(".diagnostics-toggle").click();
  await waitForDiagnostics(page, false);''',
    '''async function verifyPanelHidePreservesWeather(page, viewportName) {
  const before = await diagnosticsSnapshot(page);
  await page.locator(".diagnostics-toggle").click();
  await page.waitForFunction(() => (
    document.documentElement.classList.contains("diagnostics-on")
    && document.documentElement.classList.contains("diagnostics-panel-hidden")
    && getComputedStyle(document.querySelector(".diagnostics-panel")).display === "none"
    && document.querySelector(".diagnostics-toggle")?.textContent === "Dev show"
  ), null, { timeout: 10_000 });

  const hidden = await diagnosticsSnapshot(page);
  assert.equal(hidden.rootClass, true, `${viewportName}: hiding the panel must keep diagnostics active`);
  assert.equal(hidden.panelHidden, true, `${viewportName}: the panel should enter preview-hidden state`);
  assert.equal(hidden.panel.diagnosticsActive, true, `${viewportName}: hidden panel must not end the laboratory session`);
  assert.equal(hidden.panel.telemetryActive, true, `${viewportName}: hidden panel must retain telemetry and service bindings`);
  assert.equal(hidden.preview, before.preview, `${viewportName}: hiding the panel must preserve the environment preview lift`);
  assert.equal(hidden.weather.enabled, before.weather.enabled, `${viewportName}: hiding the panel must preserve Weather enabled state`);
  assert.equal(hidden.weather.targetPreset, before.weather.targetPreset, `${viewportName}: hiding the panel must preserve the selected Weather preset`);
  assert.equal(hidden.weather.targetIntensity, before.weather.targetIntensity, `${viewportName}: hiding the panel must preserve Weather intensity`);
  assert.equal(hidden.weather.qualityOverride, before.weather.qualityOverride, `${viewportName}: hiding the panel must preserve Weather quality`);
  assert.equal(hidden.weather.seed, before.weather.seed, `${viewportName}: hiding the panel must preserve the deterministic seed`);

  await page.locator(".diagnostics-toggle").click();
  await page.waitForFunction(() => (
    !document.documentElement.classList.contains("diagnostics-panel-hidden")
    && getComputedStyle(document.querySelector(".diagnostics-panel")).display !== "none"
    && document.querySelector(".diagnostics-toggle")?.textContent === "Dev hide"
  ), null, { timeout: 10_000 });
}

async function verifyDisabledCleanup(page, viewportName, application, baseline) {
  await page.locator("[data-debug-disable-diagnostics]").click();
  await waitForDiagnostics(page, false);'''
)
replace_once(
    "tests/dev-panel-browser.mjs",
    '''    await page.locator('[data-debug-weather="mist"]').click();
    await page.waitForFunction(() => document.documentElement.dataset.devEnvironmentPreview === "true", null, { timeout: 10_000 });
    await page.locator('[data-debug-weather-layer="rear"]').click();''',
    '''    await page.locator('[data-debug-weather="mist"]').click();
    await page.waitForFunction(() => document.documentElement.dataset.devEnvironmentPreview === "true", null, { timeout: 10_000 });
    await verifyPanelHidePreservesWeather(page, viewportName);
    await page.locator('[data-debug-weather-layer="rear"]').click();'''
)
replace_once(
    "tests/dev-panel-browser.mjs",
    'console.log("PASS: Weather laboratory interaction, complete state cleanup and RedWire/Dripfeed usability verified on desktop and mobile");',
    'console.log("PASS: Weather laboratory hide/show persistence, explicit cleanup and RedWire/Dripfeed usability verified on desktop and mobile");'
)
replace_once(
    "tests/dev-panel-browser.mjs",
    '`${viewportName}: the diagnostics panel must not cover the Dev-off control`',
    '`${viewportName}: the diagnostics panel must not cover the Dev hide/show control`'
)

# Cache-bust the browser-delivered files.
replace_once("index.html", '<link rel="stylesheet" href="css/diagnostics.css" />', '<link rel="stylesheet" href="css/diagnostics.css?v=weather-preview-1" />')
replace_once("index.html", '<link rel="stylesheet" href="css/dev-panel-controls.css?v=module-host-16" />', '<link rel="stylesheet" href="css/dev-panel-controls.css?v=weather-preview-1" />')
replace_once("index.html", '<script src="departments/weather/weather-module.js?v=weather-after-render-1"></script>', '<script src="departments/weather/weather-module.js?v=mist-recycle-1"></script>')
replace_once("index.html", '<script src="js/diagnostics.js?v=application-slot-2"></script>', '<script src="js/diagnostics.js?v=weather-preview-1"></script>')

print("Applied persistent Weather preview and continuous mist recycling fix.")
