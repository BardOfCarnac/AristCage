# NCN Viewer Integration Host

The production viewer now exposes a stable receiving shell for boot, weather,
effects and chamber-rearrangement modules.

## Ownership

- `NCNViewerLifecycle` decides which machine state is active.
- `NCNViewerRuntime` schedules recurring visual work and owns the shared frame loop.
- `NCNEvents` carries module-to-module messages.
- `NCNScene` provides named DOM and projection surfaces.
- `NCNOptical` protects the established Optical renderer behind a narrow adapter.
- `NCNModules` owns module initialisation, suspension, reset and destruction.
- `NCNViewerHost` composes these services into the context supplied to modules.

## Registering an incoming module

```js
NCNViewerHost.registerModule("weather-v2", context => {
  const layer = context.scene.require("environment:weather-mid");
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
    destroy() { task.unregister(); layer.replaceChildren(); }
  };
});
```

Modules must not query into the Optical renderer, replace chamber roots or create
permanent private `requestAnimationFrame` loops.

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
- `environment:weather-mid`
- `environment:weather-near`
- `environment:chamber-motion`
- `environment:effects`

## Host verification

Use the browser console:

```js
NCNViewerHost.snapshot();
await NCNViewerHost.suspend("manual-test");
await NCNViewerHost.resume("manual-test");
await NCNViewerHost.reset("manual-test");
NCNViewerHost.snapshot();
```

A successful reset returns the current application to its active environment
profile, leaves one runtime scheduler, and preserves the Optical composition.
