/*==================================================
  NCN MODULE INTAKE

  Static preflight for departmental publications. It records declared ownership
  and rejects contracts that attempt to own protected application or chamber roots.
==================================================*/

window.NCNModuleIntake = (() => {
  const contract = window.NCNIntegrationContract || {};
  const history = [];

  const MANAGED_CAPABILITIES = Object.freeze(["init", "suspend", "resume", "reset", "destroy"]);
  const PROFILE_CAPABILITIES = Object.freeze({
    weather: Object.freeze(["applyProfile", "configure", "setProfile", "setWeather", "setEnabled"]),
    effects: Object.freeze(["applyProfile", "configure", "setProfile"]),
    "chamber-motion": Object.freeze(["applyProfile", "configure", "setProfile", "setEnabled"])
  });
  const KNOWN_CAPABILITIES = Object.freeze([...new Set([
    ...MANAGED_CAPABILITIES,
    ...Object.values(PROFILE_CAPABILITIES).flat(),
    "run",
    "snapshot"
  ])]);
  const ALLOWED_LAYERS = Object.freeze([
    contract.SCENE?.WEATHER_FAR || "weather:far",
    contract.SCENE?.WEATHER_REAR || "weather:rear",
    contract.SCENE?.WEATHER_MIDDLE || "weather:middle",
    contract.SCENE?.WEATHER_NEAR || "weather:near",
    contract.SCENE?.CHAMBER_MOTION || "environment:chamber-motion",
    contract.SCENE?.EFFECTS || "environment:effects"
  ]);
  const ALLOWED_CHANNELS = Object.freeze(Object.values(contract.VISUAL_CHANNELS || {}));
  const ALLOWED_GROUPS = Object.freeze(Object.values(contract.RUNTIME_GROUPS || {}));
  const REPLACEABLE_MODULES = new Set(contract.REPLACEABLE_MODULES || ["boot", "effects", "weather", "chamber-motion"]);
  const PROTECTED_MODULES = new Set(contract.PROTECTED_MODULES || ["visual-director", "optical", "dripfeed"]);
  const PROTECTED_DEPENDENCIES = new Set([
    contract.MODULES?.OPTICAL || "optical",
    contract.MODULES?.DRIPFEED || "dripfeed"
  ]);
  const PROTECTED_SCENES = new Set(contract.PROTECTED_SCENE_NAMES || []);

  function uniqueStrings(input) {
    const values = typeof input === "string" ? [input] : Array.from(input || []);
    return Object.freeze([...new Set(values.map(value => String(value).trim()).filter(Boolean))]);
  }

  function normaliseManifest(name, manifest = {}) {
    const moduleName = String(name || "").trim();
    return Object.freeze({
      apiVersion: Number(manifest.apiVersion ?? contract.API_VERSION ?? 1),
      name: moduleName,
      department: String(manifest.department || moduleName || "unknown").trim(),
      version: String(manifest.version || "0.0.0").trim(),
      dependencies: uniqueStrings(manifest.dependencies),
      layers: uniqueStrings(manifest.layers),
      visualChannels: uniqueStrings(manifest.visualChannels),
      runtimeGroups: uniqueStrings(manifest.runtimeGroups),
      capabilities: uniqueStrings(manifest.capabilities),
      owns: uniqueStrings(manifest.owns),
      protectedRoots: uniqueStrings(manifest.protectedRoots),
      animationLoop: String(manifest.animationLoop || "shared-runtime").trim(),
      replaces: manifest.replaces ? String(manifest.replaces).trim() : null,
      reducedMotion: manifest.reducedMotion !== false,
      deterministicTesting: manifest.deterministicTesting === true,
      notes: String(manifest.notes || "").trim()
    });
  }

  function implementationCapabilities(implementation) {
    if (!implementation || typeof implementation !== "object") return [];
    return KNOWN_CAPABILITIES.filter(method => typeof implementation[method] === "function");
  }

  function inspect(name, implementation, manifest = {}) {
    const normalised = normaliseManifest(name, manifest);
    const errors = [];
    const warnings = [];
    const checks = [];
    const check = (label, pass, detail = "") => checks.push(Object.freeze({ label, pass: Boolean(pass), detail }));

    check("module name", Boolean(normalised.name), normalised.name || "missing");
    if (!normalised.name) errors.push("A non-empty module name is required.");

    const implementationValid = typeof implementation === "function"
      || (implementation && typeof implementation === "object");
    check("factory or object", implementationValid, typeof implementation);
    if (!implementationValid) errors.push("The module publication must expose a factory or module object.");

    const versionMatches = normalised.apiVersion === (contract.API_VERSION || 1);
    check("contract version", versionMatches, String(normalised.apiVersion));
    if (!versionMatches) errors.push(`Unsupported integration API version: ${normalised.apiVersion}.`);

    const target = normalised.replaces || normalised.name || normalised.department;
    if (PROTECTED_MODULES.has(normalised.name) || PROTECTED_MODULES.has(target)) {
      errors.push(`Protected module slots cannot be installed or replaced through departmental intake: ${target}.`);
    }
    if (normalised.replaces && normalised.replaces !== normalised.name) {
      errors.push(`Install the publication using its replacement slot name: ${normalised.replaces}.`);
    }
    if (normalised.replaces && !REPLACEABLE_MODULES.has(normalised.replaces)) {
      errors.push(`Module slot is not replaceable: ${normalised.replaces}.`);
    }

    normalised.dependencies.forEach(dependency => {
      if (dependency === normalised.name) errors.push("A module cannot depend on itself.");
      if (PROTECTED_DEPENDENCIES.has(dependency)) {
        errors.push(`Direct dependency on ${dependency} is forbidden; use context.views instead.`);
      }
    });

    normalised.layers.forEach(layer => {
      if (PROTECTED_SCENES.has(layer)) errors.push(`Protected scene ownership is forbidden: ${layer}.`);
      else if (!ALLOWED_LAYERS.includes(layer)) warnings.push(`Unrecognised declared layer: ${layer}.`);
    });

    normalised.protectedRoots.forEach(root => {
      errors.push(`The module declares access to protected root ${root}; use a host adapter instead.`);
    });

    normalised.visualChannels.forEach(channel => {
      if (!ALLOWED_CHANNELS.includes(channel)) errors.push(`Unknown visual channel: ${channel}.`);
    });

    normalised.runtimeGroups.forEach(group => {
      if (!ALLOWED_GROUPS.includes(group)) warnings.push(`Unrecognised runtime group: ${group}.`);
    });

    if (normalised.animationLoop !== "shared-runtime") {
      errors.push("Permanent private animation loops are not accepted; declare shared-runtime ownership.");
    }

    if (!normalised.reducedMotion) warnings.push("The publication does not declare a reduced-motion path.");
    if (!normalised.deterministicTesting) warnings.push("A seeded or deterministic test mode has not been declared.");

    const declaredCapabilities = new Set([
      ...normalised.capabilities,
      ...implementationCapabilities(implementation)
    ]);
    MANAGED_CAPABILITIES.forEach(method => {
      const pass = declaredCapabilities.has(method);
      check(`capability:${method}`, pass, pass ? "declared" : "missing");
      if (!pass) errors.push(`Managed module capability is missing: ${method}.`);
    });

    const profileMethods = PROFILE_CAPABILITIES[target];
    if (profileMethods) {
      const method = profileMethods.find(capability => declaredCapabilities.has(capability));
      check("application profile entry point", Boolean(method), method || "missing");
      if (!method) errors.push(`${target} must expose an accepted application-profile entry point.`);
    }
    if (target === "boot") {
      const pass = declaredCapabilities.has("run");
      check("boot run entry point", pass, pass ? "declared" : "missing");
      if (!pass) errors.push("The boot module must expose run(options).");
    }

    check("replaceable slot", !normalised.replaces || REPLACEABLE_MODULES.has(target), target);
    check("protected module boundary", !PROTECTED_MODULES.has(target), target);
    check("shared runtime", normalised.animationLoop === "shared-runtime", normalised.animationLoop);
    check("protected roots", normalised.protectedRoots.length === 0, normalised.protectedRoots.join(", "));
    check("reduced motion", normalised.reducedMotion, normalised.reducedMotion ? "declared" : "missing");
    check("deterministic testing", normalised.deterministicTesting, normalised.deterministicTesting ? "declared" : "missing");

    const report = Object.freeze({
      accepted: errors.length === 0,
      manifest: normalised,
      errors: Object.freeze(errors),
      warnings: Object.freeze(warnings),
      checks: Object.freeze(checks),
      inspectedAt: performance.now()
    });
    history.push(report);
    window.NCNEvents?.emit?.(contract.EVENTS?.MODULE_INTAKE || "module:intake", report);
    return report;
  }

  async function install(name, implementation, manifest = {}, options = {}) {
    const report = inspect(name, implementation, manifest);
    if (!report.accepted) {
      throw new Error(`Module intake rejected ${name}: ${report.errors.join(" ")}`);
    }
    const integration = window.NCNIntegration;
    if (!integration?.installModule) throw new Error("The integration services are not ready to install modules.");
    const result = await integration.installModule(name, implementation, {
      ...options,
      replace: options.replace === true || report.manifest.replaces === name,
      dependencies: report.manifest.dependencies,
      manifest: report.manifest
    });
    return Object.freeze({ report, result });
  }

  return Object.freeze({
    MANAGED_CAPABILITIES,
    PROFILE_CAPABILITIES,
    ALLOWED_LAYERS,
    normaliseManifest,
    inspect,
    install,
    snapshot: () => Object.freeze([...history])
  });
})();
