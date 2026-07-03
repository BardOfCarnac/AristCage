function activatePresence() {
  document.querySelectorAll(".entry").forEach((entry, index) => {
    entry.classList.remove("present");

    setTimeout(() => {
      entry.classList.add("present");
    }, 3000);
  });
}
