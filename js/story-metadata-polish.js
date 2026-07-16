/*==================================================
  STORY METADATA POLISH

  Replace legacy editorial tags with the three pieces of context used by the
  inspector: category, area and source type. Longer names receive compact
  display aliases so the projected tag line remains a single line on mobile.
==================================================*/

(() => {
  const aliases = new Map([
    ["Infrastructure", "Infra"],
    ["Urban Sprawl", "Sprawl"],
    ["Industrial Fringe", "Industrial"],
    ["Private Enclave", "Enclave"],
    ["Frontier Zone", "Frontier"],
    ["Civic Notice", "Civic"],
    ["Press Report", "Press"],
    ["Scanner Traffic", "Scanner"],
    ["Anonymous Leak", "Anonymous"]
  ]);

  function compactContext(value = "") {
    return aliases.get(String(value)) || String(value);
  }

  function storyContextTags(entry) {
    return [entry.category, entry.area, entry.sourceType]
      .map(compactContext)
      .filter(Boolean)
      .join(" // ");
  }

  NCN_ENTRIES.forEach(entry => {
    if (entry.type === "story") {
      entry.tags = storyContextTags(entry);
    }
  });
})();
