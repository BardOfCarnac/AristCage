/*==================================================
  PROJECTION COMPATIBILITY BRIDGE

  The former per-part scroll parallax has been retired. Layout code may still
  call updateProjection(); the permanent optical renderer now owns geometry.
==================================================*/
function updateProjection() {
  window.OpticalProjection?.refreshGeometry?.();
}

function applyPartProjection() {
  /* Intentionally empty: visible depth is supplied by OpticalProjection. */
}
