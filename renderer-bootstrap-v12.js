(() => {
  "use strict";

  if (typeof HTMLCanvasElement === "undefined") return;

  const nativeGetContext = HTMLCanvasElement.prototype.getContext;
  const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
  const suppressedContexts = new WeakMap();
  const LEGACY_FRAME_INTERVAL_MS = 200;
  const PC_LABEL_KEY = "triadPcLabel";
  const LABEL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let captureLegacyRenderer = true;
  let legacyRendererCallback = null;
  let lastLegacyFrameAt = 0;

  function createAutomaticPcLabel() {
    const bytes = new Uint8Array(6);
    if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
    else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    const suffix = [...bytes].map((value) => LABEL_ALPHABET[value % LABEL_ALPHABET.length]).join("");
    return `Player-${suffix}`;
  }

  function ensurePlayerIdentity(forceNew = false) {
    let label = "";
    try { label = String(localStorage.getItem(PC_LABEL_KEY) || "").trim(); } catch {}
    if (forceNew || !label || /^assigned automatically$/i.test(label)) label = createAutomaticPcLabel();
    try { localStorage.setItem(PC_LABEL_KEY, label); } catch {}

    const input = document.getElementById("pcLabelInput");
    if (input) {
      input.value = label;
      input.readOnly = true;
      input.setAttribute("aria-readonly", "true");
      input.title = "A unique player title was generated for this browser.";
    }
    return label;
  }

  function makeGradientStub() {
    return { addColorStop() {} };
  }

  function makeNoopContext(canvas) {
    const target = {
      canvas,
      measureText(text) { return { width: String(text || "").length * 8 }; },
      createLinearGradient: makeGradientStub,
      createRadialGradient: makeGradientStub,
      createPattern() { return null; },
      getImageData() { return { data: new Uint8ClampedArray(0), width: 0, height: 0 }; },
      isPointInPath() { return false; },
      isPointInStroke() { return false; }
    };
    return new Proxy(target, {
      get(object, property) {
        if (property in object) return object[property];
        return () => undefined;
      },
      set(object, property, value) {
        object[property] = value;
        return true;
      }
    });
  }

  function scheduleLegacyFrame(callback) {
    const tick = (frameAt) => {
      if (document.hidden || frameAt - lastLegacyFrameAt < LEGACY_FRAME_INTERVAL_MS) {
        nativeRequestAnimationFrame(tick);
        return;
      }
      lastLegacyFrameAt = frameAt;
      callback(frameAt);
    };
    return nativeRequestAnimationFrame(tick);
  }

  window.requestAnimationFrame = function triadV14RequestAnimationFrame(callback) {
    if (captureLegacyRenderer && !legacyRendererCallback) legacyRendererCallback = callback;
    if (callback === legacyRendererCallback) return scheduleLegacyFrame(callback);
    return nativeRequestAnimationFrame(callback);
  };

  window.__triadFinishLegacyCapture = () => {
    captureLegacyRenderer = false;
  };

  window.__triadEnsurePlayerIdentity = ensurePlayerIdentity;
  ensurePlayerIdentity();

  HTMLCanvasElement.prototype.getContext = function triadV14GetContext(type, ...args) {
    if (this.id === "gameCanvas" && type === "2d") {
      let context = suppressedContexts.get(this);
      if (!context) {
        context = makeNoopContext(this);
        suppressedContexts.set(this, context);
        this.dataset.legacyRendererSuppressed = "true";
      }
      return context;
    }
    return nativeGetContext.call(this, type, ...args);
  };

  window.__triadLegacyRendererSuppressed = true;
  window.__triadLegacyRendererFps = Math.round(1000 / LEGACY_FRAME_INTERVAL_MS);
})();
