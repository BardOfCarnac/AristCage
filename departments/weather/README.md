# NCN Weather Department — PR-86 publication

This directory is the departmental candidate for the replaceable `weather` slot on
`agent/prepare-module-host`. It does not install itself, modify application roots,
replace the incumbent slot, or touch protected RedWire, Dripfeed, Optical or chamber
structures.

## Approved everyday mist

The default RedWire mist is the agreed **Floor Mist / Chamber Test 01 — Low mist**
bank renderer, adapted only to the four host-supplied depth layers and shared runtime.

Its visual constants are:

- density `0.62`
- height `0.34`
- opacity `0.58`
- lateral drift `+0.18`
- depth flow `-0.12`
- turbulence `0.42`
- softness `0.66`
- deterministic seed `2045`
- 36 active banks at ordinary desktop quality and the RedWire baseline intensity

Each bank uses three to five overlapping elliptical radial puffs. Bank dimensions,
lift, alpha and speed retain the ranges from the approved test. The host's four weather
layers divide the original far pass into `far` and `rear`, while preserving the original
middle and near boundaries.

The following experimental extras are expressly excluded:

- continuous floor veil
- generic or vertical red haze
- front floor-energy line
- sprite reconstructions, pixelated or otherwise

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

## Effects boundary

Weather may request only:

- `electrical-disturbance` on `fault`
- `light-flash` on `environment`

Both requests are forced to the `ambient` purpose. Caller-supplied channel and purpose
values cannot override this policy.

## Profiles, suspension and cleanup

RedWire requests `mist` at intensity `0.42` with seed `2045`; that baseline maps to the
approved visual values above. Dripfeed disables Weather completely.

Suspension stops the shared-runtime task, clears all canvases and hides them. Disable,
reset and destruction deactivate all banks and particles, cancel Weather-owned Effects
handles and remove all owned canvases without altering the integration slot.

## Validation

- `tests/weather-module.node.test.js` covers shared-runtime behaviour, deterministic
  replay, approved bank count/specification, the absence of linear haze gradients,
  quality changes, Effects policy, suspension and cleanup.
- `tests/weather-mist-visual-contract.test.js` protects the agreed mist constants,
  energy-palette colour policy and bank construction while rejecting white mist,
  the floor veil, generic haze, front-energy line and sprite reconstructions.
- `tests/weather-pr86-host.test.js` performs the protected application round trip
  without replacing the incumbent slot.

Rendered desktop and mobile inspection remains the integration gate before merge.
