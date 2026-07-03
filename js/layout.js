function animateLayoutChange(changeFn) {
  const entries = [...document.querySelectorAll(".entry")];

  const first = new Map(
    entries.map(entry => [entry, entry.getBoundingClientRect()])
  );

  changeFn();

  requestAnimationFrame(() => {
    entries.forEach(entry => {
      const before = first.get(entry);
      const after = entry.getBoundingClientRect();

      if (!before) return;

      const deltaY = before.top - after.top;

      if (!deltaY) return;

      entry.animate(
        [
          { transform: `translateY(${deltaY}px)` },
          { transform: "translateY(0)" }
        ],
        {
          duration: 320,
          easing: "ease"
        }
      );
    });

    updateProjection();
  });
}
