(() => {
  "use strict";

  const original = document.getElementById("minimapCanvas");
  if (!original) return;

  const canvas = document.createElement("canvas");
  canvas.id = "minimapCanvasV10";
  canvas.width = Number(original.width) || 260;
  canvas.height = Number(original.height) || 170;
  canvas.setAttribute("aria-label", "Stable authoritative arena minimap");
  original.replaceWith(canvas);

  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  const buffer = document.createElement("canvas");
  buffer.width = canvas.width;
  buffer.height = canvas.height;
  const bufferCtx = buffer.getContext("2d", { alpha: false });
  const nativeSend = WebSocket.prototype.send;
  const observedSockets = new WeakSet();

  const view = {
    playerId: "",
    arena: { width: 12800, height: 8000, gridWidth: 40, gridHeight: 25 },
    teamColors: ["#1f77b4", "#d62728", "#2ca02c"],
    players: [],
    pickups: [],
    territory: new Array(1000).fill(-1),
    hasSnapshot: false
  };

  let lastDrawAt = 0;

  function rgba(hex, alpha) {
    const clean = String(hex || "#000000").replace("#", "");
    const normalized = clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean;
    const value = Number.parseInt(normalized, 16) || 0;
    return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
  }

  function resetTerritory() {
    const expected = view.arena.gridWidth * view.arena.gridHeight;
    view.territory = new Array(expected).fill(-1);
  }

  function applyTerritory(message) {
    const expected = view.arena.gridWidth * view.arena.gridHeight;
    if (Array.isArray(message.territory) && message.territory.length === expected) {
      view.territory = message.territory.slice();
      return;
    }
    if (!Array.isArray(view.territory) || view.territory.length !== expected) resetTerritory();
    if (!Array.isArray(message.territoryDelta)) return;
    for (let index = 0; index + 1 < message.territoryDelta.length; index += 2) {
      const cell = Number(message.territoryDelta[index]);
      const owner = Number(message.territoryDelta[index + 1]);
      if (Number.isInteger(cell) && cell >= 0 && cell < expected) view.territory[cell] = owner;
    }
  }

  function handleMessage(message) {
    if (!message || typeof message !== "object") return;
    if (message.type === "joined") {
      view.playerId = String(message.playerId || "");
      if (message.arena) {
        view.arena = message.arena;
        resetTerritory();
      }
      return;
    }
    if (message.type === "lobby") {
      if (Array.isArray(message.teamColors)) view.teamColors = message.teamColors;
      return;
    }
    if (message.type !== "state") return;
    if (message.arena) {
      const changed = message.arena.width !== view.arena.width || message.arena.height !== view.arena.height;
      view.arena = message.arena;
      if (changed) resetTerritory();
    }
    if (Array.isArray(message.teamColors)) view.teamColors = message.teamColors;
    view.players = Array.isArray(message.players) ? message.players : view.players;
    view.pickups = Array.isArray(message.pickups) ? message.pickups : view.pickups;
    applyTerritory(message);
    view.hasSnapshot = true;
  }

  function observe(socket) {
    if (!socket || observedSockets.has(socket)) return;
    observedSockets.add(socket);
    socket.addEventListener("message", (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      handleMessage(message);
    });
  }

  WebSocket.prototype.send = function minimapV10Send(payload) {
    if (typeof payload === "string") {
      try {
        const message = JSON.parse(payload);
        if (["register_student", "reconnect_student", "input", "set_ready", "select_team", "ping"].includes(message.type)) observe(this);
      } catch {}
    }
    return nativeSend.call(this, payload);
  };

  function drawPickupIcon(target, pickup, x, y, size) {
    const assets = window.__triadPickupAssets?.images;
    const image = assets?.[pickup.type];
    if (image?.complete && image.naturalWidth) {
      target.drawImage(image, x - size / 2, y - size / 2, size, size);
      return;
    }
    const colors = { ammo: "#f79009", shield: "#2e90fa", speed: "#12b76a", rapid: "#f04438", paint: "#7f56d9" };
    target.fillStyle = colors[pickup.type] || "#667085";
    target.fillRect(x - size / 2, y - size / 2, size, size);
  }

  function renderStableFrame() {
    const w = buffer.width;
    const h = buffer.height;
    const pad = 5;
    const mapW = w - pad * 2;
    const mapH = h - pad * 2;
    const sx = mapW / view.arena.width;
    const sy = mapH / view.arena.height;
    const cellW = view.arena.width / view.arena.gridWidth;
    const cellH = view.arena.height / view.arena.gridHeight;

    bufferCtx.fillStyle = "#e8eef6";
    bufferCtx.fillRect(0, 0, w, h);
    bufferCtx.fillStyle = "#fbfcfe";
    bufferCtx.fillRect(pad, pad, mapW, mapH);

    for (let gy = 0; gy < view.arena.gridHeight; gy += 1) {
      for (let gx = 0; gx < view.arena.gridWidth; gx += 1) {
        const owner = view.territory[gy * view.arena.gridWidth + gx];
        if (owner < 0 || owner > 2) continue;
        bufferCtx.fillStyle = rgba(view.teamColors[owner], 0.42);
        bufferCtx.fillRect(
          pad + gx * cellW * sx,
          pad + gy * cellH * sy,
          cellW * sx + 0.7,
          cellH * sy + 0.7
        );
      }
    }

    bufferCtx.strokeStyle = "rgba(16,24,40,.08)";
    bufferCtx.lineWidth = 0.7;
    for (let gx = 0; gx <= view.arena.gridWidth; gx += 5) {
      const x = pad + gx * cellW * sx;
      bufferCtx.beginPath();
      bufferCtx.moveTo(x, pad);
      bufferCtx.lineTo(x, pad + mapH);
      bufferCtx.stroke();
    }
    for (let gy = 0; gy <= view.arena.gridHeight; gy += 5) {
      const y = pad + gy * cellH * sy;
      bufferCtx.beginPath();
      bufferCtx.moveTo(pad, y);
      bufferCtx.lineTo(pad + mapW, y);
      bufferCtx.stroke();
    }

    for (const pickup of view.pickups) {
      const x = pad + Number(pickup.x) * sx;
      const y = pad + Number(pickup.y) * sy;
      drawPickupIcon(bufferCtx, pickup, x, y, 10);
    }

    for (const player of view.players) {
      if (!Number.isFinite(player.x) || !Number.isFinite(player.y)) continue;
      const x = pad + player.x * sx;
      const y = pad + player.y * sy;
      const mine = player.id === view.playerId;
      bufferCtx.fillStyle = player.alive === false ? "#98a2b3" : view.teamColors[player.team] || "#667085";
      bufferCtx.beginPath();
      bufferCtx.arc(x, y, mine ? 5.3 : 3.4, 0, Math.PI * 2);
      bufferCtx.fill();
      if (mine) {
        bufferCtx.strokeStyle = "#101828";
        bufferCtx.lineWidth = 2;
        bufferCtx.stroke();
        const viewportW = Math.min(3850, view.arena.width) * sx;
        const viewportH = Math.min(2400, view.arena.height) * sy;
        bufferCtx.strokeStyle = "rgba(16,24,40,.5)";
        bufferCtx.lineWidth = 1;
        bufferCtx.strokeRect(x - viewportW / 2, y - viewportH / 2, viewportW, viewportH);
      }
    }

    bufferCtx.strokeStyle = "#667085";
    bufferCtx.lineWidth = 1.5;
    bufferCtx.strokeRect(pad, pad, mapW, mapH);

    if (!view.hasSnapshot) {
      bufferCtx.fillStyle = "rgba(255,255,255,.82)";
      bufferCtx.fillRect(pad, pad, mapW, mapH);
      bufferCtx.fillStyle = "#475467";
      bufferCtx.font = "800 12px system-ui";
      bufferCtx.textAlign = "center";
      bufferCtx.fillText("WAITING FOR LIVE MAP", w / 2, h / 2);
    }

    ctx.drawImage(buffer, 0, 0);
  }

  function draw(frameAt) {
    if (frameAt - lastDrawAt >= 33) {
      lastDrawAt = frameAt;
      renderStableFrame();
    }
    requestAnimationFrame(draw);
  }

  requestAnimationFrame(draw);
  window.__triadMinimapV10 = Object.freeze({ version: 10, view });
})();
