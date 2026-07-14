/* Expanded article tags */

(() => {
  function addExpandedTags(root = document) {
    root.querySelectorAll(".entry:not(.panel)").forEach(entry => {
      if (entry.querySelector(".expanded-tags")) return;

      const source = entry.querySelector(".entry-content > .tags");
      const body = entry.querySelector(".expansion-zone > .body");
      if (!source || !body) return;

      const tags = document.createElement("div");
      tags.className = "part tags expanded-tags gone";
      tags.textContent = source.textContent;
      body.insertAdjacentElement("afterend", tags);
    });
  }

  const originalRender = render;
  render = function renderWithExpandedTags() {
    originalRender();
    addExpandedTags(feed);
  };

  const originalRenderResultsOnly = renderResultsOnly;
  renderResultsOnly = function renderResultsWithExpandedTags() {
    originalRenderResultsOnly();
    addExpandedTags(feed);
  };

  const originalRenderPanelOnly = renderPanelOnly;
  renderPanelOnly = function renderPanelWithExpandedTags() {
    const panel = originalRenderPanelOnly();
    addExpandedTags(feed);
    return panel;
  };

  const originalGetEntryBodyObjects = getEntryBodyObjects;
  getEntryBodyObjects = function getBodyAndExpandedTags(entry) {
    const objects = originalGetEntryBodyObjects(entry);
    const tags = entry?.querySelector(".expanded-tags");
    return tags ? [...objects, tags] : objects;
  };
})();
