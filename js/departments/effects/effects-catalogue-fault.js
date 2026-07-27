/* NCN Effects Department catalogue publication. */
(() => {
  "use strict";
  const catalogues = window.NCNEffectsDepartmentCatalogues || (window.NCNEffectsDepartmentCatalogues = []);
  catalogues.push((effects, utils) => {
    const { envelope, ease, mix, clamp01 } = utils;
    const register = effects.register;
    register("displacement", {
      channel: "fault", concurrency: "replace", duration: 360, maxFps: 30, cost: "B",
      features: ["DOM clone overlay"], defaults: { intensity: 0.45 },
      create({ target, intensity, random, createNode, positionNode, removeNode }) {
        const node = createNode(target, "ncn-effect-displacement", true);
        const phase = random() * Math.PI * 2;
        return {
          frame({ progress }) {
            positionNode(node, target);
            const level = envelope(progress) * intensity;
            const x = Math.sin(progress * Math.PI * 9 + phase) * level * 12;
            const y = Math.cos(progress * Math.PI * 7 + phase) * level * 5;
            node.style.opacity = (0.72 + level * 0.28).toFixed(3);
            node.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0)`;
          },
          cleanup: () => removeNode(node)
        };
      },
      reducedCreate({ target, intensity, createNode, positionNode, removeNode }) {
        const node = createNode(target, "ncn-effect-displacement", true);
        return {
          duration: 150,
          frame({ progress }) {
            positionNode(node, target);
            node.style.opacity = (0.8 + envelope(progress) * intensity * 0.2).toFixed(3);
            node.style.filter = `brightness(${(1 + envelope(progress) * intensity * 0.24).toFixed(3)})`;
          },
          cleanup: () => removeNode(node)
        };
      }
    });

    register("channel-separation", {
      channel: "fault", concurrency: "replace", duration: 300, maxFps: 30, cost: "C",
      features: ["two DOM clone overlays", "blend mode"], defaults: { intensity: 0.4 },
      create({ target, intensity, createNode, positionNode, removeNode }) {
        const red = createNode(target, "ncn-effect-channel-red", true);
        const cyan = createNode(target, "ncn-effect-channel-cyan", true);
        red.style.mixBlendMode = "screen";
        cyan.style.mixBlendMode = "screen";
        return {
          frame({ progress }) {
            positionNode(red, target); positionNode(cyan, target);
            const level = envelope(progress) * intensity;
            const offset = level * 9;
            red.style.opacity = (0.28 + level * 0.55).toFixed(3);
            cyan.style.opacity = (0.2 + level * 0.45).toFixed(3);
            red.style.filter = "sepia(1) saturate(8) hue-rotate(330deg)";
            cyan.style.filter = "sepia(1) saturate(6) hue-rotate(135deg)";
            red.style.transform = `translate3d(${offset.toFixed(2)}px,0,0)`;
            cyan.style.transform = `translate3d(${-offset.toFixed(2)}px,0,0)`;
          },
          cleanup() { removeNode(red); removeNode(cyan); }
        };
      },
      reducedCreate({ target, intensity, createNode, positionNode, removeNode }) {
        const node = createNode(target, "ncn-effect-channel-red", true);
        return {
          duration: 140,
          frame({ progress }) {
            positionNode(node, target);
            node.style.opacity = (envelope(progress) * intensity * 0.45).toFixed(3);
            node.style.filter = "sepia(1) saturate(4) hue-rotate(330deg)";
          },
          cleanup: () => removeNode(node)
        };
      }
    });

    register("static-burst", {
      channel: "fault", concurrency: "stack", duration: 240, maxFps: 24, cost: "B",
      features: ["DOM gradient overlay"], defaults: { intensity: 0.55 },
      create({ target, intensity, random, createNode, positionNode, removeNode }) {
        const node = createNode(target, "ncn-effect-static-burst");
        const staticField = document.createElement("div");
        staticField.className = "ncn-effect-static";
        node.append(staticField);
        return {
          frame({ progress }) {
            positionNode(node, target);
            const level = envelope(progress) * intensity;
            node.style.opacity = level.toFixed(3);
            staticField.style.transform = `translate3d(${mix(-4, 4, random()).toFixed(2)}px,${mix(-3, 3, random()).toFixed(2)}px,0)`;
            staticField.style.backgroundPosition = `${Math.floor(random() * 40)}px ${Math.floor(random() * 30)}px`;
          },
          cleanup: () => removeNode(node)
        };
      },
      reducedCreate({ target, intensity, createNode, positionNode, removeNode }) {
        const node = createNode(target, "ncn-effect-static-burst");
        const staticField = document.createElement("div");
        staticField.className = "ncn-effect-static";
        node.append(staticField);
        return {
          duration: 120,
          frame({ progress }) {
            positionNode(node, target);
            node.style.opacity = (envelope(progress) * intensity * 0.42).toFixed(3);
          },
          cleanup: () => removeNode(node)
        };
      }
    });

    register("light-flash", {
      channel: "interface", concurrency: "stack", duration: 180, maxFps: 30, cost: "A",
      features: ["DOM overlay"], defaults: { intensity: 0.55 },
      create({ target, intensity, createNode, positionNode, removeNode }) {
        const node = createNode(target, "ncn-effect-light-flash");
        node.style.background = "radial-gradient(circle at 50% 50%,rgba(255,250,235,.95),rgba(255,106,58,.48) 28%,transparent 72%)";
        node.style.mixBlendMode = "screen";
        return {
          frame({ progress }) {
            positionNode(node, target);
            node.style.opacity = (envelope(progress) * intensity).toFixed(3);
          },
          cleanup: () => removeNode(node)
        };
      }
    });

    register("blur-interference", {
      channel: "fault", concurrency: "replace", duration: 420, maxFps: 24, cost: "C",
      features: ["DOM clone overlay", "blur filter"], defaults: { intensity: 0.45 },
      create({ target, intensity, createNode, positionNode, removeNode }) {
        const node = createNode(target, "ncn-effect-blur", true);
        return {
          frame({ progress }) {
            positionNode(node, target);
            const level = envelope(progress) * intensity;
            node.style.opacity = (0.5 + level * 0.5).toFixed(3);
            node.style.filter = `blur(${(level * 5).toFixed(2)}px) contrast(${(1 + level * 0.7).toFixed(3)})`;
          },
          cleanup: () => removeNode(node)
        };
      },
      reducedCreate({ target, intensity, createNode, positionNode, removeNode }) {
        const node = createNode(target, "ncn-effect-blur", true);
        return {
          duration: 150,
          frame({ progress }) {
            positionNode(node, target);
            node.style.opacity = (envelope(progress) * intensity * 0.35).toFixed(3);
            node.style.filter = "contrast(1.15)";
          },
          cleanup: () => removeNode(node)
        };
      }
    });
  });
})();
