/*==================================================
  LAYERED CHAMBER · PRODUCTION SHELL

  Owns the shared background chamber geometry and boot presentation. The former
  interactive Chamber Lab is preserved on archive/chamber-lab-final-2026-08-04
  and is deliberately absent from the production runtime.
==================================================*/
window.LayeredChamber = (() => {
  "use strict";

  const LEGACY_STORAGE_KEY = "ncn-layered-chamber";
  const ROOT_ID = "layered-chamber-system";
  const MODES = Object.freeze({ OFF: "off", BACKGROUND: "background" });

  const geometry = {
    cell: 0.5,
    near: 2.5,
    initialDepthCells: 2,
    finalDepthCells: 16,
    infinityDepthCells: 1000,
    focal: 0.84,
    halfWidth: 3,
    halfHeight: 2.5,
    wallShiftCells: 2
  };

  const timing = {
    igniteStart: 0.16,
    ignitePeak: 0.74,
    igniteSettle: 1.08,
    travelStart: 0.86,
    travelDuration: 1.54,
    infinityHold: 0.14,
    returnDuration: 0.54,
    wallOpenDuration: 1.06,
    settleDuration: 0.46,
    breathDuration: 2.8
  };
  timing.returnStart = timing.travelStart + timing.travelDuration + timing.infinityHold;
  timing.wallOpenStart = timing.returnStart + timing.returnDuration;
  timing.done = timing.wallOpenStart + timing.wallOpenDuration + timing.settleDuration;

  const energy = {
    operating: 0.61,
    bootPeak: 1,
    rearLockPulse: 0.26,
    wallLockPulse: 0.11,
    settleBreath: 0.012
  };

  const pageRoot = document.documentElement;
  let mode = MODES.OFF;
  let mounted = false;
  let subsystemRoot = null;
  let bg = null;
  let fg = null;
  let b = null;
  let g = null;
  let W = 0;
  let H = 0;
  let DPR = 1;
  let raf = 0;
  let startedAt = 0;
  let injectedEnergy = 0;
  let injectedAt = 0;
  let injectedDuration = 0;

  const clamp01 = value => Math.max(0, Math.min(1, value));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const mix = (a, c, t) => a + (c - a) * t;
  const easeOut = t => 1 - Math.pow(1 - clamp01(t), 3);
  const easeTravel = t => Math.pow(clamp01(t), 2.72);
  const easeReturn = t => 1 - Math.pow(1 - clamp01(t), 3.35);
  const easeInOut = t => {
    const n = clamp01(t);
    return n < 0.5 ? 4 * n * n * n : 1 - Math.pow(-2 * n + 2, 3) / 2;
  };
  const sharpPulse = (t, centre, width) => {
    const distance = Math.abs(t - centre) / Math.max(width, 0.001);
    if (distance >= 1) return 0;
    const envelope = 1 - distance;
    return Math.pow(envelope, 2.35) * (0.94 + Math.cos(distance * Math.PI * 2.5) * 0.06);
  };
  const softPulse = (t, centre, width) => {
    const distance = Math.abs(t - centre) / Math.max(width, 0.001);
    if (distance >= 1) return 0;
    const envelope = 1 - distance;
    return envelope * envelope * (3 - 2 * envelope);
  };
  const snapCells = value => Math.max(
    geometry.cell,
    Math.round(value / geometry.cell) * geometry.cell
  );

  function isMode(value) {
    return Object.values(MODES).includes(value);
  }

  function makeCanvas(id) {
    const canvas = document.createElement("canvas");
    canvas.id = id;
    canvas.className = "layered-chamber-canvas";
    subsystemRoot.append(canvas);
    return canvas;
  }

  function createSubsystemRoot() {
    const node = document.createElement("div");
    node.id = ROOT_ID;
    node.className = "layered-chamber-system";
    node.setAttribute("aria-hidden", "true");
    document.body.prepend(node);
    return node;
  }

  function mount() {
    if (mounted) return;
    subsystemRoot = createSubsystemRoot();
    bg = makeCanvas("layered-chamber-bg");
    fg = makeCanvas("layered-chamber-fg");
    b = bg.getContext("2d");
    g = fg.getContext("2d");
    addEventListener("resize", resize, { passive: true });
    mounted = true;
    resize();
  }

  function unmount() {
    if (!mounted) return;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    removeEventListener("resize", resize);
    subsystemRoot?.remove();
    subsystemRoot = bg = fg = b = g = null;
    W = H = 0;
    mounted = false;
  }

  function focalLength() {
    return Math.min(W, H) * geometry.focal;
  }

  function centreY() {
    return H * 0.5;
  }

  function fitGeometryToViewport() {
    const focal = focalLength();
    geometry.halfWidth = snapCells((W * 0.5) * geometry.near / focal);
    geometry.halfHeight = snapCells((H * 0.5) * geometry.near / focal);
  }

  function resize() {
    if (!mounted || !bg || !fg) return;
    DPR = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth;
    H = innerHeight;
    fitGeometryToViewport();
    for (const canvas of [bg, fg]) {
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      canvas.getContext("2d").setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    requestDraw();
  }

  function project(x, y, z) {
    const focal = focalLength();
    return {
      x: W / 2 + x * focal / z,
      y: centreY() - y * focal / z
    };
  }

  function palette(value, alpha) {
    const stops = [[30, 1, 4], [88, 3, 9], [160, 7, 14], [238, 20, 18], [255, 82, 34]];
    const scaled = clamp01(value) * (stops.length - 1);
    const index = Math.min(stops.length - 2, Math.floor(scaled));
    const local = scaled - index;
    const a = stops[index];
    const c = stops[index + 1];
    return `rgba(${Math.round(mix(a[0], c[0], local))},${Math.round(mix(a[1], c[1], local))},${Math.round(mix(a[2], c[2], local))},${clamp01(alpha)})`;
  }

  function bootEnergy(t) {
    if (t < timing.igniteStart) return 0;
    if (t < timing.ignitePeak) {
      const n = clamp01((t - timing.igniteStart) / (timing.ignitePeak - timing.igniteStart));
      const rise = mix(0.05, energy.bootPeak, easeOut(n));
      const irregularity = (
        Math.sin(n * Math.PI * 5.5) * 0.035
        + Math.sin(n * Math.PI * 11.5) * 0.012
      ) * (1 - n);
      return clamp01(rise + irregularity);
    }
    if (t < timing.igniteSettle) {
      const n = clamp01((t - timing.ignitePeak) / (timing.igniteSettle - timing.ignitePeak));
      const release = mix(energy.bootPeak, energy.operating, easeInOut(n));
      const ring = Math.sin(n * Math.PI * 3.2) * 0.025 * (1 - n);
      return clamp01(release + ring);
    }
    return energy.operating;
  }

  function injectedEnergyAt(now) {
    if (!injectedDuration) return 0;
    const age = (now - injectedAt) / 1000;
    if (age >= injectedDuration) {
      injectedDuration = 0;
      return 0;
    }
    const n = age / injectedDuration;
    return injectedEnergy * Math.exp(-5.2 * n) * (
      0.82 + 0.18 * Math.cos(n * Math.PI * 7)
    );
  }

  function presentationState(now) {
    const t = Math.max(0, (now - startedAt) / 1000);
    return {
      t,
      travel: easeTravel((t - timing.travelStart) / timing.travelDuration),
      returning: easeReturn((t - timing.returnStart) / timing.returnDuration),
      wallOpen: easeInOut((t - timing.wallOpenStart) / timing.wallOpenDuration)
    };
  }

  function state(now) {
    const presentation = presentationState(now);
    const { t } = presentation;
    const rearLock = sharpPulse(
      t,
      timing.returnStart + timing.returnDuration,
      0.22
    );
    const wallLock = softPulse(
      t,
      timing.wallOpenStart + timing.wallOpenDuration,
      0.38
    );
    const base = bootEnergy(t);
    const breathAge = t - timing.done;
    const breathActive = breathAge > 0 && breathAge < timing.breathDuration;
    const breathPhase = breathActive ? breathAge / timing.breathDuration : 0;
    const breathEnvelope = breathActive
      ? Math.pow(Math.sin(breathPhase * Math.PI), 2)
      : 0;
    const breath = breathActive
      ? Math.sin(breathPhase * Math.PI * 2) * breathEnvelope * energy.settleBreath
      : 0;

    return {
      ...presentation,
      energy: clamp01(
        base
        + rearLock * energy.rearLockPulse
        + wallLock * energy.wallLockPulse
        + breath
        + injectedEnergyAt(now)
      ),
      done: t >= timing.done + timing.breathDuration && injectedDuration === 0
    };
  }

  function rearDepth(presentation) {
    const initial = geometry.near + geometry.initialDepthCells * geometry.cell;
    const final = geometry.near + geometry.finalDepthCells * geometry.cell;
    const infinity = geometry.near + geometry.infinityDepthCells * geometry.cell;
    if (presentation.returning > 0) {
      return mix(infinity, final, presentation.returning);
    }
    if (presentation.travel > 0) {
      return mix(initial, infinity, presentation.travel);
    }
    return initial;
  }

  function finalHalfWidth() {
    return geometry.halfWidth + geometry.wallShiftCells * geometry.cell;
  }

  function visibleHalfWidth(presentation) {
    return geometry.halfWidth
      + geometry.wallShiftCells * geometry.cell * presentation.wallOpen;
  }

  function settledPresentationSnapshot() {
    return Object.freeze({
      elapsed: timing.done,
      progress: 1,
      wallOpen: 1,
      visibleHalfWidth: finalHalfWidth(),
      rearDepth: geometry.near + geometry.finalDepthCells * geometry.cell,
      settled: true,
      active: false
    });
  }

  function presentationSnapshot(now = performance.now()) {
    if (mode === MODES.OFF || !mounted || !startedAt) {
      return settledPresentationSnapshot();
    }
    const presentation = presentationState(now);
    return Object.freeze({
      elapsed: presentation.t,
      progress: clamp01(presentation.t / timing.done),
      wallOpen: presentation.wallOpen,
      visibleHalfWidth: visibleHalfWidth(presentation),
      rearDepth: rearDepth(presentation),
      settled: presentation.t >= timing.done,
      active: presentation.t < timing.done + timing.breathDuration
        || injectedDuration > 0
    });
  }

  function apertureAt(z, halfWidth) {
    const tl = project(-halfWidth, geometry.halfHeight, z);
    const br = project(halfWidth, -geometry.halfHeight, z);
    return {
      left: tl.x,
      top: tl.y,
      right: br.x,
      bottom: br.y,
      width: br.x - tl.x,
      height: br.y - tl.y
    };
  }

  function opticalProfile(z, energyLevel, alpha = 1) {
    const zRatio = geometry.near / Math.max(geometry.near, z);
    const apparentCell = geometry.cell * focalLength() / z;
    const resolve = clamp01((apparentCell - 0.32) / 2.4);
    const contrast = clamp(Math.pow(zRatio, 0.42), 0.012, 1);
    const depthBrightness = 1 + Math.sin(z * 4.93 + 0.7) * 0.012;
    const depthOpacity = 1 + Math.sin(z * 3.17 + 1.2) * 0.008;
    return {
      resolve,
      brightness: clamp01(
        energyLevel * (0.22 + contrast * 0.78) * depthBrightness
      ),
      opacity: clamp01(
        alpha
        * Math.pow(contrast, 1.28)
        * (0.22 + resolve * 0.78)
        * depthOpacity
      ),
      width: clamp(
        0.2 + 1.25 * Math.pow(contrast, 0.72),
        0.2,
        1.45
      )
    };
  }

  function resolutionStride(z) {
    const apparentCell = geometry.cell * focalLength() / z;
    if (apparentCell >= 5) return 1;
    if (apparentCell >= 2.5) return 2;
    if (apparentCell >= 1.25) return 4;
    if (apparentCell >= 0.62) return 8;
    if (apparentCell >= 0.31) return 16;
    return Infinity;
  }

  function opticalLine(ctx, a, c, energyLevel, alpha, widthScale = 1) {
    const midpointZ = (a[2] + c[2]) * 0.5;
    const profile = opticalProfile(midpointZ, energyLevel, alpha);
    if (profile.opacity < 0.006) return;
    const A = project(a[0], a[1], a[2]);
    const C = project(c[0], c[1], c[2]);
    ctx.strokeStyle = palette(profile.brightness, profile.opacity);
    ctx.lineWidth = profile.width * widthScale;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(C.x, C.y);
    ctx.stroke();
  }

  function opticalDepthLine(
    ctx,
    x,
    y,
    nearZ,
    farZ,
    energyLevel,
    alpha,
    widthScale = 1
  ) {
    for (let z = nearZ; z < farZ - 0.0001; z += geometry.cell) {
      opticalLine(
        ctx,
        [x, y, z],
        [x, y, Math.min(farZ, z + geometry.cell)],
        energyLevel,
        alpha,
        widthScale
      );
    }
  }

  function drawRearWall(ctx, z, visibleX, systemEnergy, alpha) {
    const { cell, halfHeight: Y } = geometry;
    const fullX = finalHalfWidth();
    const xCells = Math.round((fullX * 2) / cell);
    const yCells = Math.round((Y * 2) / cell);
    const profile = opticalProfile(z, systemEnergy, alpha);
    const stride = resolutionStride(z);

    if (Number.isFinite(stride)) {
      for (let ix = 0; ix <= xCells; ix += stride) {
        const x = -fullX + ix * cell;
        if (Math.abs(x) <= visibleX + 0.0001) {
          opticalLine(
            ctx,
            [x, -Y, z],
            [x, Y, z],
            systemEnergy,
            alpha,
            1.04
          );
        }
      }
      for (let iy = 0; iy <= yCells; iy += stride) {
        const y = -Y + iy * cell;
        opticalLine(
          ctx,
          [-visibleX, y, z],
          [visibleX, y, z],
          systemEnergy,
          alpha,
          1.04
        );
      }
    }

    const aperture = apertureAt(z, visibleX);
    if (!Number.isFinite(stride) || aperture.width < 8 || profile.resolve < 0.12) {
      const unresolved = clamp01(1 - profile.resolve);
      const radius = clamp(
        0.7 + unresolved * 2.8 + systemEnergy * 0.8,
        0.7,
        4.2
      );
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = palette(
        clamp01(systemEnergy + 0.22),
        clamp01(alpha * (0.18 + unresolved * 0.62))
      );
      ctx.beginPath();
      ctx.arc(W / 2, centreY(), radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawHorizontalPlane(ctx, y, rearZ, visibleX, systemEnergy, alpha) {
    const { cell, near } = geometry;
    const fullX = finalHalfWidth();
    const xCells = Math.round((fullX * 2) / cell);

    for (let ix = 0; ix <= xCells; ix += 1) {
      const x = -fullX + ix * cell;
      if (Math.abs(x) <= visibleX + 0.0001) {
        opticalDepthLine(
          ctx,
          x,
          y,
          near,
          rearZ,
          systemEnergy,
          alpha,
          0.92
        );
      }
    }

    for (let z = near, index = 0; z <= rearZ + 0.0001; z += cell, index += 1) {
      const stride = resolutionStride(z);
      if (!Number.isFinite(stride) || index % stride !== 0) continue;
      opticalLine(
        ctx,
        [-visibleX, y, z],
        [visibleX, y, z],
        systemEnergy,
        alpha,
        0.9
      );
    }
  }

  function drawSideWall(
    ctx,
    side,
    rearZ,
    visibleX,
    systemEnergy,
    alpha
  ) {
    const { cell, halfHeight: Y, near } = geometry;
    const yCells = Math.round((Y * 2) / cell);
    const x = side * visibleX;

    for (let iy = 0; iy <= yCells; iy += 1) {
      opticalDepthLine(
        ctx,
        x,
        -Y + iy * cell,
        near,
        rearZ,
        systemEnergy,
        alpha,
        0.92
      );
    }

    for (let z = near, index = 0; z <= rearZ + 0.0001; z += cell, index += 1) {
      const stride = resolutionStride(z);
      if (!Number.isFinite(stride) || index % stride !== 0) continue;
      opticalLine(
        ctx,
        [x, -Y, z],
        [x, Y, z],
        systemEnergy,
        alpha,
        0.9
      );
    }
  }

  function drawChamber(ctx, presentation, alpha) {
    const rearZ = rearDepth(presentation);
    const visibleX = visibleHalfWidth(presentation);
    drawRearWall(ctx, rearZ, visibleX, presentation.energy, alpha * 1.2);
    drawHorizontalPlane(
      ctx,
      -geometry.halfHeight,
      rearZ,
      visibleX,
      presentation.energy,
      alpha
    );
    drawHorizontalPlane(
      ctx,
      geometry.halfHeight,
      rearZ,
      visibleX,
      presentation.energy,
      alpha * 0.92
    );
    drawSideWall(
      ctx,
      -1,
      rearZ,
      visibleX,
      presentation.energy,
      alpha * 0.96
    );
    drawSideWall(
      ctx,
      1,
      rearZ,
      visibleX,
      presentation.energy,
      alpha * 0.96
    );
  }

  function draw(now = performance.now()) {
    raf = 0;
    if (!mounted || mode === MODES.OFF || !W || !b || !g) return;
    b.clearRect(0, 0, W, H);
    g.clearRect(0, 0, W, H);
    const presentation = state(now);
    drawChamber(b, presentation, 0.34);
    if (presentation.energy > 0) {
      b.save();
      b.globalCompositeOperation = "lighter";
      drawChamber(
        b,
        presentation,
        0.03 + 0.072 * presentation.energy
      );
      b.restore();
    }
    if (!presentation.done) requestDraw();
  }

  function requestDraw() {
    if (mounted && mode !== MODES.OFF && !raf) {
      raf = requestAnimationFrame(draw);
    }
  }

  function restart() {
    if (mode === MODES.OFF) return;
    if (!mounted) mount();
    startedAt = performance.now();
    injectedDuration = 0;
    requestDraw();
  }

  function injectEnergy(amount = 0.15, duration = 0.55) {
    if (mode === MODES.OFF) return;
    injectedEnergy = clamp(amount, 0, 0.5);
    injectedDuration = Math.max(0.08, duration);
    injectedAt = performance.now();
    requestDraw();
  }

  function updateDocumentState() {
    pageRoot.classList.toggle("layered-chamber-mode", mode !== MODES.OFF);
    pageRoot.classList.toggle(
      "layered-chamber-background-mode",
      mode === MODES.BACKGROUND
    );
    pageRoot.classList.remove("layered-chamber-lab-mode");
    pageRoot.dataset.chamberMode = mode;
  }

  function clearDocumentState() {
    pageRoot.classList.remove(
      "layered-chamber-mode",
      "layered-chamber-background-mode",
      "layered-chamber-lab-mode"
    );
    delete pageRoot.dataset.chamberMode;
  }

  function setMode(nextMode, options = {}) {
    const { restartAnimation = true } = options;
    if (!isMode(nextMode)) {
      throw new TypeError(`Unknown production chamber mode: ${nextMode}`);
    }

    if (nextMode === MODES.OFF) {
      mode = MODES.OFF;
      unmount();
      clearDocumentState();
      return;
    }

    mode = MODES.BACKGROUND;
    mount();
    updateDocumentState();
    if (restartAnimation) restart();
    else requestDraw();
  }

  function init() {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    setMode(MODES.OFF, { restartAnimation: false });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  return {
    MODES,
    mount,
    unmount: () => setMode(MODES.OFF),
    restart,
    setMode,
    getMode: () => mode,
    isMounted: () => mounted,
    isEnabled: () => mode !== MODES.OFF,
    enable: () => setMode(MODES.BACKGROUND),
    disable: () => setMode(MODES.OFF),
    refresh: requestDraw,
    injectEnergy,
    getPresentationSnapshot: presentationSnapshot,
    setScroll: () => false,
    toggleDiagnostics: () => false
  };
})();
