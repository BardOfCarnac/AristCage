/*==================================================
  NCN FROZEN PUBLICATION BRIDGE

  Department APIs are intentionally frozen. The integration host's lifecycle
  adapter substitutes init()/destroy(), which cannot be done by proxying a frozen
  target directly. Supply a configurable delegated facade to the existing staged
  installer while leaving the reviewed departmental object untouched.
==================================================*/
(() => {
  "use strict";

  const integration = window.NCNIntegration;
  if (!integration?.installModule || integration.__frozenPublicationBridge === true) return;

  function delegatedFacade(instance) {
    if (!instance || typeof instance !== "object") return instance;
    const facade = {};
    for (const property of Reflect.ownKeys(instance)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(instance, property);
      if (!descriptor) continue;
      const value = Reflect.get(instance, property, instance);
      Object.defineProperty(facade, property, {
        value: typeof value === "function" ? value.bind(instance) : value,
        enumerable: descriptor.enumerable,
        configurable: true,
        writable: true
      });
    }
    return facade;
  }

  async function installModule(name, implementation, options = {}) {
    const safeImplementation = typeof implementation === "function"
      ? async moduleContext => delegatedFacade(await implementation(moduleContext))
      : delegatedFacade(implementation);
    return integration.installModule(name, safeImplementation, options);
  }

  window.NCNIntegration = Object.freeze({
    ...integration,
    installModule,
    __frozenPublicationBridge: true
  });
})();
