/*==================================================
  NCN EFFECTS CORE

  Registry, handles, channels, target normalisation, seeded randomness,
  cancellation, cleanup, suspension and reduced-motion selection.
==================================================*/
(() => {
  'use strict';

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const clamp01 = value => clamp(Number(value) || 0, 0, 1);
  const mix = (a, b, amount) => a + (b - a) * amount;
  const envelope = progress => Math.sin(clamp01(progress) * Math.PI);

  function hash(value) {
    let result = 2166136261;
    for (const character of String(value)) {
      result ^= character.charCodeAt(0);
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  }

  function createSeededRandom(seed) {
    let state = (Number(seed) >>> 0) || 0x6d2b79f5;
    return () => {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function stripCloneIdentity(node) {
    node.removeAttribute?.('id');
    node.querySelectorAll?.('[id]').forEach(child => child.removeAttribute('id'));
    node.querySelectorAll?.('[aria-describedby],[aria-labelledby]').forEach(child => {
      child.removeAttribute('aria-describedby');
      child.removeAttribute('aria-labelledby');
    });
    node.setAttribute?.('aria-hidden', 'true');
    return node;
  }

  function createStyleScope(element) {
    const original = new Map();
    return {
      set(property, value, priority = '') {
        if (!element?.style) return;
        if (!original.has(property)) {
          original.set(property, {
            value: element.style.getPropertyValue(property),
            priority: element.style.getPropertyPriority(property)
          });
        }
        element.style.setProperty(property, value, priority);
      },
      restore() {
        if (!element?.style) return;
        for (const [property, previous] of original) {
          if (previous.value) {
            element.style.setProperty(property, previous.value, previous.priority);
          } else {
            element.style.removeProperty(property);
          }
        }
        original.clear();
      }
    };
  }

  function elementTarget(element, options = {}) {
    if (!(element instanceof Element)) {
      throw new TypeError('Element effect targets require a DOM Element.');
    }
    return {
      kind: options.kind || 'element',
      id: options.id || element.dataset.effectTargetId || element.id || null,
      element,
      getElement: () => element,
      getBounds: () => element.getBoundingClientRect(),
      isValid: () => element.isConnected,
      invalidate: options.invalidate || (() => {}),
      createOverlay(className = '') {
        const rect = element.getBoundingClientRect();
        const overlay = document.createElement('div');
        overlay.className = `ncn-effect-overlay ${className}`.trim();
        overlay.setAttribute('aria-hidden', 'true');
        overlay.style.left = `${rect.left}px`;
        overlay.style.top = `${rect.top}px`;
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;
        document.body.append(overlay);
        return overlay;
      },
      createCloneOverlay(className = '') {
        const rect = element.getBoundingClientRect();
        const overlay = document.createElement('div');
        overlay.className = `ncn-effect-overlay ncn-effect-clone-overlay ${className}`.trim();
        overlay.setAttribute('aria-hidden', 'true');
        overlay.style.left = `${rect.left}px`;
        overlay.style.top = `${rect.top}px`;
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;
        const clone = stripCloneIdentity(element.cloneNode(true));
        clone.style.width = '100%';
        clone.style.height = '100%';
        clone.style.margin = '0';
        overlay.append(clone);
        document.body.append(overlay);
        return { overlay, clone };
      }
    };
  }

  function normaliseTarget(target) {
    if (target instanceof Element) return elementTarget(target);
    if (!target || typeof target !== 'object') {
      throw new TypeError('Effects require a DOM element or effect-target adapter.');
    }
    const element = target.getElement?.() || target.element || null;
    return {
      kind: target.kind || 'adapter',
      id: target.id || null,
      element,
      getElement: () => target.getElement?.() || target.element || null,
      getBounds: () => target.getBounds?.() || element?.getBoundingClientRect?.() || null,
      isValid: () => target.isValid?.() ?? Boolean((target.getElement?.() || target.element)?.isConnected ?? true),
      invalidate: () => target.invalidate?.(),
      createOverlay: className => {
        if (target.createOverlay) return target.createOverlay(className);
        if (element instanceof Element) return elementTarget(element).createOverlay(className);
        throw new Error(`Target ${target.kind || 'adapter'} cannot create an overlay.`);
      },
      createCloneOverlay: className => {
        if (target.createCloneOverlay) return target.createCloneOverlay(className);
        if (element instanceof Element) return elementTarget(element).createCloneOverlay(className);
        throw new Error(`Target ${target.kind || 'adapter'} cannot create a clone overlay.`);
      },
      raw: target
    };
  }

  function trackOverlay(target, overlay) {
    const rect = target.getBounds();
    if (!rect || !overlay) return;
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
  }

  function adaptRuntime(candidate) {
    if (candidate?.addFrameTask) return candidate;
    if (!candidate?.register) return null;
    let nextAdapterTask = 1;
    return {
      addFrameTask(options = {}) {
        let suspended = false;
        let cancelled = false;
        let skipNextDelta = false;
        let resolveFinished;
        const finished = new Promise(resolve => { resolveFinished = resolve; });
        const name = `effects-adapter:${options.owner || "effect"}:${nextAdapterTask++}`;
        const runtimeHandle = candidate.register(name, frameContext => {
          if (cancelled || suspended) return false;
          const delta = skipNextDelta ? 0 : frameContext.delta;
          skipNextDelta = false;
          const result = options.frame?.({ ...frameContext, delta });
          return !(result === false || result?.done);
        }, {
          priority: Number(options.priority) || 0,
          maxFps: Number(options.fps) || 30,
          enabled: true,
          wake: true
        });
        return Object.freeze({
          finished,
          cancel(reason = "cancelled") {
            if (cancelled) return;
            cancelled = true;
            runtimeHandle.disable();
            runtimeHandle.unregister();
            options.onCancel?.(reason);
            resolveFinished({ status: reason });
          },
          suspend() {
            if (cancelled || suspended) return;
            suspended = true;
            skipNextDelta = true;
            runtimeHandle.disable();
            options.onSuspend?.();
          },
          resume() {
            if (cancelled || !suspended) return;
            suspended = false;
            skipNextDelta = true;
            options.onResume?.();
            runtimeHandle.enable(`effects-resume:${name}`);
          },
          invalidate() {
            if (!cancelled && !suspended) runtimeHandle.wake(`effects-invalidate:${name}`);
          }
        });
      },
      registerInvalidationHandler() { return () => {}; }
    };
  }

  function createEffects(context = {}) {
    const runtime = adaptRuntime(context.runtime || window.NCNViewerRuntime || window.ViewerRuntime);
    const lifecycle = context.lifecycle || window.NCNViewerLifecycle;
    const viewer = context.viewer || document.querySelector('.viewer');
    const title = context.title || document.querySelector('.rail-title');
    if (!runtime?.addFrameTask) {
      throw new Error('createEffects requires the shared NCNViewerRuntime.');
    }

    const registry = new Map();
    const active = new Map();
    const channelIndex = new Map();
    const queues = new Map();
    const targetIds = new WeakMap();
    const unregisterRuntimeHandlers = [];
    const profile = { ambient: false, interaction: false };

    let nextHandleId = 1;
    let nextTargetId = 1;
    let initialised = false;
    let destroyed = false;
    let suspended = false;
    let clearing = false;
    let globalIntensity = 1;
    let reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;

    function identityFor(target) {
      const object = target.raw || target.element || target;
      if (!object || (typeof object !== 'object' && typeof object !== 'function')) {
        return `primitive:${String(object)}`;
      }
      if (!targetIds.has(object)) targetIds.set(object, `target-${nextTargetId++}`);
      return targetIds.get(object);
    }

    function channelKey(target, channel) {
      return `${identityFor(target)}::${channel}`;
    }

    function channelSet(key) {
      let set = channelIndex.get(key);
      if (!set) {
        set = new Set();
        channelIndex.set(key, set);
      }
      return set;
    }

    function removeFromChannel(handle) {
      const set = channelIndex.get(handle._channelKey);
      set?.delete(handle);
      if (set && !set.size) channelIndex.delete(handle._channelKey);
    }

    function removeQueued(handle) {
      const queue = queues.get(handle._channelKey);
      if (!queue) return false;
      const index = queue.indexOf(handle);
      if (index < 0) return false;
      queue.splice(index, 1);
      if (!queue.length) queues.delete(handle._channelKey);
      return true;
    }

    function beginQueued(key) {
      const queue = queues.get(key);
      if (!queue?.length || channelIndex.get(key)?.size) return;
      const next = queue.shift();
      if (!queue.length) queues.delete(key);
      next._start();
    }

    function register(name, definition) {
      if (destroyed) throw new Error('Effects instance has been destroyed.');
      if (!name || (!definition?.create && typeof definition !== 'function')) {
        throw new TypeError('effects.register requires a name and effect implementation.');
      }
      const normalised = typeof definition === 'function'
        ? { create: definition }
        : { ...definition };
      registry.set(String(name), Object.freeze(normalised));
      return api;
    }

    function unregister(name) {
      registry.delete(String(name));
    }

    function makeResult(handle, status, reason = null) {
      return Object.freeze({
        id: handle.id,
        name: handle.name,
        channel: handle.channel,
        status,
        reason
      });
    }

    function play(name, requestedTarget, requestedOptions = {}) {
      if (destroyed) throw new Error('Effects instance has been destroyed.');
      const definition = registry.get(String(name));
      if (!definition) throw new Error(`Unknown NCN effect: ${name}`);

      const target = normaliseTarget(requestedTarget);
      const options = {
        ...(definition.defaults || {}),
        ...requestedOptions
      };
      options.localIntensity = clamp01(options.intensity ?? 1);
      options.intensity = options.localIntensity * globalIntensity;
      options.duration = Math.max(0, Number(options.duration ?? definition.duration ?? 500));
      options.channel = options.channel || definition.channel || 'interface';
      options.concurrency = options.concurrency || definition.concurrency || 'stack';
      options.priority = Number(options.priority ?? definition.priority ?? 0);
      options.seed = Number.isFinite(Number(options.seed))
        ? Number(options.seed)
        : hash(`${name}:${nextHandleId}:${identityFor(target)}`);

      const key = channelKey(target, options.channel);
      const occupants = [...(channelIndex.get(key) || [])]
        .filter(handle => ['queued', 'running', 'suspended'].includes(handle.state));

      if (options.concurrency === 'ignore' && occupants.length) {
        const ignored = createPassiveHandle(name, target, options, 'ignored');
        return ignored;
      }

      if (options.concurrency === 'replace') {
        occupants
          .filter(handle => handle.priority <= options.priority)
          .forEach(handle => handle.cancel('replaced'));
      }

      if (options.concurrency === 'merge' && occupants.length) {
        const mergeTarget = occupants.sort((a, b) => b.priority - a.priority)[0];
        if (mergeTarget._controller?.merge?.(options) !== false) {
          mergeTarget.setIntensity(Math.max(mergeTarget.intensity, options.intensity));
          return mergeTarget;
        }
      }

      const handle = createLiveHandle(name, definition, target, options, key);

      if (options.concurrency === 'queue' && occupants.length) {
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

    function createPassiveHandle(name, target, options, status) {
      const result = Object.freeze({
        id: `effect-${nextHandleId++}`,
        name,
        target,
        channel: options.channel,
        priority: options.priority,
        intensity: options.intensity,
        state: status,
        finished: Promise.resolve({ status, name, channel: options.channel }),
        cancel() {},
        setIntensity() {}
      });
      return result;
    }

    function createLiveHandle(name, definition, target, options, key) {
      const id = `effect-${nextHandleId++}`;
      let resolveFinished;
      const finished = new Promise(resolve => { resolveFinished = resolve; });

      const handle = {
        id,
        name,
        target,
        channel: options.channel,
        priority: options.priority,
        intensity: options.intensity,
        _baseIntensity: options.localIntensity,
        state: 'queued',
        finished,
        _channelKey: key,
        _task: null,
        _controller: null,
        _resolved: false,
        _started: false,
        _elapsed: 0,
        _start: null,
        cancel: null,
        setIntensity: null
      };

      function complete(status = 'completed', reason = null) {
        if (handle._resolved) return;
        const wasStarted = handle._started;
        removeQueued(handle);
        handle._resolved = true;
        handle.state = status;
        handle._task?.cancel(status);
        handle._task = null;
        try {
          handle._controller?.cleanup?.({ status, reason });
        } catch (error) {
          console.error(`[NCNEffects] cleanup failed for ${name}`, error);
        }
        removeFromChannel(handle);
        active.delete(id);
        resolveFinished(makeResult(handle, status, reason));
        if (wasStarted && !clearing) beginQueued(key);
      }

      handle.cancel = reason => complete('cancelled', reason || 'cancelled');
      handle.setIntensity = value => {
        handle.intensity = clamp01(value);
        handle._controller?.setIntensity?.(handle.intensity);
      };

      handle._start = () => {
        if (handle._resolved || destroyed) return;
        if (!target.isValid()) {
          complete('cancelled', 'invalid-target');
          return;
        }

        handle._started = true;
        handle.state = suspended ? 'suspended' : 'running';
        active.set(id, handle);
        channelSet(key).add(handle);

        const useReduced = reducedMotion && definition.reducedCreate;
        const create = useReduced ? definition.reducedCreate : definition.create;
        const random = createSeededRandom(options.seed);

        try {
          handle._controller = create({
            effects: api,
            runtime,
            target,
            options,
            intensity: handle.intensity,
            random,
            seed: options.seed,
            reducedMotion: Boolean(reducedMotion),
            utils: window.NCNEffectUtils
          }) || {};
        } catch (error) {
          console.error(`[NCNEffects] failed to start ${name}`, error);
          complete('failed', error.message);
          return;
        }

        const duration = Math.max(0, Number(handle._controller.duration ?? options.duration));
        const fps = clamp(Number(handle._controller.fps ?? handle._controller.maxFps ?? definition.fps ?? definition.maxFps ?? 30), 1, 60);
        handle._controller.setIntensity?.(handle.intensity);

        if (!duration && !handle._controller.frame) {
          queueMicrotask(() => complete('completed'));
          return;
        }

        handle._task = runtime.addFrameTask({
          owner: `effects:${name}`,
          channel: options.channel,
          fps,
          priority: options.priority,
          frame({ now, delta }) {
            if (handle._resolved || suspended) return;
            if (!target.isValid()) {
              complete('cancelled', 'invalid-target');
              return false;
            }

            handle._elapsed += delta;
            const progress = duration > 0 ? clamp01(handle._elapsed / duration) : 0;
            const result = handle._controller?.frame?.({
              now,
              delta,
              elapsed: handle._elapsed,
              duration,
              progress,
              intensity: handle.intensity,
              random
            });
            target.invalidate();
            if (result === false || result?.done || (duration > 0 && progress >= 1)) {
              complete('completed');
              return false;
            }
          },
          onSuspend: () => handle._controller?.suspend?.(),
          onResume: () => handle._controller?.resume?.()
        });

        if (suspended) handle._task.suspend();
      };

      return handle;
    }

    async function init() {
      if (destroyed) throw new Error('Effects instance has been destroyed.');
      if (initialised) return api;
      initialised = true;

      if (context.registerRuntimeInvalidations !== false) {
        unregisterRuntimeHandlers.push(
          runtime.registerInvalidationHandler('chamber', () => window.LayeredChamber?.refresh?.()),
          runtime.registerInvalidationHandler('optical-geometry', () => window.OpticalProjection?.refreshGeometry?.()),
          runtime.registerInvalidationHandler('optical-lifecycle', () => window.OpticalProjection?.refreshLifecycle?.())
        );
      }

      return api;
    }

    function setGlobalIntensity(value) {
      globalIntensity = clamp01(value);
      for (const handle of active.values()) {
        handle.setIntensity(handle._baseIntensity * globalIntensity);
      }
    }

    function setReducedMotion(value) {
      reducedMotion = Boolean(value);
      for (const handle of active.values()) {
        handle._controller?.setReducedMotion?.(reducedMotion);
      }
    }

    function suspend() {
      if (destroyed || suspended) return;
      suspended = true;
      for (const handle of active.values()) {
        handle.state = 'suspended';
        handle._task?.suspend();
      }
    }

    function resume() {
      if (destroyed || !suspended) return;
      suspended = false;
      for (const handle of active.values()) {
        handle.state = 'running';
        handle._task?.resume();
      }
    }

    function clear(filter = null) {
      const predicate = typeof filter === 'function'
        ? filter
        : handle => !filter || handle.channel === filter || handle.name === filter;
      const affectedKeys = new Set();
      clearing = true;
      try {
        for (const handle of [...active.values()]) {
          if (!predicate(handle)) continue;
          affectedKeys.add(handle._channelKey);
          handle.cancel('cleared');
        }
        for (const [key, queue] of [...queues.entries()]) {
          for (const handle of [...queue]) {
            if (!predicate(handle)) continue;
            affectedKeys.add(key);
            handle.cancel('cleared');
          }
        }
      } finally {
        clearing = false;
      }
      for (const key of affectedKeys) beginQueued(key);
    }

    function destroy() {
      if (destroyed) return;
      clear();
      unregisterRuntimeHandlers.splice(0).forEach(unregister => unregister?.());
      registry.clear();
      active.clear();
      channelIndex.clear();
      queues.clear();
      destroyed = true;
      initialised = false;
    }

    function setProfile(next = {}) {
      profile.ambient = Boolean(next.ambient);
      profile.interaction = Boolean(next.interaction);
      if (!profile.ambient) clear('ambient');
      if (!profile.interaction) clear('interaction');
    }

    function ambientAllowed(priority = lifecycle?.PRIORITY?.ambient || 10) {
      return profile.ambient
        && !document.hidden
        && (lifecycle?.allows?.('minor-effect', priority) ?? true);
    }

    function interactionAllowed(priority = lifecycle?.PRIORITY?.interaction || 40) {
      return profile.interaction
        && !document.hidden
        && (lifecycle?.allows?.('minor-effect', priority) ?? true);
    }

    function pulseEntry(entry, options = {}) {
      if (!entry || (!options.force && !interactionAllowed(options.priority))) return false;
      return play('glow-pulse', entry, {
        channel: options.channel || 'interaction',
        concurrency: 'replace',
        duration: options.duration || 300,
        intensity: options.intensity ?? 0.55,
        seed: options.seed,
        priority: options.priority ?? lifecycle?.PRIORITY?.interaction ?? 40
      });
    }

    function titleJitter(options = {}) {
      if (!title || (!options.force && !ambientAllowed(options.priority))) return false;
      return play('displacement', title, {
        channel: options.channel || 'ambient',
        concurrency: 'replace',
        duration: options.duration || 110,
        intensity: options.intensity ?? 0.16,
        seed: options.seed,
        priority: options.priority ?? lifecycle?.PRIORITY?.ambient ?? 10
      });
    }

    function registrationFault(options = {}) {
      if (!viewer || (!options.force && !ambientAllowed(options.priority))) return false;
      return play('channel-separation', viewer, {
        channel: options.channel || 'ambient',
        concurrency: 'replace',
        duration: options.duration || 90,
        intensity: options.intensity ?? 0.12,
        seed: options.seed,
        priority: options.priority ?? lifecycle?.PRIORITY?.ambient ?? 10
      });
    }

    function getSnapshot() {
      return Object.freeze({
        initialised,
        destroyed,
        suspended,
        reducedMotion,
        globalIntensity,
        profile: Object.freeze({ ...profile }),
        registered: [...registry.keys()],
        active: [...active.values()].map(handle => ({
          id: handle.id,
          name: handle.name,
          channel: handle.channel,
          state: handle.state,
          intensity: handle.intensity
        })),
        queued: [...queues.values()].reduce((sum, queue) => sum + queue.length, 0)
      });
    }

    const api = Object.freeze({
      init,
      register,
      unregister,
      play,
      setGlobalIntensity,
      setReducedMotion,
      suspend,
      resume,
      clear,
      destroy,
      setProfile,
      setAmbientEnabled(enabled) {
        setProfile({ ambient: enabled, interaction: profile.interaction });
      },
      pulseEntry,
      titleJitter,
      registrationFault,
      snapshot: getSnapshot,
      getSnapshot,
      getDefinition: name => registry.get(String(name)) || null,
      list: () => [...registry.entries()].map(([name, definition]) => ({
        name,
        channel: definition.channel || 'interface',
        cost: definition.cost || 'unknown',
        features: definition.features || [],
        defaults: { ...(definition.defaults || {}) }
      }))
    });

    return api;
  }

  window.NCNEffectUtils = Object.freeze({
    clamp,
    clamp01,
    mix,
    envelope,
    hash,
    createSeededRandom,
    createStyleScope,
    createElementTarget: elementTarget,
    elementTarget,
    normaliseTarget,
    stripCloneIdentity,
    trackOverlay
  });

  window.createEffects = createEffects;
  window.NCNEffectDefinitions = window.NCNEffectDefinitions || new Map();
})();
