/*==================================================
  NCN INTERACTIONS
==================================================*/

const Interactions = (() => {

    let currentScene = "feed";
    let selectedStoryId = null;

    function init() {

        document.addEventListener("click", handleClick);

    }

    function handleClick(event) {

        const story = event.target.closest(".story");

        if (!story) return;

        const storyId = story.dataset.storyId;

        if (!storyId) return;

        if (selectedStoryId === storyId) {

            selectedStoryId = null;
            currentScene = "feed";
            ProjectionEngine.render(Scenes.feed());
            revealProjection();

            return;

        }

        selectedStoryId = storyId;
        currentScene = "expanded";

        ProjectionEngine.render(
            Scenes.expanded(storyId)
        );

        revealProjection();

        requestAnimationFrame(() => {

            const expandedStory = document.querySelector(
                `.story[data-story-id="${storyId}"]`
            );

            if (expandedStory) {

                expandedStory.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });

            }

        });

    }

    function revealProjection() {

        const glyphs = document.querySelectorAll(".glyph");

        glyphs.forEach((glyph, index) => {

            glyph.classList.remove("is-present");

            window.setTimeout(() => {

                glyph.classList.add("is-present");

            }, 80 + index * 55);

        });

    }

    return {

        init,
        revealProjection

    };

})();
