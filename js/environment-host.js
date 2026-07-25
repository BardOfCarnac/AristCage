/*==================================================
  NCN ENVIRONMENT HOST

  Neutral terminal-owned layers. Applications and environmental modules receive
  named surfaces rather than attaching themselves to arbitrary viewer roots.
==================================================*/

window.NCNEnvironmentHost = (() => {
  const ROOT_ID = "ncn-environment-system";
  const LAYER_NAMES = Object.freeze([
    "weather-far",
    "weather-mid",
    "weather-near",
    "chamber-motion",
    "effects"
  ]);

  let root = null;
  const layers = new Map();

  function ensureLayer(name) {
    const key = String(name);
    const existing = layers.get(key);
    if (existing?.isConnected) return existing;

    const element = root.querySelector(`[data-ncn-environment-layer="${key}"]`)
      || document.createElement("div");
    element.className = `ncn-environment-layer ncn-environment-layer--${key}`;
    element.dataset.ncnEnvironmentLayer = key;
    element.setAttribute("aria-hidden", "true");
    if (!element.isConnected) root.append(element);
    layers.set(key, element);
    window.NCNScene?.register?.(`environment:${key}`, () => element, {
      owner: "terminal",
      writable: true,
      replace: true,
      description: `Terminal environmental layer: ${key}`
    });
    return element;
  }

  function ensure() {
    if (!root?.isConnected) {
      root = document.getElementById(ROOT_ID) || document.createElement("div");
      root.id = ROOT_ID;
      root.className = "ncn-environment-system";
      root.setAttribute("aria-hidden", "true");
      if (!root.isConnected) document.body.append(root);
    }
    LAYER_NAMES.forEach(ensureLayer);
    window.NCNScene?.register?.("environment", () => root, {
      owner: "terminal",
      writable: false,
      replace: true,
      description: "Terminal environment root"
    });
    return root;
  }

  function layer(name) {
    ensure();
    if (!LAYER_NAMES.includes(String(name))) {
      throw new Error(`Unknown environment layer: ${name}`);
    }
    return ensureLayer(String(name));
  }

  function clear() {
    ensure().replaceChildren();
    layers.clear();
    LAYER_NAMES.forEach(ensureLayer);
  }

  function destroy() {
    root?.remove();
    root = null;
    layers.clear();
  }

  return Object.freeze({
    LAYER_NAMES,
    ensure,
    root: () => ensure(),
    layer,
    layers: () => Object.freeze(Object.fromEntries(LAYER_NAMES.map(name => [name, layer(name)]))),
    clear,
    destroy
  });
})();
