(() => {
  "use strict";

  if (typeof HTMLCanvasElement === "undefined") return;

  const nativeGetContext = HTMLCanvasElement.prototype.getContext;
  const suppressedContexts = new WeakMap();

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

  HTMLCanvasElement.prototype.getContext = function triadV12GetContext(type, ...args) {
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
})();
