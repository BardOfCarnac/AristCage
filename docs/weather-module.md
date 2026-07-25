# NCN Weather Department — Published Chamber Weather Module

## Package

- `js/weather-presets.js` — data-only preset definitions.
- `js/weather-module.js` — `createWeather(context)` factory.
- `css/weather-module.css` — layer/canvas presentation rules.
- `js/weather-renderer.js` — AristCage integration adapter and backwards-compatible `NCNWeatherRenderer` API.
- `weather-demo.html` — standalone chamber demonstration.
- `tests/weather-module-tests.html` — browser acceptance and cleanup tests.

The production factory does not create an animation loop, chamber geometry or application lifecycle. It registers one task with the supplied shared runtime.

## Required context

```js
const weather = createWeather({
  id: "redwire-weather",
  runtime: NCNViewerRuntime,
  presets: NCNWeatherPresets,
  layers: {
    far: farAtmosphereLayer,
    rear: rearWeatherLayer,
    middle: middleWeatherLayer,
    near: nearWeatherLayer
  },
  camera: () => NCNChamberCamera.snapshot(),
  allowAmbient: () => NCNViewerLifecycle.allows("ambient"),
  effects: effectsDirector,
  blockEvents: window,
  resizeTarget: window,
  seed: 2045,
  intensity: 0.35
});

await weather.init();
```

Each supplied layer may be an element or a canvas. When an element is supplied, the module creates one canvas inside it and removes that canvas during `destroy()`. The caller owns the layer elements.

## Public controls

```js
await weather.init();
weather.setPreset("mist");
weather.setIntensity(0.35);
weather.transitionTo("rain", { duration: 3000 });
weather.setReadingZone({ element: articleLayer, attenuation: 0.8 });
weather.setControlZones([{ element: rail, attenuation: 0.65 }]);
weather.setWind({ x: 0.2, y: 0, z: -0.1 });
weather.setQuality("medium");
weather.setSeed(2045);
weather.setEnabled(true);
weather.suspend();
weather.resume();
weather.reset();
weather.clearImmediate();
weather.attenuateForTransition(0.2);
weather.addDisturbance({ x: 0, y: -0.5, z: 4.5, radius: 1.6, strength: 0.5 });
weather.requestElectricalPulse(0.25);
weather.snapshot();
weather.destroy();
```

`requestElectricalPulse()` never decides to create a major fault. It asks the supplied effects director for `electrical-flash` and `mist-illumination`. Returning `false` from the effects director suppresses the pulse.

## Presets

The first package contains:

- `clear`
- `dust`
- `mist`
- `heavy-mist`
- `light-rain`
- `rain`
- `electrical-weather`

Presets share one data model: atmosphere, particle definitions, layer weights, wind and electrical potential. Transitions blend those fields and allow old particles to expire naturally while the new spawn profile takes over.

## Reading priority

`setReadingZone()` applies both:

1. a local destination-out attenuation mask around the supplied element or rectangle;
2. a modest global intensity reduction while that zone is active.

Controls can be protected separately with `setControlZones()`. AristCage's adapter automatically tracks expanded RedWire entries, the rail, open panels and the desktop inspector.

## Shared runtime behaviour

The factory registers exactly one task. It does not call `requestAnimationFrame()` or `setInterval()`.

- spawning stops while suspended or while `allowAmbient()` returns false;
- existing particles continue only when the shared runtime invokes the task;
- tab restoration produces no large simulation jump because delta is clamped to 50 ms;
- a clear, settled chamber allows the runtime task to sleep;
- transitions and setting changes wake the task through the runtime handle.

## Particle caps and quality

Default hard caps are:

| Quality | Mist | Dust | Rain | Max FPS | DPR cap |
|---|---:|---:|---:|---:|---:|
| low | 26 | 36 | 64 | 12 | 1.0 |
| medium | 46 | 58 | 112 | 20 | 1.2 |
| high | 72 | 90 | 180 | 30 | 1.5 |
| reduced | 14 | 12 | 0 | 8 | 1.0 |

Caller-supplied `particleCaps` may lower these limits but cannot exceed the selected quality cap. Pools are fixed and reused; failed spawn attempts do not allocate replacements.

Reduced quality removes rain spawning, greatly reduces motion and uses sparse mist/dust. `clearImmediate()` is the accessibility/performance emergency path and removes all active particles in the same call.

## Effects integration

Supported requests:

```js
effects.play("electrical-flash", middleLayer, {
  intensity: 0.25,
  source: "redwire-weather"
});

effects.play("mist-illumination", rearLayer, {
  intensity: 0.18,
  duration: 800,
  source: "redwire-weather"
});
```

The module does not implement general glitching or major fault scheduling. The AristCage adapter dispatches a cancellable `ncn:effect-request` event when the current effects controller does not expose `play()`.

## Optional block interaction

Supply an `EventTarget` as `blockEvents`. The module listens for:

- `ncn:block-motion-start`
- `ncn:block-motion-pulse`
- `ncn:block-motion-settle`

Event detail may contain `x`, `y`, `z`, `radius`, `strength` and `life`. Missing block infrastructure has no effect on weather operation.

## Cleanup contract

`destroy()`:

- unregisters the shared runtime task;
- removes every listener registered by the module;
- deactivates and releases all particle pools;
- clears sprite caches;
- removes every canvas the module created;
- leaves caller-owned environmental layers intact.

A destroyed instance cannot be reinitialised; create a new instance instead.

## Validation

Open:

- `weather-demo.html` for preset, intensity, wind, reading-zone, quality, suspend/resume, block pulse, electrical request, reset and destroy controls;
- `tests/weather-module-tests.html` for the acceptance test sequence.

The browser tests check supplied-layer initialisation, mist operation, rain transition, reading-zone registration, suspended spawn behaviour, bounded resume, clean reset and complete canvas disposal.

The JavaScript files are syntax-checked as part of publication. A rendered browser/device pass is still required before merging, especially for mobile attenuation masks, visual density and low-power tuning.
