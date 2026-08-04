# AristCage production ownership inventory

Status: production boundary recorded after legacy viewer archival on 4 August 2026.

This document describes what is installed by the normal `index.html` application. It is a resource and authority inventory, not a proposed directory layout.

## Archived reference systems

The following reference systems were preserved at the exact pre-removal commit `c46b80e00502d6368a68709e934bdbff49825978` and are no longer installed by production `main`:

| Reference | Archive branch | Production removal |
| --- | --- | --- |
| Interactive Chamber Lab | `archive/chamber-lab-final-2026-08-04` | Lab mode, feed redraw, wheel/touch interaction, feed `MutationObserver`, persisted Lab restoration and Lab CSS are absent. |
| Pre-Optics DOM parallax viewer | `archive/pre-optics-parallax-final-2026-08-04` | `js/projection.js`, `NCN_PROJECTION_PROFILE`, projection travel configuration, per-part `--projection-y` transforms and scroll/resize updates are absent. |

The active Projection lifecycle is **not** the archived parallax viewer. `Projection`, `presence.js` and `layout.js` continue to own article resolve/dismiss transactions. The active background chamber is **not** Chamber Lab. It remains the geometry and boot-presentation source used by Optical, Weather and Dripfeed.

## Production authority map

| Concern | Canonical owner | Public boundary | Explicit non-owner |
| --- | --- | --- | --- |
| Shared visual scheduling | `NCNViewerRuntime` | `register`, quality, group suspension, runtime snapshot | Individual Weather effects, diagnostics and Integration must not create competing frame loops. |
| Viewer lifecycle | `NCNViewerLifecycle` | activation, suspension, readiness and shutdown states | Departments do not decide application lifecycle independently. |
| Scene cancellation | `NCNScene` | scene tokens and stale-work cancellation | Effect implementations do not invent private scene generations. |
| Cross-system composition | `NCNIntegration` and `NCNIntegratedDepartments` | service registration, profile routing, readiness | Integration does not mutate departmental policy or simulation state. |
| Background chamber shell | `LayeredChamber` | `OFF`/`BACKGROUND`, presentation snapshot, energy injection | Chamber Lab is archived; the shell does not render article copies or own feed interaction. |
| Chamber camera | `NCNChamberCamera` | immutable snapshots, projection and aperture queries | Optical, Weather and Dripfeed do not maintain separate chamber cameras. |
| RedWire article optics | `OpticalProjection` | semantic plane definitions, enable/disable, refresh | Weather does not query Optical private implementation state; the old DOM parallax viewer is archived. |
| Weather simulation and rendering | `NCNWeatherDepartment` | one service, one shared-runtime render task, profile/seed/wind/quality lifecycle, four layer canvases | Individual effects do not register tasks, create fullscreen canvas banks or interpret application state. |
| Weather/article composition | `NCNRedWireWeatherCardOcclusion` | Weather after-render subscription plus public Optical rectangles | It does not change Weather profiles, wind, seed or density. |
| Chamber movement | Chamber Movement department | movement profile, trigger/settle/cancel and published motion state | It does not own host application traffic policy or Weather. |
| Fault/effect catalogue | Effects department | accepted effect request service | Weather may request accepted effects but does not install a second Effects runtime. |
| RedWire application | RedWire feed/state/presence modules | article state, panels and projection transactions | RedWire does not control Dripfeed presentation. |
| Dripfeed application | `NCNDripfeed`, Dripfeed surface controller and chamber bridge | publication surfaces, controls, reader and chamber-owned placement | Dripfeed does not inherit RedWire Weather or Chamber Movement. |
| Developer diagnostics | `diagnostics.js` plus `NCNDevPanel` | explicit `?debug=1`, keyboard or triple-mark activation | Ordinary visits create no diagnostic panel, diagnostic runtime task or diagnostic observers. |
| Development-only rangefinder | `HeuristicRangefinder` | diagnostic control or direct development API | It is not exposed in the production rail and is not mounted during ordinary use. |

## Runtime-backed resource ledger

### Normal RedWire baseline

After accepted departments are ready and RedWire is active:

- **one shared visual runtime** owns persistent departmental tasks;
- **two mounted Chamber canvases** exist: `#layered-chamber-bg` and `#layered-chamber-fg`;
- **four mounted Weather canvases** exist: far, rear, middle and near;
- **Optical uses DOM semantic planes**, not another fullscreen canvas bank;
- **the archived parallax renderer contributes no scroll listener, resize listener, global function or CSS transform**;
- **the archived Chamber Lab contributes no wheel/touch listeners and no feed `MutationObserver`**.

Therefore the ordinary RedWire canvas baseline is **six mounted canvases**.

### Conditional resources

These are legitimate but must remain conditional and visible in diagnostics:

- Heavy mist may create one mounted `ncn-redwire-weather-foreground` canvas and one detached mask canvas. Both belong to the Integration compositor and are released on application exit.
- Enabling the development-only rangefinder may create one additional chamber canvas and its interaction surface. It must not exist during ordinary use.
- Diagnostics may register its bounded telemetry task and listeners only while diagnostics are explicitly active.

### Weather contract

Weather currently owns:

- exactly four layer keys: `far`, `rear`, `middle`, `near`;
- exactly one registration with `NCNViewerRuntime` for its canonical render step;
- profile blending and effective intensity;
- Visual Director envelope consumption;
- X/Y/Z wind;
- quality and DPR selection;
- seed and deterministic simulation state;
- canvas creation, sizing, visibility and destruction;
- depth-frame publication and after-render subscriptions.

A new Weather effect may own its private simulation data. It may not own another application lifecycle, runtime task, fullscreen canvas bank, resize observer, random source, wind source, Optical selector policy or diagnostics controller.

## Production assembly rules

1. `index.html` installs only the active application and explicitly query-gated probes.
2. Archived viewers are not selectable by query string, persisted storage, normal controls or script order.
3. RedWire activates Optical, Weather and Chamber Movement through the environment/integration profile.
4. Dripfeed retains the background chamber but receives neither RedWire Weather nor Chamber Movement.
5. Diagnostics exercise canonical public services and restore the active application profile on exit.
6. Comparison or parity work must occur on an archive branch or a deliberately development-only branch, never by silently loading both implementations in production.

## Automated evidence

`tests/production-ownership-contract.test.js` validates the source boundary. `js/production-ownership-probe.js`, enabled only with `?ownershipProbe=1`, validates the mounted browser boundary and publishes its resource count, active services and violations for CI.
