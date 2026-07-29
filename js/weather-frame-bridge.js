/*==================================================
  NCN WEATHER FRAME BRIDGE

  Integration-owned wrapper around the accepted Weather factory. It decorates
  Weather's public runtime registration so consumers can run synchronously after
  each completed Weather render without reaching into Weather's private state.
==================================================*/
(() => {
  "use strict";

  const existing = window.NCNWeatherFrameBridge;
  if (existing?.installed === true) return;

  const originalFactory = window.createNCNWeatherDepartment
    || window.NCNWeatherDepartment?.createWeather
    || window.createWeather;

  if (typeof originalFactory !== "function") {
    window.NCNWeatherFrameBridge = Object.freeze({ installed: false, reason: "weather-factory-unavailable" });
    return;
  }

  function createWeatherWithFrameBridge(context) {
    if (!context?.runtime?.register) return originalFactory(context);

    const listeners = new Set();
    let service = null;
    let destroyed = false;

    const runtime = Object.create(context.runtime);
    Object.defineProperty(runtime, "register", {
      configurable: false,
      enumerable: true,
      writable: false,
      value(name, callback, options = {}) {
        if (name !== "render" || typeof callback !== "function") {
          return context.runtime.register(name, callback, options);
        }

        return context.runtime.register(name, frame => {
          const active = callback(frame) === true;
          const depthFrame = service?.getDepthFrame?.(frame?.frame)
            || service?.getDepthFrame?.()
            || null;
          const payload = Object.freeze({
            frame,
            depthFrame,
            active,
            frameNumber: depthFrame?.frameNumber ?? null,
            token: depthFrame?.token ?? null
          });
          [...listeners].forEach(listener => {
            try { listener(payload); } catch (error) { console.error("[NCN Weather frame bridge] listener failed", error); }
          });
          return active;
        }, options);
      }
    });

    const instance = originalFactory(Object.freeze({ ...context, runtime }));
    if (!instance || typeof instance !== "object") return instance;

    function subscribeAfterRender(listener) {
      if (typeof listener !== "function") throw new TypeError("Weather after-render subscribers must be functions.");
      if (destroyed) return () => false;
      listeners.add(listener);
      let subscribed = true;
      return () => {
        if (!subscribed) return false;
        subscribed = false;
        return listeners.delete(listener);
      };
    }

    const originalDestroy = typeof instance.destroy === "function" ? instance.destroy.bind(instance) : null;
    service = Object.freeze({
      ...instance,
      subscribeAfterRender,
      afterRenderContract: "synchronous-after-weather-canvas-render",
      destroy(reason) {
        if (!destroyed) {
          destroyed = true;
          listeners.clear();
        }
        return originalDestroy ? originalDestroy(reason) : true;
      }
    });

    return service;
  }

  window.createNCNWeatherDepartment = createWeatherWithFrameBridge;
  window.NCNWeatherFrameBridge = Object.freeze({
    installed: true,
    originalFactory,
    createWeatherWithFrameBridge
  });
})();
