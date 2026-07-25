/*==================================================
  NCN EFFECTS: DISTURBANCE AND FAULTS
==================================================*/
(() => {
  "use strict";

  const effects = window.NCNEffects;
  if (!effects) throw new Error("NCNEffects core must load before effect definitions.");

  const { clamp01, mix, envelope, createStyleScope, trackOverlay } = window.NCNEffectUtils;

  effects.register("displacement", {
    channel: "fault",
    concurrency: "replace",
    duration: 520,
    maxFps: 36,
    cost: "B",
    features: ["DOM clone overlay"],
    defaults: { intensity: 0.45 },
    create({ target, intensity, random }) {
      const { overlay, clone } = target.createCloneOverlay("ncn-effect-displacement");
      const styles = createStyleScope(clone);
      let currentIntensity = intensity;
      return {
        setIntensity: value => { currentIntensity = value; },
        frame({ progress }) {
          trackOverlay(target, overlay);
          const level = envelope(progress) * currentIntensity;
          const x = (random() - 0.5) * 16 * level;
          const y = (random() - 0.5) * 8 * level;
          styles.set("transform", `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`);
          overlay.style.opacity = (0.3 + level * 0.7).toFixed(3);
        },
        cleanup: () => overlay.remove()
      };
    },
    reducedCreate({ target, intensity }) {
      const { overlay, clone } = target.createCloneOverlay("ncn-effect-displacement");
      const styles = createStyleScope(clone);
      return {
        duration: 180,
        frame({ progress }) {
          trackOverlay(target, overlay);
          const level = envelope(progress) * intensity;
          styles.set("filter", `brightness(${(1 + level * 0.3).toFixed(3)})`);
          overlay.style.opacity = level.toFixed(3);
        },
        cleanup: () => overlay.remove()
      };
    }
  });

  effects.register("channel-separation", {
    channel: "fault",
    concurrency: "replace",
    duration: 440,
    maxFps: 30,
    cost: "C",
    features: ["two DOM clone overlays", "mix-blend-mode"],
    defaults: { intensity: 0.5 },
    create({ target, intensity }) {
      const red = target.createCloneOverlay("ncn-effect-channel ncn-effect-channel-red");
      const cyan = target.createCloneOverlay("ncn-effect-channel ncn-effect-channel-cyan");
      return {
        frame({ progress }) {
          trackOverlay(target, red.overlay);
          trackOverlay(target, cyan.overlay);
          const level = envelope(progress) * intensity;
          const offset = level * 7;
          red.overlay.style.transform = `translate3d(${-offset}px, 0, 0)`;
          cyan.overlay.style.transform = `translate3d(${offset}px, 0, 0)`;
          red.overlay.style.opacity = (level * 0.72).toFixed(3);
          cyan.overlay.style.opacity = (level * 0.62).toFixed(3);
        },
        cleanup() {
          red.overlay.remove();
          cyan.overlay.remove();
        }
      };
    },
    reducedCreate({ target, intensity }) {
      const red = target.createCloneOverlay("ncn-effect-channel ncn-effect-channel-red");
      const cyan = target.createCloneOverlay("ncn-effect-channel ncn-effect-channel-cyan");
      return {
        duration: 160,
        frame({ progress }) {
          trackOverlay(target, red.overlay);
          trackOverlay(target, cyan.overlay);
          const level = envelope(progress) * intensity * 0.45;
          red.overlay.style.transform = "translate3d(-1px, 0, 0)";
          cyan.overlay.style.transform = "translate3d(1px, 0, 0)";
          red.overlay.style.opacity = level.toFixed(3);
          cyan.overlay.style.opacity = level.toFixed(3);
        },
        cleanup() {
          red.overlay.remove();
          cyan.overlay.remove();
        }
      };
    }
  });

  effects.register("static-burst", {
    channel: "fault",
    concurrency: "replace",
    duration: 320,
    maxFps: 24,
    cost: "B",
    features: ["DOM overlay", "CSS gradients"],
    defaults: { intensity: 0.55 },
    create({ target, intensity, random }) {
      const overlay = target.createOverlay("ncn-effect-static-burst");
      return {
        frame({ progress }) {
          trackOverlay(target, overlay);
          const level = envelope(progress) * intensity;
          overlay.style.opacity = level.toFixed(3);
          overlay.style.setProperty("--ncn-static-x", `${Math.floor(random() * 100)}%`);
          overlay.style.setProperty("--ncn-static-y", `${Math.floor(random() * 100)}%`);
          overlay.style.setProperty("--ncn-static-size", `${mix(3, 12, random()).toFixed(1)}px`);
        },
        cleanup: () => overlay.remove()
      };
    },
    reducedCreate({ target, intensity }) {
      const overlay = target.createOverlay("ncn-effect-static-burst");
      return {
        duration: 130,
        frame({ progress }) {
          trackOverlay(target, overlay);
          overlay.style.opacity = (envelope(progress) * intensity * 0.65).toFixed(3);
        },
        cleanup: () => overlay.remove()
      };
    }
  });

  effects.register("light-flash", {
    channel: "interface",
    concurrency: "stack",
    duration: 180,
    maxFps: 30,
    cost: "A",
    features: ["DOM overlay"],
    defaults: { intensity: 0.5 },
    create({ target, intensity }) {
      const overlay = target.createOverlay("ncn-effect-light-flash");
      return {
        frame({ progress }) {
          trackOverlay(target, overlay);
          overlay.style.opacity = (envelope(progress) * intensity).toFixed(3);
        },
        cleanup: () => overlay.remove()
      };
    }
  });

  effects.register("blur-interference", {
    channel: "fault",
    concurrency: "replace",
    duration: 520,
    maxFps: 30,
    cost: "C",
    features: ["DOM clone overlay", "CSS blur"],
    defaults: { intensity: 0.45 },
    create({ target, intensity }) {
      const { overlay, clone } = target.createCloneOverlay("ncn-effect-blur-interference");
      const styles = createStyleScope(clone);
      return {
        frame({ progress }) {
          trackOverlay(target, overlay);
          const level = envelope(progress) * intensity;
          overlay.style.opacity = (0.25 + level * 0.75).toFixed(3);
          styles.set("filter", `blur(${(level * 3.5).toFixed(2)}px) brightness(${(1 + level * 0.35).toFixed(3)})`);
        },
        cleanup: () => overlay.remove()
      };
    },
    reducedCreate({ target, intensity }) {
      const overlay = target.createOverlay("ncn-effect-light-flash");
      return {
        duration: 160,
        frame({ progress }) {
          trackOverlay(target, overlay);
          overlay.style.opacity = (envelope(progress) * intensity * 0.28).toFixed(3);
        },
        cleanup: () => overlay.remove()
      };
    }
  });

  effects.register("particle-emission", {
    channel: "environment",
    concurrency: "stack",
    duration: 760,
    maxFps: 30,
    cost: "C",
    features: ["DOM particles"],
    defaults: { intensity: 0.5, count: 18 },
    create({ target, options, intensity, random }) {
      const overlay = target.createOverlay("ncn-effect-particles");
      const count = Math.max(1, Math.round((Number(options.count) || 18) * mix(0.25, 1, intensity)));
      const particles = Array.from({ length: count }, () => {
        const node = document.createElement("i");
        node.className = "ncn-effect-particle";
        overlay.append(node);
        return {
          node,
          x: mix(10, 90, random()),
          y: mix(55, 95, random()),
          vx: mix(-18, 18, random()),
          vy: mix(-72, -22, random()),
          delay: mix(0, 0.45, random()),
          size: mix(1, 4, random())
        };
      });
      return {
        frame({ progress }) {
          trackOverlay(target, overlay);
          for (const particle of particles) {
            const local = clamp01((progress - particle.delay) / Math.max(0.05, 1 - particle.delay));
            const x = particle.x + particle.vx * local;
            const y = particle.y + particle.vy * local + 28 * local * local;
            particle.node.style.width = `${particle.size}px`;
            particle.node.style.height = `${particle.size}px`;
            particle.node.style.transform = `translate3d(${x}%, ${y}%, 0)`;
            particle.node.style.opacity = (Math.sin(local * Math.PI) * intensity).toFixed(3);
          }
        },
        cleanup: () => overlay.remove()
      };
    },
    reducedCreate({ target, intensity }) {
      const overlay = target.createOverlay("ncn-effect-particles ncn-effect-particles-static");
      for (let index = 0; index < 4; index += 1) {
        const particle = document.createElement("i");
        particle.className = "ncn-effect-particle";
        particle.style.transform = `translate3d(${35 + index * 10}%, ${55 - (index % 2) * 8}%, 0)`;
        overlay.append(particle);
      }
      return {
        duration: 180,
        frame({ progress }) {
          trackOverlay(target, overlay);
          overlay.style.opacity = (envelope(progress) * intensity * 0.75).toFixed(3);
        },
        cleanup: () => overlay.remove()
      };
    }
  });

  effects.register("electrical-disturbance", {
    channel: "chamber",
    concurrency: "replace",
    duration: 650,
    maxFps: 36,
    cost: "C",
    features: ["DOM overlay", "generated SVG path"],
    defaults: { intensity: 0.55 },
    create({ target, intensity, random }) {
      const overlay = target.createOverlay("ncn-effect-electrical");
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 100 100");
      svg.setAttribute("preserveAspectRatio", "none");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      path.setAttribute("class", "ncn-effect-electrical-path");
      svg.append(path);
      overlay.append(svg);
      let nextRedraw = 0;
      return {
        frame({ elapsed, progress }) {
          trackOverlay(target, overlay);
          const level = envelope(progress) * intensity;
          overlay.style.opacity = level.toFixed(3);
          if (elapsed >= nextRedraw) {
            nextRedraw = elapsed + mix(35, 95, random());
            const points = [];
            for (let index = 0; index <= 8; index += 1) {
              points.push(`${(index / 8) * 100},${50 + (random() - 0.5) * 42 * level}`);
            }
            path.setAttribute("points", points.join(" "));
          }
        },
        cleanup: () => overlay.remove()
      };
    },
    reducedCreate({ target, intensity }) {
      const overlay = target.createOverlay("ncn-effect-light-flash");
      return {
        duration: 180,
        frame({ progress }) {
          trackOverlay(target, overlay);
          overlay.style.opacity = (envelope(progress) * intensity * 0.5).toFixed(3);
        },
        cleanup: () => overlay.remove()
      };
    }
  });

  effects.register("signal-fault", {
    channel: "fault",
    concurrency: "replace",
    duration: 720,
    maxFps: 36,
    cost: "D",
    features: ["three DOM overlays", "clone overlays", "CSS gradients"],
    defaults: { intensity: 0.55 },
    create({ target, intensity, random }) {
      const staticLayer = target.createOverlay("ncn-effect-static-burst");
      const red = target.createCloneOverlay("ncn-effect-channel ncn-effect-channel-red");
      const cyan = target.createCloneOverlay("ncn-effect-channel ncn-effect-channel-cyan");
      let nextNoise = 0;
      return {
        frame({ elapsed, progress }) {
          trackOverlay(target, staticLayer);
          trackOverlay(target, red.overlay);
          trackOverlay(target, cyan.overlay);
          const level = envelope(progress) * intensity;
          const jitter = Math.sin(progress * Math.PI * 14) * level * 5;
          red.overlay.style.transform = `translate3d(${(-jitter - level * 2).toFixed(2)}px, 0, 0)`;
          cyan.overlay.style.transform = `translate3d(${(jitter + level * 2).toFixed(2)}px, 0, 0)`;
          red.overlay.style.opacity = (level * 0.65).toFixed(3);
          cyan.overlay.style.opacity = (level * 0.52).toFixed(3);
          staticLayer.style.opacity = (level * 0.72).toFixed(3);
          if (elapsed >= nextNoise) {
            nextNoise = elapsed + mix(28, 80, random());
            staticLayer.style.setProperty("--ncn-static-x", `${Math.floor(random() * 100)}%`);
            staticLayer.style.setProperty("--ncn-static-y", `${Math.floor(random() * 100)}%`);
          }
        },
        cleanup() {
          staticLayer.remove();
          red.overlay.remove();
          cyan.overlay.remove();
        }
      };
    },
    reducedCreate({ target, intensity }) {
      const overlay = target.createOverlay("ncn-effect-static-burst");
      return {
        duration: 180,
        frame({ progress }) {
          trackOverlay(target, overlay);
          overlay.style.opacity = (envelope(progress) * intensity * 0.55).toFixed(3);
        },
        cleanup: () => overlay.remove()
      };
    }
  });
})();
