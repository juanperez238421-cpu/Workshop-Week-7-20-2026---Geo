(() => {
  "use strict";

  if (typeof WebSocket === "undefined") return;

  const previousSend = WebSocket.prototype.send;
  const observed = new WeakSet();
  const sockets = new Set();
  const socketState = new WeakMap();

  const INPUT_MIN_INTERVAL_MS = 45;
  const INPUT_KEEPALIVE_MS = 220;
  const CLIENT_BACKPRESSURE_BYTES = 16 * 1024;
  const APP_PING_INTERVAL_MS = 4000;
  const SOFT_STREAM_STALL_MS = 2800;
  const RESYNC_RETRY_MS = 2600;
  const HARD_STREAM_STALL_MS = 12000;
  const PONG_STALE_MS = 10000;
  const MAX_RESYNC_ATTEMPTS = 3;
  const WATCHDOG_INTERVAL_MS = 700;

  function parseMessage(data) {
    if (typeof data !== "string") return null;
    try { return JSON.parse(data); } catch { return null; }
  }

  function statusFor(socket) {
    let status = socketState.get(socket);
    if (!status) {
      const now = performance.now();
      status = {
        phase: "lobby",
        lastStateAt: now,
        lastPongAt: now,
        lastPingAt: 0,
        lastResyncAt: 0,
        resyncAttempts: 0,
        lastInputAt: 0,
        lastInputSignature: "",
        lastShoot: false,
        lastDash: false,
        reconnectTriggered: false,
        warningShown: false
      };
      socketState.set(socket, status);
    }
    return status;
  }

  function announce(text, duration = 2300) {
    const banner = document.getElementById("eventBanner");
    if (!banner) return;
    banner.textContent = text;
    banner.classList.add("visible");
    setTimeout(() => banner.classList.remove("visible"), duration);
  }

  function updateBadge(mode, text) {
    const badge = document.getElementById("connectionBadge");
    if (!badge) return;
    badge.className = `connection-badge ${mode}`;
    badge.textContent = text;
  }

  function sendDirect(socket, payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    try {
      previousSend.call(socket, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  function observe(socket) {
    if (!socket || observed.has(socket)) return;
    observed.add(socket);
    sockets.add(socket);
    const status = statusFor(socket);

    socket.addEventListener("message", (event) => {
      const message = parseMessage(event.data);
      if (!message) return;
      const now = performance.now();
      if (message.type === "state") {
        status.lastStateAt = now;
        status.phase = message.phase || status.phase;
        status.resyncAttempts = 0;
        status.reconnectTriggered = false;
        status.warningShown = false;
        if (message.resync) announce("Realtime state synchronized.", 1400);
      } else if (message.type === "lobby") {
        status.phase = message.phase || status.phase;
        status.lastStateAt = now;
      } else if (message.type === "countdown") {
        status.phase = "countdown";
        status.lastStateAt = now;
      } else if (message.type === "match_ended") {
        status.phase = "ended";
      } else if (message.type === "pong") {
        status.lastPongAt = now;
      } else if (message.type === "joined" || message.type === "controller_joined") {
        status.lastStateAt = now;
        status.resyncAttempts = 0;
      }
    });

    socket.addEventListener("open", () => {
      const now = performance.now();
      status.lastStateAt = now;
      status.lastPongAt = now;
      status.lastPingAt = 0;
      status.lastResyncAt = 0;
      status.resyncAttempts = 0;
      status.reconnectTriggered = false;
      status.warningShown = false;
    });

    socket.addEventListener("close", () => sockets.delete(socket), { once: true });
  }

  function inputSignature(message) {
    const dx = Math.round((Number(message.dx) || 0) * 1000) / 1000;
    const dy = Math.round((Number(message.dy) || 0) * 1000) / 1000;
    const angle = Math.round((Number(message.angle) || 0) * 1000) / 1000;
    return `${dx}|${dy}|${angle}|${Boolean(message.shoot)}|${Boolean(message.dash)}`;
  }

  WebSocket.prototype.send = function stableRealtimeSendV12(payload) {
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
      "request_state",
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

  function requestResync(socket, status, now, reason = "stream-delay") {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (now - status.lastResyncAt < RESYNC_RETRY_MS) return;
    status.lastResyncAt = now;
    status.resyncAttempts += 1;
    sendDirect(socket, { type: "request_state", reason, attempt: status.resyncAttempts, clientTime: Date.now() });
    if (!status.warningShown) {
      status.warningShown = true;
      updateBadge("connecting", "SYNCING");
      announce("Network delay detected · requesting a full state without disconnecting…", 2600);
    }
  }

  function checkSocket(socket, now) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const status = statusFor(socket);

    if (now - status.lastPingAt >= APP_PING_INTERVAL_MS) {
      status.lastPingAt = now;
      sendDirect(socket, { type: "ping", clientTime: Date.now(), v12: true });
    }

    const activePhase = status.phase === "playing" || status.phase === "countdown";
    if (!activePhase || document.hidden || status.reconnectTriggered) return;

    const stateAge = now - status.lastStateAt;
    const pongAge = now - status.lastPongAt;
    if (stateAge >= SOFT_STREAM_STALL_MS && status.resyncAttempts < MAX_RESYNC_ATTEMPTS) {
      requestResync(socket, status, now);
    }

    if (stateAge < HARD_STREAM_STALL_MS) return;
    if (pongAge < PONG_STALE_MS && status.resyncAttempts < MAX_RESYNC_ATTEMPTS) return;

    status.reconnectTriggered = true;
    updateBadge("connecting", "RECONNECTING");
    announce("Server stream did not recover · restoring the player session…", 3200);
    try { socket.close(4000, "Realtime stream recovery exhausted"); } catch {}
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
    for (const socket of sockets) {
      const status = statusFor(socket);
      status.lastPongAt = now;
      if (status.phase === "playing" || status.phase === "countdown") requestResync(socket, status, now, "visibility-resume");
    }
  });

  window.__triadNetworkV12 = Object.freeze({
    version: 12,
    inputRateLimitHz: Math.round(1000 / INPUT_MIN_INTERVAL_MS),
    softStreamStallMs: SOFT_STREAM_STALL_MS,
    hardStreamStallMs: HARD_STREAM_STALL_MS,
    appPingIntervalMs: APP_PING_INTERVAL_MS,
    maxResyncAttempts: MAX_RESYNC_ATTEMPTS
  });
})();
