/*==================================================
  NCN WEATHER INTEGRATION ADAPTER

  Binds the published createWeather(context) factory to the terminal-owned
  environment host, shared runtime, lifecycle, camera and application profiles.
==================================================*/

window.NCNWeatherRenderer = (() => {
  const runtime = window.NCNViewerRuntime;
  const lifecycle = window.NCNViewerLifecycle;
  const host = window.NCNEnvironmentHost;

  let weather = null;
  let initPromise = null;
  let desired = {
    enabled: false,
    preset: 'clear',
    intensity: 0,
    wind: { x: 0, y: 0, z: 0 },
    quality: 'auto',
    seed: 2045
  };
  let feedObserver = null;
  let runtimeUnsubscribe = null;
  let zoneFrame = 0;

  function camera() {
    return window.NCNChamberCamera?.snapshot?.()
      || window.LayeredChamber?.getCameraSnapshot?.()
      || null;
  }

  function effectsAdapter() {
    return Object.freeze({
      play(name, target, options = {}) {
        if (typeof window.NCNEffects?.play === 'function') {
          return window.NCNEffects.play(name, target, options);
        }
        const request = new CustomEvent('ncn:effect-request', {
          cancelable: true,
          detail: { name, target, options, source: 'weather' }
        });
        return window.dispatchEvent(request);
      }
    });
  }

  function allowAmbient() {
    return lifecycle?.allows?.('ambient', lifecycle.PRIORITY.ambient) ?? true;
  }

  function ensureWeather() {
    if (weather) return initPromise;
    if (!window.createWeather || !runtime || !host) {
      return Promise.reject(new Error('Weather dependencies are unavailable.'));
    }

    weather = window.createWeather({
      id: 'ncn-terminal-weather',
      taskName: 'weather-environment',
      runtime,
      layers: host.layers(),
      camera,
      effects: effectsAdapter(),
      allowAmbient,
      resizeTarget: window,
      blockEvents: window,
      seed: desired.seed,
      intensity: desired.intensity,
      particleCaps: { mist: 72, dust: 90, rain: 180 },
      priority: 20
    });
    initPromise = weather.init().then(() => {
      attachReadingObserver();
      if (!runtimeUnsubscribe && runtime.subscribe) {
        runtimeUnsubscribe = runtime.subscribe(event => {
          if (event.type !== 'quality-change' || desired.quality !== 'auto') return;
          weather?.setQuality?.(event.runtime.quality === 'reduced' ? 'reduced' : 'medium');
        });
      }
      return weather;
    });
    return initPromise;
  }

  function mapLegacyProfile(profile = {}) {
    const legacyMist = Number(profile.mist);
    const intensity = Number.isFinite(profile.intensity)
      ? profile.intensity
      : Number.isFinite(legacyMist)
        ? legacyMist
        : desired.intensity;
    let preset = profile.preset || desired.preset;
    if (!profile.preset && Number.isFinite(legacyMist)) {
      preset = legacyMist >= 0.62 ? 'heavy-mist' : legacyMist > 0.01 ? 'mist' : 'clear';
    }
    const wind = typeof profile.wind === 'number'
      ? { x: profile.wind, y: 0, z: -Math.abs(profile.wind) * 0.16 }
      : profile.wind || desired.wind;
    return {
      enabled: profile.enabled ?? desired.enabled,
      preset,
      intensity: Math.max(0, Math.min(1, Number(intensity) || 0)),
      wind: {
        x: Number(wind?.x) || 0,
        y: Number(wind?.y) || 0,
        z: Number(wind?.z) || 0
      },
      quality: profile.quality || desired.quality,
      seed: Number.isFinite(Number(profile.seed)) ? Number(profile.seed) : desired.seed,
      transitionDuration: Math.max(0, Number(profile.transitionDuration) || 0)
    };
  }

  function applyDesired() {
    return ensureWeather().then(instance => {
      if (instance.snapshot().seed !== desired.seed) instance.setSeed(desired.seed);
      if (desired.quality && desired.quality !== 'auto') instance.setQuality(desired.quality);
      instance.setWind(desired.wind);
      instance.setIntensity(desired.intensity);
      if (!desired.enabled) {
        instance.setEnabled(false);
        instance.clearImmediate();
        return instance;
      }
      instance.setEnabled(true);
      if (desired.transitionDuration > 0) {
        instance.transitionTo(desired.preset, { duration: desired.transitionDuration });
      } else {
        instance.setPreset(desired.preset);
      }
      scheduleZoneSync();
      return instance;
    }).catch(error => {
      console.error('[NCN weather] integration failed', error);
      return null;
    });
  }

  function activeReadingElement() {
    return document.querySelector(
      '#feed .entry.expanded:not(.panel) .projection-plate, '
      + '.optical-mode .optical-semantic-item[data-optical-role="body"], '
      + '.dripfeed-reader[aria-hidden="false"], '
      + '.dripfeed-reader.is-open'
    );
  }

  function controlElements() {
    return [
      document.querySelector('.rail'),
      document.querySelector('#feed .entry.panel .projection-plate'),
      document.querySelector('.desktop-inspector:not(:empty)')
    ].filter(Boolean);
  }

  function syncZones() {
    zoneFrame = 0;
    if (!weather) return;
    const reading = activeReadingElement();
    weather.setReadingZone(reading ? {
      element: reading,
      attenuation: 0.84,
      padding: 24,
      radius: 34
    } : null);
    weather.setControlZones(controlElements().map(element => ({
      element,
      attenuation: 0.68,
      padding: 14,
      radius: 22
    })));
  }

  function scheduleZoneSync() {
    if (zoneFrame) return;
    zoneFrame = requestAnimationFrame(syncZones);
  }

  function attachReadingObserver() {
    if (feedObserver) return;
    const feed = document.querySelector('#feed');
    if (feed) {
      feedObserver = new MutationObserver(scheduleZoneSync);
      feedObserver.observe(feed, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'hidden', 'aria-hidden']
      });
    }
    window.addEventListener('scroll', scheduleZoneSync, { passive: true });
    window.addEventListener('resize', scheduleZoneSync, { passive: true });
    window.addEventListener('ncn:chamber-camera-change', scheduleZoneSync);
    window.addEventListener('ncn:application-change', scheduleZoneSync);
    scheduleZoneSync();
  }

  function configure(profile = {}) {
    desired = mapLegacyProfile(profile);
    if (!desired.enabled && !weather) return desired;
    void applyDesired();
    return desired;
  }

  function setWeather(next = {}) {
    return configure({ ...desired, ...next });
  }

  function disable() {
    desired = { ...desired, enabled: false, preset: 'clear', intensity: 0, transitionDuration: 0 };
    if (weather) {
      weather.setEnabled(false);
      weather.clearImmediate();
    }
  }

  function suspend() {
    weather?.suspend?.();
  }

  function resume() {
    if (desired.enabled) weather?.resume?.();
  }

  function reset() {
    weather?.reset?.();
    if (desired.enabled) void applyDesired();
  }

  function destroy() {
    if (zoneFrame) cancelAnimationFrame(zoneFrame);
    zoneFrame = 0;
    feedObserver?.disconnect();
    feedObserver = null;
    runtimeUnsubscribe?.();
    runtimeUnsubscribe = null;
    window.removeEventListener('scroll', scheduleZoneSync);
    window.removeEventListener('resize', scheduleZoneSync);
    window.removeEventListener('ncn:chamber-camera-change', scheduleZoneSync);
    window.removeEventListener('ncn:application-change', scheduleZoneSync);
    weather?.destroy?.();
    weather = null;
    initPromise = null;
  }

  window.addEventListener('ncn:lifecycle-change', event => {
    const next = event.detail?.next;
    if (next === lifecycle?.STATES?.SLEEPING) suspend();
    else if (next === lifecycle?.STATES?.READY) resume();
    if ([lifecycle?.STATES?.REALIGNING, lifecycle?.STATES?.DEGRADED].includes(next)) {
      weather?.attenuateForTransition?.(0.12);
    }
  });

  return Object.freeze({
    configure,
    setWeather,
    disable,
    suspend,
    resume,
    reset,
    destroy,
    setPreset(name) {
      desired = { ...desired, enabled: true, preset: name, transitionDuration: 0 };
      void applyDesired();
    },
    transitionTo(name, options = {}) {
      desired = { ...desired, enabled: true, preset: name, transitionDuration: Number(options.duration) || 0 };
      void applyDesired();
    },
    setIntensity(value) {
      desired = { ...desired, intensity: Math.max(0, Math.min(1, Number(value) || 0)) };
      weather?.setIntensity?.(desired.intensity);
    },
    setReadingZone(zone) {
      weather?.setReadingZone?.(zone);
    },
    requestElectricalPulse(intensity) {
      return weather?.requestElectricalPulse?.(intensity) || false;
    },
    snapshot: () => Object.freeze({ desired: { ...desired }, module: weather?.snapshot?.() || null })
  });
})();
