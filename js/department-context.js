/*==================================================
  NCN DEPARTMENT CONTEXT

  Capability-scoped façade supplied to incoming modules. It is an ownership
  boundary, not a security sandbox; departmental code remains subject to review.
==================================================*/

window.NCNDepartmentContext = (() => {
  const contract = window.NCNIntegrationContract || {};
  const resources = new WeakMap();
  const BLOCKED_SERVICE_METHODS = new Set(["init", "suspend", "resume", "reset", "destroy"]);
  const WEATHER_LAYERS = Object.freeze({
    far: contract.SCENE?.WEATHER_FAR || "weather:far",
    rear: contract.SCENE?.WEATHER_REAR || "weather:rear",
    middle: contract.SCENE?.WEATHER_MIDDLE || "weather:middle",
    near: contract.SCENE?.WEATHER_NEAR || "weather:near"
  });

  function strings(input) {
    const values = typeof input === "string" ? [input] : Array.from(input || []);
    return [...new Set(values.map(value => String(value).trim()).filter(Boolean))];
  }

  function readOnlyService(service) {
    if (!service || typeof service !== "object") return service || null;
    return new Proxy(service, {
      get(target, property) {
        if (BLOCKED_SERVICE_METHODS.has(String(property))) return undefined;
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
      set() { return false; },
      deleteProperty() { return false; }
    });
  }

  function create(owner, manifest = {}) {
    const moduleName = String(owner || manifest.name || manifest.department || "department").trim();
    const base = window.NCNViewerHost?.context?.();
    if (!base) throw new Error("The viewer host context is unavailable.");

    const allowedLayers = new Set(strings(manifest.layers));
    const allowedGroups = new Set(strings(manifest.runtimeGroups));
    const allowedChannels = new Set(strings(manifest.visualChannels));
    const allowedDependencies = new Set(strings(manifest.dependencies));
    const owned = { owner: moduleName, base, tasks: [], subscriptions: [] };

    const runtime = Object.freeze({
      register(name, callback, options = {}) {
        const localName = String(name || "task").trim();
        const group = String(options.group || [...allowedGroups][0] || "default");
        if (allowedGroups.size && !allowedGroups.has(group)) {
          throw new Error(`${moduleName} did not declare runtime group ${group}.`);
        }
        const taskName = localName.startsWith(`${moduleName}:`)
          ? localName
          : `${moduleName}:${localName}`;
        const handle = base.runtime.register(taskName, callback, { ...options, group });
        owned.tasks.push(handle);
        return handle;
      },
      wake: reason => base.runtime.wake(`${moduleName}:${reason || "wake"}`),
      getQuality: base.runtime.getQuality,
      snapshot: base.runtime.snapshot,
      subscribe(listener) {
        const unsubscribe = base.runtime.subscribe(listener);
        owned.subscriptions.push(unsubscribe);
        return unsubscribe;
      }
    });

    const lifecycle = Object.freeze({
      STATES: base.lifecycle.STATES,
      PRIORITY: base.lifecycle.PRIORITY,
      current: base.lifecycle.current,
      snapshot: base.lifecycle.snapshot,
      allows: base.lifecycle.allows,
      isLocked: base.lifecycle.isLocked,
      subscribe(listener) {
        const unsubscribe = base.lifecycle.subscribe(listener);
        owned.subscriptions.push(unsubscribe);
        return unsubscribe;
      },
      acquire(name, priority = base.lifecycle.PRIORITY.ambient) {
        return base.lifecycle.acquire(name, moduleName, priority);
      },
      releaseOwnedLocks: () => base.lifecycle.releaseOwner(moduleName)
    });

    const events = Object.freeze({
      on(type, listener, options) {
        const unsubscribe = base.events.on(type, listener, options);
        owned.subscriptions.push(unsubscribe);
        return unsubscribe;
      },
      once(type, listener) {
        const unsubscribe = base.events.once(type, listener);
        owned.subscriptions.push(unsubscribe);
        return unsubscribe;
      },
      emit: base.events.emit,
      snapshot: base.events.snapshot
    });

    const scene = Object.freeze({
      get(name) {
        const key = String(name);
        if (!allowedLayers.has(key)) return null;
        return base.scene.get(key);
      },
      require(name) {
        const key = String(name);
        if (!allowedLayers.has(key)) {
          throw new Error(`${moduleName} did not declare scene layer ${key}.`);
        }
        return base.scene.require(key);
      },
      has: name => allowedLayers.has(String(name)) && base.scene.has(String(name)),
      snapshot: () => base.scene.snapshot().filter(item => allowedLayers.has(item.name))
    });

    const weather = Object.fromEntries(Object.entries(WEATHER_LAYERS)
      .filter(([, sceneName]) => allowedLayers.has(sceneName))
      .map(([key]) => [key, base.layers.weather[key]]));
    const layers = Object.freeze({
      weather: Object.freeze(weather),
      chamberMotion: allowedLayers.has(contract.SCENE?.CHAMBER_MOTION || "environment:chamber-motion")
        ? base.layers.chamberMotion
        : null,
      effects: allowedLayers.has(contract.SCENE?.EFFECTS || "environment:effects")
        ? base.layers.effects
        : null
    });

    const views = Object.freeze({
      getReadingZone: base.views.getReadingZone,
      getControlZones: base.views.getControlZones,
      getDepthPlaneDefinitions: base.views.getDepthPlaneDefinitions,
      isReading: () => Boolean(base.views.current()?.isReading?.()),
      active: () => window.NCNApplications?.current?.() || null
    });

    const chamber = Object.freeze({
      getCameraSnapshot: () => window.NCNChamberCamera?.snapshot?.() || null,
      project: (x, y, z) => window.NCNChamberCamera?.project?.(x, y, z) || null,
      apertureAt: (z, halfWidth) => window.NCNChamberCamera?.apertureAt?.(z, halfWidth) || null,
      aperturePointsAt: (z, halfWidth) => window.NCNChamberCamera?.aperturePointsAt?.(z, halfWidth) || [],
      getMode: () => window.LayeredChamber?.getMode?.() || null,
      isMounted: () => Boolean(window.LayeredChamber?.isMounted?.())
    });

    const director = Object.freeze({
      MODES: window.NCNVisualDirector?.MODES,
      CHANNELS: window.NCNVisualDirector?.CHANNELS,
      currentMode: window.NCNVisualDirector?.currentMode,
      snapshot: window.NCNVisualDirector?.snapshot,
      envelope(channel, options = {}) {
        const key = String(channel);
        if (allowedChannels.size && !allowedChannels.has(key)) {
          throw new Error(`${moduleName} did not declare visual channel ${key}.`);
        }
        return window.NCNVisualDirector?.envelope?.(key, options);
      },
      claim(channel, options = {}) {
        const key = String(channel);
        if (allowedChannels.size && !allowedChannels.has(key)) {
          throw new Error(`${moduleName} did not declare visual channel ${key}.`);
        }
        return window.NCNVisualDirector?.claim?.(key, { ...options, owner: moduleName });
      }
    });

    function scopedGetService(name) {
      const key = String(name);
      if (key === (contract.MODULES?.VISUAL_DIRECTOR || "visual-director")) return director;
      if (!allowedDependencies.has(key)) return null;
      return readOnlyService(window.NCNIntegration?.getService?.(key));
    }

    const integration = Object.freeze({
      getService: scopedGetService,
      requireService(name) {
        const service = scopedGetService(name);
        if (!service) throw new Error(`${moduleName} cannot access undeclared dependency ${name}.`);
        return service;
      },
      currentApplicationProfile() {
        const name = window.NCNApplications?.current?.() || "redwire";
        return window.NCNEnvironment?.profile?.(name) || null;
      }
    });

    const applications = Object.freeze({
      current: base.applications?.current,
      profiles: base.applications?.profiles,
      switchTo: moduleName === (contract.MODULES?.BOOT || "boot")
        ? base.applications?.switchTo
        : undefined
    });

    const environment = Object.freeze({
      current: base.environment?.current,
      profile: base.environment?.profile
    });

    const moduleContext = Object.freeze({
      owner: moduleName,
      runtime,
      lifecycle,
      events,
      scene,
      layers,
      views,
      chamber,
      applications,
      environment,
      settings: base.settings,
      contract,
      director,
      integration
    });
    resources.set(moduleContext, owned);
    return moduleContext;
  }

  async function release(moduleContext, reason = "context-release") {
    const owned = resources.get(moduleContext);
    if (!owned) return false;
    resources.delete(moduleContext);

    [...owned.subscriptions].reverse().forEach(unsubscribe => {
      try { unsubscribe?.(); } catch (error) { console.error(error); }
    });
    [...owned.tasks].reverse().forEach(handle => {
      try { handle?.unregister?.(); } catch (error) { console.error(error); }
    });
    owned.base.lifecycle?.releaseOwner?.(owned.owner);
    window.NCNVisualDirector?.releaseOwner?.(owned.owner, reason);
    return true;
  }

  return Object.freeze({ create, release });
})();
