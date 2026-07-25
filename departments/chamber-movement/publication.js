/*==================================================
  NCN CHAMBER MOVEMENT · PR 86 DEPARTMENTAL PUBLICATION

  This publication is suitable for NCNModuleIntake inspection. It does not
  install itself and does not replace the incumbent chamber-motion slot.
==================================================*/
(function publishChamberMovement(globalScope) {
  "use strict";

  const manifest = Object.freeze({
    apiVersion: 1,
    name: "chamber-motion",
    department: "chamber-motion",
    version: "1.1.1-pr86-publication",
    dependencies: Object.freeze(["visual-director", "effects"]),
    layers: Object.freeze(["environment:chamber-motion"]),
    visualChannels: Object.freeze(["chamber"]),
    runtimeGroups: Object.freeze(["chamber"]),
    capabilities: Object.freeze([
      "init", "applyProfile", "suspend", "resume", "reset", "destroy",
      "trigger", "cancel", "settle", "snapshot"
    ]),
    owns: Object.freeze([
      "movement choreography",
      "temporary block transforms",
      "route reservations",
      "settling state"
    ]),
    protectedRoots: Object.freeze([]),
    animationLoop: "shared-runtime",
    replaces: "chamber-motion",
    reducedMotion: true,
    deterministicTesting: true,
    notes: "Publication only. A chamber-owned block geometry adapter is required during staged installation."
  });

  function resolveChamberAdapter(adapters, context) {
    const source = adapters?.chamber;
    return typeof source === "function" ? source(context) : source;
  }

  function create(context, adapters = {}) {
    if (!context?.runtime?.register) {
      throw new TypeError("A PR 86 department context with runtime.register() is required.");
    }
    if (!context?.director?.envelope || !context?.director?.claim) {
      throw new TypeError("The PR 86 visual director façade is required.");
    }
    const chamber = resolveChamberAdapter(adapters, context);
    if (!chamber?.getBlocks) {
      throw new TypeError("A chamber-owned block geometry adapter is required.");
    }
    const movementSurface = context.layers?.chamberMotion;
    if (!movementSurface) {
      throw new TypeError("The declared environment:chamber-motion layer is unavailable.");
    }
    const effects = context.integration?.requireService?.("effects");
    if (!effects?.play) {
      throw new TypeError("The declared effects dependency must provide play().");
    }

    return globalScope.createBlockRearrangement({
      runtime: context.runtime,
      events: context.events,
      chamber,
      visualDirector: context.director,
      effects,
      movementSurface,
      getReducedMotion: () => Boolean(context.settings?.reducedMotion),
      getQuality: () => context.settings?.quality || context.runtime?.getQuality?.() || "full",
      taskName: "update",
      taskGroup: "chamber",
      priority: 30,
      strictDependencies: true,
      seed: adapters.seed,
      logger: adapters.logger
    });
  }

  function createFactory(adapters = {}) {
    return context => create(context, adapters);
  }

  globalScope.NCNChamberMotionPublication = Object.freeze({
    manifest,
    create,
    createFactory,
    autoInstall: false,
    baseBranch: "agent/prepare-module-host"
  });
})(globalThis);
