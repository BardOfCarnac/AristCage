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

    transitionTo(nextScene, storyId);
  }

  function transitionTo(scene, storyIdToScroll) {
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
    }, 520);
  }

  function revealProjection() {
    const glyphs = document.querySelectorAll(".glyph");

    glyphs.forEach((glyph, index) => {
      glyph.classList.remove("is-leaving");
      glyph.classList.remove("is-present");

      window.setTimeout(() => {
        glyph.classList.add("is-present");
      }, 80 + index * 55);
    });

    updateScrollParallax();
  }

  function dismissProjection() {
    const glyphs = document.querySelectorAll(".glyph");

    glyphs.forEach((glyph, index) => {
      window.setTimeout(() => {
        glyph.classList.remove("is-present");
        glyph.classList.add("is-leaving");
      }, index * 18);
    });
  }

  function updateScrollParallax() {
    document.querySelectorAll(".story").forEach((story) => {
      const rect = story.getBoundingClientRect();
      const screenOffset = rect.top / window.innerHeight;

      story.querySelectorAll(".glyph").forEach((glyph) => {
        const z = parseFloat(
          getComputedStyle(glyph).getPropertyValue("--glyph-z")
        ) || 0;

        const closeness = Math.max(0, (z + 200) / 300);
        const movement = screenOffset * closeness * -22;

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
