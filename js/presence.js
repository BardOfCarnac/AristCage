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

function dismiss(entries, callback) {

    entries.forEach(entry => {
        entry.classList.remove("present");
        entry.classList.add("leaving");
    });

    setTimeout(() => {

        if (callback) {
            callback();
        }

    }, 180);

}

/*==================================================
  INITIAL LOAD
==================================================*/

function activatePresence() {

    resolve(
        [...document.querySelectorAll(".entry")]
    );

}
