/*==================================================
  PRODUCTION OWNERSHIP PROBE

  Inert during ordinary use. With ?ownershipProbe=1 it verifies the mounted
  production boundary and publishes a machine-readable resource inventory for
  CI. It installs no persistent observer, listener or runtime task.
==================================================*/
(() => {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  if (params.get("ownershipProbe") !== "1") return;

  const root = document.documentElement;
  const output = document.createElement("pre");
  output.id = "production-ownership-probe";
  output.hidden = true;
  document.body.append(output);

  function serialise(value) {
    try { return JSON.stringify(value, null, 2); }
    catch (error) {
      return JSON.stringify({ serialisationError: String(error?.message || error) });
    }
  }

  function publish(status, detail) {
    root.dataset.ownershipProbeStatus = status;
    root.dataset.ownershipProbeMessage = String(detail?.message || status).slice(0, 500);
    output.dataset.status = status;
    output.textContent = serialise(detail);
  }

  function waitFor(predicate, timeout = 20_000) {
    const started = performance.now();
    return new Promise((resolve, reject) => {
      const poll = () => {
        let value = null;
        try { value = predicate(); }
        catch (error) { reject(error); return; }
        if (value) { resolve(value); return; }
        if (performance.now() - started >= timeout) {
          reject(new Error("Timed out waiting for the mounted production boundary."));
          return;
        }
        window.setTimeout(poll, 50);
      };
      poll();
    });
  }

  function moduleSnapshot() {
    return window.NCNModules?.snapshot?.() || [];
  }

  function serviceSnapshot(name) {
    try { return window.NCNIntegration?.getService?.(name)?.snapshot?.() || null; }
    catch (error) { return { snapshotError: String(error?.message || error) }; }
  }

  function canvasName(canvas) {
    return canvas.id || canvas.className || "anonymous-canvas";
  }

  Promise.resolve().then(async () => {
    try {
      await window.NCNIntegratedDepartments?.ready?.();
      await waitFor(() => (
        window.NCNApplications?.current?.() === "redwire"
        && window.LayeredChamber?.getMode?.() === window.LayeredChamber?.MODES?.BACKGROUND
        && window.OpticalProjection?.isEnabled?.() === true
        && document.querySelectorAll(".ncn-department-weather-canvas").length === 4
        && document.querySelectorAll(".ncn-chamber-motion-canvas").length === 3
        && document.querySelectorAll(".optical-plane").length === 10
        && document.querySelector(".ncn-floor-mist")?.dataset.ncnLegacyWeatherRetired === "true"
        && document.querySelector(".ncn-chamber-block")?.dataset.ncnLegacyChamberMotionRetired === "true"
      ));

      const chamberCanvasNodes = [...document.querySelectorAll(".layered-chamber-canvas")];
      const weatherCanvasNodes = [...document.querySelectorAll(".ncn-department-weather-canvas")];
      const motionCanvasNodes = [...document.querySelectorAll(".ncn-chamber-motion-canvas")];
      const compatibilityWeatherCanvas = document.querySelector("canvas.ncn-floor-mist");
      const compatibilityMotionBlock = document.querySelector(".ncn-chamber-block");
      const allCanvasNodes = [...document.querySelectorAll("canvas")];

      const chamberCanvases = chamberCanvasNodes.map(canvasName);
      const weatherCanvases = weatherCanvasNodes.map(canvasName);
      const movementCanvases = motionCanvasNodes.map(canvas => Object.freeze({
        name: canvasName(canvas),
        role: canvas.dataset.ncnChamberMotionCanvas || null,
        hidden: canvas.hidden === true,
        connected: canvas.isConnected
      }));
      const allCanvases = allCanvasNodes.map(canvasName);
      const chamberModes = Object.values(window.LayeredChamber?.MODES || {}).sort();
      const modules = moduleSnapshot();
      const weather = serviceSnapshot("weather");
      const motion = serviceSnapshot("chamber-motion");
      const effects = serviceSnapshot("effects");
      const compositor = window.NCNRedWireWeatherCardOcclusion?.snapshot?.() || null;
      const compatibilityWeather = window.NCNWeatherRenderer?.snapshot?.() || null;
      const compatibilityMotion = window.NCNChamberMotion?.snapshot?.() || null;
      const movementRoles = movementCanvases.map(item => item.role).sort();

      const checks = Object.freeze({
        redwireActive: window.NCNApplications?.current?.() === "redwire",
        noLegacyRailControls: !document.querySelector(
          "#layered-chamber-toggle, #heuristic-rangefinder-toggle, #optical-projection-toggle"
        ),
        noParallaxFunction: typeof window.updateProjection === "undefined",
        noParallaxProfile: typeof window.NCN_PROJECTION_PROFILE === "undefined",
        noParallaxTravelConfig: !Object.prototype.hasOwnProperty.call(
          window.NCN_CONFIG || {},
          "projection"
        ),
        chamberModesAreProductionOnly: chamberModes.join("|") === "background|off",
        chamberBackgroundActive: window.LayeredChamber?.getMode?.() === "background",
        noLabClass: !root.classList.contains("layered-chamber-lab-mode"),
        noPersistedLabMode: window.localStorage.getItem("ncn-layered-chamber") === null,
        chamberCanvasCount: chamberCanvases.length === 2,
        weatherCanvasCount: weatherCanvases.length === 4,
        movementCanvasCount: movementCanvases.length === 3,
        movementCanvasRoles: movementRoles.join("|") === "foreground-mist|production|wall-matched",
        compatibilityWeatherCanvasDocumented: Boolean(
          compatibilityWeatherCanvas
          && compatibilityWeatherCanvas.isConnected
          && compatibilityWeatherCanvas.hidden === true
          && compatibilityWeatherCanvas.dataset.ncnLegacyWeatherRetired === "true"
          && compatibilityWeatherCanvas.classList.contains("is-enabled") === false
        ),
        compatibilityWeatherDormant: Boolean(
          compatibilityWeather
          && compatibilityWeather.enabled === false
          && Number(compatibilityWeather.targetMist) === 0
        ),
        compatibilityMotionBlockDocumented: Boolean(
          compatibilityMotionBlock
          && compatibilityMotionBlock.isConnected
          && compatibilityMotionBlock.hidden === true
          && compatibilityMotionBlock.dataset.ncnLegacyChamberMotionRetired === "true"
          && compatibilityMotionBlock.classList.contains("is-moving") === false
        ),
        compatibilityMotionDormant: Boolean(
          compatibilityMotion
          && compatibilityMotion.enabled === false
          && compatibilityMotion.active === false
        ),
        connectedCanvasBaseline: allCanvases.length === 10,
        canonicalCanvasBaseline: (
          chamberCanvases.length + weatherCanvases.length + movementCanvases.length
        ) === 9,
        noUnexpectedCanvas: allCanvasNodes.every(canvas => (
          chamberCanvasNodes.includes(canvas)
          || weatherCanvasNodes.includes(canvas)
          || motionCanvasNodes.includes(canvas)
          || canvas === compatibilityWeatherCanvas
        )),
        noRangefinderSurface: !document.querySelector(
          "#heuristic-rangefinder-plane, .heuristic-rangefinder-hit-surface"
        ),
        opticalEnabled: window.OpticalProjection?.isEnabled?.() === true,
        opticalPlaneCount: document.querySelectorAll(".optical-plane").length === 10,
        noStandardMistForegroundCanvas: !document.querySelector(
          ".ncn-redwire-weather-foreground"
        ),
        weatherOwnsFourCanvases: Number(weather?.resources?.canvases) === 4,
        weatherOwnsRuntimeTask: weather?.resources?.runtimeTask === true,
        movementAdapterConnected: motion?.adapter?.canvasConnected === true,
        movementAdapterIdle: motion?.adapter?.canvasVisible === false,
        acceptedModulesReady: ["effects", "weather", "chamber-motion"].every(name => {
          const record = modules.find(item => item.name === name);
          return record && ["ready", "suspended"].includes(record.state);
        })
      });

      const violations = Object.entries(checks)
        .filter(([, passed]) => passed !== true)
        .map(([name]) => name);
      const detail = {
        message: violations.length
          ? `Production ownership violations: ${violations.join(", ")}`
          : "Production ownership boundary verified in the mounted browser.",
        checks,
        violations,
        application: window.NCNApplications?.current?.() || null,
        environment: window.NCNEnvironment?.current?.() || null,
        resources: {
          canonical: {
            chamberCanvases,
            weatherCanvases,
            movementCanvases,
            connectedCanvasCount: 9
          },
          compatibility: {
            weather: {
              canvas: compatibilityWeatherCanvas ? canvasName(compatibilityWeatherCanvas) : null,
              connected: compatibilityWeatherCanvas?.isConnected === true,
              hidden: compatibilityWeatherCanvas?.hidden === true,
              retired: compatibilityWeatherCanvas?.dataset.ncnLegacyWeatherRetired === "true",
              snapshot: compatibilityWeather
            },
            chamberMotion: {
              blockConnected: compatibilityMotionBlock?.isConnected === true,
              blockHidden: compatibilityMotionBlock?.hidden === true,
              retired: compatibilityMotionBlock?.dataset.ncnLegacyChamberMotionRetired === "true",
              snapshot: compatibilityMotion
            }
          },
          connectedCanvasCount: allCanvases.length,
          allCanvases,
          opticalPlanes: document.querySelectorAll(".optical-plane").length,
          compositor
        },
        runtime: window.NCNViewerRuntime?.snapshot?.() || null,
        lifecycle: window.NCNViewerLifecycle?.snapshot?.()
          || window.NCNViewerLifecycle?.current?.()
          || null,
        modules,
        integration: window.NCNIntegration?.snapshot?.() || null,
        services: { weather, motion, effects },
        archives: {
          chamberLab: "archive/chamber-lab-final-2026-08-04",
          parallaxViewer: "archive/pre-optics-parallax-final-2026-08-04",
          sourceCommit: "c46b80e00502d6368a68709e934bdbff49825978"
        },
        nextCleanup: Object.freeze({
          stage: "legacy environment adapter",
          issue: 113,
          targets: Object.freeze(["NCNWeatherRenderer", "NCNChamberMotion"])
        })
      };

      publish(violations.length ? "error" : "ready", detail);
    } catch (error) {
      publish("error", {
        message: String(error?.message || error),
        stack: String(error?.stack || ""),
        application: window.NCNApplications?.current?.() || null,
        runtime: window.NCNViewerRuntime?.snapshot?.() || null,
        modules: moduleSnapshot(),
        integration: window.NCNIntegration?.snapshot?.() || null
      });
    }
  });
})();
