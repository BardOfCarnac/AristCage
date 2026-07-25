/*==================================================
  NCN ENVIRONMENT HOST

  Neutral terminal-owned layers. Applications and environmental modules receive
  named surfaces rather than attaching themselves to arbitrary viewer roots.
==================================================*/

window.NCNEnvironmentHost = (() => {
  const ROOT_ID = "ncn-environment-system";
  const LAYER_NAMES = Object.freeze([
    "weather-far",
    "weather-rear",
    "weather-middle",
    "weather-near",
    "chamber-motion",
    "effects"
  ]);
  const ALIASES = Object.freeze({
    far: "weather-far",
    rear: "weather-rear",
    middle: "weather-middle",
    mid: "weather-middle",
    near: "weather-near",
    "weather-mid": "weather-middle"
  });

  let root = null;
  const layers = new Map();

  function normaliseName(name) {
    const key = String(name || "").trim();
    return ALIASES[key] || key;
  }

  function ensureRoot() {
    if (root?.isConnected) return root;
    root = document.getElementById(ROOT_ID) || document.createElement("div");
    root.id = ROOT_ID;
    root.className = "ncn-environment-system";
    root.setAttribute("aria-hidden", "true");
    if (!root.isConnected) document.body.append(root);
    return root;
  }

  function registerSceneNames(name, element) {
    window.NCNScene?.register?.(`environment:${name}`, () => element, {
      owner: "terminal",
      writable: true,
      replace: true,
      description: `Terminal environmental layer: ${name}`
    });

    const weatherName = name.replace(/^weather-/, "");
    if (weatherName !== name) {
      window.NCNScene?.register?.(`weather:${weatherName}`, () => element, {
        owner: "terminal",
        writable: true,
        replace: true,
        description: `Terminal weather layer: ${weatherName}`
      });
    }
  }

  function ensureLayer(name) {
    const key = normaliseName(name);
    if (!LAYER_NAMES.includes(key)) throw new RangeError(`Unknown environment layer: ${name}`);

    const existing = layers.get(key);
    if (existing?.isConnected) return existing;

    const host = ensureRoot();
    const element = host.querySelector(`[data-ncn-environment-layer="${key}"]`)
      || document.createElement("div");
    element.className = `ncn-environment-layer ncn-environment-layer--${key}`;
    element.dataset.ncnEnvironmentLayer = key;
    element.setAttribute("aria-hidden", "true");
    if (!element.isConnected) host.append(element);
    layers.set(key, element);
    registerSceneNames(key, element);
    return element;
  }

  function ensure() {
    const host = ensureRoot();
    LAYER_NAMES.forEach(ensureLayer);
    window.NCNScene?.register?.("environment", () => host, {
      owner: "terminal",
      writable: false,
      replace: true,
      description: "Terminal environment root"
    });
    return host;
  }

  function layer(name) {
    ensure();
    return ensureLayer(name);
  }

  function canonicalLayers() {
    ensure();
    return Object.freeze(Object.fromEntries(LAYER_NAMES.map(name => [name, ensureLayer(name)])));
  }

  function weatherLayers() {
    ensure();
    return Object.freeze({
      far: ensureLayer("weather-far"),
      rear: ensureLayer("weather-rear"),
      middle: ensureLayer("weather-middle"),
      near: ensureLayer("weather-near")
    });
  }

  function clear() {
    ensureRoot().replaceChildren();
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
    ALIASES,
    ensure,
    root: () => ensure(),
    layer,
    layers: canonicalLayers,
    weatherLayers,
    clear,
    destroy
  });
})();