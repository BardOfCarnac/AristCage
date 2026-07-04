/*==================================================
  LAYOUT
==================================================*/

function animateLayoutChange(changeFn, changedEntry) {

    const affectedEntries =
        [...document.querySelectorAll(".entry")]
            .filter(entry => {

                if (entry === changedEntry) return false;

                return (
                    entry.getBoundingClientRect().top >
                    changedEntry.getBoundingClientRect().top
                );

            });

    dismiss(affectedEntries, () => {

        changeFn();

        requestAnimationFrame(() => {

            updateProjection();

            resolve(affectedEntries);

        });

    });

}
