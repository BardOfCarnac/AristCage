function activatePresence() {
  document.querySelectorAll(".entry").forEach((entry, index) => {
    entry.classList.remove("present");

    requestAnimationFrame(() => {
      setTimeout(() => {
        entry.classList.add("present");
      }, index * 80);
    });
  });
}
