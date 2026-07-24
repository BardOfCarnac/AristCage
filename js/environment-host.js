/*==================================================
  NCN ENVIRONMENT HOST

  A neutral terminal-owned layer. It contains no weather or application
  styling until an application profile explicitly enables a module.
==================================================*/

window.NCNEnvironmentHost = (() => {
  const ROOT_ID = "ncn-environment-system";
  let root = null;

  function ensure() {
    if (root?.isConnected) return root;
    root = document.getElementById(ROOT_ID) || document.createElement("div");
    root.id = ROOT_ID;
    root.className = "ncn-environment-system";
    root.setAttribute("aria-hidden", "true");
    if (!root.isConnected) document.body.append(root);
    return root;
  }

  return Object.freeze({
    ensure,
    root: () => ensure(),
    clear() {
      ensure().replaceChildren();
    }
  });
})();
