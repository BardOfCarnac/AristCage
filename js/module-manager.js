/*==================================================
  NCN MODULE MANAGER

  Predictable lifecycle ownership for weather, effects, chamber movement,
  boot and future terminal services.
==================================================*/

window.NCNModules = (() => {
  const LIFECYCLE_METHODS = Object.freeze(["init", "suspend", "resume", "reset", "destroy"]);
  const records = new Map();
  let sharedContext = null;

  function assertName(name) {
    if (typeof name !== "string" || !name.trim()) {
      throw new TypeError("Module names must be non-empty strings.");
    }
    return name.trim();
  }

  function normaliseDependencies(input = []) {
    const values = typeof input === "string" ? [input] : Array.from(input || []);
    const dependencies = [...new Set(values.map(assertName))];
    return Object.freeze(dependencies);
  }

  function validateInstance(name, instance) {
    if (!instance || typeof instance !== "object") return {};
    for (const method of LIFECYCLE_METHODS) {
      if (instance[method] !== undefined && typeof instance[method] !== "function") {
        throw new TypeError(`Module ${name} exposes non-function ${method}`);
      }
    }
    return instance;
  }

  function setContext(context) {
    sharedContext = Object.freeze({ ...(context || {}) });
    return sharedContext;
  }

  function register(name, implementation, options = {}) {
    const key = assertName(name);
    const existing = records.get(key);
    if (existing && options.replace !== true) {
      throw new Error(`Module already registered: ${key}`);
    }
    if (existing && !["registered", "error", "destroyed"].includes(existing.state)) {
      throw new Error(`Active module must be destroyed before replacement: ${key}`);
    }

    const dependencies = normaliseDependencies(options.dependencies || []);
    if (dependencies.includes(key)) throw new Error(`Module cannot depend on itself: ${key}`);

    const record = {
      name: key,
      implementation,
      instance: null,
      dependencies,
      state: "registered",
      error: null,
      managed: options.managed !== false
    };
    records.set(key, record);
    window.NCNScene?.unregisterOwner?.(key);

    return Object.freeze({
      init: () => init(key),
      suspend: reason => suspend(key, reason),
      resume: reason => resume(key, reason),
      reset: reason => reset(key, reason),
      destroy: reason => destroy(key, reason),
      snapshot: () => recordSnapshot(record)
    });
  }

  function capabilities(record) {
    const target = record.instance || record.implementation;
    return Object.freeze(LIFECYCLE_METHODS.filter(method => typeof target?.[method] === "function"));
  }

  function recordSnapshot(record) {
    return Object.freeze({
      name: record.name,
      state: record.state,
      dependencies: record.dependencies,
      capabilities: capabilities(record),
      managed: record.managed,
      error: record.error ? String(record.error.message || record.error) : null
    });
  }

  function dependencyOrder() {
    const ordered = [];
    const visited = new Set();
    const visiting = new Set();

    function visit(name, ancestry = []) {
      if (visited.has(name)) return;
      if (visiting.has(name)) {
        throw new Error(`Circular module dependency: ${[...ancestry, name].join(" -> ")}`);
      }
      const record = records.get(name);
      if (!record) throw new Error(`Unknown module dependency: ${name}`);
      visiting.add(name);
      record.dependencies.forEach(dependency => visit(dependency, [...ancestry, name]));
      visiting.delete(name);
      visited.add(name);
      ordered.push(name);
    }

    records.forEach((_, name) => visit(name));
    return ordered;
  }

  function requireDependencies(record) {
    record.dependencies.forEach(name => {
      const dependency = records.get(name);
      if (!dependency || !["ready", "suspended"].includes(dependency.state)) {
        throw new Error(`${record.name} requires ready module ${name}`);
      }
    });
  }

  async function invoke(record, method, ...args) {
    if (!record.instance || typeof record.instance[method] !== "function") return undefined;
    return record.instance[method](...args);
  }

  async function init(name, ancestry = []) {
    const key = assertName(name);
    const record = records.get(key);
    if (!record) throw new Error(`Unknown module: ${key}`);
    if (["ready", "suspended"].includes(record.state)) return record.instance;
    if (record.state === "destroyed") throw new Error(`Destroyed module cannot be reinitialised: ${key}`);
    if (ancestry.includes(key) || record.state === "initialising") {
      throw new Error(`Circular module dependency: ${[...ancestry, key].join(" -> ")}`);
    }

    try {
      record.state = "initialising";
      for (const dependency of record.dependencies) await init(dependency, [...ancestry, key]);
      requireDependencies(record);
      const created = typeof record.implementation === "function"
        ? await record.implementation(sharedContext)
        : record.implementation;
      record.instance = validateInstance(key, created);
      await invoke(record, "init", sharedContext);
      record.error = null;
      record.state = "ready";
      window.NCNEvents?.emit?.("module:ready", { name: record.name });
      return record.instance;
    } catch (error) {
      record.error = error;
      record.state = "error";
      window.NCNEvents?.emit?.("module:error", { name: record.name, error });
      throw error;
    }
  }

  async function initAll() {
    for (const name of dependencyOrder()) await init(name);
    return snapshot();
  }

  async function suspend(name, reason = "host") {
    const record = records.get(assertName(name));
    if (!record || !record.managed || record.state !== "ready") return false;
    await invoke(record, "suspend", reason);
    record.state = "suspended";
    return true;
  }

  async function resume(name, reason = "host") {
    const record = records.get(assertName(name));
    if (!record || !record.managed || record.state !== "suspended") return false;
    await invoke(record, "resume", reason);
    record.state = "ready";
    return true;
  }

  async function reset(name, reason = "host") {
    const record = records.get(assertName(name));
    if (!record || !record.managed || !["ready", "suspended"].includes(record.state)) return false;
    await invoke(record, "reset", reason);
    return true;
  }

  async function destroy(name, reason = "host") {
    const record = records.get(assertName(name));
    if (!record || record.state === "destroyed") return false;
    await invoke(record, "destroy", reason);
    record.state = "destroyed";
    window.NCNScene?.unregisterOwner?.(record.name);
    window.NCNEvents?.emit?.("module:destroyed", { name: record.name, reason });
    return true;
  }

  async function each(method, reason, reverse = false) {
    const names = dependencyOrder();
    if (reverse) names.reverse();
    for (const name of names) await ({ suspend, resume, reset, destroy })[method](name, reason);
    return snapshot();
  }

  function get(name) {
    return records.get(assertName(name))?.instance || null;
  }

  function snapshot() {
    return Object.freeze([...records.values()].map(recordSnapshot));
  }

  return Object.freeze({
    LIFECYCLE_METHODS,
    setContext,
    register,
    init,
    initAll,
    get,
    has: name => records.has(assertName(name)),
    suspend,
    resume,
    reset,
    destroy,
    suspendAll: reason => each("suspend", reason, true),
    resumeAll: reason => each("resume", reason, false),
    resetAll: reason => each("reset", reason, true),
    destroyAll: reason => each("destroy", reason, true),
    snapshot
  });
})();