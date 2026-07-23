(() => {
  "use strict";

  const BUILD = "20260723-hitscan-visual18";
  const observedSockets = new WeakSet();
  const nativeAddEventListener = WebSocket.prototype.addEventListener;
  const state = {
    phase: "lobby",
    arena: { width: 12800, height: 8000 },
    teamColors: ["#1f77b4", "#d62728", "#2ca02c"],
    players: [],
    tracers: [],
    localPlayerId: "",
    serverOffset: 0
  };

  let overlay = null;
  let ctx = null;

  function ensureOverlay() {
    if (overlay && ctx) return true;
    overlay = document.createElement("canvas");
    overlay.id = "combatFxCanvasV18";
    overlay.setAttribute("aria-hidden", "true");
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      pointerEvents: "none",
      zIndex: "3"
    });
    document.body.appendChild(overlay);
    ctx = overlay.getContext("2d");
    resize();
    return Boolean(ctx);
  }

  function parse(data) {
    if (typeof data !== "string") return null;
    try { return JSON.parse(data); } catch { return null; }
  }

  function observe(socket) {
    if (!socket || observedSockets.has(socket)) return;
    observedSockets.add(socket);
    nativeAddEventListener.call(socket, "message", (event) => {
      const message = parse(event.data);
      if (!message) return;
      if (message.type === "hello") state.serverOffset = Number(message.serverTime) - Date.now();
      if (message.type === "joined") state.localPlayerId = String(message.playerId || "");
      if (message.type === "countdown") state.phase = "countdown";
      if (message.type === "match_ended") state.phase = "ended";
      if (message.type !== "state") return;
      state.phase = message.phase || state.phase;
      if (message.arena) state.arena = message.arena;
      if (Array.isArray(message.teamColors)) state.teamColors = message.teamColors;
      if (Array.isArray(message.players)) state.players = message.players;
      if (Array.isArray(message.projectiles)) {
        state.tracers = message.projectiles.filter((projectile) => projectile.type === "tracer" || Number.isFinite(Number(projectile.startX)));
      }
      if (Number.isFinite(Number(message.serverNow))) state.serverOffset = Number(message.serverNow) - Date.now();
    });
  }

  WebSocket.prototype.addEventListener = function triadCombatObserver(type, listener, options) {
    if (type === "message") observe(this);
    return nativeAddEventListener.call(this, type, listener, options);
  };

  function resize() {
    if (!overlay || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    overlay.width = Math.round(width * dpr);
    overlay.height = Math.round(height * dpr);
    overlay.style.width = `${width}px`;
    overlay.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function camera() {
    const me = state.players.find((player) => player.id === state.localPlayerId) || state.players.find((player) => !player.isBot && player.connected) || null;
    const centerX = Number(me?.x) || Number(state.arena.width) / 2;
    const centerY = Number(me?.y) || Number(state.arena.height) / 2;
    const visibleWidth = Math.min(3850, Number(state.arena.width) || 12800);
    const visibleHeight = Math.min(2400, Number(state.arena.height) || 8000);
    const scale = Math.max(0.04, Math.min(innerWidth / visibleWidth, innerHeight / visibleHeight));
    const halfW = innerWidth / scale / 2;
    const halfH = innerHeight / scale / 2;
    const arenaWidth = Number(state.arena.width) || 12800;
    const arenaHeight = Number(state.arena.height) || 8000;
    const cameraX = arenaWidth <= halfW * 2 ? arenaWidth / 2 : Math.max(halfW, Math.min(arenaWidth - halfW, centerX));
    const cameraY = arenaHeight <= halfH * 2 ? arenaHeight / 2 : Math.max(halfH, Math.min(arenaHeight - halfH, centerY));
    return { scale, offsetX: innerWidth / 2 - cameraX * scale, offsetY: innerHeight / 2 - cameraY * scale };
  }

  function worldToScreen(x, y, transform) {
    return { x: Number(x) * transform.scale + transform.offsetX, y: Number(y) * transform.scale + transform.offsetY };
  }

  function rgba(hex, alpha) {
    const clean = String(hex || "#111827").replace("#", "");
    const normalized = clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean;
    const value = Number.parseInt(normalized, 16) || 0;
    return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
  }

  function drawTracer(projectile, now, transform) {
    const expiresAt = Number(projectile.expiresAt) || now;
    const spawnedAt = Number(projectile.spawnedAt) || expiresAt - 145;
    const life = Math.max(1, expiresAt - spawnedAt);
    const remaining = Math.max(0, Math.min(1, (expiresAt - now) / life));
    if (remaining <= 0) return;
    const start = worldToScreen(projectile.startX, projectile.startY, transform);
    const end = worldToScreen(projectile.endX, projectile.endY, transform);
    const teamColor = state.teamColors[Number(projectile.team)] || "#111827";

    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = `rgba(255,255,255,${0.84 * remaining})`;
    ctx.lineWidth = projectile.hit ? 5.5 : 4;
    ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
    ctx.strokeStyle = rgba(teamColor, 0.92 * remaining);
    ctx.lineWidth = projectile.hit ? 2.8 : 2;
    ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
    if (projectile.hit) {
      ctx.fillStyle = `rgba(255,255,255,${0.9 * remaining})`;
      ctx.beginPath(); ctx.arc(end.x, end.y, 7 + 5 * remaining, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(teamColor, remaining);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(end.x, end.y, 13 + 7 * (1 - remaining), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawMuzzle(player, now, transform) {
    const age = now - Number(player.lastShotAt || 0);
    if (age < 0 || age > 95 || player.alive === false) return;
    const alpha = 1 - age / 95;
    const angle = Number(player.angle) || 0;
    const x = Number(player.x) + Math.cos(angle) * 48;
    const y = Number(player.y) + Math.sin(angle) * 48;
    const point = worldToScreen(x, y, transform);
    const color = state.teamColors[Number(player.team)] || "#111827";
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(angle);
    ctx.fillStyle = `rgba(255,255,255,${0.95 * alpha})`;
    ctx.beginPath();
    ctx.moveTo(17, 0); ctx.lineTo(-4, 8); ctx.lineTo(2, 0); ctx.lineTo(-4, -8); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba(color, alpha);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function frame() {
    if (["countdown", "playing"].includes(state.phase) && ensureOverlay()) {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      const now = Date.now() + state.serverOffset;
      const transform = camera();
      state.tracers.forEach((projectile) => drawTracer(projectile, now, transform));
      state.players.forEach((player) => drawMuzzle(player, now, transform));
    } else if (ctx) {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
    }
    requestAnimationFrame(frame);
  }

  addEventListener("resize", resize, { passive: true });
  requestAnimationFrame(frame);

  window.__triadCombatV18 = Object.freeze({
    build: BUILD,
    model: "authoritative-semi-auto-hitscan",
    tracerOverlay: true
  });
})();
