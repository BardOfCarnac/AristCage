/*==================================================
  NCN INTERACTIONS
==================================================*/

const Interactions = (() => {
  let selectedStoryId = null;
  let isTransitioning = false;

  function init() {
    document.addEventListener("click", handleClick);
    window.addEventListener("scroll", updateScrollParallax);
    window.addEventListener("resize", updateScrollParallax);

    updateScrollParallax();
  }

  function handleClick(event) {
    const story = event.target.closest(".story");
    if (!story || isTransitioning) return;

    const storyId = story.dataset.storyId;
    if (!storyId) return;

    selectedStoryId = selectedStoryId === storyId ? null : storyId;

    const nextScene = selectedStoryId
      ? Scenes.expanded(selectedStoryId)
      : Scenes.feed();

    transitionTo(nextScene, selectedStoryId);
  }

  function transitionTo(scene, storyIdToScroll = null) {
    isTransitioning = true;

    dismissProjection();

    window.setTimeout(() => {
      ProjectionEngine.render(scene);
      revealProjection();

      if (storyIdToScroll) {
        requestAnimationFrame(() => {
          const target = document.querySelector(
            `.story[data-story-id="${storyIdToScroll}"]`
          );

          if (target) {
            target.scrollIntoView({
              behavior: "smooth",
              block: "center"
            });
          }
        });
      }

      isTransitioning = false;
    }, 260);
  }

  function revealProjection() {
    const glyphs = document.querySelectorAll(".glyph");

    glyphs.forEach((glyph, index) => {
      glyph.classList.remove("is-leaving");
      glyph.classList.remove("is-present");

      window.setTimeout(() => {
        glyph.classList.add("is-present");
      }, 60 + index * 42);
    });

    updateScrollParallax();
  }

  function dismissProjection() {
    const glyphs = document.querySelectorAll(".glyph");

    glyphs.forEach((glyph, index) => {
      window.setTimeout(() => {
        glyph.classList.remove("is-present");
        glyph.classList.add("is-leaving");
      }, index * 10);
    });
  }

  function updateScrollParallax() {
    document.querySelectorAll(".story").forEach((story) => {
      const rect = story.getBoundingClientRect();
      const centre = rect.top + rect.height / 2;
      const offset = (centre - window.innerHeight / 2) / window.innerHeight;

      story.querySelectorAll(".glyph").forEach((glyph) => {
        const rawZ = getComputedStyle(glyph).getPropertyValue("--glyph-z");
        const z = parseFloat(rawZ) || 0;

        const closeness = Math.max(0, (z + 220) / 320);
        const movement = offset * closeness * -26;

        glyph.style.setProperty("--parallax-y", `${movement}px`);
      });
    });
  }

  return {
    init,
    revealProjection,
    dismissProjection,
    updateScrollParallax
  };
})();
