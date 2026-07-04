/*==================================================
  PRESENCE
==================================================*/

function resolve(entries) {

    entries.forEach((entry, index) => {

        entry.classList.remove("leaving");

        setTimeout(() => {
            entry.classList.add("present");
        }, index * 60);

    });

}

function dismiss(entries, onComplete) {

    entries.forEach(entry => {

        entry.classList.remove("present");
        entry.classList.add("leaving");

    });

    const delay = 180;

    setTimeout(() => {

        if (typeof onComplete === "function") {
            onComplete();
        }

    }, delay);

}

/*==================================================
  INITIAL LOAD
==================================================*/

function activatePresence() {

    resolve(
        [...document.querySelectorAll(".entry")]
    );

}
