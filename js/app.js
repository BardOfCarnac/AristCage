/*==================================================
  NIGHT CITY NEWS
  APPLICATION ENTRY POINT
==================================================*/

function boot() {

    render();

    updateProjection();

}

if (document.readyState === "loading") {

    document.addEventListener("DOMContentLoaded", boot);

} else {

    boot();

}
