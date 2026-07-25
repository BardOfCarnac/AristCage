/* NCN Effects Department catalogue publication. */
(() => {
  "use strict";
  const catalogues = window.NCNEffectsDepartmentCatalogues || (window.NCNEffectsDepartmentCatalogues = []);
  catalogues.push((effects, utils) => {
    const { envelope, ease, mix, clamp01 } = utils;
    const register = effects.register;
    register("glow-pulse", {
      channel: "interface", concurrency: "replace", duration: 420, maxFps: 30, cost: "A",
      features: ["DOM clone overlay", "CSS filter"],
      defaults: { intensity: 0.55 },
      create({ target, intensity, createNode, positionNode, removeNode }) {
        const node = createNode(target, "ncn-effect-glow", true);
        let level = intensity;
        return {
          setIntensity(value) { level = value; },
          frame({ progress }) {
            positionNode(node, target);
            const pulse = envelope(progress) * level;
            node.style.opacity = clamp01(0.25 + pulse * 0.9).toFixed(3);
            node.style.filter = `brightness(${(1 + pulse * 0.7).toFixed(3)}) drop-shadow(0 0 ${(6 + pulse * 22).toFixed(1)}px rgba(255,72,30,${(0.2 + pulse * 0.65).toFixed(3)}))`;
          },
          cleanup: () => removeNode(node)
        };
      },
      reducedCreate({ target, intensity, createNode, positionNode, removeNode }) {
        const node = createNode(target, "ncn-effect-glow", true);
        return {
          duration: 180,
          frame({ progress }) {
            positionNode(node, target);
            const pulse = envelope(progress) * intensity * 0.55;
            node.style.opacity = (0.35 + pulse).toFixed(3);
            node.style.filter = `brightness(${(1 + pulse * 0.35).toFixed(3)})`;
          },
          cleanup: () => removeNode(node)
        };
      }
    });

    register("flicker", {
      channel: "interface", concurrency: "replace", duration: 520, maxFps: 30, cost: "A",
      features: ["DOM clone overlay"],
      defaults: { intensity: 0.45 },
      create({ target, intensity, random, createNode, positionNode, removeNode }) {
        const node = createNode(target, "ncn-effect-flicker", true);
        let nextChange = 0;
        let opacity = 1;
        return {
          frame({ elapsed }) {
            positionNode(node, target);
            if (elapsed >= nextChange) {
              nextChange = elapsed + mix(22, 95, random());
              opacity = 1 - random() * intensity * 0.72;
            }
            node.style.opacity = opacity.toFixed(3);
          },
          cleanup: () => removeNode(node)
        };
      },
      reducedCreate({ target, intensity, createNode, positionNode, removeNode }) {
        const node = createNode(target, "ncn-effect-flicker", true);
        return {
          duration: 150,
          frame({ progress }) {
            positionNode(node, target);
            node.style.opacity = (1 - envelope(progress) * intensity * 0.18).toFixed(3);
          },
          cleanup: () => removeNode(node)
        };
      }
    });

    register("relay-scan", {
      channel: "interface", concurrency: "replace", duration: 760, maxFps: 30, cost: "B",
      features: ["DOM overlay"], defaults: { intensity: 0.6, direction: "vertical" },
      create({ target, options, intensity, createNode, positionNode, removeNode }) {
        const node = createNode(target, "ncn-effect-relay-scan");
        const line = document.createElement("div");
        line.className = "ncn-effect-scan-line";
        node.append(line);
        return {
          frame({ progress }) {
            positionNode(node, target);
            node.style.opacity = intensity.toFixed(3);
            const position = mix(-12, 112, progress);
            line.style.transform = options.direction === "horizontal"
              ? `translate3d(${position}%,0,0) rotate(90deg)`
              : `translate3d(0,${position}%,0)`;
          },
          cleanup: () => removeNode(node)
        };
      },
      reducedCreate({ target, intensity, createNode, positionNode, removeNode }) {
        const node = createNode(target, "ncn-effect-relay-scan");
        const line = document.createElement("div");
        line.className = "ncn-effect-scan-line";
        line.style.top = "50%";
        node.append(line);
        return {
          duration: 180,
          frame({ progress }) {
            positionNode(node, target);
            node.style.opacity = (envelope(progress) * intensity * 0.7).toFixed(3);
          },
          cleanup: () => removeNode(node)
        };
      }
    });

    register("heat-resolve", {
      channel: "article", concurrency: "replace", duration: 480, maxFps: 30, cost: "B",
      features: ["DOM clone overlay", "CSS filter"], defaults: { intensity: 0.7 },
      create({ target, intensity, createNode, positionNode, removeNode }) {
        const node = createNode(target, "ncn-effect-heat-resolve", true);
        return {
          frame({ progress }) {
            positionNode(node, target);
            const heat = intensity * envelope(progress);
            node.style.opacity = clamp01(progress * 1.28).toFixed(3);
            node.style.filter = `sepia(${(0.55 + heat * 0.3).toFixed(3)}) saturate(${(1.4 + heat * 2.2).toFixed(3)}) brightness(${(0.35 + progress * 0.75 + heat).toFixed(3)})`;
            node.style.transform = `scale(${(0.985 + progress * 0.015).toFixed(4)})`;
          },
          cleanup: () => removeNode(node)
        };
      },
      reducedCreate({ target, intensity, createNode, positionNode, removeNode }) {
        const node = createNode(target, "ncn-effect-heat-resolve", true);
        return {
          duration: 220,
          frame({ progress }) {
            positionNode(node, target);
            node.style.opacity = progress.toFixed(3);
            node.style.filter = `brightness(${(0.75 + progress * 0.25 + envelope(progress) * intensity * 0.35).toFixed(3)})`;
          },
          cleanup: () => removeNode(node)
        };
      }
    });

    register("signal-collapse", {
      channel: "article", concurrency: "replace", duration: 280, maxFps: 30, cost: "B",
      features: ["DOM clone overlay", "CSS filter"], defaults: { intensity: 0.7 },
      create({ target, intensity, createNode, positionNode, removeNode }) {
        const node = createNode(target, "ncn-effect-signal-collapse", true);
        return {
          frame({ progress }) {
            positionNode(node, target);
            const collapse = ease(progress) * intensity;
            node.style.opacity = (1 - progress).toFixed(3);
            node.style.transform = `translate3d(${(collapse * 8).toFixed(2)}px,0,0) scaleY(${(1 - collapse * 0.22).toFixed(4)})`;
            node.style.filter = `brightness(${(1 - progress * 0.72).toFixed(3)}) saturate(${(1 - progress * 0.58).toFixed(3)}) blur(${(progress * intensity * 1.8).toFixed(2)}px)`;
          },
          cleanup: () => removeNode(node)
        };
      },
      reducedCreate({ target, createNode, positionNode, removeNode }) {
        const node = createNode(target, "ncn-effect-signal-collapse", true);
        return {
          duration: 160,
          frame({ progress }) {
            positionNode(node, target);
            node.style.opacity = (1 - progress).toFixed(3);
          },
          cleanup: () => removeNode(node)
        };
      }
    });
  });
})();
