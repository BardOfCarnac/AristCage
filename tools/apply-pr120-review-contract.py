from pathlib import Path


def replace_once(path, old, new):
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one anchor, found {count}: {old[:140]!r}")
    file_path.write_text(text.replace(old, new, 1))


def replace_all(path, old, new, expected):
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f"{path}: expected {expected} anchors, found {count}: {old[:140]!r}")
    file_path.write_text(text.replace(old, new))


marker = 'return Promise.resolve(toggleDiagnosticsPanel());'
if marker in Path('js/diagnostics.js').read_text():
    print('PR 120 review contract fixes are already applied.')
    raise SystemExit(0)

# Route every ordinary activation gesture through one shared presentation action.
replace_once(
    'js/diagnostics.js',
    '''  toggle.addEventListener("click", () => {
    if (document.documentElement.classList.contains("diagnostics-on")) toggleDiagnosticsPanel();
    else void setDiagnosticsEnabled(true);
  });''',
    '''  toggle.addEventListener("click", () => { void toggleDiagnostics(); });'''
)
replace_once(
    'js/diagnostics.js',
    '''function toggleDiagnostics() {
  return setDiagnosticsEnabled(!document.documentElement.classList.contains("diagnostics-on"));
}''',
    '''function toggleDiagnostics() {
  if (document.documentElement.classList.contains("diagnostics-on")) {
    return Promise.resolve(toggleDiagnosticsPanel());
  }
  return setDiagnosticsEnabled(true);
}'''
)

