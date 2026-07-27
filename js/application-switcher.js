/*==================================================
  TERMINAL APPLICATION SWITCHER

  Applications share the neutral terminal chamber and runtime, while each owns
  its document model, renderer and environmental profile. Animated switches hide
  the outgoing mount, realign the empty chamber, then activate the incoming app.
==================================================*/

window.NCNApplications = (() => {
  const SESSION_KEY = 'ncn-terminal-application';
  const profiles = Object.freeze({
    redwire: Object.freeze({
      name: 'redwire',
      mark: 'NCN',
      title: 'Night City News',
      version: '14.07.2045 / v1.0',
      documentTitle: 'Night City News'
    }),
    dripfeed: Object.freeze({
      name: 'dripfeed',
      mark: 'DF',
      version: '',
      documentTitle: 'Dripfeed // Night City News Terminal'
    })
  });

  const redwireRoot = document.querySelector('#redwire-root');
  const dripfeedRoot = document.querySelector('#dripfeed-root');
  let dripfeedApp = null;
  let switching = false;
  let railMeasurementFrame = 0;

  function profile(name) {
    return profiles[name] || profiles.redwire;
  }

  function measureRailClearance() {
    railMeasurementFrame = 0;
    const rail = document.querySelector('.rail');
    const bottom = Math.max(0, Math.ceil(rail?.getBoundingClientRect?.().bottom || 0));
    document.documentElement.style.setProperty('--ncn-rail-clearance', `${bottom}px`);
    return bottom;
  }

  function requestRailMeasurement() {
    if (railMeasurementFrame) cancelAnimationFrame(railMeasurementFrame);
    railMeasurementFrame = requestAnimationFrame(measureRailClearance);
  }

  function updateChrome(name) {
    const current = profile(name);
    const mark = document.querySelector('.rail-mark');
    const title = document.querySelector('.rail-title strong');
    const version = document.querySelector('.rail-title > span');

    document.documentElement.dataset.ncnApp = current.name;
    document.body.dataset.ncnApp = current.name;
    document.title = current.documentTitle;

    window.DripfeedWordmark?.destroy?.();

    if (mark) mark.textContent = current.mark;
    if (title) {
      if (current.name === 'dripfeed') {
        title.innerHTML = '<span class="dripfeed-wordmark-host" role="img" aria-label="DripFeed">DripFeed</span>';
        void window.DripfeedWordmark?.mount?.(title.querySelector('.dripfeed-wordmark-host'));
      } else {
        title.textContent = current.title;
      }
    }
    if (version) {
      const showVersion = current.name !== 'dripfeed';
      version.hidden = !showVersion;
      version.textContent = showVersion ? current.version : '';
    }
    requestRailMeasurement();
  }

  function ensureDripfeed() {
    if (dripfeedApp) return dripfeedApp;
    if (!dripfeedRoot || !window.Dripfeed?.mount) return null;
    dripfeedApp = window.Dripfeed.mount(dripfeedRoot);
    return dripfeedApp;
  }

  function setMountVisibility(name = null) {
    if (redwireRoot) redwireRoot.hidden = name !== 'redwire';
    if (dripfeedRoot) dripfeedRoot.hidden = name !== 'dripfeed';
  }

  function prepareToLeave(name) {
    if (name === 'dripfeed') dripfeedApp?.deactivate?.();
  }

  function mountApplication(name) {
    if (name === 'dripfeed') {
      const app = ensureDripfeed();
      setMountVisibility('dripfeed');
      app?.activate?.();
      requestRailMeasurement();
      return;
    }

    setMountVisibility('redwire');
    render();
    updateProjection();
    activatePresence(true);
    requestRailMeasurement();
  }

  function resolveApplication(name, animate) {
    const root = name === 'dripfeed' ? dripfeedRoot : redwireRoot;
    root?.classList.remove('application-resolving');
    if (!animate) return;
    requestAnimationFrame(() => root?.classList.add('application-resolving'));
    window.setTimeout(() => root?.classList.remove('application-resolving'), 320);
  }

  async function switchTo(name, options = {}) {
    const next = profile(name).name;
    const current = NCN_STATE.activeApp || 'redwire';
    if (switching || (next === current && options.force !== true)) return false;
    switching = true;

    try {
      const environment = window.NCNEnvironment;
      prepareToLeave(current);
      setMountVisibility(null);

      if (environment?.prepareApplication) {
        await environment.prepareApplication(next, {
          previous: current,
          animate: options.animate !== false,
          magnitude: 1.08
        });
      }

      NCN_STATE.activeApp = next;
      updateChrome(next);
      mountApplication(next);

      if (environment?.activateApplication) {
        environment.activateApplication(next, { previous: current });
      }

      resolveApplication(next, options.animate !== false);
      window.sessionStorage.setItem(SESSION_KEY, next);
      window.dispatchEvent(new CustomEvent('ncn:application-change', {
        detail: {
          name: next,
          previous: current,
          reason: options.reason || 'switch',
          environmentHandled: Boolean(environment?.activateApplication)
        }
      }));
      return true;
    } finally {
      switching = false;
    }
  }

  function initialApplication() {
    const query = new URLSearchParams(window.location.search).get('app');
    if (profiles[query]) return query;
    const session = window.sessionStorage.getItem(SESSION_KEY);
    return profiles[session] ? session : 'redwire';
  }

  window.addEventListener('resize', requestRailMeasurement, { passive: true });
  document.fonts?.ready?.then(requestRailMeasurement).catch?.(() => {});

  const initial = initialApplication();
  if (initial === 'dripfeed') {
    void switchTo('dripfeed', { animate: false, force: true, reason: 'initial' });
  } else {
    NCN_STATE.activeApp = 'redwire';
    setMountVisibility('redwire');
    updateChrome('redwire');
  }

  return Object.freeze({
    switchTo,
    current: () => NCN_STATE.activeApp,
    isSwitching: () => switching,
    profiles: () => Object.values(profiles).map(item => ({ ...item })),
    getRailClearance: () => measureRailClearance(),
    getDepthPlaneDefinitions: () => (
      NCN_STATE.activeApp === 'dripfeed'
        ? dripfeedApp?.getDepthPlaneDefinitions?.() || window.Dripfeed?.depth?.PLANE_DEFINITIONS || []
        : window.OpticalProjection?.getPlaneDefinitions?.() || []
    )
  });
})();
