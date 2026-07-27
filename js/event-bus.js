/*==================================================
  NCN EVENT BUS

  Internal module communication. Existing window-level NCN events can be
  bridged during migration without making new modules depend on the DOM.
==================================================*/

window.NCNEvents = (() => {
  const target = new EventTarget();
  const bridges = new Map();
  const subscriptions = new Set();

  function assertType(type) {
    if (typeof type !== "string" || !type.trim()) {
      throw new TypeError("Event types must be non-empty strings.");
    }
    return type.trim();
  }

  function on(type, listener, options = {}) {
    const name = assertType(type);
    if (typeof listener !== "function") {
      throw new TypeError(`Listener for ${name} must be a function.`);
    }

    const wrapped = event => listener(event.detail, event);
    target.addEventListener(name, wrapped, options);
    const unsubscribe = () => {
      target.removeEventListener(name, wrapped, options);
      subscriptions.delete(unsubscribe);
    };
    subscriptions.add(unsubscribe);
    return unsubscribe;
  }

  function once(type, listener) {
    return on(type, listener, { once: true });
  }

  function emit(type, detail = {}) {
    const name = assertType(type);
    const payload = Object.freeze({
      type: name,
      at: performance.now(),
      detail
    });
    target.dispatchEvent(new CustomEvent(name, { detail: payload }));
    return payload;
  }

  function bridgeWindow(windowEvent, busEvent = null) {
    const source = assertType(windowEvent);
    const destination = assertType(busEvent || source.replace(/^ncn:/, ""));
    const key = `${source}->${destination}`;
    if (bridges.has(key)) return bridges.get(key).stop;

    const handler = event => emit(destination, event.detail);
    window.addEventListener(source, handler);
    const stop = () => {
      window.removeEventListener(source, handler);
      bridges.delete(key);
    };
    bridges.set(key, { source, destination, stop });
    return stop;
  }

  function clear() {
    [...subscriptions].forEach(unsubscribe => unsubscribe());
    [...bridges.values()].forEach(bridge => bridge.stop());
  }

  return Object.freeze({
    on,
    once,
    emit,
    bridgeWindow,
    clear,
    snapshot: () => Object.freeze({
      subscriptions: subscriptions.size,
      bridges: Object.freeze([...bridges.keys()])
    })
  });
})();
