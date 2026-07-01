// script.js — Projection Engine v1

const viewer = document.querySelector(".viewer");
const projectionSpace = document.querySelector("#projectionSpace");
const objects = [...document.querySelectorAll(".projected-object")];

const clarityToggle = document.querySelector("#clarityToggle");
const motionToggle = document.querySelector("#motionToggle");

let focusedObject = null;
let reducedMotion = false;

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function randomInt(min, max) {
  return Math.floor(randomBetween(min, max + 1));
}

function initialiseObjects() {
  objects.forEach((object, index) => {
    const depth = Number(object.dataset.depth || 100);
    const type = object.dataset.objectType || "generic";

    object.dataset.state = "active";
    object.dataset.index = String(index);
    object.dataset.seed = String(randomInt(1000, 9999));

    object.style.setProperty("--object-depth", `${depth}px`);
    object.style.setProperty("--drift-x", "0px");
    object.style.setProperty("--drift-y", "0px");
    object.style.setProperty("--focus-z", "0px");
    object.style.setProperty("--object-scale", "1");
    object.style.setProperty("--phase-delay", `${randomBetween(-12, 0).toFixed(2)}s`);
    object.style.setProperty("--phase-duration", `${randomBetween(7, 15).toFixed(2)}s`);

    object.style.animationDelay = `var(--phase-delay)`;
    object.style.animationDuration = `var(--phase-duration)`;

    if (isInteractiveObject(type)) {
      object.setAttribute("tabindex", object.getAttribute("tabindex") || "0");
      object.addEventListener("click", (event) => {
        event.stopPropagation();
        focusObject(object);
      });

      object.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          focusObject(object);
        }
      });
    }
  });
}

function isInteractiveObject(type) {
  return ["article", "masthead", "filters", "submit", "ticker"].includes(type);
}

function focusObject(target) {
  if (focusedObject === target) {
    clearFocus();
    return;
  }

  focusedObject = target;
  viewer.classList.add("has-focus");

  objects.forEach((object) => {
    object.classList.remove("is-focused", "is-muted", "is-background");

    if (object === target) {
      object.dataset.state = "focused";
      object.classList.add("is-focused");
      object.style.setProperty("--focus-z", "280px");
      object.style.setProperty("--object-scale", "1.06");
    } else {
      object.dataset.state = "muted";

      if (object.dataset.objectType === "detail") {
        object.classList.add("is-background");
      } else {
        object.classList.add("is-muted");
      }

      object.style.setProperty("--focus-z", "-80px");
      object.style.setProperty("--object-scale", "0.97");
    }
  });
}

function clearFocus() {
  focusedObject = null;
  viewer.classList.remove("has-focus");

  objects.forEach((object) => {
    object.dataset.state = "active";
    object.classList.remove("is-focused", "is-muted", "is-background");
    object.style.setProperty("--focus-z", "0px");
    object.style.setProperty("--object-scale", "1");
  });
}

function updateIdleMotion() {
  if (reducedMotion || viewer.classList.contains("is-clarity")) return;

  objects.forEach((object) => {
    if (object.dataset.state === "focused") return;

    const depth = Number(object.dataset.depth || 100);
    const depthFactor = Math.min(Math.max(depth / 500, 0.3), 1.2);

    const driftX = randomBetween(-5, 5) * depthFactor;
    const driftY = randomBetween(-3, 3) * depthFactor;

    object.style.setProperty("--drift-x", `${driftX.toFixed(2)}px`);
    object.style.setProperty("--drift-y", `${driftY.toFixed(2)}px`);
  });
}

function rareFlicker() {
  if (reducedMotion || viewer.classList.contains("is-clarity")) return;

  const candidates = objects.filter((object) => {
    return object.dataset.state !== "focused";
  });

  const object = candidates[randomInt(0, candidates.length - 1)];
  if (!object) return;

  object.classList.add("is-flickering");

  window.setTimeout(() => {
    object.classList.remove("is-flickering");
  }, randomBetween(70, 180));
}

clarityToggle.addEventListener("click", () => {
  viewer.classList.toggle("is-clarity");

  if (viewer.classList.contains("is-clarity")) {
    clearFocus();
  }
});

motionToggle.addEventListener("click", () => {
  reducedMotion = !reducedMotion;
  viewer.classList.toggle("is-reduced-motion", reducedMotion);

  motionToggle.textContent = reducedMotion
    ? "Restore Motion"
    : "Reduce Motion";
});

projectionSpace.addEventListener("click", () => {
  clearFocus();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    clearFocus();
  }
});

initialiseObjects();

window.setInterval(updateIdleMotion, 1800);
window.setInterval(rareFlicker, 4200);
