(() => {
  "use strict";

  const BUILD = "20260723-fluid-clean25";
  const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
  const callbackState = new WeakMap();
  const hardwareThreads = Number(navigator.hardwareConcurrency) || 4;
  const deviceMemory = Number(navigator.deviceMemory) || 4;
  const nativeDpr = Number(window.devicePixelRatio) || 1;
  const maximumDpr = hardwareThreads <= 4 || deviceMemory <= 4 ? 1 : 1.25;
  let lowDetailUntil = 0;
  let longTaskObserver = null;

  try {
    const descriptor = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
    if (!descriptor || descriptor.configurable) {
      Object.defineProperty(window, "devicePixelRatio", {
        configurable: true,
        get: () => Math.min(nativeDpr, maximumDpr)
      });
    }
  } catch {}

  function lowDetailActive() {
    return performance.now() < lowDetailUntil;
  }

  function markLowDetail(durationMs = 8000) {
    lowDetailUntil = Math.max(lowDetailUntil, performance.now() + durationMs);
    document.body?.classList.add("triad-low-detail-v25");
  }

  function refreshDetailClass() {
    if (lowDetailActive()) return;
    document.body?.classList.remove("triad-low-detail-v25");
  }

  function targetFps(callbackName) {
    if (document.hidden) return 12;
    // student-app-v16 keeps the clock, question timer and minimap alive in its
    // callback named "frame". Its full arena canvas is virtual in v25, so five
    // support updates per second are enough and avoid a second high-rate world loop.
    if (callbackName === "frame") return 5;
    if (lowDetailActive()) return 38;
    if (hardwareThreads <= 4 || deviceMemory <= 4) return 45;
    return 52;
  }

  window.requestAnimationFrame = function triadFluidRequestAnimationFrame(callback) {
    if (typeof callback !== "function") return nativeRequestAnimationFrame(callback);
    const callbackName = callback.name || "";
    if (callbackName !== "drawFrame" && callbackName !== "frame") return nativeRequestAnimationFrame(callback);

    return nativeRequestAnimationFrame((timestamp) => {
      const current = callbackState.get(callback) || { lastRun: 0, averageFrame: 16.7 };
      const elapsed = current.lastRun ? timestamp - current.lastRun : 1000;
      const minimumInterval = 1000 / targetFps(callbackName);

      if (elapsed + 0.5 < minimumInterval) {
        callbackState.set(callback, current);
        window.requestAnimationFrame(callback);
        return;
      }

      if (current.lastRun) {
        current.averageFrame = current.averageFrame * 0.9 + elapsed * 0.1;
        if (callbackName === "drawFrame" && current.averageFrame > 29) markLowDetail(6500);
      }
      current.lastRun = timestamp;
      callbackState.set(callback, current);
      refreshDetailClass();
      callback(timestamp);
    });
  };

  if (typeof PerformanceObserver === "function") {
    try {
      longTaskObserver = new PerformanceObserver((list) => {
        if (list.getEntries().some((entry) => entry.duration >= 70)) markLowDetail(9000);
      });
      longTaskObserver.observe({ entryTypes: ["longtask"] });
    } catch {}
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshDetailClass();
  });

  document.documentElement.classList.add("triad-fluid-client-v25");

  window.__triadFluidClientV25 = Object.freeze({
    build: BUILD,
    adaptiveFramePacing: true,
    maximumDevicePixelRatio: maximumDpr,
    lowEndTargetFps: 45,
    normalTargetFps: 52,
    recoveryTargetFps: 38,
    hiddenTabTargetFps: 12,
    legacySupportLoopFps: 5,
    legacyRendererDisabledByBootstrap: true,
    opensAdditionalSocket: false,
    stop() {
      try { longTaskObserver?.disconnect(); } catch {}
    }
  });
})();
