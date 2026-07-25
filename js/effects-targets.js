/*==================================================
  NCN EFFECT TARGET ADAPTERS
==================================================*/
(() => {
  "use strict";

  const { createElementTarget, normaliseTarget } = window.NCNEffectUtils;

  function createTargetFactories() {
    function requiredElement(value, label = value) {
      const element = typeof value === "string" ? document.querySelector(value) : value;
      if (!(element instanceof Element)) throw new Error(`NCN effect target not found: ${label}`);
      return element;
    }

    return Object.freeze({
      element(value, options = {}) {
        return createElementTarget(requiredElement(value), options);
      },
      glyph(value) {
        return createElementTarget(requiredElement(value), { kind: "glyph" });
      },
      article(value) {
        const source = value instanceof Element
          ? value
          : document.querySelector(`.entry[data-entry-id="${CSS.escape(String(value))}"]`);
        return createElementTarget(requiredElement(source, value), {
          kind: "article",
          id: source?.dataset.entryId || String(value)
        });
      },
      optical(articleId, role = "headline") {
        const selector = `.optical-semantic-item[data-optical-entry-id="${CSS.escape(String(articleId))}"][data-optical-role="${CSS.escape(String(role))}"]`;
        return createElementTarget(requiredElement(selector), {
          kind: `optical-${role}`,
          id: `${articleId}:${role}`
        });
      },
      chamber() {
        return createElementTarget(requiredElement("#layered-chamber-fg, #layered-chamber-front, #layered-chamber-bg"), {
          kind: "chamber",
          id: "chamber",
          invalidate: () => window.LayeredChamber?.refresh?.()
        });
      },
      chamberWall(surface = "rear") {
        const provider = window.LayeredChamber?.getEffectTarget?.("wall", surface);
        if (provider) return normaliseTarget(provider);
        return createElementTarget(requiredElement(surface === "front"
          ? "#layered-chamber-fg, #layered-chamber-front"
          : "#layered-chamber-bg, #layered-chamber-rear"), {
          kind: "chamber-wall",
          id: `wall:${surface}`,
          invalidate: () => window.LayeredChamber?.refresh?.()
        });
      },
      chamberBlock(descriptor = null) {
        const provider = window.NCNChamberMotion?.getEffectTarget?.(descriptor)
          || window.LayeredChamber?.getEffectTarget?.("block", descriptor);
        if (provider) return normaliseTarget(provider);
        const currentBlock = document.querySelector(".ncn-chamber-block");
        if (currentBlock) {
          return createElementTarget(currentBlock, {
            kind: "chamber-block",
            id: descriptor?.id || "current-chamber-block",
            invalidate: () => window.NCNViewerRuntime?.wake?.("effect:chamber-block")
          });
        }
        throw new Error("No chamber block is currently published as an effect target.");
      },
      environment(layer = "front") {
        const provider = window.NCNEnvironmentHost?.getEffectTarget?.(layer);
        if (provider) return normaliseTarget(provider);
        const weatherLayer = document.querySelector(".ncn-floor-mist")
          || document.querySelector("#ncn-environment-system");
        if (weatherLayer) {
          return createElementTarget(weatherLayer, {
            kind: "environment",
            id: `environment:${layer}`,
            invalidate: () => window.NCNViewerRuntime?.wake?.("effect:environment")
          });
        }
        return createElementTarget(requiredElement(layer === "rear"
          ? "#layered-chamber-bg, #layered-chamber-rear"
          : "#layered-chamber-fg, #layered-chamber-front"), {
          kind: "environment",
          id: `environment:${layer}`,
          invalidate: () => window.NCNViewerRuntime?.wake?.("effect:environment")
        });
      },
      terminal() {
        return createElementTarget(document.documentElement, { kind: "terminal", id: "terminal" });
      },
      adapter: normaliseTarget
    });
  }

  window.NCNEffectTargets = createTargetFactories();
})();
