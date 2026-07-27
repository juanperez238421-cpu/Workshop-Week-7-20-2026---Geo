(() => {
  "use strict";

  const query = new URLSearchParams(location.search);
  const desktopMode = location.protocol === "file:" && query.get("desktop") === "1";
  const requestedLocalServer = String(query.get("server") || "").trim();
  const trustedLoopbackServer = /^ws:\/\/(127\.0\.0\.1|localhost):\d+$/i.test(requestedLocalServer);

  window.TRIAD_CONFIG = Object.freeze({
    serverUrl: desktopMode && trustedLoopbackServer
      ? requestedLocalServer
      : "wss://triad-territory-rush-server.onrender.com",
    gameUrl: "https://juanperez238421-cpu.github.io/Workshop-Week-7-20-2026---Geo/",
    clientBuild: desktopMode ? "20260725-desktop-local27" : "20260725-fair-question-rotation27",
    desktopMode: desktopMode && trustedLoopbackServer
  });
})();
