/*==================================================
  NCN BLOCK REARRANGEMENT · PR 86 PUBLICATION

  Renderer-agnostic chamber block choreography.
  The chamber supplies block handles and geometry.
  NCNViewerRuntime supplies all recurring animation work.
  The visual director grants permission for movements.
==================================================*/
(function attachBlockRearrangement(globalScope, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) {
    globalScope.createBlockRearrangement = api.createBlockRearrangement;
    globalScope.NCN_BLOCK_REARRANGEMENT_SHAPES = api.SHAPES;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function blockRearrangementFactory() {
  "use strict";

  const VERSION = "1.1.1-pr86-publication";
  const DEFAULT_TASK_NAME = "block-rearrangement:update";
  const DEFAULT_TASK_GROUP = "chamber";
  const SUPPORTED_PATTERNS = new Set([
    "extract-rotate-settle",
    "wall-to-rear",
    "extract-outward-turn-inward-settle"
  ]);

  const SHAPES = Object.freeze([
    Object.freeze({ key: "single", cells: Object.freeze([[0, 0]]) }),
    Object.freeze({ key: "domino-h", cells: Object.freeze([[0, 0], [1, 0]]) }),
    Object.freeze({ key: "domino-v", cells: Object.freeze([[0, 0], [0, 1]]) }),
    Object.freeze({ key: "triple-h", cells: Object.freeze([[0, 0], [1, 0], [2, 0]]) }),
    Object.freeze({ key: "triple-v", cells: Object.freeze([[0, 0], [0, 1], [0, 2]]) }),
    Object.freeze({ key: "l3-a", cells: Object.freeze([[0, 0], [1, 0], [0, 1]]) }),
    Object.freeze({ key: "l3-b", cells: Object.freeze([[0, 0], [1, 0], [1, 1]]) }),
    Object.freeze({ key: "square4", cells: Object.freeze([[0, 0], [1, 0], [0, 1], [1, 1]]) }),
    Object.freeze({ key: "t4", cells: Object.freeze([[0, 0], [1, 0], [2, 0], [1, 1]]) }),
    Object.freeze({ key: "line5", cells: Object.freeze([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]) }),
    Object.freeze({ key: "pento-l", cells: Object.freeze([[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]]) }),
    Object.freeze({ key: "pento-t", cells: Object.freeze([[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]]) }),
    Object.freeze({ key: "hex-rect", cells: Object.freeze([[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]]) }),
    Object.freeze({ key: "hex-stair", cells: Object.freeze([[0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2]]) }),
    Object.freeze({ key: "hepto-arch", cells: Object.freeze([[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [3, 1]]) }),
    Object.freeze({ key: "hepto-tower", cells: Object.freeze([[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 1]]) })
  ]);

  const DEFAULT_PROFILE = Object.freeze({
    enabled: true,
    intensity: 0.5,
    quality: "full",
    maxActive: 4,
    clusterSize: Object.freeze([1, 7]),
    durationRange: Object.freeze([6500, 10500]),
    maxFps: 30,
    routePaddingCells: 0.2,
    settleDuration: 520,
    reducedMotionPolicy: "static",
    reducedMotionDuration: 420,
    reducedMotionDepth: 0.16,
    effects: Object.freeze({})
  });

  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const clamp01 = value => clamp(value, 0, 1);
  const mix = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - clamp01(t), 3);
  const easeIn = t => Math.pow(clamp01(t), 3);
  const smoothstep = t => {
    const n = clamp01(t);
    return n * n * (3 - 2 * n);
  };

  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scale = (v, amount) => [v[0] * amount, v[1] * amount, v[2] * amount];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const length3 = v => Math.sqrt(Math.max(0, dot(v, v)));
  const normalize = v => {
    const magnitude = length3(v);
    return magnitude > 0.000001 ? scale(v, 1 / magnitude) : [0, 0, 0];
  };
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
  const lerp3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

  function hashSeed(value) {
    let result = 2166136261;
    for (const character of String(value)) {
      result ^= character.charCodeAt(0);
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  }

  function seededRandom(seed) {
    let state = hashSeed(seed);
    return () => {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function rotateAroundAxis(vector, axis, angle) {
    const unitAxis = normalize(axis);
    if (length3(unitAxis) < 0.000001 || Math.abs(angle) < 0.000001) return [...vector];
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return add(
      add(scale(vector, cosine), scale(cross(unitAxis, vector), sine)),
      scale(unitAxis, dot(unitAxis, vector) * (1 - cosine))
    );
  }

  function cloneBasis(basis) {
    return { u: [...basis.u], v: [...basis.v], n: [...basis.n] };
  }

  function interpolateBasis(source, target, progress) {
    const n = clamp01(progress);
    const sourceNormal = normalize(source.n);
    const targetNormal = normalize(target.n);
    const cosine = clamp(dot(sourceNormal, targetNormal), -1, 1);
    const angle = Math.acos(cosine);
    let axis = cross(sourceNormal, targetNormal);
    if (length3(axis) < 0.000001) {
      axis = normalize(add(source.v, target.v));
      if (length3(axis) < 0.000001) axis = [0, 1, 0];
    }
    if (n >= 0.999999) return cloneBasis(target);
    return {
      u: normalize(rotateAroundAxis(source.u, axis, angle * n)),
      v: normalize(rotateAroundAxis(source.v, axis, angle * n)),
      n: normalize(rotateAroundAxis(source.n, axis, angle * n))
    };
  }

  function shapeBounds(shape) {
    const xs = shape.cells.map(cell => cell[0]);
    const ys = shape.cells.map(cell => cell[1]);
    return {
      minU: Math.min(...xs), maxU: Math.max(...xs),
      minV: Math.min(...ys), maxV: Math.max(...ys)
    };
  }

  function normalizeShape(shape) {
    const bounds = shapeBounds(shape);
    const cells = shape.cells.map(([u, v]) => [u - bounds.minU, v - bounds.minV]);
    return Object.freeze({
      key: shape.key,
      cells: Object.freeze(cells),
      width: bounds.maxU - bounds.minU + 1,
      height: bounds.maxV - bounds.minV + 1,
      size: cells.length
    });
  }

  const NORMALIZED_SHAPES = Object.freeze(SHAPES.map(normalizeShape));

  function eventWithDetail(type, detail) {
    if (typeof CustomEvent === "function") return new CustomEvent(type, { detail });
    const event = typeof Event === "function" ? new Event(type) : { type };
    Object.defineProperty(event, "detail", { value: detail, enumerable: true });
    return event;
  }

  function validateBasis(basis, label) {
    if (!basis || ![basis.u, basis.v, basis.n].every(vector => Array.isArray(vector) && vector.length === 3)) {
      throw new TypeError(`${label} must provide basis.u, basis.v and basis.n vectors.`);
    }
  }

  function geometryOf(block) {
    const geometry = typeof block.getGeometry === "function" ? block.getGeometry() : block.geometry;
    if (!geometry || !Array.isArray(geometry.center) || geometry.center.length !== 3) {
      throw new TypeError(`Block ${block.id || "unknown"} has no valid geometry centre.`);
    }
    validateBasis(geometry.basis, `Block ${block.id || "unknown"}`);
    return {
      ...geometry,
      center: [...geometry.center],
      basis: cloneBasis(geometry.basis),
      size: Number(geometry.size) || Number(geometry.cellSize) || 0.5
    };
  }

  function indexBlocks(blocks) {
    const map = new Map();
    for (const block of blocks) {
      if (!block || block.id == null || !Number.isInteger(block.u) || !Number.isInteger(block.v)) {
        throw new TypeError("Every chamber block requires id, integer u and integer v fields.");
      }
      map.set(`${block.u}:${block.v}`, block);
    }
    return map;
  }

  function regionBounds(blocks) {
    return {
      minU: Math.min(...blocks.map(block => block.u)),
      maxU: Math.max(...blocks.map(block => block.u)),
      minV: Math.min(...blocks.map(block => block.v)),
      maxV: Math.max(...blocks.map(block => block.v))
    };
  }

  function boundsOverlap(a0, a1, b0, b1, padding = 0) {
    return a0 <= b1 + padding && b0 <= a1 + padding;
  }

  function averagePoints(points) {
    if (!points.length) return [0, 0, 0];
    return scale(points.reduce((result, point) => add(result, point), [0, 0, 0]), 1 / points.length);
  }

  function averageBasis(blocks) {
    const bases = blocks.map(block => geometryOf(block).basis);
    return {
      u: normalize(averagePoints(bases.map(basis => basis.u))),
      v: normalize(averagePoints(bases.map(basis => basis.v))),
      n: normalize(averagePoints(bases.map(basis => basis.n)))
    };
  }

  function segmentDistance(first, second) {
    const small = 0.0000001;
    const u = sub(first.b, first.a);
    const v = sub(second.b, second.a);
    const w = sub(first.a, second.a);
    const a = dot(u, u);
    const b = dot(u, v);
    const c = dot(v, v);
    const d = dot(u, w);
    const e = dot(v, w);
    const denominator = a * c - b * b;
    let sNumerator;
    let sDenominator = denominator;
    let tNumerator;
    let tDenominator = denominator;

    if (denominator < small) {
      sNumerator = 0;
      sDenominator = 1;
      tNumerator = e;
      tDenominator = c;
    } else {
      sNumerator = b * e - c * d;
      tNumerator = a * e - b * d;
      if (sNumerator < 0) {
        sNumerator = 0;
        tNumerator = e;
        tDenominator = c;
      } else if (sNumerator > sDenominator) {
        sNumerator = sDenominator;
        tNumerator = e + b;
        tDenominator = c;
      }
    }

    if (tNumerator < 0) {
      tNumerator = 0;
      if (-d < 0) sNumerator = 0;
      else if (-d > a) sNumerator = sDenominator;
      else {
        sNumerator = -d;
        sDenominator = a;
      }
    } else if (tNumerator > tDenominator) {
      tNumerator = tDenominator;
      if (-d + b < 0) sNumerator = 0;
      else if (-d + b > a) sNumerator = sDenominator;
      else {
        sNumerator = -d + b;
        sDenominator = a;
      }
    }

    const sc = Math.abs(sNumerator) < small ? 0 : sNumerator / sDenominator;
    const tc = Math.abs(tNumerator) < small ? 0 : tNumerator / tDenominator;
    return length3(sub(add(w, scale(u, sc)), scale(v, tc)));
  }

  function normalizePair(value, fallback) {
    if (!Array.isArray(value)) return [...fallback];
    const first = clamp(Math.round(value[0]), 1, 7);
    const second = clamp(Math.round(value[1]), first, 7);
    return [first, second];
  }

  function normalizeDurationRange(value, fallback) {
    if (!Array.isArray(value)) return [...fallback];
    const minimum = Math.max(250, Number(value[0]) || fallback[0]);
    const maximum = Math.max(minimum, Number(value[1]) || fallback[1]);
    return [minimum, maximum];
  }

  function normalizeEffects(value, fallback = {}) {
    if (!value || typeof value !== "object") return { ...fallback };
    return { ...fallback, ...value };
  }

  function normalizeProfile(next = {}, current = DEFAULT_PROFILE) {
    const quality = String(next.quality ?? current.quality).toLowerCase() === "low" ? "low" : "full";
    const reducedMotionPolicy = ["static", "deny"].includes(String(next.reducedMotionPolicy ?? current.reducedMotionPolicy))
      ? String(next.reducedMotionPolicy ?? current.reducedMotionPolicy)
      : "static";
    return Object.freeze({
      enabled: next.enabled == null ? Boolean(current.enabled) : Boolean(next.enabled),
      intensity: clamp01(next.intensity ?? current.intensity),
      quality,
      maxActive: clamp(Math.round(next.maxActive ?? current.maxActive), 1, 4),
      clusterSize: Object.freeze(normalizePair(next.clusterSize, current.clusterSize)),
      durationRange: Object.freeze(normalizeDurationRange(next.durationRange, current.durationRange)),
      maxFps: clamp(Math.round(next.maxFps ?? current.maxFps), 1, 60),
      routePaddingCells: clamp(next.routePaddingCells ?? current.routePaddingCells, 0, 2),
      settleDuration: Math.max(120, Number(next.settleDuration ?? current.settleDuration) || 520),
      reducedMotionPolicy,
      reducedMotionDuration: Math.max(120, Number(next.reducedMotionDuration ?? current.reducedMotionDuration) || 420),
      reducedMotionDepth: clamp(next.reducedMotionDepth ?? current.reducedMotionDepth, 0.02, 0.35),
      reducedMotion: next.reducedMotion == null ? (current.reducedMotion ?? null) : Boolean(next.reducedMotion),
      effects: Object.freeze(normalizeEffects(next.effects, current.effects))
    });
  }

  function createBlockRearrangement(context = {}) {
    const runtime = context.runtime;
    const chamber = context.chamber;
    const director = context.visualDirector || context.director || null;
    const effects = context.effects || null;
    const events = context.events || null;
    const movementSurface = context.movementSurface || context.surface || null;
    const eventTarget = new EventTarget();
    const now = typeof context.now === "function"
      ? context.now
      : () => (typeof performance !== "undefined" ? performance.now() : Date.now());
    const taskName = String(context.taskName || DEFAULT_TASK_NAME);
    const taskGroup = String(context.taskGroup || DEFAULT_TASK_GROUP);
    const mediaQuery = context.reducedMotion && typeof context.reducedMotion === "object"
      ? context.reducedMotion
      : (typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null);
    const getReducedMotion = typeof context.getReducedMotion === "function"
      ? context.getReducedMotion
      : (typeof context.reducedMotion === "function" ? context.reducedMotion : null);
    const getQuality = typeof context.getQuality === "function"
      ? context.getQuality
      : (typeof context.quality === "function" ? context.quality : null);

    let configuredSeed = context.seed ?? null;
    let random = typeof context.random === "function"
      ? context.random
      : (configuredSeed == null ? Math.random : seededRandom(configuredSeed));

    const state = {
      initialised: false,
      destroyed: false,
      suspended: false,
      profile: normalizeProfile({
        intensity: context.intensity,
        maxFps: context.maxFps,
        quality: context.performanceMode,
        reducedMotion: typeof context.reducedMotion === "boolean" ? context.reducedMotion : undefined
      }, DEFAULT_PROFILE),
      profileMeta: Object.freeze({ reason: "initial" }),
      sequences: new Map(),
      reservations: new Map(),
      pending: new Map(),
      catalogs: new Map(),
      runtimeHandle: null,
      sequenceSerial: 0,
      requestSerial: 0,
      suspendedAt: 0,
      unsubscribeGeometry: null,
      unsubscribeRuntime: null,
      reducedMotionListener: null,
      admissionTail: Promise.resolve(),
      generation: 0,
      effectHandles: new Set()
    };

    function log(level, message, detail) {
      const logger = context.logger;
      if (logger && typeof logger[level] === "function") logger[level](message, detail);
    }

    function readReducedMotion() {
      if (typeof state.profile.reducedMotion === "boolean") return state.profile.reducedMotion;
      if (getReducedMotion) {
        try { return Boolean(getReducedMotion()); }
        catch (error) { log("warn", "Could not read live reduced-motion state.", error); }
      }
      if (typeof context.reducedMotion === "boolean") return context.reducedMotion;
      return Boolean(mediaQuery?.matches);
    }

    function readHostQuality() {
      let value = null;
      try {
        value = getQuality ? getQuality() : runtime?.getQuality?.();
      } catch (error) {
        log("warn", "Could not read live host quality.", error);
      }
      return String(value || context.performanceMode || "full").toLowerCase();
    }

    function performanceMode() {
      const hostQuality = readHostQuality();
      if (["low", "reduced"].includes(hostQuality)) return "low";
      return state.profile.quality === "low" ? "low" : "full";
    }

    function effectiveMaxFps() {
      return performanceMode() === "low" ? Math.min(20, state.profile.maxFps) : state.profile.maxFps;
    }

    function refreshRuntimePolicy(reason = "quality-change") {
      state.runtimeHandle?.setMaxFps?.(effectiveMaxFps());
      const reduced = readReducedMotion();
      if (reduced && state.profile.reducedMotionPolicy === "deny" && state.sequences.size) {
        void settle({ reason, duration: state.profile.settleDuration });
      }
      return Object.freeze({
        reducedMotion: reduced,
        hostQuality: readHostQuality(),
        performanceMode: performanceMode(),
        maxFps: effectiveMaxFps()
      });
    }

    function activeLimit() {
      return performanceMode() === "low" ? 1 : state.profile.maxActive;
    }

    function snapshot() {
      const clock = now();
      const activeSequences = [...state.sequences.values()].map(sequence => Object.freeze({
        id: sequence.id,
        phase: sequence.phase,
        pattern: sequence.pattern,
        sourceRegion: sequence.sourceRegion,
        targetRegion: sequence.targetRegion,
        blockIds: Object.freeze(sequence.sourceBlocks.map(block => String(block.id))),
        progress: sequence.settlePlan
          ? clamp01((clock - sequence.settlePlan.startedAt) / sequence.settlePlan.duration)
          : clamp01((clock - sequence.startedAt) / sequence.duration),
        reduced: sequence.reduced,
        settlingEarly: Boolean(sequence.settlePlan)
      }));
      return Object.freeze({
        version: VERSION,
        slot: "chamber-motion",
        initialised: state.initialised,
        destroyed: state.destroyed,
        suspended: state.suspended,
        enabled: state.profile.enabled,
        profile: state.profile,
        profileMeta: state.profileMeta,
        seed: configuredSeed,
        activeSequenceCount: state.sequences.size,
        pendingApprovalCount: state.pending.size,
        reservedRouteCount: state.reservations.size,
        activeSequences: Object.freeze(activeSequences),
        runtimeTask: state.runtimeHandle?.snapshot?.() || null,
        taskGroup,
        directorMode: director?.currentMode?.() || null,
        movementSurfaceSupplied: Boolean(movementSurface),
        reducedMotion: readReducedMotion(),
        hostQuality: readHostQuality(),
        performanceMode: performanceMode(),
        noPrivateAnimationLoop: true,
        settled: state.sequences.size === 0 && state.pending.size === 0
      });
    }

    function emit(type, sequence, extra = {}) {
      const detail = Object.freeze({
        module: "block-rearrangement",
        slot: "chamber-motion",
        version: VERSION,
        sequenceId: sequence?.id || extra.sequenceId || null,
        pattern: sequence?.pattern || extra.pattern || null,
        region: sequence?.sourceRegion || extra.region || null,
        targetRegion: sequence?.targetRegion || extra.targetRegion || null,
        blockIds: Object.freeze(sequence ? sequence.sourceBlocks.map(block => String(block.id)) : []),
        targetBlockIds: Object.freeze(sequence ? sequence.targetBlocks.map(block => String(block.id)) : []),
        intensity: sequence?.intensity ?? state.profile.intensity,
        phase: sequence?.phase || extra.phase || null,
        timestamp: now(),
        ...extra
      });
      eventTarget.dispatchEvent(eventWithDetail(type, detail));
      if (events?.emit) events.emit(type, detail);
      else if (typeof context.emit === "function") context.emit(type, detail);
      return detail;
    }

    function effectNameFor(stage, sequence) {
      return sequence?.options?.effects?.[stage] || state.profile.effects?.[stage] || null;
    }

    function effectTargetFor(sequence) {
      return chamber.getEffectTarget?.({
        kind: "chamber-block",
        sequenceId: sequence.id,
        blockIds: sequence.sourceBlocks.map(block => String(block.id)),
        movementSurface
      }) || movementSurface || null;
    }

    function trackEffect(handle) {
      if (!handle || typeof handle !== "object") return null;
      state.effectHandles.add(handle);
      Promise.resolve(handle.finished)
        .catch(() => undefined)
        .finally(() => state.effectHandles.delete(handle));
      return handle;
    }

    function requestEffect(stage, sequence, extra = {}) {
      const name = effectNameFor(stage, sequence);
      if (!name || !effects || typeof effects.play !== "function") return null;
      const target = effectTargetFor(sequence);
      if (!target) return null;
      try {
        const handle = effects.play(name, target, {
          channel: "chamber",
          concurrency: "replace",
          priority: 30,
          intensity: sequence.intensity,
          seed: `${configuredSeed ?? "runtime"}:${sequence.id}:${stage}`,
          sequenceId: sequence.id,
          blockIds: sequence.sourceBlocks.map(block => String(block.id)),
          ...extra
        });
        sequence.effectHandles.add(handle);
        return trackEffect(handle);
      } catch (error) {
        log("warn", `Block effect '${name}' failed.`, error);
        return null;
      }
    }

    function cancelSequenceEffects(sequence, reason) {
      for (const handle of sequence.effectHandles) {
        try { handle?.cancel?.(reason); } catch (error) { log("warn", "Could not cancel block effect.", error); }
        state.effectHandles.delete(handle);
      }
      sequence.effectHandles.clear();
    }

    function assertUsable() {
      if (state.destroyed) throw new Error("Block rearrangement module has been destroyed.");
      if (!state.initialised) throw new Error("Call init() before using block rearrangement.");
    }

    function validateContext() {
      if (!runtime || typeof runtime.register !== "function") {
        throw new TypeError("context.runtime.register(name, callback, options) is required.");
      }
      if (!chamber || typeof chamber.getBlocks !== "function") {
        throw new TypeError("context.chamber.getBlocks(region) is required.");
      }
      if (!movementSurface) {
        throw new TypeError("The terminal-owned environment:chamber-motion surface must be supplied.");
      }
      if (context.strictDependencies === true) {
        const modernDirector = director
          && typeof director.envelope === "function"
          && typeof director.claim === "function";
        const legacyDirector = director
          && [director.approve, director.canTrigger].some(method => typeof method === "function");
        if (!modernDirector && !legacyDirector) {
          throw new TypeError("The shared visual director must provide envelope()/claim() or an approval adapter.");
        }
        if (!effects || typeof effects.play !== "function") {
          throw new TypeError("The declared effects dependency must provide play(name, target, options).");
        }
      }
    }

    function refreshCatalogs() {
      const requiredRegions = ["left-wall", "right-wall", "rear-wall"];
      state.catalogs.clear();
      for (const region of requiredRegions) {
        const blocks = [...(chamber.getBlocks(region) || [])];
        if (!blocks.length) throw new Error(`Chamber returned no blocks for ${region}.`);
        for (const block of blocks) {
          if (region !== "rear-wall" && (
            typeof block.capture !== "function"
            || typeof block.applyPose !== "function"
            || typeof block.restore !== "function"
          )) {
            throw new TypeError(`Movable block ${block.id || "unknown"} must implement capture(), applyPose() and restore().`);
          }
          geometryOf(block);
        }
        state.catalogs.set(region, Object.freeze({
          region,
          blocks: Object.freeze(blocks),
          index: indexBlocks(blocks),
          bounds: regionBounds(blocks)
        }));
      }
    }

    function sourceRegionsFor(requestedRegion) {
      const region = String(requestedRegion || "side-walls");
      if (region === "left-wall" || region === "right-wall") return [region];
      if (["both-walls", "side-walls", "either-side-wall", "either-wall"].includes(region)) {
        const counts = { "left-wall": 0, "right-wall": 0 };
        for (const sequence of state.sequences.values()) counts[sequence.sourceRegion] += 1;
        return counts["left-wall"] <= counts["right-wall"]
          ? ["left-wall", "right-wall"]
          : ["right-wall", "left-wall"];
      }
      throw new TypeError(`Unknown block source region: ${region}`);
    }

    function shapePool(options) {
      const requested = options.clusterSize || state.profile.clusterSize;
      let [minimum, maximum] = normalizePair(requested, state.profile.clusterSize);
      if (performanceMode() === "low") maximum = Math.min(maximum, 3);
      return NORMALIZED_SHAPES.filter(shape => shape.size >= minimum && shape.size <= maximum);
    }

    function shuffled(items) {
      const result = [...items];
      for (let index = result.length - 1; index > 0; index -= 1) {
        const other = Math.floor(random() * (index + 1));
        [result[index], result[other]] = [result[other], result[index]];
      }
      return result;
    }

    function placementsFor(catalog, shape) {
      const placements = [];
      const { bounds, index } = catalog;
      for (let v = bounds.minV; v <= bounds.maxV - shape.height + 1; v += 1) {
        for (let u = bounds.minU; u <= bounds.maxU - shape.width + 1; u += 1) {
          const cells = shape.cells.map(([du, dv]) => index.get(`${u + du}:${v + dv}`));
          if (cells.every(Boolean)) placements.push(cells);
        }
      }
      return placements;
    }

    function clusterRadius(shape, cellSize) {
      const width = shape.width * cellSize;
      const height = shape.height * cellSize;
      const depth = cellSize;
      return 0.5 * Math.sqrt(width * width + height * height + depth * depth)
        + state.profile.routePaddingCells * cellSize;
    }

    function buildPlan(shape, sourceRegion, sourceBlocks, targetBlocks) {
      const sourceGeometries = sourceBlocks.map(geometryOf);
      const targetGeometries = targetBlocks.map(geometryOf);
      const cellSize = sourceGeometries[0].size;
      if (sourceGeometries.some(geometry => Math.abs(geometry.size - cellSize) > 0.00001)
        || targetGeometries.some(geometry => Math.abs(geometry.size - cellSize) > 0.00001)) {
        return null;
      }
      const sourceAnchor = averagePoints(sourceGeometries.map(geometry => geometry.center));
      const targetAnchor = averagePoints(targetGeometries.map(geometry => geometry.center));
      const sourceBasis = averageBasis(sourceBlocks);
      const targetBasis = averageBasis(targetBlocks);
      const sourceFull = add(sourceAnchor, scale(sourceBasis.n, cellSize * 0.5));
      const targetFull = add(targetAnchor, scale(targetBasis.n, cellSize * 0.5));
      const outwardDistance = dot(sub(targetFull, sourceFull), sourceBasis.n);
      if (outwardDistance < -0.00001) return null;
      const turnCentre = add(sourceFull, scale(sourceBasis.n, Math.max(0, outwardDistance)));
      const radius = clusterRadius(shape, cellSize);
      const segments = Object.freeze([
        Object.freeze({ a: sourceAnchor, b: sourceFull, radius }),
        Object.freeze({ a: sourceFull, b: turnCentre, radius }),
        Object.freeze({ a: turnCentre, b: targetFull, radius }),
        Object.freeze({ a: targetFull, b: targetAnchor, radius })
      ]);
      return Object.freeze({
        cellSize,
        sourceAnchor,
        targetAnchor,
        sourceBasis,
        targetBasis,
        sourceFull,
        targetFull,
        turnCentre,
        outwardDistance: Math.max(0, outwardDistance),
        inboundDistance: length3(sub(targetFull, turnCentre)),
        sourceBounds: regionBounds(sourceBlocks),
        targetBounds: regionBounds(targetBlocks),
        sourceRegion,
        radius,
        segments
      });
    }

    function reservationConflicts(candidate) {
      for (const active of state.reservations.values()) {
        if (candidate.sourceRegion === active.sourceRegion) {
          const sourceConflict = boundsOverlap(
            candidate.sourceBounds.minU, candidate.sourceBounds.maxU,
            active.sourceBounds.minU, active.sourceBounds.maxU, 1
          ) && boundsOverlap(
            candidate.sourceBounds.minV, candidate.sourceBounds.maxV,
            active.sourceBounds.minV, active.sourceBounds.maxV, 1
          );
          if (sourceConflict) return true;
        }
        const targetConflict = boundsOverlap(
          candidate.targetBounds.minU, candidate.targetBounds.maxU,
          active.targetBounds.minU, active.targetBounds.maxU, 1
        ) && boundsOverlap(
          candidate.targetBounds.minV, candidate.targetBounds.maxV,
          active.targetBounds.minV, active.targetBounds.maxV, 1
        );
        if (targetConflict) return true;

        for (const first of candidate.segments) {
          for (const second of active.segments) {
            if (segmentDistance(first, second) <= first.radius + second.radius) return true;
          }
        }
      }
      return false;
    }

    function choosePlacement(options) {
      const targetRegion = String(options.targetRegion || "rear-wall");
      if (targetRegion !== "rear-wall") throw new TypeError("The published choreography currently targets rear-wall only.");
      const targetCatalog = state.catalogs.get(targetRegion);
      const pool = shuffled(shapePool(options));
      const sourceRegions = sourceRegionsFor(options.region);

      for (const shape of pool) {
        const targetPlacements = shuffled(placementsFor(targetCatalog, shape));
        for (const sourceRegion of sourceRegions) {
          const sourceCatalog = state.catalogs.get(sourceRegion);
          const sourcePlacements = shuffled(placementsFor(sourceCatalog, shape));
          for (const sourceBlocks of sourcePlacements) {
            for (const targetBlocks of targetPlacements) {
              const plan = buildPlan(shape, sourceRegion, sourceBlocks, targetBlocks);
              if (plan && !reservationConflicts(plan)) {
                return { shape, sourceRegion, targetRegion, sourceBlocks, targetBlocks, plan };
              }
            }
          }
        }
      }
      return null;
    }

    function captureHandles(blocks) {
      const handles = [];
      try {
        for (const block of blocks) handles.push({ block, snapshot: block.capture() });
        return handles;
      } catch (error) {
        for (const item of handles) {
          try { item.block.restore(item.snapshot); item.block.clearPose?.(); } catch { /* best effort rollback */ }
        }
        throw error;
      }
    }

    function restoreSequence(sequence) {
      for (const item of sequence.handles) {
        try {
          item.block.restore(item.snapshot);
          item.block.clearPose?.();
        } catch (error) {
          log("error", `Could not restore chamber block ${item.block.id || "unknown"}.`, error);
        }
      }
      sequence.currentBlockPoses = [];
      state.reservations.delete(sequence.id);
      state.sequences.delete(sequence.id);
      if (!state.sequences.size) state.runtimeHandle?.disable?.();
    }

    function finishSequence(sequence, status, extra = {}) {
      if (!sequence || sequence.finished) return;
      sequence.finished = true;
      cancelSequenceEffects(sequence, status);
      try { sequence.visualClaim?.release?.(`blockmove:${status}`); } catch (error) { log("warn", "Could not release visual claim.", error); }
      sequence.visualClaim = null;
      restoreSequence(sequence);
      const completed = status === "complete" || status === "settled";
      emit(completed ? "blockmove:complete" : "blockmove:cancel", sequence, { status, ...extra });
      if (completed) requestEffect("complete", sequence, { settledEarly: status === "settled" });
      sequence.resolve(Object.freeze({
        status,
        sequenceId: sequence.id,
        blockIds: Object.freeze(sequence.sourceBlocks.map(block => String(block.id))),
        ...extra
      }));
    }

    function failSequence(sequence, error) {
      if (!sequence || sequence.finished) return;
      sequence.finished = true;
      cancelSequenceEffects(sequence, "error");
      try { sequence.visualClaim?.release?.("blockmove:error"); } catch { /* release is best effort */ }
      sequence.visualClaim = null;
      restoreSequence(sequence);
      emit("blockmove:error", sequence, { error, message: String(error?.message || error) });
      sequence.resolve(Object.freeze({ status: "error", sequenceId: sequence.id, error }));
      log("error", "Block movement failed.", error);
    }

    function phaseTimings(sequence) {
      const plan = sequence.plan;
      const linearBudget = 0.84;
      const turnBudget = 0.16;
      const distances = [
        plan.cellSize * 0.5,
        Math.max(0.000001, plan.outwardDistance),
        Math.max(0.000001, plan.inboundDistance),
        plan.cellSize * 0.5
      ];
      const total = distances.reduce((sum, value) => sum + value, 0);
      const extractEnd = linearBudget * distances[0] / total;
      const outwardEnd = extractEnd + linearBudget * distances[1] / total;
      const turnEnd = outwardEnd + turnBudget;
      const inboundEnd = turnEnd + linearBudget * distances[2] / total;
      return Object.freeze({ extractEnd, outwardEnd, turnEnd, inboundEnd });
    }

    function localOffsets(sequence, basis) {
      const centroidU = sequence.shape.cells.reduce((sum, cell) => sum + cell[0], 0) / sequence.shape.size;
      const centroidV = sequence.shape.cells.reduce((sum, cell) => sum + cell[1], 0) / sequence.shape.size;
      return sequence.shape.cells.map(([u, v]) => add(
        scale(basis.u, (u - centroidU) * sequence.plan.cellSize),
        scale(basis.v, (v - centroidV) * sequence.plan.cellSize)
      ));
    }

    function normalPoseAt(sequence, progress) {
      const t = clamp01(progress);
      const timing = sequence.timing;
      const plan = sequence.plan;
      let phase;
      let basis;
      let anchorCentre;
      let thickness;

      if (t < timing.extractEnd) {
        const n = smoothstep(t / Math.max(0.000001, timing.extractEnd));
        phase = "extracting";
        basis = plan.sourceBasis;
        thickness = plan.cellSize * n;
        anchorCentre = add(plan.sourceAnchor, scale(plan.sourceBasis.n, thickness * 0.5));
      } else if (t < timing.outwardEnd) {
        const n = easeOut((t - timing.extractEnd) / Math.max(0.000001, timing.outwardEnd - timing.extractEnd));
        phase = "travelling-out";
        basis = plan.sourceBasis;
        thickness = plan.cellSize;
        anchorCentre = lerp3(plan.sourceFull, plan.turnCentre, n);
      } else if (t < timing.turnEnd) {
        const n = smoothstep((t - timing.outwardEnd) / Math.max(0.000001, timing.turnEnd - timing.outwardEnd));
        phase = "turning";
        basis = interpolateBasis(plan.sourceBasis, plan.targetBasis, n);
        thickness = plan.cellSize;
        anchorCentre = plan.turnCentre;
      } else if (t < timing.inboundEnd) {
        const n = easeIn((t - timing.turnEnd) / Math.max(0.000001, timing.inboundEnd - timing.turnEnd));
        phase = "travelling-in";
        basis = plan.targetBasis;
        thickness = plan.cellSize;
        anchorCentre = lerp3(plan.turnCentre, plan.targetFull, n);
      } else {
        const n = smoothstep((t - timing.inboundEnd) / Math.max(0.000001, 1 - timing.inboundEnd));
        phase = "settling";
        basis = plan.targetBasis;
        thickness = plan.cellSize * (1 - n);
        anchorCentre = add(plan.targetAnchor, scale(plan.targetBasis.n, thickness * 0.5));
      }
      return { phase, basis, anchorCentre, thickness };
    }

    function reducedPoseAt(sequence, progress) {
      const t = clamp01(progress);
      const envelope = t < 0.5 ? smoothstep(t * 2) : smoothstep((1 - t) * 2);
      const thickness = sequence.plan.cellSize * state.profile.reducedMotionDepth * envelope;
      return {
        phase: t < 0.5 ? "extracting" : "settling",
        basis: sequence.plan.sourceBasis,
        anchorCentre: add(sequence.plan.sourceAnchor, scale(sequence.plan.sourceBasis.n, thickness * 0.5)),
        thickness
      };
    }

    function settlePoseAt(sequence, clock) {
      const plan = sequence.settlePlan;
      const n = smoothstep((clock - plan.startedAt) / Math.max(1, plan.duration));
      return {
        phase: "settling",
        basis: interpolateBasis(plan.startPose.basis, plan.targetBasis, n),
        anchorCentre: lerp3(plan.startPose.anchorCentre, plan.targetAnchor, n),
        thickness: mix(plan.startPose.thickness, 0, n),
        settleProgress: n
      };
    }

    function applySequencePose(sequence, pose, progress) {
      const offsets = localOffsets(sequence, pose.basis);
      const poses = [];
      for (let index = 0; index < sequence.handles.length; index += 1) {
        const item = sequence.handles[index];
        const blockPose = Object.freeze({
          sequenceId: sequence.id,
          pattern: sequence.pattern,
          phase: pose.phase,
          progress: clamp01(progress),
          centre: add(pose.anchorCentre, offsets[index]),
          basis: cloneBasis(pose.basis),
          thickness: Math.max(0, pose.thickness),
          size: sequence.plan.cellSize,
          localCell: Object.freeze([...sequence.shape.cells[index]]),
          clusterCells: sequence.shape.cells,
          sourceRegion: sequence.sourceRegion,
          targetRegion: sequence.targetRegion,
          reduced: sequence.reduced
        });
        item.block.applyPose(blockPose);
        poses.push(Object.freeze({ blockId: String(item.block.id), pose: blockPose }));
      }
      sequence.currentPose = Object.freeze({
        phase: pose.phase,
        basis: cloneBasis(pose.basis),
        anchorCentre: [...pose.anchorCentre],
        thickness: Math.max(0, pose.thickness)
      });
      sequence.currentBlockPoses = Object.freeze(poses);
    }

    function announcePhase(sequence, phase) {
      if (phase === sequence.phase) return;
      sequence.phase = phase;
      if (phase === "extracting") {
        emit("blockmove:extract", sequence);
        requestEffect("extract", sequence);
      } else if (phase === "settling") {
        emit("blockmove:settle", sequence, { early: Boolean(sequence.settlePlan) });
        requestEffect("settle", sequence, { early: Boolean(sequence.settlePlan) });
      }
    }

    function updateSequence(sequence, clock) {
      if (sequence.finalFramePending) {
        finishSequence(sequence, sequence.settlePlan ? "settled" : "complete", {
          settledEarly: Boolean(sequence.settlePlan)
        });
        return;
      }

      let pose;
      let progress;
      if (sequence.settlePlan) {
        progress = clamp01((clock - sequence.settlePlan.startedAt) / sequence.settlePlan.duration);
        pose = settlePoseAt(sequence, clock);
      } else {
        progress = clamp01((clock - sequence.startedAt) / sequence.duration);
        pose = sequence.reduced ? reducedPoseAt(sequence, progress) : normalPoseAt(sequence, progress);
      }
      applySequencePose(sequence, pose, progress);
      announcePhase(sequence, pose.phase);
      if (progress >= 1 || pose.settleProgress >= 1) sequence.finalFramePending = true;
    }

    function update(frame) {
      if (state.destroyed || !state.initialised || state.suspended || !state.sequences.size) return false;
      const clock = Number(frame?.now) || now();
      for (const sequence of [...state.sequences.values()]) {
        try { updateSequence(sequence, clock); } catch (error) { failSequence(sequence, error); }
      }
      return state.sequences.size > 0 && !state.suspended;
    }

    function withAdmissionLock(work) {
      const run = state.admissionTail.then(work, work);
      state.admissionTail = run.then(() => undefined, () => undefined);
      return run;
    }

    function permissionMethod() {
      if (typeof director?.approve === "function") return proposal => director.approve(proposal);
      if (typeof director?.canTrigger === "function") return proposal => director.canTrigger(proposal);
      return null;
    }

    async function permissionGranted(request, proposal, options) {
      if (typeof director?.envelope === "function") {
        try {
          const envelope = director.envelope("chamber", { intensity: proposal.intensity });
          return Object.freeze({
            allowed: Boolean(envelope?.allowed),
            intensity: clamp01(envelope?.intensity ?? proposal.intensity),
            mode: envelope?.mode || null,
            reducedMotion: Boolean(envelope?.reducedMotion),
            reason: envelope?.allowed ? null : `mode:${envelope?.mode || "unknown"}`
          });
        } catch (error) {
          log("warn", "Visual director envelope check failed.", error);
          return Object.freeze({ allowed: false, intensity: 0, reason: "director-error" });
        }
      }

      if (options.approved === true) {
        return Object.freeze({ allowed: true, intensity: proposal.intensity, mode: null, reducedMotion: false });
      }
      const approve = permissionMethod();
      if (!approve) return Object.freeze({ allowed: false, intensity: 0, reason: "director-unavailable" });
      try {
        const result = await Promise.resolve(approve(Object.freeze({ ...proposal, signal: request.controller?.signal })));
        return Object.freeze({
          allowed: result !== false,
          intensity: proposal.intensity,
          mode: null,
          reducedMotion: false,
          reason: result === false ? "director" : null
        });
      } catch (error) {
        if (!request.cancelled) log("warn", "Block movement permission check failed.", error);
        return Object.freeze({ allowed: false, intensity: 0, reason: request.cancelled ? "cancelled" : "director-error" });
      }
    }

    function runtimeWake(reason) {
      if (!state.runtimeHandle) return;
      if (typeof state.runtimeHandle.enable === "function") state.runtimeHandle.enable(reason);
      else state.runtimeHandle.wake?.(reason);
    }

    function startSequence(placement, options, intensity, reduced, visualClaim = null) {
      const durationRange = normalizeDurationRange(options.durationRange, state.profile.durationRange);
      const duration = reduced
        ? state.profile.reducedMotionDuration
        : Math.max(250, Number(options.duration) || mix(durationRange[1], durationRange[0], intensity));
      const id = `blockmove-${++state.sequenceSerial}`;
      let resolveSequence;
      const promise = new Promise(resolve => { resolveSequence = resolve; });
      const sequence = {
        id,
        pattern: String(options.pattern || "extract-rotate-settle"),
        options,
        intensity,
        reduced,
        sourceRegion: placement.sourceRegion,
        targetRegion: placement.targetRegion,
        shape: placement.shape,
        sourceBlocks: placement.sourceBlocks,
        targetBlocks: placement.targetBlocks,
        handles: captureHandles(placement.sourceBlocks),
        plan: placement.plan,
        timing: null,
        startedAt: now(),
        duration,
        phase: null,
        currentPose: null,
        currentBlockPoses: Object.freeze([]),
        settlePlan: null,
        finalFramePending: false,
        finished: false,
        resolve: resolveSequence,
        promise,
        effectHandles: new Set(),
        visualClaim
      };
      sequence.timing = phaseTimings(sequence);
      state.sequences.set(id, sequence);
      state.reservations.set(id, placement.plan);
      emit("blockmove:start", sequence, { duration, shape: sequence.shape.key, reduced });
      requestEffect("start", sequence, { shape: sequence.shape.key, reduced });
      runtimeWake(`blockmove:start:${id}`);
      return sequence;
    }

    async function init() {
      if (state.destroyed) throw new Error("Cannot initialise a destroyed block rearrangement module.");
      if (state.initialised) return api;
      validateContext();
      refreshCatalogs();
      state.runtimeHandle = runtime.register(taskName, update, {
        group: taskGroup,
        priority: Number(context.priority) || 30,
        maxFps: effectiveMaxFps(),
        enabled: false
      });

      if (typeof chamber.subscribeGeometryChange === "function") {
        state.unsubscribeGeometry = chamber.subscribeGeometryChange(() => {
          reset({ reason: "geometry-change" });
          refreshCatalogs();
        });
      }

      if (mediaQuery?.addEventListener) {
        state.reducedMotionListener = () => refreshRuntimePolicy("reduced-motion-change");
        mediaQuery.addEventListener("change", state.reducedMotionListener);
      }
      if (typeof runtime.subscribe === "function") {
        state.unsubscribeRuntime = runtime.subscribe(change => {
          if (change?.type === "quality-change" || change?.runtime?.quality) {
            refreshRuntimePolicy("host-quality-change");
          }
        });
      }

      state.initialised = true;
      emit("blockmove:ready", null, { taskName, taskGroup });
      return api;
    }

    async function trigger(options = {}) {
      assertUsable();
      if (!state.profile.enabled) return Object.freeze({ status: "disabled" });
      if (state.suspended) return Object.freeze({ status: "suspended" });
      if (typeof document !== "undefined" && document.hidden) return Object.freeze({ status: "rejected", reason: "hidden" });

      const pattern = String(options.pattern || "extract-rotate-settle");
      if (!SUPPORTED_PATTERNS.has(pattern)) throw new TypeError(`Unsupported movement pattern: ${pattern}`);
      const intensity = clamp01(options.intensity ?? state.profile.intensity);
      const reduced = readReducedMotion();
      if (reduced && state.profile.reducedMotionPolicy === "deny") {
        return Object.freeze({ status: "rejected", reason: "reduced-motion" });
      }

      const request = {
        id: `blockrequest-${++state.requestSerial}`,
        generation: state.generation,
        cancelled: false,
        controller: typeof AbortController === "function" ? new AbortController() : null
      };
      state.pending.set(request.id, request);
      const proposal = Object.freeze({
        requestId: request.id,
        slot: "chamber-motion",
        region: options.region || "side-walls",
        targetRegion: options.targetRegion || "rear-wall",
        pattern,
        intensity,
        reduced,
        activeSequenceCount: state.sequences.size,
        pendingApprovalCount: state.pending.size - 1
      });
      emit("blockmove:proposed", null, proposal);

      const permission = await permissionGranted(request, proposal, options);
      if (!permission.allowed || request.cancelled || request.generation !== state.generation || state.destroyed) {
        state.pending.delete(request.id);
        return Object.freeze({
          status: request.cancelled || state.destroyed ? "cancel" : "rejected",
          reason: request.cancelled ? "cancelled" : (state.destroyed ? "destroyed" : (permission.reason || "director"))
        });
      }

      const admitted = await withAdmissionLock(() => {
        state.pending.delete(request.id);
        if (request.cancelled || request.generation !== state.generation || state.destroyed) {
          return { result: Object.freeze({ status: "cancel", reason: "cancelled" }) };
        }
        if (!state.profile.enabled) return { result: Object.freeze({ status: "disabled" }) };
        if (state.suspended) return { result: Object.freeze({ status: "suspended" }) };
        if (state.sequences.size >= activeLimit()) {
          return { result: Object.freeze({ status: "busy", activeSequenceCount: state.sequences.size }) };
        }
        const effectiveIntensity = clamp01(permission.intensity ?? intensity);
        const placement = choosePlacement({ ...options, pattern, intensity: effectiveIntensity });
        if (!placement) return { result: Object.freeze({ status: "no-clear-route" }) };

        let visualClaim = null;
        if (typeof director?.claim === "function") {
          visualClaim = director.claim("chamber", {
            priority: Number(options.priority) || 30,
            intensity: effectiveIntensity,
            exclusive: false
          });
          if (!visualClaim?.granted) {
            return { result: Object.freeze({
              status: "rejected",
              reason: visualClaim?.reason || "director-claim"
            }) };
          }
        }

        try {
          const sequence = startSequence(
            placement,
            { ...options, pattern },
            visualClaim?.intensity ?? effectiveIntensity,
            reduced || permission.reducedMotion,
            visualClaim
          );
          return { promise: sequence.promise };
        } catch (error) {
          visualClaim?.release?.("sequence-start-error");
          throw error;
        }
      });

      return admitted.promise || admitted.result;
    }

    function matchSequences(selector) {
      if (!selector) return [...state.sequences.values()];
      const id = typeof selector === "string" ? selector : selector.sequenceId;
      return id ? [state.sequences.get(id)].filter(Boolean) : [...state.sequences.values()];
    }

    function cancelPending(reason = "cancelled") {
      let count = 0;
      state.generation += 1;
      for (const request of state.pending.values()) {
        request.cancelled = true;
        request.controller?.abort?.(reason);
        count += 1;
      }
      state.pending.clear();
      return count;
    }

    function cancel(selector = null, options = {}) {
      assertUsable();
      if (selector && typeof selector === "object" && !selector.sequenceId) {
        options = selector;
        selector = null;
      }
      const pending = cancelPending(options.reason || "cancelled");
      const targets = matchSequences(selector);
      for (const sequence of targets) finishSequence(sequence, "cancel", { reason: options.reason || "cancelled" });
      return pending + targets.length;
    }

    async function settle(selector = null, options = {}) {
      assertUsable();
      if (selector && typeof selector === "object" && !selector.sequenceId) {
        options = selector;
        selector = null;
      }
      cancelPending(options.reason || "settle");
      const targets = matchSequences(selector);
      if (!targets.length) return Object.freeze([]);

      if (state.suspended || options.immediate === true) {
        for (const sequence of targets) finishSequence(sequence, "settled", {
          reason: options.reason || "settle",
          immediate: true,
          settledEarly: true
        });
        return Object.freeze(await Promise.all(targets.map(sequence => sequence.promise)));
      }

      const clock = now();
      for (const sequence of targets) {
        if (sequence.settlePlan || sequence.finished) continue;
        const startPose = sequence.currentPose
          || (sequence.reduced ? reducedPoseAt(sequence, 0) : normalPoseAt(sequence, 0));
        sequence.finalFramePending = false;
        sequence.settlePlan = Object.freeze({
          startedAt: clock,
          duration: Math.max(120, Number(options.duration) || state.profile.settleDuration),
          startPose: Object.freeze({
            basis: cloneBasis(startPose.basis),
            anchorCentre: [...startPose.anchorCentre],
            thickness: startPose.thickness
          }),
          targetBasis: cloneBasis(sequence.reduced ? sequence.plan.sourceBasis : sequence.plan.targetBasis),
          targetAnchor: [...(sequence.reduced ? sequence.plan.sourceAnchor : sequence.plan.targetAnchor)]
        });
        announcePhase(sequence, "settling");
      }
      runtimeWake("blockmove:settle");
      return Object.freeze(await Promise.all(targets.map(sequence => sequence.promise)));
    }

    async function applyProfile(profile = {}, meta = {}) {
      if (state.destroyed) throw new Error("Cannot apply a profile to a destroyed module.");
      const previous = state.profile;
      state.profile = normalizeProfile(profile, state.profile);
      state.profileMeta = Object.freeze({ ...meta, reason: meta.reason || "profile" });

      if (Object.prototype.hasOwnProperty.call(profile, "seed")) {
        configuredSeed = profile.seed;
        random = configuredSeed == null ? Math.random : seededRandom(configuredSeed);
      }
      refreshRuntimePolicy("profile-change");
      emit("blockmove:profile", null, { profile: state.profile, meta: state.profileMeta });

      if (previous.enabled && !state.profile.enabled && state.initialised) {
        if (meta.cancel === true) cancel({ reason: meta.reason || "profile-disabled" });
        else await settle({ reason: meta.reason || "profile-disabled", duration: meta.settleDuration });
      }
      return snapshot();
    }

    function suspend(reason = "host") {
      assertUsable();
      if (state.suspended) return snapshot();
      cancelPending(`suspend:${reason}`);
      state.suspended = true;
      state.suspendedAt = now();
      state.runtimeHandle?.suspend?.();
      emit("blockmove:suspended", null, { activeSequenceCount: state.sequences.size, reason });
      return snapshot();
    }

    function resume(reason = "host") {
      assertUsable();
      if (!state.suspended) return snapshot();
      const clock = now();
      const pausedFor = Math.max(0, clock - state.suspendedAt);
      for (const sequence of state.sequences.values()) {
        sequence.startedAt += pausedFor;
        if (sequence.settlePlan) {
          sequence.settlePlan = Object.freeze({
            ...sequence.settlePlan,
            startedAt: sequence.settlePlan.startedAt + pausedFor
          });
        }
      }
      state.suspended = false;
      state.suspendedAt = 0;
      if (state.sequences.size) {
        if (typeof state.runtimeHandle?.resume === "function") state.runtimeHandle.resume(`blockmove:resume:${reason}`);
        else runtimeWake(`blockmove:resume:${reason}`);
      }
      emit("blockmove:resumed", null, { activeSequenceCount: state.sequences.size, pausedFor, reason });
      return snapshot();
    }

    function reset(options = {}) {
      if (!state.initialised || state.destroyed) return snapshot();
      const reason = options.reason || "reset";
      const pending = cancelPending(reason);
      const sequences = [...state.sequences.values()];
      for (const sequence of sequences) finishSequence(sequence, "cancel", { reason });
      state.reservations.clear();
      state.runtimeHandle?.disable?.();
      emit("blockmove:reset", null, {
        restoredSequenceCount: sequences.length,
        cancelledApprovalCount: pending,
        reason
      });
      return snapshot();
    }

    function getActiveGeometry() {
      return Object.freeze([...state.sequences.values()].flatMap(sequence => sequence.currentBlockPoses.map(item => Object.freeze({
        sequenceId: sequence.id,
        blockId: item.blockId,
        phase: sequence.phase,
        pose: item.pose
      }))));
    }

    async function destroy(reason = "host-destroy") {
      if (state.destroyed) return false;
      if (state.initialised) reset({ reason });
      state.destroyed = true;
      state.unsubscribeGeometry?.();
      state.unsubscribeGeometry = null;
      state.unsubscribeRuntime?.();
      state.unsubscribeRuntime = null;
      if (mediaQuery?.removeEventListener && state.reducedMotionListener) {
        mediaQuery.removeEventListener("change", state.reducedMotionListener);
      }
      state.reducedMotionListener = null;
      for (const handle of state.effectHandles) {
        try { handle?.cancel?.(reason); } catch { /* cleanup path */ }
      }
      state.effectHandles.clear();
      state.runtimeHandle?.unregister?.();
      state.runtimeHandle = null;
      state.catalogs.clear();
      state.reservations.clear();
      state.pending.clear();
      state.initialised = false;
      emit("blockmove:destroy", null, { reason });
      return true;
    }

    const api = Object.freeze({
      version: VERSION,
      init,
      applyProfile,
      suspend,
      resume,
      reset,
      destroy,
      trigger,
      cancel,
      settle,
      snapshot,
      getActiveGeometry,
      addEventListener: (...args) => eventTarget.addEventListener(...args),
      removeEventListener: (...args) => eventTarget.removeEventListener(...args)
    });

    return api;
  }

  return Object.freeze({ createBlockRearrangement, SHAPES: NORMALIZED_SHAPES, VERSION });
});
