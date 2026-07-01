/*==================================================
  NCN MAIN
==================================================*/

document.addEventListener("DOMContentLoaded", () => {
  ProjectionEngine.render(Scenes.feed());

  Interactions.init();
  Interactions.revealProjection();
});
