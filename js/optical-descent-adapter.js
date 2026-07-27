/*==================================================
  OPTICAL DESCENT ADAPTER

  This protected boundary takes custody of the actual live Optical semantic
  nodes when the established renderer begins dismissal. Integration receives
  only an opaque descent session: no article element, ID or Optical record.
==================================================*/

window.NCNOpticalDescentAdapter = (() => {
  const DESCENT_DURATION = 760;
  const REDUCED_DURATION = 300;
  const START_DEPTH = 2.5;
  const DEPTH_TRAVEL = 6.6;
  const REDUCED_DEPTH_TRAVEL = 4.4;
  const nativeRemove = Element.prototype.remove;

  let stage = null;
  let observer = null;
  let batchScheduled = false;
  let anonymousBatch = 0;
  const activeSessions = new Set();

  function ensureStage() {
    if (stage?.isConnected) return stage;
    stage = document.createElement("div");
    stage.className = "ncn-optical-descent-stage";
    stage.setAttribute("aria-hidden", "true");
    document.body.append(stage);
    return stage;
  }

  function validRect(rect) {
    return Boolean(rect
      && Number.isFinite(rect.left)
      && Number.isFinite(rect.top)
      && rect.width > 0
      && rect.height > 0);
  }

  function unionBounds(items) {
    const rects = items.map(item => item.getBoundingClientRect()).filter(validRect);
    if (!rects.length) return null;
    const left = Math.min(...rects.map(rect => rect.left));
    const top = Math.min(...rects.map(rect => rect.top));
    const right = Math.max(...rects.map(rect => rect.right));
    const bottom = Math.max(...rects.map(rect => rect.bottom));
    return Object.freeze({ left, top, right, bottom, width: right - left, height: bottom - top });
  }

  function reducedMotion() {
    return window.NCNViewerRuntime?.snapshot?.().quality === "reduced"
      || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  }

  function takeCustody(item) {
    const rect = item.getBoundingClientRect();
    if (!validRect(rect)) return null;

    const parent = item.parentElement;
    const planeOrder = Number(parent?.style?.getPropertyValue?.("--optical-plane-order")) || 0;
    const sourceWidth = Number.parseFloat(item.style.width) || rect.width;
    const sourceHeight = Number.parseFloat(item.style.height) || rect.height;
    const left = rect.left - (sourceWidth - rect.width) * 0.5;
    const top = rect.top - (sourceHeight - rect.height) * 0.5;

    item.dataset.opticalDescentOwned = "true";
    item.classList.remove("optical-dismissing");
    item.classList.add("optical-descending");
    item.style.position = "absolute";
    item.style.left = `${left}px`;
    item.style.top = `${top}px`;
    item.style.width = `${sourceWidth}px`;
    item.style.height = `${sourceHeight}px`;
    item.style.zIndex = String(planeOrder);
    item.style.setProperty("--optical-descent-x", "0px");
    item.style.setProperty("--optical-descent-y", "0px");
    item.style.setProperty("--optical-descent-scale", "1");

    let removalRequested = false;
    Object.defineProperty(item, "remove", {
      configurable: true,
      value() { removalRequested = true; }
    });

    ensureStage().append(item);
    return Object.freeze({
      element: item,
      removalRequested: () => removalRequested,
      release() {
        try { delete item.remove; } catch (_) {}
        nativeRemove.call(item);
      }
    });
  }

  function makeSession(items) {
    const custody = items.map(takeCustody).filter(Boolean);
    if (!custody.length) return null;

    const reduced = reducedMotion();
    const duration = reduced ? REDUCED_DURATION : DESCENT_DURATION;
    const depthTravel = reduced ? REDUCED_DEPTH_TRAVEL : DEPTH_TRAVEL;
    const initial = unionBounds(custody.map(item => item.element));
    const initialCentreX = initial ? initial.left + initial.width * 0.5 : window.innerWidth * 0.5;
    const camera = window.NCNOptical?.getCameraSnapshot?.();
    const horizontalTravel = camera
      ? (camera.centreX - initialCentreX) * (reduced ? 0.08 : 0.18)
      : 0;
    const verticalTravel = Math.min(
      window.innerHeight * (reduced ? 0.10 : 0.24),
      reduced ? 78 : 230
    );
    const scaleLoss = reduced ? 0.12 : 0.30;
    let closed = false;

    function close() {
      if (closed) return false;
      closed = true;
      custody.forEach(item => item.release());
      activeSessions.delete(session);
      if (stage && !stage.children.length) stage.remove();
      stage = stage?.isConnected ? stage : null;
      return true;
    }

    const session = Object.freeze({
      duration,
      sample(progress) {
        if (closed) return null;
        const linear = Math.max(0, Math.min(1, Number(progress) || 0));
        const eased = 1 - Math.pow(1 - linear, 3);
        const translateX = horizontalTravel * eased;
        const translateY = verticalTravel * eased;
        const descentScale = 1 - scaleLoss * eased;

        custody.forEach(item => {
          item.element.style.setProperty("--optical-descent-x", `${translateX.toFixed(2)}px`);
          item.element.style.setProperty("--optical-descent-y", `${translateY.toFixed(2)}px`);
          item.element.style.setProperty("--optical-descent-scale", descentScale.toFixed(5));
        });

        const bounds = unionBounds(custody.map(item => item.element));
        if (!bounds) return Object.freeze({ complete: true, surface: null });
        const chamberZ = START_DEPTH + depthTravel * eased;
        const surface = Object.freeze({
          chamberZ,
          projectedBounds: bounds,
          clip(targetContext, viewport = {}) {
            const originX = Number(viewport.left) || 0;
            const originY = Number(viewport.top) || 0;
            targetContext.beginPath?.();
            if (typeof targetContext.roundRect === "function") {
              targetContext.roundRect(
                bounds.left - originX,
                bounds.top - originY,
                bounds.width,
                bounds.height,
                Math.min(18, bounds.height * 0.08)
              );
            } else {
              targetContext.rect?.(
                bounds.left - originX,
                bounds.top - originY,
                bounds.width,
                bounds.height
              );
            }
            targetContext.clip?.();
          }
        });
        return Object.freeze({ progress: linear, eased, complete: linear >= 1, surface });
      },
      finish() { return close(); },
      cancel() { return close(); }
    });

    activeSessions.add(session);
    return session;
  }

  function beginGroup(items) {
    if (!window.NCNArticleMistDescent?.begin) return false;
    const session = makeSession(items);
    if (!session) return false;
    if (window.NCNArticleMistDescent.begin(session)) return true;
    session.cancel("integration-unavailable");
    return false;
  }

  function flushDismissals() {
    batchScheduled = false;
    const candidates = [...document.querySelectorAll(
      ".optical-plane-system .optical-semantic-item.optical-dismissing:not([data-optical-descent-owned])"
    )];
    if (!candidates.length) return;

    const groups = new Map();
    const anonymousKey = `anonymous-${++anonymousBatch}`;
    candidates.forEach(item => {
      const key = item.dataset.opticalEntryId || anonymousKey;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    groups.forEach(items => beginGroup(items));
  }

  function scheduleFlush() {
    if (batchScheduled) return;
    batchScheduled = true;
    queueMicrotask(flushDismissals);
  }

  function start() {
    if (observer) return;
    observer = new MutationObserver(mutations => {
      if (mutations.some(mutation => (
        mutation.type === "attributes"
        && mutation.attributeName === "class"
        && mutation.target instanceof Element
        && mutation.target.classList.contains("optical-dismissing")
      ))) scheduleFlush();
    });
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  function destroy() {
    observer?.disconnect();
    observer = null;
    [...activeSessions].forEach(session => session.cancel("adapter-destroy"));
    activeSessions.clear();
    stage?.remove?.();
    stage = null;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else start();

  return Object.freeze({
    destroy,
    snapshot: () => Object.freeze({
      observing: Boolean(observer),
      active: activeSessions.size,
      stage: Boolean(stage?.isConnected),
      exposesArticleElements: false,
      articleRasterisation: false
    })
  });
})();
