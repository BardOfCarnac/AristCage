# NCN Weather Department — PR-86 publication

This directory is a departmental candidate for the replaceable `weather` slot on
`agent/prepare-module-host` (PR #86). It deliberately does **not** install itself,
modify `index.html`, replace the incumbent slot, or touch RedWire, Dripfeed or
chamber structures.

## Load order for intake

1. `weather-manifest.js`
2. `weather-presets.js`
3. `weather-module.js`
4. `weather-module.css` when the integration agent stages visual testing

The candidate is exposed as:

```js
NCNWeatherDepartmentManifest
NCNWeatherDepartment.createWeather
createNCNWeatherDepartment
createWeather
```

Preflight without replacing the incumbent:

```js
NCNIntegrationHarness.inspectCandidate(
  "weather",
  NCNWeatherDepartment.createWeather,
  NCNWeatherDepartmentManifest
);
```

## Contract

The factory consumes the capability-scoped PR-86 department context. It uses only:

- `context.layers.weather.far`
- `context.layers.weather.rear`
- `context.layers.weather.middle`
- `context.layers.weather.near`
- `context.runtime` for its sole recurring task
- `context.director` for environment and fault envelopes
- `context.integration.requireService("effects")` for accepted reusable effects
- `context.views` for reading and control-zone descriptors
- `context.chamber` for read-only projection geometry

It never queries or alters protected Optical, RedWire, Dripfeed or chamber roots.
Weather CSS targets only `.ncn-department-weather-canvas*`; canonical layer geometry
and stacking remain host-owned.

## Public API

```js
const weather = createWeather(context);
await weather.init();
weather.applyProfile(profile, meta);
weather.suspend();
weather.resume();
weather.reset();
weather.destroy();
weather.setPreset("mist");
weather.setIntensity(0.35);
weather.transitionTo("rain", { duration: 3000 });
weather.snapshot();
```

Additional controls are `setEnabled`, `setWind`, `setQuality`, `setSeed` and
`requestAtmosphericEffect`.

## Effects boundary

Weather resolves only the declared `effects` dependency. The only effect names it
may request are:

- `electrical-disturbance` on the `fault` channel;
- `light-flash` on the `environment` channel.

Both are marked with the explicit `ambient` purpose. Unknown names are rejected
before reaching the Effects service. Weather does not call a global effects object
or dispatch a fallback window event.

## Runtime and frame work

Construction creates no resources. `init()` creates one canvas in each supplied
layer and registers exactly one recurring task in runtime group `environment`.
There is no module-owned `requestAnimationFrame`, interval or per-particle timer.

Camera state, four layer rectangles, the reading zone and control zones are each
resolved once per shared-runtime frame and passed through particle update and
rendering. Particle drawing performs no additional layout or camera lookup.

## Quality and reduced motion

`quality: "auto"` follows the host continuously. Initial reduced mode is honoured
before the first frame, and later full → reduced → full changes do not become
latched as an explicit user choice. Explicit `reduced`, `low`, `medium` or `high`
settings remain available for diagnostics.

Reduced mode uses 8fps, 10 mist particles, 8 dust particles and no rain. The visual
director remains authoritative and may suppress weather further.

## Suspension and cleanup

Suspension stops the runtime task, clears all canvases and hides them so the final
weather frame cannot remain frozen over the interface. Resume restores the canvases
with a zero-delta guard before playback continues.

`destroy()` unregisters the sole task, cancels owned effect handles, removes all four
canvases, clears pools and releases every owned reference. It does not change the
incumbent integration slot.

## Deterministic testing

All particle variation and effect request seeds come from local seeded generators.
There is no `Math.random()` identity or variation. Given the same seed, profile and
runtime deltas, the particle fingerprint is repeatable.

Validation files:

- `tests/weather-module.node.test.js` — deterministic runtime, Effects-name,
  quality, suspension, geometry and cleanup acceptance;
- `tests/weather-module.test.js` — generic browser/context acceptance;
- `tests/weather-pr86-host.test.js` — manual PR-86 intake and protected
  RedWire → Dripfeed → RedWire round trip without slot installation;
- `.github/workflows/weather-department-check.yml` — syntax, deterministic Node
  harness and static ownership checks.

The integration agent remains responsible for staged installation, incumbent
retirement and rendered desktop/mobile testing.