# Keep the explicit destructive exit reachable at every internal scroll position.
replace_once(
    'css/diagnostics.css',
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
}''',
    '''.diagnostics-title {
  position: sticky;
  top: -10px;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: -10px -10px 8px;
  padding: 10px;
  border-bottom: 1px solid rgba(255, 70, 40, .28);
  background: rgba(2, 2, 4, .985);
  box-shadow: 0 8px 14px rgba(2, 2, 4, .76);
  color: var(--white);
  font-weight: 600;
  letter-spacing: .16em;
  text-transform: uppercase;
}'''
)

# Make recycling genuinely independent-axis and remove obsolete parameters/locals.
replace_once(
    'departments/weather/weather-module.js',
    '    function resetMistBank(bank, bounds, initial = false) {',
    '    function resetMistBank(bank, bounds) {'
)
replace_once(
    'departments/weather/weather-module.js',
    '        if (type === "mist" && bounds) resetMistBank(particle, bounds, true);',
    '        if (type === "mist" && bounds) resetMistBank(particle, bounds);'
)
replace_all(
    'departments/weather/weather-module.js',
    'resetMistBank(bank, bounds, true)',
    'resetMistBank(bank, bounds)',
    3
)
replace_once(
    'departments/weather/weather-module.js',
    '''    function recycleMistBank(bank, bounds, crossedX, crossedZ) {
      const previousX = bank.x;
      const previousZ = bank.z;
      const xLimit = bounds.halfWidth + bank.width * 1.4;
      const nearLimit = bounds.near + 0.08;
      const farLimit = bounds.far + 0.2;
      resetMistBank(bank, bounds);

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
    }''',
    '''    function mistRecycleFrame(bank, bounds) {
      return Object.freeze({
        xLimit: bounds.halfWidth + bank.width * 1.4,
        nearLimit: bounds.near + 0.08,
        farLimit: bounds.far + 0.2
      });
    }

    function resolveMistRecycleAxes(previous, rerolled, bounds, crossedX, crossedZ) {
      const previousFrame = mistRecycleFrame(previous, bounds);
      const next = { ...rerolled };

      if (crossedX) {
        next.x = previous.x > previousFrame.xLimit
          ? -bounds.halfWidth + next.width * 0.18
          : bounds.halfWidth - next.width * 0.18;
      } else {
        next.x = previous.x;
        const requiredWidth = Math.max(0, (Math.abs(previous.x) - bounds.halfWidth) / 1.4);
        const safeWidth = Math.min(previous.width, requiredWidth + 0.005);
        next.width = Math.max(next.width, safeWidth);
      }

      if (crossedZ) {
        next.z = previous.z < previousFrame.nearLimit
          ? bounds.far - next.depth * 0.18
          : bounds.near + 0.12 + next.depth * 0.18;
      } else next.z = previous.z;

      return next;
    }

    function recycleMistBank(bank, bounds, crossedX, crossedZ) {
      const previous = { x: bank.x, z: bank.z, width: bank.width, depth: bank.depth };
      resetMistBank(bank, bounds);
      Object.assign(bank, resolveMistRecycleAxes(previous, bank, bounds, crossedX, crossedZ));
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
      const frame = mistRecycleFrame(bank, bounds);
      const crossedX = bank.x > frame.xLimit || bank.x < -frame.xLimit;
      const crossedZ = bank.z < frame.nearLimit || bank.z > frame.farLimit;
      if (crossedX || crossedZ) recycleMistBank(bank, bounds, crossedX, crossedZ);
    }'''
)
replace_once(
    'departments/weather/weather-module.js',
    '''    return Object.freeze({
      init,''',
    '''    function testMistRecycleAxes(sample = {}) {
      if (context.testing !== true) throw new Error("Weather recycle probes are test-only.");
      const bounds = {
        halfWidth: Number(sample.bounds?.halfWidth) || 4.2,
        halfHeight: Number(sample.bounds?.halfHeight) || 2.55,
        near: Number(sample.bounds?.near) || 2.5,
        far: Number(sample.bounds?.far) || 10.5
      };
      const previous = {
        x: Number(sample.previous?.x) || 0,
        z: Number(sample.previous?.z) || bounds.near,
        width: Math.max(0.01, Number(sample.previous?.width) || 1),
        depth: Math.max(0.01, Number(sample.previous?.depth) || 0.7)
      };
      const rerolled = {
        x: 0,
        z: 0,
        width: Math.max(0.01, Number(sample.rerolled?.width) || 0.62),
        depth: Math.max(0.01, Number(sample.rerolled?.depth) || 0.38)
      };
      return Object.freeze(resolveMistRecycleAxes(
        previous,
        rerolled,
        bounds,
        Boolean(sample.crossedX),
        Boolean(sample.crossedZ)
      ));
    }

    return Object.freeze({
      init,'''
)
replace_once(
    'departments/weather/weather-module.js',
    '''      }),
      requestAtmosphericEffect: requestEffect''',
    '''      }),
      ...(context.testing === true ? { testMistRecycleAxes } : {}),
      requestAtmosphericEffect: requestEffect'''
)

# Deterministic axis-contract coverage for every requested crossing case.
replace_once(
    'departments/weather/tests/weather-module.node.test.js',
    '''const context = {
  owner: 'weather-node-test',''',
    '''const context = {
  owner: 'weather-node-test',
  testing: true,'''
)
replace_once(
    'departments/weather/tests/weather-module.node.test.js',
    '''  assert.ok(source.includes('recycleMistBank'), 'Weather must own an explicit mist-bank recycling path');''',
    '''  assert.ok(source.includes('recycleMistBank'), 'Weather must own an explicit mist-bank recycling path');
  assert.equal(source.includes('initial = false'), false, 'mist reset must not retain an unused initial-mode parameter');
  assert.equal(source.includes('else bank.x = clamp'), false, 'depth-only recycling must not clamp the untouched X axis');
  assert.equal(source.includes('else bank.z = clamp'), false, 'X-only recycling must not clamp the untouched Z axis');'''
)
replace_once(
    'departments/weather/tests/weather-module.node.test.js',
    '''  await weather.init();
  let snapshot = weather.snapshot();''',
    '''  await weather.init();

  const recycleBounds = { halfWidth: 4.2, halfHeight: 2.55, near: 2.5, far: 10.5 };
  const recycleProbe = (previous, rerolled, crossedX, crossedZ) => weather.testMistRecycleAxes({
    bounds: recycleBounds,
    previous,
    rerolled,
    crossedX,
    crossedZ
  });

  const positiveX = recycleProbe(
    { x: 5.95, z: 7.15, width: 1.2, depth: 0.8 },
    { width: 0.72, depth: 0.55 },
    true,
    false
  );
  assert.equal(positiveX.z, 7.15, 'positive X-only recycling must preserve depth exactly');
  assert.ok(positiveX.x < 0 && positiveX.x >= -recycleBounds.halfWidth,
    'positive X crossing must re-enter through the negative chamber side');

  const negativeX = recycleProbe(
    { x: -5.95, z: 6.35, width: 1.2, depth: 0.8 },
    { width: 0.74, depth: 0.57 },
    true,
    false
  );
  assert.equal(negativeX.z, 6.35, 'negative X-only recycling must preserve depth exactly');
  assert.ok(negativeX.x > 0 && negativeX.x <= recycleBounds.halfWidth,
    'negative X crossing must re-enter through the positive chamber side');

  const nearZ = recycleProbe(
    { x: 5.55, z: 2.54, width: 1.0, depth: 0.75 },
    { width: 0.62, depth: 0.42 },
    false,
    true
  );
  assert.equal(nearZ.x, 5.55, 'near Z-only recycling must preserve lateral position exactly');
  assert.ok(nearZ.z < recycleBounds.far && nearZ.z > 9.5,
    'near crossing must re-enter through the far chamber boundary');
  assert.ok(Math.abs(nearZ.x) <= recycleBounds.halfWidth + nearZ.width * 1.4,
    'rerolled width must be widened enough to keep the preserved X coordinate valid');

  const farZ = recycleProbe(
    { x: -5.5, z: 10.75, width: 1.0, depth: 0.8 },
    { width: 0.64, depth: 0.46 },
    false,
    true
  );
  assert.equal(farZ.x, -5.5, 'far Z-only recycling must preserve lateral position exactly');
  assert.ok(farZ.z > recycleBounds.near && farZ.z < 3.2,
    'far crossing must re-enter through the near chamber boundary');
  assert.ok(Math.abs(farZ.x) <= recycleBounds.halfWidth + farZ.width * 1.4,
    'far-wrap reroll must retain a width compatible with the preserved X coordinate');

  const simultaneous = recycleProbe(
    { x: 6.1, z: 2.52, width: 1.1, depth: 0.72 },
    { width: 0.7, depth: 0.5 },
    true,
    true
  );
  assert.ok(simultaneous.x < 0, 'simultaneous crossing must wrap X independently');
  assert.ok(simultaneous.z > 9.5, 'simultaneous crossing must wrap Z independently');

  let snapshot = weather.snapshot();'''
)

# Mounted proof for keyboard, mark gesture, floating control, sticky exit and explicit cleanup.
replace_once(
    'tests/dev-panel-browser.mjs',
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
''',
    '''function assertWeatherPreviewPreserved(actual, expected, label) {
  assert.equal(actual.preview, expected.preview, `${label}: environment preview lift must survive`);
  assert.equal(actual.weather.enabled, expected.weather.enabled, `${label}: Weather enabled state must survive`);
  assert.equal(actual.weather.targetPreset, expected.weather.targetPreset, `${label}: Weather preset must survive`);
  assert.equal(actual.weather.targetIntensity, expected.weather.targetIntensity, `${label}: Weather intensity must survive`);
  assert.equal(actual.weather.qualityOverride, expected.weather.qualityOverride, `${label}: Weather quality must survive`);
  assert.equal(actual.weather.seed, expected.weather.seed, `${label}: Weather seed must survive`);
}

async function waitForPanelPresentation(page, hidden) {
  await page.waitForFunction(expectedHidden => {
    const root = document.documentElement;
    const panel = document.querySelector(".diagnostics-panel");
    const toggle = document.querySelector(".diagnostics-toggle");
    return root.classList.contains("diagnostics-on")
      && root.classList.contains("diagnostics-panel-hidden") === expectedHidden
      && (getComputedStyle(panel).display === "none") === expectedHidden
      && toggle?.textContent === (expectedHidden ? "Dev show" : "Dev hide");
  }, hidden, { timeout: 10_000 });
}

async function verifyPresentationRoute(page, viewportName, routeName, trigger) {
  const before = await diagnosticsSnapshot(page);
  await trigger();
  await waitForPanelPresentation(page, true);

  const hidden = await diagnosticsSnapshot(page);
  assert.equal(hidden.rootClass, true, `${viewportName}/${routeName}: presentation toggle must keep diagnostics active`);
  assert.equal(hidden.panelHidden, true, `${viewportName}/${routeName}: panel should hide without exiting`);
  assert.equal(hidden.panel.diagnosticsActive, true, `${viewportName}/${routeName}: laboratory session must remain active`);
  assert.equal(hidden.panel.telemetryActive, true, `${viewportName}/${routeName}: telemetry must remain active`);
  assertWeatherPreviewPreserved(hidden, before, `${viewportName}/${routeName}/hidden`);

  await trigger();
  await waitForPanelPresentation(page, false);
  const shown = await diagnosticsSnapshot(page);
  assert.equal(shown.panelHidden, false, `${viewportName}/${routeName}: second gesture must reveal the panel`);
  assertWeatherPreviewPreserved(shown, before, `${viewportName}/${routeName}/shown`);
}

async function tripleTapRailMark(page) {
  const mark = page.locator(".rail-mark");
  for (let index = 0; index < 3; index += 1) await mark.click();
}

async function verifyPanelHidePreservesWeather(page, viewportName) {
  await verifyPresentationRoute(page, viewportName, "floating-control", () => page.locator(".diagnostics-toggle").click());
}

async function verifyKeyboardAndMarkPreserveWeather(page, viewportName) {
  await verifyPresentationRoute(page, viewportName, "keyboard", () => page.keyboard.press("Control+Shift+D"));
  await verifyPresentationRoute(page, viewportName, "triple-mark", () => tripleTapRailMark(page));
}
'''
)
replace_once(
    'tests/dev-panel-browser.mjs',
    '''async function verifyDisabledCleanup(page, viewportName, application, baseline) {
  await page.locator("[data-debug-disable-diagnostics]").click();
  await waitForDiagnostics(page, false);''',
    '''async function verifyDisabledCleanup(page, viewportName, application, baseline) {
  await page.locator(".diagnostics-panel").evaluate(panel => { panel.scrollTop = panel.scrollHeight; });
  await page.waitForFunction(() => {
    const panel = document.querySelector(".diagnostics-panel");
    const title = document.querySelector(".diagnostics-title");
    const exit = document.querySelector("[data-debug-disable-diagnostics]");
    const panelRect = panel.getBoundingClientRect();
    const exitRect = exit.getBoundingClientRect();
    return getComputedStyle(title).position === "sticky"
      && exit.getClientRects().length > 0
      && exitRect.top >= panelRect.top - 1
      && exitRect.bottom <= panelRect.bottom + 1;
  }, null, { timeout: 10_000 });
  await page.locator("[data-debug-disable-diagnostics]").click();
  await waitForDiagnostics(page, false);'''
)
replace_once(
    'tests/dev-panel-browser.mjs',
    '''    await verifyWeatherControls(page, viewportName);
    await switchApplication(page, "dripfeed");''',
    '''    await verifyWeatherControls(page, viewportName);
    await verifyKeyboardAndMarkPreserveWeather(page, viewportName);
    await switchApplication(page, "dripfeed");'''
)
replace_once(
    'tests/dev-panel-browser.mjs',
    '  console.log("PASS: Weather laboratory hide/show persistence, explicit cleanup and RedWire/Dripfeed usability verified on desktop and mobile");',
    '  console.log("PASS: All diagnostics presentation routes preserve Weather, sticky explicit cleanup works, and RedWire/Dripfeed remain usable on desktop and mobile");'
)

# Cache-bust the corrected production assets for manual verification.
replace_once('index.html', 'css/diagnostics.css?v=weather-preview-2', 'css/diagnostics.css?v=weather-preview-3')
replace_once('index.html', 'css/dev-panel-controls.css?v=weather-preview-2', 'css/dev-panel-controls.css?v=weather-preview-3')
replace_once('index.html', 'departments/weather/weather-module.js?v=mist-recycle-2', 'departments/weather/weather-module.js?v=mist-recycle-3')
replace_once('index.html', 'js/diagnostics.js?v=weather-preview-2', 'js/diagnostics.js?v=weather-preview-3')

print('Applied PR 120 integration review contract fixes.')
