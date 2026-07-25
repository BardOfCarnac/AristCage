/* NCN Effects Department catalogue publication. */
(() => {
  "use strict";
  const catalogues = window.NCNEffectsDepartmentCatalogues || (window.NCNEffectsDepartmentCatalogues = []);
  catalogues.push((effects, utils) => {
    const { envelope, ease, mix, clamp01 } = utils;
    const register = effects.register;
    register("particle-emission", {
      channel: "environment", concurrency: "stack", duration: 700, maxFps: 30, cost: "C",
      features: ["DOM particles"], defaults: { intensity: 0.5, count: 18 },
      create({ target, options, intensity, random, createNode, positionNode, removeNode }) {
        const node = createNode(target, "ncn-effect-particles");
        const count = Math.max(2, Math.min(50, Math.round((options.count || 18) * Math.max(0.2, intensity))));
        const particles = Array.from({ length: count }, () => {
          const element = document.createElement("i");
          element.className = "ncn-effect-particle";
          node.append(element);
          return {
            element,
            x: random(),
            y: random(),
            vx: mix(-0.08, 0.08, random()),
            vy: mix(-0.18, -0.04, random()),
            phase: random()
          };
        });
        return {
          frame({ progress }) {
            positionNode(node, target);
            const fade = Math.sin(progress * Math.PI);
            particles.forEach(particle => {
              const x = particle.x + particle.vx * progress * 6;
              const y = particle.y + particle.vy * progress * 6;
              particle.element.style.left = `${x * 100}%`;
              particle.element.style.top = `${y * 100}%`;
              particle.element.style.opacity = (fade * intensity * (0.45 + particle.phase * 0.55)).toFixed(3);
              particle.element.style.transform = `scale(${(0.7 + particle.phase * 0.9).toFixed(2)})`;
            });
          },
          cleanup: () => removeNode(node)
        };
      },
      reducedCreate({ target, options, intensity, createNode, positionNode, removeNode }) {
        const node = createNode(target, "ncn-effect-particles");
        const count = Math.max(2, Math.min(8, Math.round((options.count || 8) * Math.max(0.2, intensity))));
        Array.from({ length: count }, (_, index) => {
          const element = document.createElement("i");
          element.className = "ncn-effect-particle";
          element.style.left = `${18 + (index * 17) % 68}%`;
          element.style.top = `${30 + (index * 23) % 45}%`;
          node.append(element);
        });
        return {
          duration: 220,
          frame({ progress }) {
            positionNode(node, target);
            node.style.opacity = (envelope(progress) * intensity * 0.55).toFixed(3);
          },
          cleanup: () => removeNode(node)
        };
      }
    });

    register("electrical-disturbance", {
      channel: "chamber", concurrency: "replace", duration: 520, maxFps: 30, cost: "C",
      features: ["generated SVG path"], defaults: { intensity: 0.55 },
      create({ target, intensity, random, createNode, positionNode, removeNode }) {
        const node = createNode(target, "ncn-effect-electrical");
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.classList.add("ncn-effect-arc");
        svg.setAttribute("viewBox", "0 0 100 100");
        const path = document.createElementNS(svg.namespaceURI, "path");
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "rgba(255,218,190,.95)");
        path.setAttribute("stroke-width", "1.2");
        path.setAttribute("filter", "drop-shadow(0 0 3px rgba(255,72,24,.95))");
        svg.append(path);
        node.append(svg);
        return {
          frame({ progress }) {
            positionNode(node, target);
            const points = [[4, 55]];
            for (let index = 1; index < 8; index += 1) points.push([index * 13, 50 + mix(-18, 18, random())]);
            points.push([96, 45]);
            path.setAttribute("d", `M ${points.map(point => point.join(" ")).join(" L ")}`);
            node.style.opacity = (envelope(progress) * intensity).toFixed(3);
          },
          cleanup: () => removeNode(node)
        };
      },
      reducedCreate({ target, intensity, createNode, positionNode, removeNode }) {
        const node = createNode(target, "ncn-effect-electrical");
        node.style.background = "linear-gradient(120deg,transparent 42%,rgba(255,210,175,.85) 49%,rgba(255,70,28,.8) 51%,transparent 58%)";
        return {
          duration: 150,
          frame({ progress }) {
            positionNode(node, target);
            node.style.opacity = (envelope(progress) * intensity * 0.6).toFixed(3);
          },
          cleanup: () => removeNode(node)
        };
      }
    });

    register("signal-fault", {
      channel: "fault", concurrency: "replace", duration: 640, maxFps: 30, cost: "D",
      features: ["composite clone overlays", "static overlay", "CSS filters"], defaults: { intensity: 0.5 },
      create({ target, intensity, random, createNode, positionNode, removeNode }) {
        const base = createNode(target, "ncn-effect-signal-fault", true);
        const split = createNode(target, "ncn-effect-signal-fault-split", true);
        const staticNode = createNode(target, "ncn-effect-signal-fault-static");
        const staticField = document.createElement("div");
        staticField.className = "ncn-effect-static";
        staticNode.append(staticField);
        split.style.mixBlendMode = "screen";
        return {
          frame({ progress }) {
            positionNode(base, target); positionNode(split, target); positionNode(staticNode, target);
            const level = envelope(progress) * intensity;
            const offset = Math.sin(progress * Math.PI * 12) * level * 13;
            base.style.opacity = (0.7 + level * 0.3).toFixed(3);
            base.style.filter = `brightness(${(1 + level * 0.45).toFixed(3)}) blur(${(level * 1.5).toFixed(2)}px)`;
            split.style.opacity = (level * 0.65).toFixed(3);
            split.style.filter = "sepia(1) saturate(7) hue-rotate(330deg)";
            split.style.transform = `translate3d(${offset.toFixed(2)}px,${mix(-2, 2, random()).toFixed(2)}px,0)`;
            staticNode.style.opacity = (level * 0.5).toFixed(3);
            staticField.style.backgroundPosition = `${Math.floor(random() * 50)}px ${Math.floor(random() * 35)}px`;
          },
          cleanup() { removeNode(base); removeNode(split); removeNode(staticNode); }
        };
      },
      reducedCreate({ target, intensity, createNode, positionNode, removeNode }) {
        const node = createNode(target, "ncn-effect-signal-fault", true);
        return {
          duration: 180,
          frame({ progress }) {
            positionNode(node, target);
            const level = envelope(progress) * intensity * 0.5;
            node.style.opacity = (0.5 + level).toFixed(3);
            node.style.filter = `brightness(${(1 + level * 0.3).toFixed(3)}) contrast(1.12)`;
          },
          cleanup: () => removeNode(node)
        };
      }
    });
  });
})();
