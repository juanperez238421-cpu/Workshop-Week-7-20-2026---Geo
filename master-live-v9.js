(() => {
  "use strict";

  const shell = document.getElementById("masterArenaShell");
  const baseCanvas = document.getElementById("masterGameCanvas");
  if (!shell || !baseCanvas) return;

  document.getElementById("masterSupplyCanvas")?.remove();

  const canvas = document.createElement("canvas");
  canvas.id = "masterRealtimeCanvas";
  canvas.setAttribute("aria-label", "Realtime teacher arena renderer");
  canvas.setAttribute("aria-hidden", "true");
  shell.appendChild(canvas);
  baseCanvas.style.opacity = "0";

  const meta = document.querySelector(".master-live-meta");
  if (meta && !document.getElementById("masterSupplyCount")) {
    const supplies = document.createElement("div");
    supplies.innerHTML = '<span>SUPPLIES</span><strong id="masterSupplyCount">0 BOXES</strong>';
    meta.appendChild(supplies);
  }
  if (meta && !document.getElementById("masterNetworkQuality")) {
    const network = document.createElement("div");
    network.id = "masterNetworkCard";
    network.dataset.quality = "waiting";
    network.innerHTML = '<span>REALTIME STREAM</span><strong id="masterNetworkQuality">WAITING</strong><small id="masterNetworkDetail">No server snapshots yet</small>';
    meta.appendChild(network);
  }

  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  const nativeSend = WebSocket.prototype.send;
  const observedSockets = new WeakSet();
  const visualPlayers = new Map();
  const visualProjectiles = new Map();
  const recentGaps = [];

  const view = {
    arena: { width: 9600, height: 6000, gridWidth: 40, gridHeight: 25 },
    hitboxes: { player: 30, projectile: 18, pickup: 60 },
    teamNames: ["Team 1", "Team 2", "Team 3"],
    teamColors: ["#1f77b4", "#d62728", "#2ca02c"],
    players: [],
    projectiles: [],
    pickups: [],
    territory: new Array(1000).fill(-1),
    territoryCounts: [0, 0, 0],
    remainingMs: 300000,
    phase: "lobby"
  };

  const pickupStyles = {
    ammo: { color: "#f79009", icon: "A" },
    shield: { color: "#2e90fa", icon: "S" },
    speed: { color: "#12b76a", icon: "V" },
    rapid: { color: "#f04438", icon: "R" },
    paint: { color: "#7f56d9", icon: "P" }
  };

  const CONTROL_TYPES = new Set([
    "create_control_room",
    "restore_control",
    "approve_registration",
    "reject_registration",
    "remove_player",
    "set_registration_lock",
    "set_player_ready",
    "fill_with_bots",
    "remove_bots",
    "start_match",
    "end_match",
    "reset_room",
    "ping"
  ]);

  let width = 320;
  let height = 220;
  let dpr = 1;
  let lastFrameAt = performance.now();
  let lastStateAt = 0;
  let averageInterval = 0;
  let lastSequence = 0;
  let roundTripMs = 0;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const smoothing = (rate, dt) => 1 - Math.exp(-rate * Math.max(0, dt));
  const lerpAngle = (from, to, amount) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * amount;

  function rgba(hex, alpha) {
    const clean = String(hex || "#000000").replace("#", "");
    const normalized = clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean;
    const value = Number.parseInt(normalized, 16) || 0;
    return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
  }

  function applyTerritory(message) {
    const expected = view.arena.gridWidth * view.arena.gridHeight;
    if (Array.isArray(message.territory) && message.territory.length === expected) {
      view.territory = message.territory.slice();
      return;
    }
    if (!Array.isArray(view.territory) || view.territory.length !== expected) view.territory = new Array(expected).fill(-1);
    if (!Array.isArray(message.territoryDelta)) return;
    for (let index = 0; index + 1 < message.territoryDelta.length; index += 2) {
      const cell = Number(message.territoryDelta[index]);
      const owner = Number(message.territoryDelta[index + 1]);
      if (Number.isInteger(cell) && cell >= 0 && cell < expected) view.territory[cell] = owner;
    }
  }

  function pruneRecentGaps(now = performance.now()) {
    while (recentGaps.length && now - recentGaps[0].at > 10000) recentGaps.shift();
    return recentGaps.reduce((sum, item) => sum + item.count, 0);
  }

  function observe(socket) {
    if (!socket || observedSockets.has(socket)) return;
    observedSockets.add(socket);
    socket.addEventListener("message", (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === "controller_joined" && message.arena) {
        view.arena = message.arena;
        view.territory = new Array(view.arena.gridWidth * view.arena.gridHeight).fill(-1);
      }
      if (message.type === "pong") {
        const clientTime = Number(message.clientTime);
        if (Number.isFinite(clientTime)) roundTripMs = Math.max(0, Date.now() - clientTime);
        return;
      }
      if (message.type === "lobby") {
        view.phase = message.phase || view.phase;
        view.teamNames = Array.isArray(message.teamNames) ? message.teamNames : view.teamNames;
        view.teamColors = Array.isArray(message.teamColors) ? message.teamColors : view.teamColors;
        return;
      }
      if (message.type !== "state") return;

      const now = performance.now();
      const interval = lastStateAt ? now - lastStateAt : 0;
      if (interval) averageInterval = averageInterval ? averageInterval * 0.84 + interval * 0.16 : interval;
      lastStateAt = now;
      const sequence = Number(message.sequence) || 0;
      if (sequence && lastSequence && sequence > lastSequence + 1) recentGaps.push({ at: now, count: sequence - lastSequence - 1 });
      if (sequence) lastSequence = sequence;

      const oldPlayers = new Map(view.players.map((player) => [player.id, player]));
      const oldProjectiles = new Map(view.projectiles.map((projectile) => [projectile.id, projectile]));
      const snapshotSeconds = clamp((interval || averageInterval || 50) / 1000, 0.02, 0.2);
      view.players = (Array.isArray(message.players) ? message.players : view.players).map((player) => {
        const previous = oldPlayers.get(player.id);
        return {
          ...player,
          vx: previous ? clamp((Number(player.x) - Number(previous.x)) / snapshotSeconds, -2200, 2200) : 0,
          vy: previous ? clamp((Number(player.y) - Number(previous.y)) / snapshotSeconds, -2200, 2200) : 0,
          receivedAt: now
        };
      });
      view.projectiles = Array.isArray(message.projectiles)
        ? message.projectiles.map((projectile) => ({ ...projectile, previous: oldProjectiles.get(projectile.id), receivedAt: now }))
        : view.projectiles;
      view.arena = message.arena || view.arena;
      view.hitboxes = message.hitboxes || view.hitboxes;
      view.teamNames = Array.isArray(message.teamNames) ? message.teamNames : view.teamNames;
      view.teamColors = Array.isArray(message.teamColors) ? message.teamColors : view.teamColors;
      view.pickups = Array.isArray(message.pickups) ? message.pickups : view.pickups;
      view.territoryCounts = Array.isArray(message.territoryCounts) ? message.territoryCounts : view.territoryCounts;
      view.remainingMs = Number(message.remainingMs) || 0;
      view.phase = message.phase || view.phase;
      applyTerritory(message);
      updateMeta();
    });
  }

  WebSocket.prototype.send = function masterRealtimeSend(payload) {
    if (typeof payload === "string") {
      try {
        const message = JSON.parse(payload);
        if (CONTROL_TYPES.has(message.type)) observe(this);
      } catch {}
    }
    return nativeSend.call(this, payload);
  };

  function updateMeta() {
    const supplyCount = document.getElementById("masterSupplyCount");
    const network = document.getElementById("masterNetworkQuality");
    const detail = document.getElementById("masterNetworkDetail");
    const networkCard = document.getElementById("masterNetworkCard");
    if (supplyCount) supplyCount.textContent = `${view.pickups.length} BOX${view.pickups.length === 1 ? "" : "ES"}`;
    if (!network || !networkCard) return;
    if (!averageInterval) {
      networkCard.dataset.quality = "waiting";
      network.textContent = "WAITING";
      if (detail) detail.textContent = "No server snapshots yet";
      return;
    }
    const recent = pruneRecentGaps();
    const quality = averageInterval <= 62 && recent <= 2 ? "excellent" : averageInterval <= 85 && recent <= 5 ? "good" : averageInterval <= 130 ? "fair" : "poor";
    networkCard.dataset.quality = quality;
    network.textContent = quality.toUpperCase();
    if (detail) {
      const rtt = roundTripMs ? ` · ${Math.round(roundTripMs)} ms RTT` : "";
      detail.textContent = `${Math.round(averageInterval)} ms stream${rtt} · ${recent} recent skip${recent === 1 ? "" : "s"}`;
    }
  }

  function resize() {
    const rect = shell.getBoundingClientRect();
    width = Math.max(320, rect.width);
    height = Math.max(220, rect.height);
    dpr = Math.min(devicePixelRatio || 1, 1.75);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function syncPlayers(dt, frameAt) {
    const ids = new Set();
    for (const target of view.players) {
      ids.add(target.id);
      const age = Math.min(0.12, Math.max(0, (frameAt - Number(target.receivedAt || frameAt)) / 1000));
      const predictedX = Number(target.x) + Number(target.vx || 0) * age;
      const predictedY = Number(target.y) + Number(target.vy || 0) * age;
      let visual = visualPlayers.get(target.id);
      if (!visual) {
        visual = { ...target, x: predictedX, y: predictedY };
        visualPlayers.set(target.id, visual);
      } else {
        const amount = smoothing(18, dt);
        visual.x += (predictedX - visual.x) * amount;
        visual.y += (predictedY - visual.y) * amount;
        visual.angle = lerpAngle(Number(visual.angle) || 0, Number(target.angle) || 0, amount);
        Object.assign(visual, target, { x: visual.x, y: visual.y, angle: visual.angle });
      }
    }
    for (const id of visualPlayers.keys()) if (!ids.has(id)) visualPlayers.delete(id);
  }

  function syncProjectiles(dt, frameAt) {
    const ids = new Set();
    for (const target of view.projectiles) {
      ids.add(target.id);
      const age = Math.min(0.12, Math.max(0, (frameAt - Number(target.receivedAt || frameAt)) / 1000));
      const predictedX = Number(target.x) + Number(target.vx || 0) * age;
      const predictedY = Number(target.y) + Number(target.vy || 0) * age;
      let visual = visualProjectiles.get(target.id);
      if (!visual) {
        visual = { ...target, x: predictedX, y: predictedY };
        visualProjectiles.set(target.id, visual);
      } else {
        const amount = smoothing(24, dt);
        visual.x += (predictedX - visual.x) * amount;
        visual.y += (predictedY - visual.y) * amount;
        Object.assign(visual, target, { x: visual.x, y: visual.y });
      }
    }
    for (const id of visualProjectiles.keys()) if (!ids.has(id)) visualProjectiles.delete(id);
  }

  function drawPickup(pickup, transform, frameAt) {
    const style = pickupStyles[pickup.type] || pickupStyles.ammo;
    const x = transform.offsetX + Number(pickup.x) * transform.scale;
    const y = transform.offsetY + Number(pickup.y) * transform.scale;
    const size = clamp((Number(pickup.radius) || view.hitboxes.pickup) * transform.scale, 7, 13)
      * (1 + Math.sin(frameAt / 180 + Number(pickup.x) * 0.01) * 0.06);
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = style.color;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-size, -size, size * 2, size * 2, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = `900 ${Math.max(7, size * 0.9)}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(style.icon, 0, 0.5);
    ctx.restore();
  }

  function drawProjectile(projectile, transform) {
    const x = transform.offsetX + Number(projectile.x) * transform.scale;
    const y = transform.offsetY + Number(projectile.y) * transform.scale;
    const color = view.teamColors[projectile.team] || "#101828";
    const speed = Math.hypot(Number(projectile.vx) || 0, Number(projectile.vy) || 0) || 1;
    const ux = (Number(projectile.vx) || 0) / speed;
    const uy = (Number(projectile.vy) || 0) / speed;
    const radius = clamp((Number(projectile.radius) || view.hitboxes.projectile) * transform.scale, 3.5, 7);
    ctx.strokeStyle = rgba(color, 0.62);
    ctx.lineWidth = Math.max(3, radius * 0.75);
    ctx.beginPath();
    ctx.moveTo(x - ux * radius * 3.6, y - uy * radius * 3.6);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, radius + 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlayer(player, transform) {
    const x = transform.offsetX + Number(player.x) * transform.scale;
    const y = transform.offsetY + Number(player.y) * transform.scale;
    const color = view.teamColors[player.team] || "#667085";
    const hitRadius = clamp((Number(view.hitboxes.player) || 30) * transform.scale, 7, 12);
    const size = clamp(hitRadius * 1.35, 10, 14);

    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = player.connected === false ? 0.38 : player.alive === false ? 0.2 : 1;
    ctx.strokeStyle = rgba(color, 0.25);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, hitRadius, 0, Math.PI * 2);
    ctx.stroke();

    if (player.alive === false) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.72, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      if (player.invulnerable) {
        ctx.strokeStyle = rgba(color, 0.58);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, size * 1.48, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.rotate(Number(player.angle) || 0);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(size * 1.45, 0);
      ctx.lineTo(-size, size * 0.92);
      ctx.lineTo(-size * 0.72, 0);
      ctx.lineTo(-size, -size * 0.92);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();

    const label = `${player.pcLabel || "Player"}${player.isBot ? " · AI" : ""}`;
    ctx.font = "800 9px system-ui";
    const textWidth = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.fillRect(x - textWidth / 2 - 4, y - size - 19, textWidth + 8, 14);
    ctx.fillStyle = "#101828";
    ctx.textAlign = "center";
    ctx.fillText(label, x, y - size - 8);

    ctx.font = "800 8px system-ui";
    ctx.fillStyle = color;
    ctx.fillText(`L${player.lives ?? 3} · A${player.ammo ?? 5}`, x, y + size + 13);
  }

  function draw(frameAt) {
    resize();
    const dt = Math.min(0.05, Math.max(0.001, (frameAt - lastFrameAt) / 1000));
    lastFrameAt = frameAt;
    syncPlayers(dt, frameAt);
    syncProjectiles(dt, frameAt);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#e8eef6";
    ctx.fillRect(0, 0, width, height);

    const padding = 18;
    const scale = Math.max(0.05, Math.min((width - padding * 2) / view.arena.width, (height - padding * 2) / view.arena.height));
    const arenaWidth = view.arena.width * scale;
    const arenaHeight = view.arena.height * scale;
    const transform = {
      scale,
      offsetX: (width - arenaWidth) / 2,
      offsetY: (height - arenaHeight) / 2
    };

    ctx.fillStyle = "#fbfcfe";
    ctx.fillRect(transform.offsetX, transform.offsetY, arenaWidth, arenaHeight);

    const cellW = view.arena.width / view.arena.gridWidth;
    const cellH = view.arena.height / view.arena.gridHeight;
    for (let gy = 0; gy < view.arena.gridHeight; gy += 1) {
      for (let gx = 0; gx < view.arena.gridWidth; gx += 1) {
        const owner = view.territory[gy * view.arena.gridWidth + gx];
        if (owner >= 0 && owner < 3) {
          ctx.fillStyle = rgba(view.teamColors[owner], 0.34);
          ctx.fillRect(
            transform.offsetX + gx * cellW * scale,
            transform.offsetY + gy * cellH * scale,
            cellW * scale + 0.5,
            cellH * scale + 0.5
          );
        }
      }
    }

    ctx.strokeStyle = "rgba(16,24,40,.08)";
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= view.arena.gridWidth; gx += 1) {
      const x = transform.offsetX + gx * cellW * scale;
      ctx.beginPath();
      ctx.moveTo(x, transform.offsetY);
      ctx.lineTo(x, transform.offsetY + arenaHeight);
      ctx.stroke();
    }
    for (let gy = 0; gy <= view.arena.gridHeight; gy += 1) {
      const y = transform.offsetY + gy * cellH * scale;
      ctx.beginPath();
      ctx.moveTo(transform.offsetX, y);
      ctx.lineTo(transform.offsetX + arenaWidth, y);
      ctx.stroke();
    }

    for (const pickup of view.pickups) drawPickup(pickup, transform, frameAt);
    for (const projectile of visualProjectiles.values()) drawProjectile(projectile, transform);
    for (const player of visualPlayers.values()) drawPlayer(player, transform);

    ctx.strokeStyle = "#98a2b3";
    ctx.lineWidth = 2;
    ctx.strokeRect(transform.offsetX, transform.offsetY, arenaWidth, arenaHeight);

    const seconds = Math.max(0, Math.ceil(view.remainingMs / 1000));
    const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    ctx.fillStyle = "rgba(255,255,255,.94)";
    ctx.strokeStyle = "#d0d5dd";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(transform.offsetX + 10, transform.offsetY + 10, 112, 34, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#101828";
    ctx.font = "900 14px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(`${view.phase.toUpperCase()} · ${time}`, transform.offsetX + 66, transform.offsetY + 32);

    requestAnimationFrame(draw);
  }

  addEventListener("resize", resize);
  updateMeta();
  requestAnimationFrame(draw);
})();