/*==================================================
  NCN SCENES
==================================================*/

const Scenes = (() => {

    /*==============================================
      FEED
    ==============================================*/

    function feed() {

        return {

            name: "feed",

            header: NCN_DATA.meta,

            stories: NCN_DATA.stories

        };

    }

    /*==============================================
      EXPANDED STORY
    ==============================================*/

    function expanded(storyId) {

        const stories = NCN_DATA.stories.map(story => ({

            ...story,

            expanded: story.id === storyId

        }));

        return {

            name: "expanded",

            header: NCN_DATA.meta,

            stories

        };

    }

    /*==============================================
      EMPTY
    ==============================================*/

    function empty() {

        return {

            name: "empty",

            header: NCN_DATA.meta,

            stories: []

        };

    }

    /*==============================================
      LOADING
    ==============================================*/

    function loading() {

        return {

            name: "loading",

            header: {

                ...NCN_DATA.meta,

                tagline: "Establishing connection..."

            },

            stories: []

        };

    }

    /*==============================================
      PUBLIC
    ==============================================*/

    return {

        feed,
        expanded,
        empty,
        loading

    };

})();
