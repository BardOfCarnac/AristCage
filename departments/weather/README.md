# NCN Weather Department — PR-86 publication

This directory publishes the replaceable `weather` department. It does not install
itself, modify application roots, replace the incumbent slot, or touch protected
RedWire, Dripfeed, Optical or chamber structures.

## Approved everyday mist

The default RedWire mist is the agreed **Floor Mist / Chamber Test 01 — Low mist**
bank renderer, adapted only to the four host-supplied depth layers and shared runtime.

Its renderer constants are:

- density `0.62`
- height `0.34`
- opacity `0.58`
- lateral drift `+0.18`
- depth flow `-0.12`
- turbulence `0.42`
- softness `0.66`
- deterministic seed `2045`

Each bank uses three to five overlapping elliptical radial puffs. The ordinary `mist`
preset restores the broad-bank presentation of the accepted chamber prototype by using:

- vertical fill `0.04`
- bank scale `1.52`
- bank multiplier `1.58`

Against the renderer's deterministic base ranges this produces an effective ordinary
footprint of approximately `0.94–2.40` chamber units wide and `0.58–1.75` deep. The
accepted ordinary bank population is retained, but its puffs overlap into broad local
banks rather than reading as separated patches.

The host's four weather layers divide the original far pass into `far` and `rear`, while
preserving the original middle and near boundaries.

The following experimental extras remain expressly excluded:

- continuous floor veil
- generic or vertical red haze
- front floor-energy line
- sprite reconstructions, pixelated or otherwise

## Reading-surface presentation

The RedWire application requests ordinary mist at intensity `0.46`. Reading-zone
attenuation is `0.48`, leaving enough of the low near field visible for the bottom of an
article to sit inside the atmosphere instead of cutting a nearly empty rectangle through
it. Control-zone attenuation remains `0.68`.

These are host profile values passed through Weather's existing public `applyProfile()`
contract. They do not add an article dependency, alter Optical geometry or introduce a
second compositor.

## Energy-palette colour policy

Weather uses only the RedWire energy palette:

- ordinary mist has a red body with brighter red local illumination;
- the `smoke` preset darkens the same banks into deep crimson and maroon values;
- electrical or heated weather may lift those reds toward orange;
- the chamber is never covered by a general colour wash to achieve this effect.

The bank colour changes locally inside each radial puff. It does not reintroduce haze,
a floor veil or the front floor-energy line. Blue-white remains the responsibility of
rare electrical Effects rather than the normal mist body.

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

## Capability boundary

The factory uses only:

- `context.layers.weather.far`
- `context.layers.weather.rear`
- `context.layers.weather.middle`
- `context.layers.weather.near`
- `context.runtime` for its sole recurring task
- `context.director` for environment and fault envelopes
- `context.integration.requireService("effects")`
- `context.views` for reading and control-zone attenuation
- `context.chamber` for read-only projection geometry

Construction is inert. `init()` creates one canvas in each supplied layer and registers
one task in runtime group `environment`. There is no private animation loop, interval
or per-bank timer.

## Immutable depth-frame surface

Weather publishes a read-only view of the exact mist field used by its most recent
ordinary render:

```js
const frame = weather.getDepthFrame(optionalFrameToken);

frame.renderForeground(context2d, {
  nearerThan: chamberZ,
  viewport: { left, top, width, height }
});
```

The chamber convention is explicit: **smaller positive `z` is nearer**. Foreground
selection therefore uses each visible puff's actual depth, `puffZ < chamberZ`; it does
not use the containing bank's centre or a fixed slice count.

The frame handle is frozen and exposes only metadata, a token and the rendering method.
Private bank and puff collections are never returned. `renderForeground()`:

- uses the same elapsed time, camera projection, colour, softness and puff positions as
  the normal Weather frame;
- performs no simulation update, spawn, reset or particle mutation;
- preserves the ordinary puff draw order after depth filtering;
- treats `viewport` only as a viewport-relative CSS-pixel rendering bound, equivalent
  to `getBoundingClientRect()` coordinates, with the target context origin corresponding to
  the viewport's top-left;
- reproduces the current reading/control attenuation unless
  `includeAttenuation: false` is explicitly supplied;
- allocates no canvas, timer or article-specific resource.

The surface knows nothing about articles or Optical. Integration may apply its own
pre-existing silhouette clip before calling the method. A frame becomes inert when a
new Weather state invalidates it, or when Weather is disabled, suspended, reset or
destroyed. Exact per-puff ordering is the reference contract; a banded implementation
is not prescribed and may only be introduced later as a proven internal optimisation.

## Effects boundary

Weather may request only:

- `electrical-disturbance` on `fault`
- `light-flash` on `environment`

Both requests are forced to the `ambient` purpose. Caller-supplied channel and purpose
values cannot override this policy.

## Profiles, suspension and cleanup

RedWire requests the broad-bank `mist` profile described above. Dripfeed disables
Weather completely.

Suspension stops the shared-runtime task, clears all canvases and hides them. Disable,
reset and destruction deactivate all banks and particles, cancel Weather-owned Effects
handles and remove all owned canvases without altering the integration slot.

## Validation

- `tests/weather-module.node.test.js` covers shared-runtime behaviour, deterministic
  replay, approved bank count/specification, exact immutable puff-depth frames, the
  absence of simulation mutation during external rendering, quality changes, Effects
  policy, suspension and cleanup.
- `tests/weather-mist-visual-contract.test.js` protects the renderer constants, broad
  ordinary-bank profile, RedWire reading attenuation, energy-palette colour policy and
  exact puff-depth publication while rejecting fixed depth slices, white mist, the floor
  veil, generic haze, front-energy line and sprite reconstructions.
- `tests/weather-pr86-host.test.js` performs the protected application round trip
  without replacing the incumbent slot.

Rendered desktop and mobile inspection remains the integration gate before merge.
