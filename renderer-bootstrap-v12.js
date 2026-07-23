(() => {
  "use strict";

  if (typeof HTMLCanvasElement === "undefined") return;

  const nativeGetContext = HTMLCanvasElement.prototype.getContext;
  const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
  const suppressedContexts = new WeakMap();
  const LEGACY_FRAME_INTERVAL_MS = 200;

  let captureLegacyRenderer = true;
  let legacyRendererCallback = null;
  let lastLegacyFrameAt = 0;

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

  window.requestAnimationFrame = function triadV13RequestAnimationFrame(callback) {
    if (captureLegacyRenderer && !legacyRendererCallback) legacyRendererCallback = callback;
    if (callback === legacyRendererCallback) return scheduleLegacyFrame(callback);
    return nativeRequestAnimationFrame(callback);
  };

  window.__triadFinishLegacyCapture = () => {
    captureLegacyRenderer = false;
  };

  HTMLCanvasElement.prototype.getContext = function triadV13GetContext(type, ...args) {
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
