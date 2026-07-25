/*==================================================
  NCN ENVIRONMENT HOST

  Neutral terminal-owned environmental layer references. The host owns the
  layer DOM; weather and other modules receive references and own only their
  disposable resources inside those layers.
==================================================*/

window.NCNEnvironmentHost = (() => {
  const ROOT_ID = 'ncn-environment-system';
  const LAYER_NAMES = Object.freeze(['far', 'rear', 'middle', 'near']);
  let root = null;
  const layerMap = new Map();

  function ensureRoot() {
    if (root?.isConnected) return root;
    root = document.getElementById(ROOT_ID) || document.createElement('div');
    root.id = ROOT_ID;
    root.className = 'ncn-environment-system';
    root.setAttribute('aria-hidden', 'true');
    if (!root.isConnected) document.body.append(root);
    return root;
  }

  function ensureLayer(name) {
    if (!LAYER_NAMES.includes(name)) throw new RangeError(`Unknown environment layer: ${name}`);
    const existing = layerMap.get(name);
    if (existing?.isConnected) return existing;
    const host = ensureRoot();
    const layer = host.querySelector(`[data-environment-layer="${name}"]`) || document.createElement('div');
    layer.className = `ncn-environment-layer ncn-environment-layer-${name}`;
    layer.dataset.environmentLayer = name;
    if (!layer.isConnected) host.append(layer);
    layerMap.set(name, layer);
    return layer;
  }

  function ensure() {
    const host = ensureRoot();
    LAYER_NAMES.forEach(ensureLayer);
    return host;
  }

  function layers() {
    ensure();
    return Object.freeze(Object.fromEntries(LAYER_NAMES.map(name => [name, ensureLayer(name)])));
  }

  return Object.freeze({
    ensure,
    root: () => ensure(),
    layer: ensureLayer,
    layers,
    clear() {
      const host = ensureRoot();
      host.replaceChildren();
      layerMap.clear();
      LAYER_NAMES.forEach(ensureLayer);
    }
  });
})();
