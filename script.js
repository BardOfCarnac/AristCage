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

function initialiseObjects() {
  objects.forEach((object, index) => {
    const depth = Number(object.dataset.depth || 100);

    object.dataset.seed = String(randomBetween(0, 9999));
    object.dataset.state = "active";

    object.style.setProperty("--object-depth", `${depth}px`);
    object.style.animationDelay = `${randomBetween(-12, 0)}s`;
    object.style.animationDuration = `${randomBetween(5, 13)}s`;

    object.style.opacity = randomBetween(0.72, 0.94);

    if (object.dataset.objectType === "article") {
      object.addEventListener("click", () => focusObject(object));
      object.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          focusObject(object);
        }

        if (event.key === "Escape") {
          clearFocus();
        }
      });
    }
  });
}

function focusObject(object) {
  if (focusedObject === object) {
    clearFocus();
    return;
  }

  focusedObject = object;
  viewer.classList.add("has-focus");

  objects.forEach((item) => {
    item.classList.remove("is-focused", "is-muted");

    if (item === object) {
      item.classList.add("is-focused");
      item.dataset.state = "focused";
    } else {
      item.classList.add("is-muted");
      item.dataset.state = "muted";
    }
  });
}

function clearFocus() {
  focusedObject = null;
  viewer.classList.remove("has-focus");

  objects.forEach((object) => {
    object.classList.remove("is-focused", "is-muted");
    object.dataset.state = "active";
  });
}

function runIdlePulse() {
  if (reducedMotion) return;

  objects.forEach((object) => {
    if (object.classList.contains("is-focused")) return;

    const glow = randomBetween(0.7, 1.25);
    const driftX = randomBetween(-4, 4);
    const driftY = randomBetween(-3, 3);

    object.style.setProperty("--idle-glow", glow.toFixed(2));
    object.style.setProperty("--idle-x", `${driftX.toFixed(2)}px`);
    object.style.setProperty("--idle-y", `${driftY.toFixed(2)}px`);
  });
}

function rareFlicker() {
  if (reducedMotion) return;

  const object = objects[Math.floor(Math.random() * objects.length)];
  if (!object || object.classList.contains("is-focused")) return;

  object.classList.add("is-flickering");

  window.setTimeout(() => {
    object.classList.remove("is-flickering");
  }, randomBetween(80, 180));
}

clarityToggle.addEventListener("click", () => {
  viewer.classList.toggle("is-clarity");
});

motionToggle.addEventListener("click", () => {
  reducedMotion = !reducedMotion;
  viewer.classList.toggle("is-reduced-motion", reducedMotion);

  motionToggle.textContent = reducedMotion
    ? "Restore Motion"
    : "Reduce Motion";
});

projectionSpace.addEventListener("click", (event) => {
  if (!event.target.closest(".article-object")) {
    clearFocus();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    clearFocus();
  }
});

initialiseObjects();

window.setInterval(runIdlePulse, 1800);
window.setInterval(rareFlicker, 4200);
