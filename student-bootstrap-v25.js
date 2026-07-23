(() => {
  "use strict";

  const BUILD = "20260723-fluid-clean25";
  const WRITABLE_INPUT_IDS = ["roomCodeInput", "student1Input", "student2Input", "student3Input"];

  function setLobbyStatus(message, kind = "neutral") {
    const status = document.getElementById("lobbyStatus");
    if (!status) return;
    status.textContent = message;
    status.dataset.kind = kind;
  }

  function keepRegistrationInteractive() {
    document.body?.classList.add("lobby-active");
    document.getElementById("lobbyOverlay")?.classList.add("visible");

    const form = document.getElementById("registrationForm");
    if (form) {
      form.hidden = false;
      form.removeAttribute("inert");
      form.style.pointerEvents = "auto";
    }

    for (const id of WRITABLE_INPUT_IDS) {
      const input = document.getElementById(id);
      if (!input) continue;
      input.disabled = false;
      input.readOnly = false;
      input.removeAttribute("aria-disabled");
      input.removeAttribute("inert");
      input.tabIndex = 0;
      input.style.pointerEvents = "auto";
    }

    const registerButton = document.getElementById("registerButton");
    if (registerButton && !/CONNECTING|REGISTRATION SENT/.test(registerButton.textContent || "")) {
      registerButton.disabled = false;
      registerButton.removeAttribute("aria-disabled");
      registerButton.removeAttribute("inert");
      registerButton.tabIndex = 0;
      registerButton.style.pointerEvents = "auto";
    }
  }

  function installLazy2dContext(canvas, mayAllocate) {
    if (!canvas || canvas.dataset.lazyContextV25 === "true") return;
    canvas.dataset.lazyContextV25 = "true";

    const nativeGetContext = canvas.getContext.bind(canvas);
    let proxy = null;
    let realContext = null;
    const pendingProperties = new Map();

    canvas.getContext = function lazyGetContext(type, options) {
      if (type !== "2d") return nativeGetContext(type, options);
      if (proxy) return proxy;

      const ensureRealContext = () => {
        if (realContext) return realContext;
        realContext = nativeGetContext(type, options);
        if (!realContext) return null;
        for (const [property, value] of pendingProperties) {
          try { realContext[property] = value; } catch {}
        }
        pendingProperties.clear();
        return realContext;
      };

      proxy = new Proxy({}, {
        get(_target, property) {
          if (property === "canvas") return canvas;
          if (property === "__triadRealContext") return realContext;

          if (realContext) {
            const value = realContext[property];
            return typeof value === "function" ? value.bind(realContext) : value;
          }

          if (pendingProperties.has(property)) return pendingProperties.get(property);

          return (...args) => {
            if (!mayAllocate()) return undefined;
            const context = ensureRealContext();
            if (!context) return undefined;
            const value = context[property];
            return typeof value === "function" ? value.apply(context, args) : value;
          };
        },
        set(_target, property, value) {
          if (realContext) {
            realContext[property] = value;
            return true;
          }

          if (mayAllocate()) {
            const context = ensureRealContext();
            if (context) context[property] = value;
            else pendingProperties.set(property, value);
          } else {
            pendingProperties.set(property, value);
          }
          return true;
        }
      });

      return proxy;
    };
  }

  function installInputFirstCanvases() {
    const gameplayActive = () => !document.body?.classList.contains("lobby-active");
    const questionActive = () => document.getElementById("questionOverlay")?.classList.contains("visible") === true;

    // The recovered arena owns the full-size gameplay renderer. Keeping the legacy
    // gameCanvas context virtual prevents the hidden Student App renderer from
    // consuming another 25–30 frames per second on every classroom PC.
    installLazy2dContext(document.getElementById("gameCanvas"), () => false);
    installLazy2dContext(document.getElementById("minimapCanvas"), gameplayActive);
    installLazy2dContext(document.getElementById("questionCanvas"), questionActive);
  }

  function reportStartupFailure(reason) {
    keepRegistrationInteractive();
    setLobbyStatus(`Registration stayed available, but the game client reported: ${reason}`, "error");
  }

  keepRegistrationInteractive();
  installInputFirstCanvases();

  window.addEventListener("error", (event) => {
    const source = String(event.filename || "");
    if (!source.includes("student-app-v16.js")) return;
    reportStartupFailure(event.message || "student client startup error");
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (window.__triadStudentRecovery) return;
    const reason = event.reason?.message || String(event.reason || "student client startup rejection");
    reportStartupFailure(reason);
  });

  window.addEventListener("load", () => {
    keepRegistrationInteractive();

    if ("serviceWorker" in navigator) {
      const projectScope = new URL("./", location.href).href;
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(
          registrations
            .filter((registration) => registration.scope.startsWith(projectScope))
            .map((registration) => registration.unregister())
        ))
        .catch(() => {});
    }

    setTimeout(() => {
      if (!window.__triadStudentRecovery) reportStartupFailure("the main client did not finish initializing");
    }, 1500);
  }, { once: true });

  window.__triadInputBootstrap = Object.freeze({
    build: BUILD,
    mode: "registration-before-renderer",
    perCanvasLazyContext: true,
    legacyArenaRendererDisabled: true,
    minimapAndQuestionCanvasesPreserved: true
  });
})();
