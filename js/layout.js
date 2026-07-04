function animateLayoutChange(changeFn, changedEntry) {
  const affectedEntries = [...document.querySelectorAll(".entry")]
    .filter(entry => {
      return entry !== changedEntry &&
        entry.getBoundingClientRect().top > changedEntry.getBoundingClientRect().top;
    });

  affectedEntries.forEach(entry => {
    entry.classList.add("leaving");
    entry.classList.remove("present");
  });

  setTimeout(() => {
    changeFn();

    requestAnimationFrame(() => {
      updateProjection();

      affectedEntries.forEach((entry, index) => {
        setTimeout(() => {
          entry.classList.remove("leaving");
          entry.classList.add("present");
        }, 80 + index * 45);
      });
    });
  }, 160);
}
