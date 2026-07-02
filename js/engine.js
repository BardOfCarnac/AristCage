/*==================================================
  NCN PROJECTION ENGINE
==================================================*/

const ProjectionEngine = (() => {
  const feed = document.getElementById("feed");

  function clear() {
    feed.innerHTML = "";
  }

  function render(scene) {
    clear();

    if (scene.header) {
      feed.appendChild(createHeader(scene.header));
    }

    if (scene.stories) {
      const list = document.createElement("section");
      list.className = "story-list";

      scene.stories.forEach((story) => {
        list.appendChild(createStory(story));
      });

      feed.appendChild(list);
    }
  }

  function createHeader(data) {
    const header = document.createElement("header");
    header.className = "feed-header";

    header.innerHTML = `
      <div class="feed-header-meta">
        <span class="glyph glyph-meta">${data.date}</span>
        <span class="glyph glyph-meta">${data.version}</span>
      </div>

      <h1 class="feed-title glyph glyph-headline">${data.title}</h1>

      <div class="feed-tagline glyph glyph-tags">
        ${data.tagline}
      </div>
    `;

    return header;
  }

  function createStory(data) {
    const article = document.createElement("article");

    article.className = data.expanded
      ? "story is-expanded"
      : "story";

    article.dataset.storyId = data.id;

    article.innerHTML = `
      <div class="story-projection">

        <div class="story-frame glyph glyph-frame"></div>

        <div class="story-priority glyph glyph-priority priority-${data.priority}"></div>

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
