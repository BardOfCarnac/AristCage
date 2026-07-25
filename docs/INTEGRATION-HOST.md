# NCN Viewer Integration Host

The production viewer exposes a stable receiving shell for boot, weather,
effects and chamber-rearrangement modules while preserving the established
RedWire Optical renderer and Dripfeed application.

## Ownership

- `NCNViewerLifecycle` decides which machine state is active.
- `NCNViewerRuntime` schedules recurring visual work and owns the shared frame loop.
- `NCNEvents` carries module-to-module messages.
- `NCNScene` provides named DOM and projection surfaces.
- `NCNOptical` protects the established Optical renderer behind a narrow adapter.
- `NCNDripfeed` protects the established tile wall and reader behind a narrow adapter.
- `NCNModules` owns module initialisation, suspension, reset and destruction.
- `NCNViewerHost` composes these services into the context supplied to modules.

Neither application renderer is a general-purpose environmental surface. Incoming
modules must use terminal-owned environment layers and the view adapters.

## Module context

A factory registered through `NCNViewerHost.registerModule()` receives:

```js
{
  runtime,
  lifecycle,
  events,
  scene,
  layers,
  views,
  optical,
  dripfeed,
  applications,
  environment,
  settings
}
```

Useful dynamic values include:

```js
context.settings.reducedMotion;
context.settings.quality;
context.layers.weather;       // { far, rear, middle, near }
context.layers.chamberMotion;
context.layers.effects;
context.views.getReadingZone();
context.views.getControlZones();
context.views.getDepthPlaneDefinitions();
```

Reading and control zones use the same shape:

```js
{
  element,
  rect: { left, top, right, bottom, width, height }
}
```

## Registering an incoming module

```js
NCNViewerHost.registerModule("weather-v2", context => {
  const weatherLayers = context.layers.weather;
  const task = context.runtime.register("weather-v2:update", update, {
    group: "environment",
    maxFps: 20,
    enabled: false
  });

  function update(frame) {
    // Return true while another frame is required.
    return false;
  }

  return {
    init() {},
    suspend() { task.suspend(); },
    resume() { task.resume(); },
    reset() { task.reset(); },
    destroy() {
      task.unregister();
      Object.values(weatherLayers).forEach(layer => layer.replaceChildren());
    }
  };
});
```

Lifecycle methods are optional, but any exposed `init`, `suspend`, `resume`,
`reset` or `destroy` property must be a function. Active modules must be destroyed
before replacement. Circular module dependencies are rejected.

Dependency order governs the whole lifecycle: dependencies initialise and resume
first; dependants suspend, reset and destroy first.

The host keeps stable compatibility adapters named `weather`, `effects` and
`chamber-motion`. A published department module may replace the corresponding
global implementation (`NCNWeatherRenderer`, `NCNEffects` or `NCNChamberMotion`)
without rewriting host lifecycle code, provided it exposes the agreed methods.

Modules must not query into the Optical or Dripfeed renderers, replace chamber
roots or create permanent private `requestAnimationFrame` loops.

## Named scene surfaces

- `viewer`
- `interface`
- `application`
- `application:redwire`
- `application:dripfeed`
- `chamber`
- `optical`
- `environment`
- `environment:weather-far`
- `environment:weather-rear`
- `environment:weather-middle`
- `environment:weather-near`
- `environment:chamber-motion`
- `environment:effects`
- `weather:far`
- `weather:rear`
- `weather:middle`
- `weather:near`

`weather-mid` and `mid` remain accepted aliases for `weather-middle`, but new
modules should publish against `far`, `rear`, `middle` and `near`.

## Passive verification

Use the browser console:

```js
NCNViewerHost.verify();
```

This confirms that the shared services, protected application boundaries, named
layers, module states and active application roots are coherent without changing
viewer state.

## Lifecycle smoke test

```js
NCNViewerHost.snapshot();
await NCNViewerHost.suspend("manual-test");
await NCNViewerHost.resume("manual-test");
await NCNViewerHost.reset("manual-test");
NCNViewerHost.verify({ throwOnFailure: true });
```

A successful reset returns the current application to its active environment
profile, leaves one runtime scheduler, and preserves both protected application
compositions.