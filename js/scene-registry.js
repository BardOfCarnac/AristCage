/*==================================================
  NCN SCENE REGISTRY

  Stable names for terminal-owned layers. Modules receive references through
  this registry instead of querying or restructuring the production viewer.
==================================================*/

window.NCNScene = (() => {
  const records = new Map();

  function normaliseName(name) {
    if (typeof name !== "string" || !name.trim()) {
      throw new TypeError("Scene layer names must be non-empty strings.");
    }
    return name.trim();
  }

  function register(name, source, options = {}) {
    const key = normaliseName(name);
    const resolver = typeof source === "function" ? source : () => source;
    const existing = records.get(key);
    if (existing && options.replace !== true && existing.owner !== options.owner) {
      throw new Error(`Scene layer already registered: ${key}`);
    }

    records.set(key, {
      name: key,
      owner: options.owner || "terminal",
      writable: options.writable === true,
      resolver,
      description: options.description || ""
    });
    return get(key);
  }

  function get(name) {
    const record = records.get(normaliseName(name));
    if (!record) return null;
    const element = record.resolver();
    return element instanceof Element && element.isConnected ? element : null;
  }

  function requireLayer(name) {
    const element = get(name);
    if (!element) throw new Error(`Required scene layer is unavailable: ${name}`);
    return element;
  }

  function has(name) {
    return records.has(normaliseName(name));
  }

  function unregister(name, owner = null) {
    const key = normaliseName(name);
    const record = records.get(key);
    if (!record || (owner && record.owner !== owner)) return false;
    records.delete(key);
    return true;
  }

  function unregisterOwner(owner) {
    let removed = 0;
    records.forEach((record, name) => {
      if (record.owner !== owner) return;
      records.delete(name);
      removed += 1;
    });
    return removed;
  }

  function bootstrap() {
    const entries = {
      viewer: () => document.querySelector(".viewer"),
      interface: () => document.querySelector(".rail"),
      application: () => document.querySelector(".app"),
      "application:redwire": () => document.querySelector("#redwire-root"),
      "application:dripfeed": () => document.querySelector("#dripfeed-root"),
      chamber: () => document.querySelector(".layered-chamber-system"),
      optical: () => document.querySelector(".optical-plane-system"),
      environment: () => window.NCNEnvironmentHost?.root?.() || document.querySelector("#ncn-environment-system")
    };

    Object.entries(entries).forEach(([name, resolver]) => {
      register(name, resolver, { owner: "terminal", replace: true });
    });
    return snapshot();
  }

  function snapshot() {
    return Object.freeze([...records.values()].map(record => Object.freeze({
      name: record.name,
      owner: record.owner,
      writable: record.writable,
      connected: Boolean(get(record.name)),
      description: record.description
    })));
  }

  return Object.freeze({
    register,
    get,
    require: requireLayer,
    has,
    unregister,
    unregisterOwner,
    bootstrap,
    snapshot
  });
})();
