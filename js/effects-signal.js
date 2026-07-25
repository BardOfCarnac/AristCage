/*==================================================
  NCN EFFECTS: SIGNAL AND MATERIALISATION
==================================================*/
(() => {
  "use strict";

  const effects = window.NCNEffects;
  if (!effects) throw new Error("NCNEffects core must load before effect definitions.");

  const { clamp01, mix, envelope, createStyleScope, trackOverlay } = window.NCNEffectUtils;

  effects.register("glow-pulse", {
    channel: "interface",
    concurrency: "replace",
    duration: 420,
    maxFps: 30,
    cost: "A",
    features: ["DOM", "CSS filter"],
    defaults: { intensity: 0.55 },
    create({ target, intensity }) {
      const element = target.getElement();
      if (!element) throw new Error("glow-pulse requires an element target.");
      const styles = createStyleScope(element);
      let currentIntensity = intensity;
      return {
        setIntensity: value => { currentIntensity = value; },
        frame({ progress }) {
          const level = envelope(progress) * currentIntensity;
          styles.set("filter", `brightness(${(1 + level * 0.55).toFixed(3)}) drop-shadow(0 0 ${(4 + level * 18).toFixed(1)}px rgba(255,72,34,${(0.16 + level * 0.56).toFixed(3)}))`);
        },
        cleanup: () => styles.restore()
      };
    },
    reducedCreate({ target, intensity }) {
      const element = target.getElement();
      const styles = createStyleScope(element);
      return {
        duration: 180,
        frame({ progress }) {
          const level = envelope(progress) * intensity * 0.7;
          styles.set("filter", `brightness(${(1 + level * 0.35).toFixed(3)})`);
        },
        cleanup: () => styles.restore()
      };
    }
  });

  effects.register("flicker", {
    channel: "interface",
    concurrency: "replace",
    duration: 520,
    maxFps: 30,
    cost: "A",
    features: ["DOM"],
    defaults: { intensity: 0.45 },
    create({ target, intensity, random }) {
      const element = target.getElement();
      if (!element) throw new Error("flicker requires an element target.");
      const styles = createStyleScope(element);
      let currentIntensity = intensity;
      let nextChange = 0;
      let opacity = 1;
      return {
        setIntensity: value => { currentIntensity = value; },
        frame({ elapsed }) {
          if (elapsed >= nextChange) {
            nextChange = elapsed + mix(22, 95, random());
            opacity = 1 - random() * currentIntensity * 0.72;
          }
          styles.set("opacity", opacity.toFixed(3));
        },
        cleanup: () => styles.restore()
      };
    },
    reducedCreate({ target, intensity }) {
      const styles = createStyleScope(target.getElement());
      return {
        duration: 150,
        frame({ progress }) {
          styles.set("opacity", (1 - envelope(progress) * intensity * 0.18).toFixed(3));
        },
        cleanup: () => styles.restore()
      };
    }
  });

  effects.register("relay-scan", {
    channel: "interface",
    concurrency: "replace",
    duration: 760,
    maxFps: 30,
    cost: "B",
    features: ["DOM overlay"],
    defaults: { intensity: 0.6, direction: "vertical" },
    create({ target, options, intensity }) {
      const overlay = target.createOverlay("ncn-effect-relay-scan");
      const line = document.createElement("div");
      line.className = "ncn-effect-scan-line";
      overlay.append(line);
      const vertical = options.direction !== "horizontal";
      return {
        frame({ progress }) {
          trackOverlay(target, overlay);
          const position = mix(-12, 112, progress);
          overlay.style.setProperty("--ncn-effect-level", intensity.toFixed(3));
          line.style.transform = vertical
            ? `translate3d(0, ${position}%, 0)`
            : `translate3d(${position}%, 0, 0) rotate(90deg)`;
        },
        cleanup: () => overlay.remove()
      };
    },
    reducedCreate({ target, intensity }) {
      const overlay = target.createOverlay("ncn-effect-relay-scan ncn-effect-relay-scan-static");
      overlay.style.setProperty("--ncn-effect-level", (intensity * 0.7).toFixed(3));
      return {
        duration: 180,
        frame: () => trackOverlay(target, overlay),
        cleanup: () => overlay.remove()
      };
    }
  });

  effects.register("heat-resolve", {
    channel: "article",
    concurrency: "replace",
    duration: 480,
    maxFps: 30,
    cost: "B",
    features: ["DOM clone overlay", "CSS filter"],
    defaults: { intensity: 0.7 },
    create({ target, intensity }) {
      const { overlay, clone } = target.createCloneOverlay("ncn-effect-heat-resolve");
      const styles = createStyleScope(clone);
      let currentIntensity = intensity;
      return {
        setIntensity: value => { currentIntensity = value; },
        frame({ progress }) {
          trackOverlay(target, overlay);
          const heat = currentIntensity * envelope(progress);
          overlay.style.opacity = clamp01(progress * 1.28).toFixed(3);
          styles.set("filter", `brightness(${(0.3 + progress * 0.7 + heat * 1.15).toFixed(3)}) saturate(${(0.5 + progress * 0.5 + heat * 0.25).toFixed(3)})`);
          styles.set("transform", `scale(${(0.985 + progress * 0.015).toFixed(4)})`);
          overlay.style.setProperty("--ncn-effect-heat", heat.toFixed(3));
        },
        cleanup: () => overlay.remove()
      };
    },
    reducedCreate({ target, intensity }) {
      const { overlay, clone } = target.createCloneOverlay("ncn-effect-heat-resolve");
      const styles = createStyleScope(clone);
      return {
        duration: 220,
        frame({ progress }) {
          trackOverlay(target, overlay);
          overlay.style.opacity = progress.toFixed(3);
          styles.set("filter", `brightness(${(0.75 + progress * 0.25 + envelope(progress) * intensity * 0.35).toFixed(3)})`);
        },
        cleanup: () => overlay.remove()
      };
    }
  });

  effects.register("signal-collapse", {
    channel: "article",
    concurrency: "replace",
    duration: 260,
    maxFps: 30,
    cost: "B",
    features: ["DOM clone overlay", "CSS filter"],
    defaults: { intensity: 0.7 },
    create({ target, intensity }) {
      const { overlay, clone } = target.createCloneOverlay("ncn-effect-signal-collapse");
      const styles = createStyleScope(clone);
      return {
        frame({ progress }) {
          trackOverlay(target, overlay);
          const collapse = progress * intensity;
          overlay.style.opacity = (1 - progress).toFixed(3);
          styles.set("transform", `translate3d(${(collapse * 8).toFixed(2)}px, 0, 0) scaleY(${(1 - collapse * 0.22).toFixed(4)})`);
          styles.set("filter", `brightness(${(1 - progress * 0.72).toFixed(3)}) saturate(${(1 - progress * 0.58).toFixed(3)}) blur(${(progress * intensity * 1.8).toFixed(2)}px)`);
        },
        cleanup: () => overlay.remove()
      };
    },
    reducedCreate({ target }) {
      const { overlay } = target.createCloneOverlay("ncn-effect-signal-collapse");
      return {
        duration: 160,
        frame({ progress }) {
          trackOverlay(target, overlay);
          overlay.style.opacity = (1 - progress).toFixed(3);
        },
        cleanup: () => overlay.remove()
      };
    }
  });
})();
