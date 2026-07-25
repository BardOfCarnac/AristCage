# NCN Effects Department

## Purpose

`js/effects.js` is the shared visual-effects library for Night City News. It creates requested visual primitives and enforces technical rules around targets, duration, cancellation, cleanup, suspension and concurrency.

It does not choose lifecycle state, boot order, weather, weather intensity, chamber blocks, article state or random global event timing.

The existing `NCNViewerLifecycle` remains the authority over machine state. The existing `NCNViewerRuntime` remains the authority over frame scheduling.

## Loading order

The application already loads the shared runtime and lifecycle. Effect files must follow them:

```html
<link rel="stylesheet" href="css/effects.css">
<script src="js/viewer-runtime.js"></script>
<script src="js/viewer-lifecycle.js"></script>
<script src="js/effects-core.js"></script>
<script src="js/effects-targets.js"></script>
<script src="js/effects.js"></script>
<script src="js/effects-signal.js"></script>
<script src="js/effects-disturbance.js"></script>
```

`effects-core.js` publishes the factory, `effects-targets.js` publishes target adapters, and `effects.js` creates `window.NCNEffects`; catalogue files then register named implementations against that instance. Loading the package does not play an effect or start a permanent loop.

## Public API

The default instance is `window.NCNEffects`. Independent instances can be created with `window.createEffects(context)`.

```js
await NCNEffects.init();

const handle = NCNEffects.play("signal-fault", target, {
  intensity: 0.4,
  duration: 600,
  seed: 1234,
  channel: "fault",
  concurrency: "replace",
  priority: 90
});

handle.cancel("superseded");
const result = await handle.finished;

NCNEffects.setGlobalIntensity(0.75);
NCNEffects.setReducedMotion(false);
NCNEffects.suspend();
NCNEffects.resume();
NCNEffects.clear();
NCNEffects.destroy();
```

A handle exposes:

- `id`, `name`, `target`, `channel`, `priority`, `intensity` and `state`;
- `finished`, which resolves on completion, cancellation, clearing, replacement, failure or ignore;
- `cancel(reason)`;
- `setIntensity(value)`.

## Registration

```js
NCNEffects.register("relay-scan", relayScanDefinition);
NCNEffects.unregister("relay-scan");
```

An effect definition may provide:

```js
{
  channel: "interface",
  concurrency: "replace",
  duration: 500,
  maxFps: 30,
  cost: "B",
  features: ["DOM overlay"],
  defaults: { intensity: 0.5 },
  create(context) { return controller; },
  reducedCreate(context) { return reducedController; }
}
```

A controller may provide `frame`, `cleanup`, `setIntensity`, `suspend`, `resume`, `merge` and a duration or frame-rate override.

Cleanup is invoked on every terminal path.

## Targets

Effects accept a DOM `Element` or an adapter:

```js
{
  kind: "chamber-block",
  id: "right-4-7",
  getElement() {},
  getBounds() {},
  isValid() {},
  createOverlay(className) {},
  createCloneOverlay(className) {},
  invalidate() {}
}
```

Factories are available at `NCNEffectTargets`:

```js
NCNEffectTargets.element(element);
NCNEffectTargets.glyph(element);
NCNEffectTargets.article(entryIdOrElement);
NCNEffectTargets.optical(entryId, "headline");
NCNEffectTargets.chamber();
NCNEffectTargets.chamberWall("rear");
NCNEffectTargets.chamberBlock();
NCNEffectTargets.environment("front");
NCNEffectTargets.terminal();
NCNEffectTargets.adapter(customAdapter);
```

The current DOM-backed `.ncn-chamber-block` is targetable directly. A future multi-block or canvas-backed implementation should publish a stable provider through `NCNChamberMotion.getEffectTarget(descriptor)` or `LayeredChamber.getEffectTarget("block", descriptor)`.

## Channels and concurrency

Recommended channels are:

- `interface`
- `chamber`
- `article`
- `environment`
- `fault`
- `boot`

Concurrency is scoped to a target and channel:

- `stack`: coexist;
- `replace`: cancel occupants with lower or equal priority;
- `ignore`: do not start when occupied;
- `queue`: wait for current occupants;
- `merge`: update a compatible active controller or reuse its handle.

The external director chooses channels, priorities and visual intensity. The effects library only applies the requested technical policy.

## Catalogue

| Effect | Default channel | Cost | Required features |
|---|---|---:|---|
| `glow-pulse` | interface | A | DOM, CSS filter |
| `flicker` | interface | A | DOM |
| `relay-scan` | interface | B | DOM overlay |
| `heat-resolve` | article | B | clone overlay, CSS filter |
| `signal-collapse` | article | B | clone overlay, CSS filter |
| `displacement` | fault | B | clone overlay |
| `channel-separation` | fault | C | two clone overlays, blend mode |
| `static-burst` | fault | B | overlay, gradients |
| `light-flash` | interface | A | overlay |
| `blur-interference` | fault | C | clone overlay, blur filter |
| `particle-emission` | environment | C | DOM particles |
| `electrical-disturbance` | chamber | C | generated SVG path |
| `signal-fault` | fault | D | composite clone and static overlays |

Cost classes are approximate:

- A: one element or variable;
- B: one overlay or clone;
- C: several layers, filters or particles;
- D: large-area composite effect;
- E: specialist WebGL or heavy canvas processing.

The initial catalogue requires no WebGL or shaders. Blur and composite effects scale with target area. Particle cost scales with intensity and requested count.

## Runtime behaviour

Every animated effect registers a temporary named task with `NCNViewerRuntime`. It does not create a private RAF loop.

The runtime already sleeps between due frames and pauses hidden documents. Effects additionally pause their own logical elapsed time during `NCNEffects.suspend()`, so resumption does not create an accumulated jump.

Finite effects must have a duration or return `false`/`{done: true}` from their frame controller.

## Randomness

Randomised effects use a deterministic generator. Passing the same effect, target, options and seed produces the same random sequence for testing.

Effect implementations must not call `Math.random()` for visual variation.

## Intensity and reduced motion

Substantial effects accept an intensity from `0` to `1`. Effective intensity is multiplied by the global intensity.

Reduced-motion mode selects a substitute where one is defined. Examples include:

- static glow rather than repeated movement;
- a restrained interference frame rather than shake;
- crossfade rather than spatial collapse;
- fewer particles rather than no response.

The caller uses the same effect name in both modes.

## Compatibility boundary

The former public controls remain available:

```js
NCNEffects.setProfile({ ambient: true, interaction: true });
NCNEffects.setAmbientEnabled(true);
NCNEffects.pulseEntry(entry, options);
NCNEffects.titleJitter(options);
NCNEffects.registrationFault(options);
NCNEffects.snapshot();
```

They now request registered effects. They no longer attach global click/scroll directors or schedule random faults. Narrative scheduling belongs to an external director.

## Optical preservation

The Effects Department does not change Optical plane definitions, depth, scaling, port mapping, article layout or primary DOM structure.

The Optical renderer can adopt shared effects incrementally through its protected presentation profile. Existing Optical animation must not be removed until visual equivalence is demonstrated.

## Gallery and tests

- `effects-gallery.html` exposes all effects, target sizes, intensity, duration, seed, channel, concurrency and reduced-motion controls.
- `tests/effects-smoke.html` verifies playback, cancellation, replay cleanup, queueing, priority replacement, suspension, reduced motion, clearing, deterministic seeds, compatibility wrappers and destruction.
