/*==================================================
  NIGHT CITY NEWS
  APPLICATION ENTRY POINT
==================================================*/

function boot() {

    render();

    updateProjection();
  activatePresence();

}

if (document.readyState === "loading") {

    document.addEventListener("DOMContentLoaded", boot);

} else {

    boot();

}
