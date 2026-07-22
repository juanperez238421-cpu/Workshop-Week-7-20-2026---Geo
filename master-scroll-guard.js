(() => {
  "use strict";

  const root = document.documentElement;
  const body = document.body;

  function forceDocumentScrolling() {
    root.style.setProperty("width", "100%", "important");
    root.style.setProperty("height", "auto", "important");
    root.style.setProperty("min-height", "100%", "important");
    root.style.setProperty("overflow-x", "hidden", "important");
    root.style.setProperty("overflow-y", "auto", "important");

    if (body.classList.contains("teacher-auth-locked")) {
      body.style.removeProperty("overflow-x");
      body.style.removeProperty("overflow-y");
      body.style.setProperty("overflow", "hidden", "important");
      return;
    }

    body.style.removeProperty("overflow");
    body.style.setProperty("width", "100%", "important");
    body.style.setProperty("height", "auto", "important");
    body.style.setProperty("min-height", "100vh", "important");
    body.style.setProperty("overflow-x", "hidden", "important");
    body.style.setProperty("overflow-y", "visible", "important");

    for (const element of [
      document.getElementById("teacherApp"),
      document.getElementById("controlPanel")
    ]) {
      if (!element) continue;
      element.style.setProperty("height", "auto", "important");
      element.style.setProperty("min-height", "0", "important");
      element.style.setProperty("max-height", "none", "important");
      element.style.setProperty("overflow", "visible", "important");
    }
  }

  function installRegistrationJump() {
    const jump = document.getElementById("pendingJumpButton");
    const inbox = document.getElementById("registrationInbox");
    if (!jump || !inbox || jump.dataset.scrollGuardBound === "true") return;

    jump.dataset.scrollGuardBound = "true";
    jump.addEventListener("click", (event) => {
      event.preventDefault();
      forceDocumentScrolling();
      window.requestAnimationFrame(() => {
        inbox.scrollIntoView({ behavior: "smooth", block: "start" });
        inbox.focus({ preventScroll: true });
      });
    });

    if (!inbox.hasAttribute("tabindex")) inbox.setAttribute("tabindex", "-1");
  }

  function refresh() {
    forceDocumentScrolling();
    installRegistrationJump();
  }

  const observer = new MutationObserver(refresh);
  observer.observe(body, {
    attributes: true,
    attributeFilter: ["class"],
    childList: true,
    subtree: true
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refresh, { once: true });
  } else {
    refresh();
  }

  window.addEventListener("load", refresh, { once: true });
  window.addEventListener("pageshow", refresh);
})();
