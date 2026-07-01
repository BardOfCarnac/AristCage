/*==================================================
  NCN PROJECTION ENGINE
==================================================*/

const ProjectionEngine = (() => {

    const feed = document.getElementById("feed");

    /*==============================================
      PUBLIC
    ==============================================*/

    function clear() {

        feed.innerHTML = "";

    }

    function render(scene) {

        clear();

        if(scene.header){

            feed.appendChild(
                createHeader(scene.header)
            );

        }

        if(scene.stories){

            const list = document.createElement("section");

            list.className = "story-list";

            scene.stories.forEach(story=>{

                list.appendChild(
                    createStory(story)
                );

            });

            feed.appendChild(list);

        }

    }

    /*==============================================
      HEADER
    ==============================================*/

    function createHeader(data){

        const header = document.createElement("header");

        header.className = "feed-header";

        header.innerHTML = `

            <div class="glyph glyph-meta">
                ${data.date}
                &nbsp;&nbsp;&nbsp;
                ${data.version}
            </div>

            <h1 class="glyph glyph-headline">
                ${data.title}
            </h1>

            <div class="glyph glyph-tags">
                ${data.tagline}
            </div>

        `;

        return header;

    }

    /*==============================================
      STORY
    ==============================================*/

    function createStory(data){

        const article = document.createElement("article");

        article.className = "story";

        article.dataset.storyId = data.id;

        article.innerHTML = `

            <div class="story-projection">

                <div class="story-frame glyph glyph-frame"></div>

                <div class="story-priority glyph glyph-priority"></div>

                <div class="story-content">

                    <div class="story-meta glyph glyph-meta">

                        ${data.meta}

                    </div>

                    <h2 class="story-headline glyph glyph-headline">

                        ${data.title}

                    </h2>

                    <div class="story-tags glyph glyph-tags">

                        ${data.tags.join(" // ")}

                    </div>

                    <div class="story-body glyph glyph-body">

                        ${data.body}

                    </div>

                </div>

            </div>

        `;

        return article;

    }

    return {

        render,

        clear

    };

})();
