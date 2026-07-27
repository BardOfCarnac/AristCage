/*==================================================
  NCN INTEGRATION CONTRACT

  Shared names and versioned boundaries for terminal modules. This file contains
  no renderer behaviour and may be consumed by departmental publications.
==================================================*/

window.NCNIntegrationContract = (() => {
  const API_VERSION = 1;

  const MODULES = Object.freeze({
    BOOT: "boot",
    VISUAL_DIRECTOR: "visual-director",
    EFFECTS: "effects",
    WEATHER: "weather",
    CHAMBER_MOTION: "chamber-motion",
    OPTICAL: "optical",
    DRIPFEED: "dripfeed"
  });

  const REPLACEABLE_MODULES = Object.freeze([
    MODULES.BOOT,
    MODULES.EFFECTS,
    MODULES.WEATHER,
    MODULES.CHAMBER_MOTION
  ]);

  const PROTECTED_MODULES = Object.freeze([
    MODULES.VISUAL_DIRECTOR,
    MODULES.OPTICAL,
    MODULES.DRIPFEED
  ]);

  const RUNTIME_GROUPS = Object.freeze({
    BOOT: "boot",
    INTERFACE: "interface",
    ARTICLE: "article",
    ENVIRONMENT: "environment",
    CHAMBER: "chamber",
    EFFECTS: "effects",
    DIAGNOSTICS: "diagnostics"
  });

  const VISUAL_CHANNELS = Object.freeze({
    BOOT: "boot",
    INTERFACE: "interface",
    ARTICLE: "article",
    ENVIRONMENT: "environment",
    CHAMBER: "chamber",
    FAULT: "fault"
  });

  const SCENE = Object.freeze({
    VIEWER: "viewer",
    INTERFACE: "interface",
    APPLICATION: "application",
    REDWIRE: "application:redwire",
    DRIPFEED: "application:dripfeed",
    CHAMBER: "chamber",
    OPTICAL: "optical",
    ENVIRONMENT: "environment",
    WEATHER_FAR: "weather:far",
    WEATHER_REAR: "weather:rear",
    WEATHER_MIDDLE: "weather:middle",
    WEATHER_NEAR: "weather:near",
    CHAMBER_MOTION: "environment:chamber-motion",
    EFFECTS: "environment:effects"
  });

  const EVENTS = Object.freeze({
    HOST_READY: "host:ready",
    HOST_RESET: "host:reset",
    HOST_SUSPENDED: "host:suspended",
    HOST_RESUMED: "host:resumed",
    HOST_VERIFIED: "host:verified",
    APPLICATION_CHANGE: "application:change",
    LIFECYCLE_CHANGE: "lifecycle:change",
    VIEW_READING_CHANGE: "view:reading-change",
    DIRECTOR_CHANGE: "director:change",
    DIRECTOR_CLAIM: "director:claim",
    DIRECTOR_RELEASE: "director:release",
    MODULE_READY: "module:ready",
    MODULE_ERROR: "module:error",
    MODULE_DESTROYED: "module:destroyed",
    MODULE_INTAKE: "module:intake",
    BOOT_START: "boot:start",
    BOOT_COMPLETE: "boot:complete",
    BOOT_ERROR: "boot:error"
  });

  const PROTECTED_SCENE_NAMES = Object.freeze([
    SCENE.VIEWER,
    SCENE.INTERFACE,
    SCENE.APPLICATION,
    SCENE.REDWIRE,
    SCENE.DRIPFEED,
    SCENE.CHAMBER,
    SCENE.OPTICAL
  ]);

  return Object.freeze({
    API_VERSION,
    MODULES,
    REPLACEABLE_MODULES,
    PROTECTED_MODULES,
    RUNTIME_GROUPS,
    VISUAL_CHANNELS,
    SCENE,
    EVENTS,
    PROTECTED_SCENE_NAMES
  });
})();
