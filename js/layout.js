function animateLayoutChange(changeFn, changedEntry) {
  const affected = [...document.querySelectorAll(".entry")]
    .filter(entry => entry !== changedEntry);

  affected.forEach(entry => entry.classList.add("leaving"));

  setTimeout(() => {
    changeFn();

    requestAnimationFrame(() => {
      affected.forEach(entry => {
        entry.classList.remove("leaving");
        entry.classList.remove("present");

        setTimeout(() => {
          entry.classList.add("present");
        }, 80);
      });

      updateProjection();
    });
  }, 220);
}
