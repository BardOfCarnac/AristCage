# NCN Effects Department Publication

## Status

This package is a departmental candidate for the replaceable `effects` slot in the PR 86 integration host. It is not installed by the publication itself and does not alter production script loading.

Factory:

```js
createNCNEffectsDepartment(context)
```

Manifest:

```js
NCNEffectsDepartmentManifest
```

The integration agent performs intake and staged replacement.

## Ownership

The department owns:

- the locked canonical effect registry;
- temporary effect nodes inside `environment:effects`;
- temporary tasks registered in shared runtime group `effects`;
- effect handles, queues, cancellation and cleanup;
- one temporary stylesheet containing rules for module-created children.

It does not own or restyle the `environment:effects` layer itself. The host retains all layer positioning, sizing, containment and z-index. The module does not add classes, datasets or inline styles to that host-owned layer.

It does not modify RedWire, Dripfeed, Optical or chamber structures. Source targets are measured and, where needed, cloned into the effects layer. They are not wrapped, classed or styled by the module.

## Public lifecycle API

```js
init()
applyProfile(profile, meta)
suspend()
resume()
reset()
destroy()
```

## Public playback API

```js
play(name, target, options)
cancel(handleOrId, reason)
clear(filter)
snapshot()
```

Additional read-only helpers are `list()`, `names()` and `subscribe(listener)`. Canonical registration is private. The returned dependency service does not expose `register()`.

## Public effect names

- `glow-pulse`
- `flicker`
- `relay-scan`
- `heat-resolve`
- `signal-collapse`
- `displacement`
- `channel-separation`
- `static-burst`
- `light-flash`
- `blur-interference`
- `particle-emission`
- `electrical-disturbance`
- `signal-fault`

The catalogue is installed while the factory constructs the module, duplicate names are rejected, and the registry is locked before the instance is returned.

## Request purpose and application policy

Every playback request has one of three purposes:

```text
ambient
interaction
required
```

A purpose can be passed explicitly:

```js
const handle = effects.play("signal-fault", target, {
  purpose: "ambient",
  channel: "fault",
  intensity: 0.45,
  duration: 600,
  seed: 2045
});
```

When omitted, purpose is inferred from the channel:

- `boot` becomes `required`;
- `interface` and `article` become `interaction`;
- `environment`, `chamber` and `fault` become `ambient`.

`applyProfile(profile, meta)` enforces the current application policy:

```js
applyProfile({
  enabled: true,
  ambient: false,
  interaction: false,
  intensity: 0.8
}, {
  application: "dripfeed",
  reason: "application-switch"
});
```

Disallowed active and queued work is cleared. New disallowed work returns an ignored handle without creating a director claim, runtime task or node. `required` work remains available while the module is enabled.

Changing profile intensity attenuates active permitted effects through their live intensity source.

## Visual director

Every started effect requests both:

```js
context.director.envelope(channel, { intensity })
context.director.claim(channel, { intensity, priority, exclusive })
```

The effective intensity comes from the granted claim. A live effect releases and reacquires its claim when its requested intensity changes. Merge requests therefore strengthen compatible active effects only when the director grants the new authority.

All claims are released on completion, cancellation, profile rejection, suspension, reset and destruction.

## Concurrency

Concurrency is scoped to target and visual channel:

- `stack`
- `replace`
- `ignore`
- `queue`
- `merge`

`merge` applies only to an active effect with the same public name. The existing handle is returned and its live intensity is updated. Incompatible merge requests are ignored rather than mutating another effect type.

## Suspension

Suspension:

- hides every active module-created visual node;
- releases active visual-director claims;
- suspends shared-runtime tasks;
- invokes controller suspension hooks;
- rejects new playback without creating nodes, claims or tasks.

Resume reacquires authority, restores visibility and resumes tasks without an accumulated frame jump. Effects denied by the current profile or director are cancelled cleanly rather than reappearing without authority.

## Reduced motion

Reduced motion is taken from the host runtime quality state. The department adds no private media-query listener.

Substitutes preserve visual identity through restrained glow, crossfade, static interference, reduced particles and restrained electrical response. The caller uses the same public effect name.

## Deterministic testing

All variation uses a local seeded generator. Catalogue implementations do not call `Math.random()`.

The same effect, target geometry, frame sequence, options and seed produce the same visual sequence. The deterministic Node harness compares the actual generated style outcome of repeated seeded playback.

## Cleanup guarantees

Every terminal path removes or releases:

- visual-director claims;
- shared-runtime tasks;
- temporary overlays and clones;
- particles and generated SVG paths;
- the module stylesheet;
- runtime and public subscriptions;
- department-owned lifecycle locks.

`destroy()` leaves `environment:effects` empty while preserving the host layer’s own class, dataset and inline style state.

`snapshot()` reports:

- lifecycle state;
- locked-registry state;
- current profile;
- registered public names;
- active and queued effects;
- purpose, intensity and seed for active handles;
- temporary-node count;
- runtime-task count;
- listener count;
- layer connectivity.

## Verification

Local deterministic verification:

```bash
node tests/effects-department-node.js
```

The harness covers:

- host-layer ownership;
- canonical registry locking;
- named playback and cancellation;
- replay and queue cleanup;
- suspension visibility and claim release;
- playback rejection while suspended;
- application-profile enforcement;
- required-purpose bypass of ambient and interaction suppression;
- live merge strengthening and active attenuation;
- reduced-motion substitution;
- seeded visual determinism;
- clear and destroy cleanup;
- untouched source and host elements.

The integration workflow syntax-checks every publication JavaScript file and executes the deterministic cleanup harness. The integration agent still owns intake, staged installation and the protected RedWire/Dripfeed browser round trip.
