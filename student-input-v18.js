(() => {
  "use strict";

  const BUILD = "20260723-input-spacefix18";
  const EDITABLE_SELECTOR = "input, textarea, select, [contenteditable='true']";

  function isEditable(element) {
    return element instanceof Element && Boolean(element.closest(EDITABLE_SELECTOR));
  }

  function isolateEditableKeyboard(event) {
    if (!isEditable(event.target)) return;
    // Keep gameplay's global WASD / Space / Shift handlers out of form fields.
    // Deliberately do not call preventDefault: spaces, accents, paste shortcuts,
    // arrows and normal text editing must continue to work in student names.
    event.stopPropagation();
  }

  function installOnEditable(element) {
    if (!(element instanceof Element) || element.dataset.triadKeyboardIsolated === "true") return;
    element.dataset.triadKeyboardIsolated = "true";
    element.addEventListener("keydown", isolateEditableKeyboard);
    element.addEventListener("keyup", isolateEditableKeyboard);
  }

  function installAll(root = document) {
    root.querySelectorAll?.(EDITABLE_SELECTOR).forEach(installOnEditable);
  }

  installAll();
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches(EDITABLE_SELECTOR)) installOnEditable(node);
        installAll(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.__triadInputV18 = Object.freeze({
    build: BUILD,
    fullNamesWithSpaces: true,
    gameplayKeysIsolatedFromForms: true
  });
})();
