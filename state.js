/*==================================================
  APPLICATION STATE
==================================================*/

const NCN_STATE = {

    activePanel: null,

    expandedEntries: new Set()

};

/*==================================================
  HELPERS
==================================================*/

function isExpanded(id) {

    return NCN_STATE.expandedEntries.has(id);

}

function expandEntry(id) {

    NCN_STATE.expandedEntries.add(id);

}

function collapseEntry(id) {

    NCN_STATE.expandedEntries.delete(id);

}

function toggleEntry(id) {

    if (isExpanded(id)) {

        collapseEntry(id);

    } else {

        expandEntry(id);

    }

}

/*==================================================
  PANELS
==================================================*/

function togglePanel(name) {

    if (NCN_STATE.activePanel === name) {

        NCN_STATE.activePanel = null;

    } else {

        NCN_STATE.activePanel = name;

    }

}
