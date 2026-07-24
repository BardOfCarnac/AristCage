/*==================================================
  TERMINAL APPLICATION SWITCHER

  Applications share the terminal shell, chamber camera and rendering runtime,
  but each application owns its own document model and renderer.
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

  const redwireRoot = document.querySelector('.app-shell');
  const dripfeedRoot = document.querySelector('#dripfeed-root');
  let dripfeedApp = null;
  let restoreRedwireOptics = false;

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

  function setMountVisibility(name) {
    if (redwireRoot) redwireRoot.hidden = name !== 'redwire';
    if (dripfeedRoot) dripfeedRoot.hidden = name !== 'dripfeed';
  }

  function prepareToLeave(name) {
    if (name === 'redwire') {
      restoreRedwireOptics = Boolean(window.OpticalProjection?.isEnabled?.());
      if (restoreRedwireOptics) window.OpticalProjection.disable({ persist: false });
      return;
    }
    dripfeedApp?.deactivate?.();
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

    if (restoreRedwireOptics && !window.OpticalProjection?.isEnabled?.()) {
      window.OpticalProjection?.enable?.({ persist: false });
    } else {
      window.OpticalProjection?.refresh?.();
    }
  }

  async function switchTo(name, options = {}) {
    const next = profile(name).name;
    const current = NCN_STATE.activeApp || 'redwire';
    if (next === current && options.force !== true) return false;

    prepareToLeave(current);
    NCN_STATE.activeApp = next;
    updateChrome(next);
    mountApplication(next);

    const nextRoot = next === 'dripfeed' ? dripfeedRoot : redwireRoot;
    nextRoot?.classList.remove('application-resolving');
    if (options.animate !== false) {
      requestAnimationFrame(() => nextRoot?.classList.add('application-resolving'));
      window.setTimeout(() => nextRoot?.classList.remove('application-resolving'), 320);
    }

    window.sessionStorage.setItem(SESSION_KEY, next);
    window.dispatchEvent(new CustomEvent('ncn:application-change', {
      detail: { name: next, reason: options.reason || 'switch' }
    }));
    return true;
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

  return {
    switchTo,
    current: () => NCN_STATE.activeApp,
    profiles: () => Object.values(profiles).map(item => ({ ...item })),
    getDepthPlaneDefinitions: () => (
      NCN_STATE.activeApp === 'dripfeed'
        ? dripfeedApp?.getDepthPlaneDefinitions?.() || window.Dripfeed?.depth?.PLANE_DEFINITIONS || []
        : window.OpticalProjection?.getPlaneDefinitions?.() || []
    )
  };
})();
