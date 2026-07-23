(() => {
  "use strict";

  if (typeof WebSocket === "undefined") return;

  const previousSend = WebSocket.prototype.send;
  const observed = new WeakSet();
  const sockets = new Set();
  const socketState = new WeakMap();
  const INPUT_MIN_INTERVAL_MS = 45;
  const INPUT_KEEPALIVE_MS = 220;
  const STREAM_STALL_MS = 3600;
  const WATCHDOG_INTERVAL_MS = 900;
  const APP_PING_INTERVAL_MS = 5000;
  const CLIENT_BACKPRESSURE_BYTES = 24 * 1024;

  function parseMessage(data) {
    if (typeof data !== "string") return null;
    try { return JSON.parse(data); } catch { return null; }
  }

  function statusFor(socket) {
    let status = socketState.get(socket);
    if (!status) {
      status = {
        phase: "lobby",
        lastStateAt: performance.now(),
        lastPongAt: performance.now(),
        lastPingAt: 0,
        lastInputAt: 0,
        lastInputSignature: "",
        lastShoot: false,
        lastDash: false,
        reconnectTriggered: false
      };
      socketState.set(socket, status);
    }
    return status;
  }

  function announce(text) {
    const banner = document.getElementById("eventBanner");
    if (!banner) return;
    banner.textContent = text;
    banner.classList.add("visible");
    setTimeout(() => banner.classList.remove("visible"), 2200);
  }

  function observe(socket) {
    if (!socket || observed.has(socket)) return;
    observed.add(socket);
    sockets.add(socket);
    const status = statusFor(socket);

    socket.addEventListener("message", (event) => {
      const message = parseMessage(event.data);
      if (!message) return;
      if (message.type === "state") {
        status.lastStateAt = performance.now();
        status.phase = message.phase || status.phase;
        status.reconnectTriggered = false;
      } else if (message.type === "lobby") {
        status.phase = message.phase || status.phase;
        status.lastStateAt = performance.now();
      } else if (message.type === "countdown") {
        status.phase = "countdown";
        status.lastStateAt = performance.now();
      } else if (message.type === "match_ended") {
        status.phase = "ended";
      } else if (message.type === "pong") {
        status.lastPongAt = performance.now();
      } else if (message.type === "joined" || message.type === "controller_joined") {
        status.lastStateAt = performance.now();
      }
    });

    socket.addEventListener("open", () => {
      status.lastStateAt = performance.now();
      status.lastPongAt = performance.now();
      status.reconnectTriggered = false;
    });

    socket.addEventListener("close", () => sockets.delete(socket), { once: true });
  }

  function inputSignature(message) {
    const dx = Math.round((Number(message.dx) || 0) * 1000) / 1000;
    const dy = Math.round((Number(message.dy) || 0) * 1000) / 1000;
    const angle = Math.round((Number(message.angle) || 0) * 1000) / 1000;
    return `${dx}|${dy}|${angle}|${Boolean(message.shoot)}|${Boolean(message.dash)}`;
  }

  WebSocket.prototype.send = function stableRealtimeSend(payload) {
    if (typeof payload !== "string") return previousSend.call(this, payload);

    let message;
    try { message = JSON.parse(payload); } catch { return previousSend.call(this, payload); }
    const type = String(message.type || "");
    if ([
      "register_student",
      "reconnect_student",
      "create_control_room",
      "restore_control",
      "input",
      "set_ready",
      "select_team",
      "start_match",
      "ping"
    ].includes(type)) observe(this);

    if (type !== "input") return previousSend.call(this, payload);

    const status = statusFor(this);
    const now = performance.now();
    const shoot = Boolean(message.shoot);
    const dash = Boolean(message.dash);
    const urgent = shoot !== status.lastShoot || dash !== status.lastDash;
    const signature = inputSignature(message);
    const elapsed = now - status.lastInputAt;

    if (!urgent && this.bufferedAmount > CLIENT_BACKPRESSURE_BYTES) return undefined;
    if (!urgent && elapsed < INPUT_MIN_INTERVAL_MS) return undefined;
    if (!urgent && signature === status.lastInputSignature && elapsed < INPUT_KEEPALIVE_MS) return undefined;

    status.lastInputAt = now;
    status.lastInputSignature = signature;
    status.lastShoot = shoot;
    status.lastDash = dash;
    return previousSend.call(this, payload);
  };

  function checkSocket(socket, now) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const status = statusFor(socket);

    if (now - status.lastPingAt >= APP_PING_INTERVAL_MS) {
      status.lastPingAt = now;
      try { previousSend.call(socket, JSON.stringify({ type: "ping", clientTime: Date.now(), v11: true })); } catch {}
    }

    const activePhase = status.phase === "playing" || status.phase === "countdown";
    if (!activePhase || document.hidden || status.reconnectTriggered) return;
    if (now - status.lastStateAt <= STREAM_STALL_MS) return;

    status.reconnectTriggered = true;
    announce("Realtime stream stalled · reconnecting automatically…");
    const badge = document.getElementById("connectionBadge");
    if (badge) {
      badge.className = "connection-badge connecting";
      badge.textContent = "RECONNECTING";
    }
    try { socket.close(4000, "Realtime stream stalled"); } catch {}
  }

  setInterval(() => {
    const now = performance.now();
    for (const socket of [...sockets]) {
      if (socket.readyState === WebSocket.CLOSED) sockets.delete(socket);
      else checkSocket(socket, now);
    }
  }, WATCHDOG_INTERVAL_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    const now = performance.now();
    for (const socket of sockets) checkSocket(socket, now);
  });

  window.__triadNetworkV11 = Object.freeze({
    version: 11,
    inputRateLimitHz: Math.round(1000 / INPUT_MIN_INTERVAL_MS),
    streamStallMs: STREAM_STALL_MS,
    appPingIntervalMs: APP_PING_INTERVAL_MS
  });
})();
