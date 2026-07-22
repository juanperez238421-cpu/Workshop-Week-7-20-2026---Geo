(() => {
  "use strict";

  const root = document.documentElement;
  const body = document.body;
  const app = document.getElementById("teacherApp");

  function applyMasterViewport() {
    root.style.setProperty("width", "100%", "important");
    root.style.setProperty("height", "100%", "important");
    root.style.setProperty("overflow", "hidden", "important");

    body.style.setProperty("width", "100%", "important");
    body.style.setProperty("height", "100%", "important");
    body.style.setProperty("overflow", "hidden", "important");

    if (!app || body.classList.contains("teacher-auth-locked")) return;

    app.style.setProperty("position", "fixed", "important");
    app.style.setProperty("inset", "0", "important");
    app.style.setProperty("width", "100%", "important");
    app.style.setProperty("height", "100dvh", "important");
    app.style.setProperty("min-height", "0", "important");
    app.style.setProperty("max-height", "100dvh", "important");
    app.style.setProperty("overflow-x", "hidden", "important");
    app.style.setProperty("overflow-y", "scroll", "important");
    app.style.setProperty("scrollbar-gutter", "stable", "important");

    for (const element of [
      document.getElementById("controlPanel"),
      document.getElementById("registrationInbox"),
      document.getElementById("pendingList"),
      document.getElementById("rosterList")
    ]) {
      if (!element) continue;
      element.style.setProperty("height", "auto", "important");
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
      applyMasterViewport();
      window.requestAnimationFrame(() => {
        inbox.scrollIntoView({ behavior: "smooth", block: "start" });
        inbox.focus({ preventScroll: true });
      });
    });
  }

  function refresh() {
    applyMasterViewport();
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
  window.addEventListener("resize", refresh);
})();
