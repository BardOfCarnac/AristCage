/*==================================================
  NCN MODULE MANAGER

  Predictable lifecycle ownership for weather, effects, chamber movement,
  boot and future terminal services.
==================================================*/

window.NCNModules = (() => {
  const records = new Map();
  let sharedContext = null;

  function assertName(name) {
    if (typeof name !== "string" || !name.trim()) {
      throw new TypeError("Module names must be non-empty strings.");
    }
    return name.trim();
  }

  function setContext(context) {
    sharedContext = Object.freeze({ ...(context || {}) });
    return sharedContext;
  }

  function register(name, implementation, options = {}) {
    const key = assertName(name);
    if (records.has(key) && options.replace !== true) {
      throw new Error(`Module already registered: ${key}`);
    }

    const record = {
      name: key,
      implementation,
      instance: null,
      dependencies: Object.freeze([...(options.dependencies || [])]),
      state: "registered",
      error: null,
      managed: options.managed !== false
    };
    records.set(key, record);
    return Object.freeze({
      init: () => init(key),
      suspend: reason => suspend(key, reason),
      resume: reason => resume(key, reason),
      reset: reason => reset(key, reason),
      destroy: reason => destroy(key, reason),
      snapshot: () => recordSnapshot(record)
    });
  }

  function recordSnapshot(record) {
    return Object.freeze({
      name: record.name,
      state: record.state,
      dependencies: record.dependencies,
      managed: record.managed,
      error: record.error ? String(record.error.message || record.error) : null
    });
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

  async function init(name) {
    const record = records.get(assertName(name));
    if (!record) throw new Error(`Unknown module: ${name}`);
    if (["ready", "suspended"].includes(record.state)) return record.instance;
    if (record.state === "destroyed") throw new Error(`Destroyed module cannot be reinitialised: ${name}`);

    try {
      for (const dependency of record.dependencies) await init(dependency);
      requireDependencies(record);
      record.state = "initialising";
      record.instance = typeof record.implementation === "function"
        ? await record.implementation(sharedContext)
        : record.implementation;
      if (!record.instance || typeof record.instance !== "object") record.instance = {};
      await invoke(record, "init", sharedContext);
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
    for (const name of records.keys()) await init(name);
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
    return true;
  }

  async function each(method, reason, reverse = false) {
    const names = [...records.keys()];
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
    setContext,
    register,
    init,
    initAll,
    get,
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
