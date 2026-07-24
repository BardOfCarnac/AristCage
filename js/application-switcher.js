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
      version: '14.07.2045 / DF 0.8.1 / APP 02 // PUBLIC CLASSIFIEDS',
      documentTitle: 'Dripfeed // Night City News Terminal'
    })
  });

  const redwireRoot = document.querySelector('#redwire-root');
  const dripfeedRoot = document.querySelector('#dripfeed-root');
  let dripfeedApp = null;
  let switching = false;

  function profile(name) {
    return profiles[name] || profiles.redwire;
  }

  function updateChrome(name) {
    const current = profile(name);
    const mark = document.querySelector('.rail-mark');
    const title = document.querySelector('.rail-title strong');
    const version = document.querySelector('.rail-title > span');

    document.documentElement.dataset.ncnApp = current.name;
    document.body.dataset.ncnApp = current.name;
    document.title = current.documentTitle;

    if (mark) mark.textContent = current.mark;
    if (title) {
      if (current.name === 'dripfeed') {
        title.innerHTML = '<span class="dripfeed-wordmark"><span class="drip-word">drip</span><span class="feed-word">FEED</span></span>';
      } else {
        title.textContent = current.title;
      }
    }
    if (version) version.textContent = current.version;
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
      return;
    }

    setMountVisibility('redwire');
    render();
    updateProjection();
    activatePresence(true);
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
    getDepthPlaneDefinitions: () => (
      NCN_STATE.activeApp === 'dripfeed'
        ? dripfeedApp?.getDepthPlaneDefinitions?.() || window.Dripfeed?.depth?.PLANE_DEFINITIONS || []
        : window.OpticalProjection?.getPlaneDefinitions?.() || []
    )
  });
})();
