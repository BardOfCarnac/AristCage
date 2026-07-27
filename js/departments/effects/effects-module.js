/*==================================================
  NCN EFFECTS DEPARTMENT · HOST PUBLICATION

  Replaceable effects-slot factory for NCNIntegrationContract v1.
  Visible output is confined to context.layers.effects. Frame work uses the
  shared runtime, and every effect requests authority from the visual director.
==================================================*/
(() => {
  "use strict";

  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const clamp01 = value => clamp(value, 0, 1);
  const mix = (a, b, t) => a + (b - a) * t;
  const envelope = progress => Math.sin(clamp01(progress) * Math.PI);
  const ease = progress => {
    const t = clamp01(progress);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };
  const PURPOSES = Object.freeze(["ambient", "interaction", "required"]);

  function hash(value) {
    let result = 2166136261;
    for (const character of String(value)) {
      result ^= character.charCodeAt(0);
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  }

  function seededRandom(seed) {
    let state = (Number(seed) >>> 0) || 0x6d2b79f5;
    return () => {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function stripIdentity(node) {
    node.removeAttribute?.("id");
    node.removeAttribute?.("aria-describedby");
    node.removeAttribute?.("aria-labelledby");
    node.querySelectorAll?.("[id]").forEach(item => item.removeAttribute("id"));
    node.querySelectorAll?.("[aria-describedby],[aria-labelledby]").forEach(item => {
      item.removeAttribute("aria-describedby");
      item.removeAttribute("aria-labelledby");
    });
    node.setAttribute?.("aria-hidden", "true");
    return node;
  }

  function normaliseRect(rect) {
    if (!rect) return null;
    const left = Number(rect.left) || 0;
    const top = Number(rect.top) || 0;
    const width = Math.max(0, Number(rect.width) || (Number(rect.right) - left) || 0);
    const height = Math.max(0, Number(rect.height) || (Number(rect.bottom) - top) || 0);
    return Object.freeze({
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height
    });
  }

  function normaliseTarget(target) {
    if (target instanceof Element) {
      return Object.freeze({
        kind: target.dataset?.effectTargetKind || "element",
        id: target.dataset?.effectTargetId || target.id || null,
        getElement: () => target,
        getBounds: () => normaliseRect(target.getBoundingClientRect()),
        isValid: () => target.isConnected
      });
    }
    if (!target || typeof target !== "object") {
      throw new TypeError("Effects require a DOM element or target adapter.");
    }
    return Object.freeze({
      kind: target.kind || "adapter",
      id: target.id || null,
      getElement: () => target.getElement?.() || target.element || null,
      getBounds: () => normaliseRect(target.getBounds?.() || target.rect || target.element?.getBoundingClientRect?.()),
      isValid: () => target.isValid?.() ?? Boolean(target.getElement?.()?.isConnected ?? target.element?.isConnected ?? true),
      raw: target
    });
  }

  function inferPurpose(channel) {
    if (channel === "boot") return "required";
    if (channel === "interface" || channel === "article") return "interaction";
    return "ambient";
  }

  function normalisePurpose(value, channel) {
    const purpose = String(value || inferPurpose(channel)).trim();
    if (!PURPOSES.includes(purpose)) throw new RangeError(`Unknown effect purpose: ${purpose}`);
    return purpose;
  }

  function createNCNEffectsDepartment(context) {
    if (!context?.runtime?.register) throw new Error("Effects requires the shared department runtime.");
    if (!context?.director?.envelope || !context?.director?.claim) throw new Error("Effects requires the visual director.");
    if (!(context?.layers?.effects instanceof Element)) throw new Error("Effects requires environment:effects.");

    const layer = context.layers.effects;
    const registry = new Map();
    const active = new Map();
    const queues = new Map();
    const channelIndex = new Map();
    const targetIds = new WeakMap();
    const listeners = new Set();
    const ownedNodes = new Set();
    const runtimeHandles = new Set();

    let nextEffectId = 1;
    let nextTargetId = 1;
    let initialised = false;
    let suspended = false;
    let destroyed = false;
    let clearing = false;
    let registryLocked = false;
    let styleNode = null;
    let unsubscribeRuntime = null;
    let reducedMotion = Boolean(context.settings?.reducedMotion);
    let profile = Object.freeze({ enabled: true, ambient: false, interaction: false, intensity: 1 });

    function emit(type, detail = {}) {
      const payload = Object.freeze({ type, detail, snapshot: snapshot() });
      listeners.forEach(listener => {
        try { listener(payload); } catch (error) { console.error(error); }
      });
      context.events?.emit?.(`effects:${type}`, payload);
    }

    function ensureLayer() {
      if (!layer.isConnected) throw new Error("environment:effects is disconnected.");
      return layer;
    }

    function own(node) {
      ownedNodes.add(node);
      return node;
    }

    function removeOwned(node) {
      if (!node) return;
      ownedNodes.delete(node);
      node.remove?.();
    }

    function setVisible(visible) {
      ownedNodes.forEach(node => {
        if (node === styleNode) return;
        node.hidden = !visible;
      });
    }

    function installStyle() {
      if (styleNode?.isConnected) return styleNode;
      styleNode = own(document.createElement("style"));
      styleNode.dataset.effectsDepartmentStyle = "1";
      styleNode.textContent = `
        [data-ncn-effect-node]{position:fixed;box-sizing:border-box;pointer-events:none;transform-origin:center;will-change:transform,opacity,filter;overflow:visible}
        [data-ncn-effect-node] .ncn-effect-clone{position:absolute;inset:0;width:100%;height:100%;margin:0!important;pointer-events:none!important}
        [data-ncn-effect-node] .ncn-effect-scan-line{position:absolute;left:-12%;right:-12%;height:2px;top:0;background:linear-gradient(90deg,transparent,rgba(255,62,28,.95),rgba(255,236,210,.95),rgba(255,62,28,.95),transparent);box-shadow:0 0 8px rgba(255,70,36,.75),0 0 22px rgba(255,40,16,.45)}
        [data-ncn-effect-node] .ncn-effect-static{position:absolute;inset:0;background-image:repeating-linear-gradient(0deg,rgba(255,255,255,.18) 0 1px,transparent 1px 3px),repeating-linear-gradient(90deg,rgba(255,42,18,.12) 0 1px,transparent 1px 4px);mix-blend-mode:screen}
        [data-ncn-effect-node] .ncn-effect-particle{position:absolute;width:3px;height:3px;border-radius:50%;background:rgba(255,225,190,.95);box-shadow:0 0 8px rgba(255,72,28,.9)}
        [data-ncn-effect-node] .ncn-effect-arc{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
      `;
      ensureLayer().append(styleNode);
      return styleNode;
    }

    function targetIdentity(target) {
      const object = target.raw || target.getElement?.() || target;
      if (!object || (typeof object !== "object" && typeof object !== "function")) return String(object);
      if (!targetIds.has(object)) targetIds.set(object, `target-${nextTargetId++}`);
      return targetIds.get(object);
    }

    function channelKey(target, channel) {
      return `${targetIdentity(target)}::${channel}`;
    }

    function channelSet(key) {
      let set = channelIndex.get(key);
      if (!set) {
        set = new Set();
        channelIndex.set(key, set);
      }
      return set;
    }

    function createNode(target, className = "", cloneTarget = false) {
      const node = own(document.createElement("div"));
      node.className = `ncn-effect-node ${className}`.trim();
      node.dataset.ncnEffectNode = "1";
      node.setAttribute("aria-hidden", "true");
      node.hidden = suspended;
      ensureLayer().append(node);
      if (cloneTarget) {
        const element = target.getElement?.();
        if (element instanceof Element) {
          const clone = stripIdentity(element.cloneNode(true));
          clone.classList.add("ncn-effect-clone");
          node.append(clone);
        }
      }
      positionNode(node, target);
      return node;
    }

    function positionNode(node, target) {
      const rect = target.getBounds?.();
      if (!node || !rect) return false;
      node.style.left = `${rect.left}px`;
      node.style.top = `${rect.top}px`;
      node.style.width = `${rect.width}px`;
      node.style.height = `${rect.height}px`;
      return rect.width > 0 && rect.height > 0;
    }

    function registerCanonical(name, definition) {
      if (destroyed) throw new Error("Destroyed effects module cannot register effects.");
      if (registryLocked) throw new Error("The canonical effects registry is locked.");
      if (!name || typeof definition?.create !== "function") {
        throw new TypeError("Effect definitions require a name and create(context).");
      }
      const key = String(name);
      if (registry.has(key)) throw new Error(`Duplicate canonical effect name: ${key}`);
      registry.set(key, Object.freeze({ ...definition }));
      return registrationApi;
    }

    function purposeAllowed(purpose) {
      if (!profile.enabled) return false;
      if (purpose === "required") return true;
      return purpose === "ambient" ? profile.ambient : profile.interaction;
    }

    function removeFromQueue(handle) {
      const queue = queues.get(handle._channelKey);
      if (!queue) return false;
      const index = queue.indexOf(handle);
      if (index < 0) return false;
      queue.splice(index, 1);
      if (!queue.length) queues.delete(handle._channelKey);
      return true;
    }

    function removeFromChannel(handle) {
      const set = channelIndex.get(handle._channelKey);
      set?.delete(handle);
      if (set && !set.size) channelIndex.delete(handle._channelKey);
    }

    function beginQueued(key) {
      if (suspended) return;
      const queue = queues.get(key);
      if (!queue?.length || channelIndex.get(key)?.size) return;
      const next = queue.shift();
      if (!queue.length) queues.delete(key);
      if (!purposeAllowed(next.purpose)) {
        next.cancel(`profile-${next.purpose}-disabled`);
        beginQueued(key);
        return;
      }
      next._start();
    }

    function passiveHandle(name, target, options, status, reason) {
      const id = `effect-${nextEffectId++}`;
      const result = Object.freeze({ id, name, channel: options.channel, purpose: options.purpose, status, reason });
      return Object.freeze({
        id,
        name,
        target,
        channel: options.channel,
        purpose: options.purpose,
        priority: options.priority,
        localIntensity: options.localIntensity,
        intensity: 0,
        state: status,
        finished: Promise.resolve(result),
        cancel() { return false; },
        setIntensity() { return false; }
      });
    }

    function play(name, requestedTarget, requestedOptions = {}) {
      if (destroyed) throw new Error("Destroyed effects module cannot play effects.");
      if (!initialised) throw new Error("Effects module must be initialised before playback.");
      const definition = registry.get(String(name));
      if (!definition) throw new Error(`Unknown effect: ${name}`);
      const target = normaliseTarget(requestedTarget);
      const options = {
        ...(definition.defaults || {}),
        ...requestedOptions
      };
      options.channel = options.channel || definition.channel || "interface";
      options.purpose = normalisePurpose(options.purpose || definition.purpose, options.channel);
      options.concurrency = options.concurrency || definition.concurrency || "stack";
      options.priority = Number(options.priority ?? definition.priority ?? 10);
      options.duration = Math.max(0, Number(options.duration ?? definition.duration ?? 500));
      options.localIntensity = clamp01(options.intensity ?? 1);
      options.seed = Number.isFinite(Number(options.seed))
        ? Number(options.seed)
        : hash(`${name}:${nextEffectId}:${targetIdentity(target)}`);

      if (suspended) return passiveHandle(name, target, options, "ignored", "suspended");
      if (!purposeAllowed(options.purpose)) {
        return passiveHandle(name, target, options, "ignored", `profile-${options.purpose}-disabled`);
      }

      const key = channelKey(target, options.channel);
      const occupants = [...(channelIndex.get(key) || [])]
        .filter(handle => ["running", "suspended", "queued"].includes(handle.state));

      if (options.concurrency === "ignore" && occupants.length) {
        return passiveHandle(name, target, options, "ignored", "occupied");
      }
      if (options.concurrency === "replace") {
        occupants
          .filter(handle => handle.priority <= options.priority)
          .forEach(handle => handle.cancel("replaced"));
      }
      if (options.concurrency === "merge" && occupants.length) {
        const existing = occupants
          .filter(handle => handle.name === String(name))
          .sort((a, b) => b.priority - a.priority)[0];
        if (!existing) return passiveHandle(name, target, options, "ignored", "merge-incompatible");
        existing._controller?.merge?.(options);
        existing.setIntensity(Math.max(existing.localIntensity, options.localIntensity), "merge");
        return existing;
      }

      const handle = createLiveHandle(String(name), definition, target, options, key);
      if (options.concurrency === "queue" && occupants.length) {
        let queue = queues.get(key);
        if (!queue) {
          queue = [];
          queues.set(key, queue);
        }
        queue.push(handle);
      } else {
        handle._start();
      }
      return handle;
    }

    function createLiveHandle(name, definition, target, options, key) {
      const id = `effect-${nextEffectId++}`;
      let resolveFinished;
      const finished = new Promise(resolve => { resolveFinished = resolve; });
      const handle = {
        id,
        name,
        target,
        channel: options.channel,
        purpose: options.purpose,
        priority: options.priority,
        localIntensity: options.localIntensity,
        intensity: 0,
        seed: options.seed,
        state: "queued",
        finished,
        _channelKey: key,
        _runtime: null,
        _controller: null,
        _claim: null,
        _elapsed: 0,
        _started: false,
        _resolved: false,
        _exclusive: options.exclusive === true,
        _start: null,
        cancel: null,
        setIntensity: null
      };

      function finish(status = "completed", reason = null) {
        if (handle._resolved) return false;
        const started = handle._started;
        handle._resolved = true;
        removeFromQueue(handle);
        handle.state = status;
        handle._runtime?.disable?.();
        handle._runtime?.unregister?.();
        runtimeHandles.delete(handle._runtime);
        handle._runtime = null;
        try { handle._controller?.cleanup?.({ status, reason }); } catch (error) { console.error(error); }
        handle._claim?.release?.(`effect:${status}`);
        handle._claim = null;
        removeFromChannel(handle);
        active.delete(id);
        const result = Object.freeze({ id, name, channel: handle.channel, purpose: handle.purpose, status, reason });
        resolveFinished(result);
        emit("finished", result);
        if (started && !clearing) beginQueued(key);
        return true;
      }

      function claimAuthority(reason = "start") {
        if (!purposeAllowed(handle.purpose)) {
          finish("cancelled", `profile-${handle.purpose}-disabled`);
          return false;
        }
        const requested = handle.localIntensity * profile.intensity;
        const directorEnvelope = context.director.envelope(handle.channel, { intensity: requested });
        if (!directorEnvelope.allowed) {
          finish("ignored", `director:${directorEnvelope.mode}`);
          return false;
        }
        handle._claim?.release?.(`effect:${reason}`);
        handle._claim = null;
        const claim = context.director.claim(handle.channel, {
          priority: handle.priority,
          intensity: requested,
          exclusive: handle._exclusive
        });
        if (!claim?.granted) {
          finish("cancelled", claim?.reason || "director-denied");
          return false;
        }
        handle._claim = claim;
        handle.intensity = claim.intensity;
        handle._controller?.setIntensity?.(handle.intensity);
        return true;
      }

      handle.cancel = reason => finish("cancelled", reason || "cancelled");
      handle.setIntensity = (value, reason = "set-intensity") => {
        if (handle._resolved) return 0;
        handle.localIntensity = clamp01(value);
        if (!handle._started) return handle.localIntensity;
        if (!claimAuthority(reason)) return 0;
        emit("intensity", { id, intensity: handle.intensity, localIntensity: handle.localIntensity, reason });
        return handle.intensity;
      };

      handle._start = () => {
        if (handle._resolved || destroyed || suspended) return;
        if (!target.isValid()) {
          finish("cancelled", "invalid-target");
          return;
        }
        if (!claimAuthority("start")) return;

        handle._started = true;
        handle.state = "running";
        active.set(id, handle);
        channelSet(key).add(handle);

        const random = seededRandom(options.seed);
        const useReduced = reducedMotion && typeof definition.reducedCreate === "function";
        const create = useReduced ? definition.reducedCreate : definition.create;
        const liveIntensity = Object.freeze({
          valueOf: () => handle.intensity,
          toString: () => String(handle.intensity),
          [Symbol.toPrimitive]: () => handle.intensity
        });
        try {
          handle._controller = create({
            context,
            layer,
            target,
            options,
            intensity: liveIntensity,
            random,
            reducedMotion,
            createNode,
            positionNode,
            removeNode: removeOwned
          }) || {};
        } catch (error) {
          console.error(`[NCN Effects] failed to create ${name}`, error);
          finish("failed", error.message);
          return;
        }

        const duration = Math.max(0, Number(handle._controller.duration ?? options.duration));
        const maxFps = clamp(handle._controller.maxFps ?? definition.maxFps ?? 30, 1, 60);
        handle._controller.setIntensity?.(handle.intensity);

        if (!duration && typeof handle._controller.frame !== "function") {
          queueMicrotask(() => finish("completed"));
          return;
        }

        const runtimeHandle = context.runtime.register(`effect:${id}`, frame => {
          if (handle._resolved || suspended) return false;
          if (!target.isValid()) {
            finish("cancelled", "invalid-target");
            return false;
          }
          handle._elapsed += frame.delta;
          const progress = duration > 0 ? clamp01(handle._elapsed / duration) : 0;
          const result = handle._controller.frame?.({
            ...frame,
            elapsed: handle._elapsed,
            duration,
            progress,
            intensity: handle.intensity,
            random
          });
          if (result === false || result?.done || (duration > 0 && progress >= 1)) {
            finish("completed");
            return false;
          }
          return true;
        }, {
          group: "effects",
          priority: handle.priority,
          maxFps,
          enabled: true,
          wake: true
        });
        handle._runtime = runtimeHandle;
        runtimeHandles.add(runtimeHandle);
        emit("started", { id, name, channel: handle.channel, purpose: handle.purpose, intensity: handle.intensity, seed: handle.seed });
      };

      return handle;
    }

    function cancel(handleOrId, reason = "cancelled") {
      if (!handleOrId) return false;
      if (typeof handleOrId.cancel === "function") return handleOrId.cancel(reason);
      const id = String(handleOrId);
      const live = active.get(id) || [...queues.values()].flat().find(item => item.id === id);
      return live?.cancel?.(reason) || false;
    }

    function clear(filter = null) {
      const predicate = typeof filter === "function"
        ? filter
        : handle => !filter || handle.channel === filter || handle.name === filter || handle.purpose === filter;
      const affected = new Set();
      clearing = true;
      try {
        [...active.values()].forEach(handle => {
          if (!predicate(handle)) return;
          affected.add(handle._channelKey);
          handle.cancel("cleared");
        });
        [...queues.entries()].forEach(([key, queue]) => {
          [...queue].forEach(handle => {
            if (!predicate(handle)) return;
            affected.add(key);
            handle.cancel("cleared");
          });
        });
      } finally {
        clearing = false;
      }
      if (!suspended) affected.forEach(beginQueued);
      return affected.size;
    }

    function applyProfile(next = {}, meta = {}) {
      const intensity = Number.isFinite(Number(next.intensity)) ? clamp01(next.intensity) : profile.intensity;
      profile = Object.freeze({
        enabled: next.enabled === undefined ? profile.enabled : next.enabled !== false,
        ambient: next.ambient === undefined ? profile.ambient : Boolean(next.ambient),
        interaction: next.interaction === undefined ? profile.interaction : Boolean(next.interaction),
        intensity,
        application: meta.application || context.applications?.current?.() || profile.application || null,
        reason: meta.reason || "profile"
      });

      if (!profile.enabled) {
        clear();
      } else {
        clear(handle => !purposeAllowed(handle.purpose));
        [...active.values()].forEach(handle => handle.setIntensity(handle.localIntensity, "profile"));
      }
      emit("profile", { profile, meta });
      return profile;
    }

    function suspend(reason = "host") {
      if (destroyed || suspended) return false;
      suspended = true;
      setVisible(false);
      [...active.values()].forEach(handle => {
        handle.state = "suspended";
        handle._claim?.release?.(`effect:suspend:${reason}`);
        handle._claim = null;
        handle._runtime?.suspend?.();
        handle._controller?.suspend?.(reason);
      });
      emit("suspend", { reason });
      return true;
    }

    function resume(reason = "host") {
      if (destroyed || !suspended) return false;
      suspended = false;
      [...active.values()].forEach(handle => {
        if (handle._resolved) return;
        if (!claimAuthorityForResume(handle, reason)) return;
        handle.state = "running";
        handle._controller?.resume?.(reason);
        handle._runtime?.reset?.(`effects-resume-reset:${reason}`);
        handle._runtime?.resume?.(`effects-resume:${reason}`);
      });
      setVisible(true);
      [...queues.keys()].forEach(beginQueued);
      emit("resume", { reason });
      return true;
    }

    function claimAuthorityForResume(handle, reason) {
      if (!purposeAllowed(handle.purpose)) {
        handle.cancel(`profile-${handle.purpose}-disabled`);
        return false;
      }
      const requested = handle.localIntensity * profile.intensity;
      const directorEnvelope = context.director.envelope(handle.channel, { intensity: requested });
      if (!directorEnvelope.allowed) {
        handle.cancel(`director:${directorEnvelope.mode}`);
        return false;
      }
      const claim = context.director.claim(handle.channel, {
        priority: handle.priority,
        intensity: requested,
        exclusive: handle._exclusive
      });
      if (!claim?.granted) {
        handle.cancel(claim?.reason || `resume-denied:${reason}`);
        return false;
      }
      handle._claim = claim;
      handle.intensity = claim.intensity;
      handle._controller?.setIntensity?.(handle.intensity);
      return true;
    }

    function reset(reason = "host-reset") {
      if (destroyed) return false;
      clear();
      suspended = false;
      profile = Object.freeze({ enabled: true, ambient: false, interaction: false, intensity: 1 });
      [...ownedNodes].forEach(node => {
        if (node !== styleNode) removeOwned(node);
      });
      emit("reset", { reason });
      return true;
    }

    async function init() {
      if (destroyed) throw new Error("Destroyed effects module cannot be initialised.");
      if (initialised) return api;
      ensureLayer();
      installStyle();
      unsubscribeRuntime = context.runtime.subscribe?.(event => {
        const quality = event?.runtime?.quality || context.settings?.quality;
        reducedMotion = quality === "reduced" || Boolean(context.settings?.reducedMotion);
      }) || null;
      initialised = true;
      emit("init", { effects: Object.freeze([...registry.keys()]), registryLocked });
      return api;
    }

    async function destroy(reason = "host-destroy") {
      if (destroyed) return false;
      clearing = true;
      try { clear(); } finally { clearing = false; }
      [...runtimeHandles].forEach(handle => {
        try { handle.disable?.(); handle.unregister?.(); } catch (error) { console.error(error); }
      });
      runtimeHandles.clear();
      unsubscribeRuntime?.();
      unsubscribeRuntime = null;
      listeners.clear();
      [...ownedNodes].forEach(removeOwned);
      ownedNodes.clear();
      initialised = false;
      suspended = true;
      destroyed = true;
      context.lifecycle?.releaseOwnedLocks?.();
      emit("destroy", { reason });
      return true;
    }

    function snapshot() {
      return Object.freeze({
        department: "effects",
        version: window.NCNEffectsDepartmentManifest?.version || "1.1.1-host",
        initialised,
        suspended,
        destroyed,
        reducedMotion,
        registryLocked,
        profile,
        registered: Object.freeze([...registry.keys()]),
        active: Object.freeze([...active.values()].map(handle => Object.freeze({
          id: handle.id,
          name: handle.name,
          channel: handle.channel,
          purpose: handle.purpose,
          state: handle.state,
          localIntensity: handle.localIntensity,
          intensity: handle.intensity,
          priority: handle.priority,
          seed: handle.seed
        }))),
        queued: [...queues.values()].reduce((sum, queue) => sum + queue.length, 0),
        temporaryNodes: ownedNodes.size - (styleNode?.isConnected ? 1 : 0),
        runtimeTasks: runtimeHandles.size,
        listenerCount: listeners.size + (unsubscribeRuntime ? 1 : 0),
        layerConnected: layer.isConnected,
        layerName: "environment:effects"
      });
    }

    const api = Object.freeze({
      init,
      applyProfile,
      suspend,
      resume,
      reset,
      destroy,
      play,
      cancel,
      clear,
      snapshot,
      list: () => [...registry.keys()].map(name => {
        const definition = registry.get(name);
        return Object.freeze({
          name,
          channel: definition?.channel || "interface",
          purpose: definition?.purpose || inferPurpose(definition?.channel || "interface"),
          cost: definition?.cost || "unknown",
          features: Object.freeze([...(definition?.features || [])])
        });
      }),
      names: () => Object.freeze([...registry.keys()]),
      subscribe(listener) {
        if (typeof listener !== "function") throw new TypeError("Effects subscribers must be functions.");
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    });

    const registrationApi = Object.freeze({ register: registerCanonical });
    const catalogueInstallers = Object.freeze([...(window.NCNEffectsDepartmentCatalogues || [])]);
    catalogueInstallers.forEach(install => install(registrationApi, Object.freeze({ envelope, ease, mix, clamp01 })));
    const expectedNames = Object.freeze([...(window.NCNEffectsDepartmentEffectNames || [])]);
    if (expectedNames.length) {
      const registeredNames = [...registry.keys()];
      const mismatch = registeredNames.length !== expectedNames.length
        || expectedNames.some(name => !registry.has(name));
      if (mismatch) throw new Error("Canonical effects registry does not match the published public-name list.");
    }
    registryLocked = true;
    return api;
  }

  window.createNCNEffectsDepartment = createNCNEffectsDepartment;
})();
