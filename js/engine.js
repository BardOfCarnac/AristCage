/*==================================================
  NCN PROJECTION ENGINE
==================================================*/

const ProjectionEngine = (() => {
  const feed = document.getElementById("feed");

  let headerEl = null;
  let storyListEl = null;
  let projectedStories = new Map();

  function render(scene) {
    if (scene.header) {
      reconcileHeader(scene.header);
    }

    reconcileStories(scene.stories || []);
  }

  function clear() {
    feed.innerHTML = "";
    headerEl = null;
    storyListEl = null;
    projectedStories.clear();
  }

  /*==============================================
    HEADER
  ==============================================*/

  function reconcileHeader(data) {
    if (!headerEl) {
      headerEl = createHeader(data);
      feed.appendChild(headerEl);
      revealGlyphs(headerEl);
      return;
    }

    updateText(headerEl, "[data-header-date]", data.date);
    updateText(headerEl, "[data-header-version]", data.version);
    updateText(headerEl, "[data-header-title]", data.title);
    updateText(headerEl, "[data-header-tagline]", data.tagline);
  }

  function createHeader(data) {
    const header = document.createElement("header");
    header.className = "feed-header";

    header.innerHTML = `
      <div class="feed-header-meta">
        <span class="glyph glyph-meta" data-header-date>${data.date}</span>
        <span class="glyph glyph-meta" data-header-version>${data.version}</span>
      </div>

      <h1 class="feed-title glyph glyph-headline" data-header-title>
        ${data.title}
      </h1>

      <div class="feed-tagline glyph glyph-tags" data-header-tagline>
        ${data.tagline}
      </div>
    `;

    return header;
  }

  /*==============================================
    STORIES
  ==============================================*/

  function reconcileStories(stories) {
    if (!storyListEl) {
      storyListEl = document.createElement("section");
      storyListEl.className = "story-list";
      feed.appendChild(storyListEl);
    }

    const nextIds = new Set(stories.map((story) => story.id));

    projectedStories.forEach((entry, storyId) => {
      if (!nextIds.has(storyId)) {
        dismissAndRemove(entry.el, () => {
          projectedStories.delete(storyId);
        });
      }
    });

    stories.forEach((story) => {
      const existing = projectedStories.get(story.id);

      if (existing) {
        updateStory(existing.el, story);
      } else {
        const storyEl = createStory(story);
        projectedStories.set(story.id, { el: storyEl });
        storyListEl.appendChild(storyEl);
        revealGlyphs(storyEl);
      }
    });

    stories.forEach((story) => {
      const entry = projectedStories.get(story.id);
      if (entry) {
        storyListEl.appendChild(entry.el);
      }
    });
  }

  function createStory(data) {
    const article = document.createElement("article");

    article.className = data.expanded
      ? "story is-expanded"
      : "story";

    article.dataset.storyId = data.id;

    article.innerHTML = getStoryMarkup(data);

    return article;
  }

  function updateStory(article, data) {
    article.classList.toggle("is-expanded", Boolean(data.expanded));

    updateText(article, "[data-story-meta]", data.meta);
    updateText(article, "[data-story-title]", data.title);
    updateText(article, "[data-story-tags]", data.tags.join(" // "));
    updateText(article, "[data-story-body]", data.body);

    const priority = article.querySelector(".story-priority");

    if (priority) {
      priority.className = `story-priority glyph glyph-priority priority-${data.priority}`;
    }

    const body = article.querySelector("[data-story-body]");

    if (body && data.expanded) {
      body.classList.add("is-present");
    }
  }

  function getStoryMarkup(data) {
    return `
      <div class="story-projection">
        <div class="story-frame glyph glyph-frame"></div>

        <div class="story-priority glyph glyph-priority priority-${data.priority}"></div>

        <div class="story-content">
          <div class="story-meta glyph glyph-meta" data-story-meta>
            ${data.meta}
          </div>

          <h2 class="story-headline glyph glyph-headline" data-story-title>
            ${data.title}
          </h2>

          <div class="story-tags glyph glyph-tags" data-story-tags>
            ${data.tags.join(" // ")}
          </div>

          <div class="story-body glyph glyph-body" data-story-body>
            ${data.body}
          </div>
        </div>
      </div>
    `;
  }

  /*==============================================
    HELPERS
  ==============================================*/

  function revealGlyphs(root) {
    const glyphs = root.querySelectorAll(".glyph");

    glyphs.forEach((glyph, index) => {
      glyph.classList.remove("is-leaving");

      window.setTimeout(() => {
        glyph.classList.add("is-present");
      }, 60 + index * 45);
    });
  }

  function dismissAndRemove(el, callback) {
    const glyphs = el.querySelectorAll(".glyph");

    glyphs.forEach((glyph, index) => {
      window.setTimeout(() => {
        glyph.classList.remove("is-present");
        glyph.classList.add("is-leaving");
      }, index * 18);
    });

    window.setTimeout(() => {
      el.remove();
      if (callback) callback();
    }, 700);
  }

  function updateText(root, selector, value) {
    const el = root.querySelector(selector);
    if (!el) return;

    if (el.textContent.trim() !== String(value).trim()) {
      el.textContent = value;
    }
  }

  return {
    render,
    clear,
    revealGlyphs,
    dismissAndRemove
  };
})();
