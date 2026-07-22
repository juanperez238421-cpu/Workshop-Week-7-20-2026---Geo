(() => {
  "use strict";

  const baseCanvas = document.getElementById("gameCanvas");
  const app = document.getElementById("app");
  if (!baseCanvas || !app) return;

  const canvas = document.createElement("canvas");
  canvas.id = "fluidGameCanvas";
  canvas.setAttribute("aria-label", "Fluid predicted arena renderer with supply boxes");
  canvas.setAttribute("aria-hidden", "true");
  baseCanvas.insertAdjacentElement("afterend", canvas);

  const resourceHud = document.createElement("aside");
  resourceHud.id = "resourceHud";
  resourceHud.className = "resource-hud";
  resourceHud.innerHTML = `
    <div class="resource-card lives-card"><span>LIVES</span><strong id="lifeDisplay">♥ ♥ ♥</strong><small>Question after life 3</small></div>
    <div class="resource-card ammo-card"><span>AMMO</span><strong id="ammoDisplay">● ● ● ● ●</strong><small>Supply boxes refill ammunition</small></div>
    <div class="resource-card power-card"><span>POWER</span><strong id="powerDisplay">NONE</strong><small id="powerTimer">Collect a random box</small></div>
    <div class="resource-card network-card" data-quality="waiting"><span>NETWORK</span><strong id="networkDisplay">WAITING</strong><small id="networkDetail">No server snapshots yet</small></div>`;
  app.appendChild(resourceHud);

  const pickupLegend = document.createElement("div");
  pickupLegend.id = "pickupLegend";
  pickupLegend.className = "pickup-legend";
  pickupLegend.innerHTML = `
    <span><b data-type="ammo">A</b>Ammo</span>
    <span><b data-type="shield">S</b>Shield</span>
    <span><b data-type="speed">V</b>Speed</span>
    <span><b data-type="rapid">R</b>Rapid</span>
    <span><b data-type="paint">P</b>Paint</span>`;
  app.appendChild(pickupLegend);

  const pickupToast = document.createElement("div");
  pickupToast.id = "pickupToast";
  pickupToast.className = "pickup-toast";
  app.appendChild(pickupToast);

  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  const observedSockets = new WeakSet();
  const previousSend = WebSocket.prototype.send;
  const visualPlayers = new Map();
  const visualProjectiles = new Map();
  const pointer = { x: innerWidth * 0.68, y: innerHeight * 0.5, worldX: 0, worldY: 0 };
  const aim = { active: false, angle: 0, initialized: false };
  const input = { dx: 0, dy: 0, dash: false, shoot: false };

  let dpr = 1;
  let width = innerWidth;
  let height = innerHeight;
  let cameraX = 0;
  let cameraY = 0;
  let cameraReady = false;
  let lastFrameAt = performance.now();
  let lastStateAt = 0;
  let lastSequence = 0;
  let droppedSnapshots = 0;
  let averageInterval = 0;
  let predictedDashUntil = 0;
  let lastDashInput = false;
  let toastTimer = 0;

  const state = {
    playerId: "",
    phase: "lobby",
    arena: { width: 9600, height: 6000, gridWidth: 40, gridHeight: 25 },
    cohesionRadius: 760,
    maxLives: 3,
    maxAmmo: 5,
    teamNames: ["Team 1", "Team 2", "Team 3"],
    teamColors: ["#1f77b4", "#d62728", "#2ca02c"],
    players: [],
    projectiles: [],
    pickups: [],
    territory: [],
    territoryCounts: [0, 0, 0],
    remainingMs: 300000,
    serverNowOffset: 0
  };

  const pickupStyles = {
    ammo: { color: "#f79009", icon: "A", label: "AMMO +3" },
    shield: { color: "#2e90fa", icon: "S", label: "SHIELD" },
    speed: { color: "#12b76a", icon: "V", label: "SPEED" },
    rapid: { color: "#f04438", icon: "R", label: "RAPID FIRE" },
    paint: { color: "#7f56d9", icon: "P", label: "PAINT BOOST" }
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const smoothing = (rate, dt) => 1 - Math.exp(-rate * Math.max(0, dt));
  const lerpAngle = (from, to, amount) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * amount;

  function rgba(hex, alpha) {
    const clean = String(hex || "#000000").replace("#", "");
    const normalized = clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean;
    const value = Number.parseInt(normalized, 16) || 0;
    return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
  }

  function localTarget() {
    return state.players.find((player) => player.id === state.playerId) || null;
  }

  function localVisual() {
    return visualPlayers.get(state.playerId) || localTarget();
  }

  function neutralizeOldRenderer(targetCanvas) {
    if (!targetCanvas) return;
    try {
      const old = targetCanvas.getContext("2d");
      for (const method of ["clearRect", "fillRect", "strokeRect", "beginPath", "closePath", "moveTo", "lineTo", "arc", "fill", "stroke", "save", "restore", "translate", "rotate", "scale", "setTransform", "fillText", "strokeText", "setLineDash"]) {
        try { old[method] = () => {}; } catch {}
      }
      targetCanvas.style.opacity = "0";
    } catch {}
  }

  function resize() {
    width = innerWidth;
    height = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 1.75);
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function cameraTransform(dt) {
    const me = localVisual();
    const lookAhead = aim.active ? 520 : 300;
    const targetX = (me?.x ?? state.arena.width / 2) + Math.cos(aim.angle || Number(me?.angle) || 0) * lookAhead;
    const targetY = (me?.y ?? state.arena.height / 2) + Math.sin(aim.angle || Number(me?.angle) || 0) * lookAhead;

    if (!cameraReady) {
      cameraX = targetX;
      cameraY = targetY;
      cameraReady = true;
    } else {
      const amount = smoothing(7.5, dt);
      cameraX += (targetX - cameraX) * amount;
      cameraY += (targetY - cameraY) * amount;
    }

    const worldWidth = Math.min(3850, state.arena.width);
    const worldHeight = Math.min(2400, state.arena.height);
    const scale = Math.max(0.055, Math.min(width / worldWidth, height / worldHeight));
    const halfW = width / scale / 2;
    const halfH = height / scale / 2;
    cameraX = clamp(cameraX, halfW, Math.max(halfW, state.arena.width - halfW));
    cameraY = clamp(cameraY, halfH, Math.max(halfH, state.arena.height - halfH));

    return {
      scale,
      offsetX: width / 2 - cameraX * scale,
      offsetY: height / 2 - cameraY * scale,
      left: cameraX - halfW,
      right: cameraX + halfW,
      top: cameraY - halfH,
      bottom: cameraY + halfH
    };
  }

  function worldFromPointer(transform) {
    return {
      x: clamp((pointer.x - transform.offsetX) / transform.scale, 0, state.arena.width),
      y: clamp((pointer.y - transform.offsetY) / transform.scale, 0, state.arena.height)
    };
  }

  function updateAim(transform) {
    const me = localVisual();
    if (!me) return;
    const world = worldFromPointer(transform);
    pointer.worldX = world.x;
    pointer.worldY = world.y;
    aim.angle = Math.atan2(world.y - me.y, world.x - me.x);
    aim.initialized = true;
  }

  function observeSocket(socket) {
    if (!socket || observedSockets.has(socket)) return;
    observedSockets.add(socket);
    socket.addEventListener("message", (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      handleMessage(message);
    });
  }

  WebSocket.prototype.send = function fluidGameplaySend(payload) {
    let outgoing = payload;
    if (typeof payload === "string") {
      try {
        const message = JSON.parse(payload);
        if (["register_student", "reconnect_student", "input"].includes(message.type)) observeSocket(this);
        if (message.type === "input") {
          input.dx = clamp(Number(message.dx) || 0, -1, 1);
          input.dy = clamp(Number(message.dy) || 0, -1, 1);
          input.dash = Boolean(message.dash);
          input.shoot = Boolean(message.shoot);
          const me = localTarget();
          if (input.dash && !lastDashInput && me && Date.now() + state.serverNowOffset >= Number(me.dashReadyAt || 0)) predictedDashUntil = performance.now() + 220;
          lastDashInput = input.dash;
          if (aim.initialized) message.angle = aim.angle;
          outgoing = JSON.stringify(message);
        }
      } catch {}
    }
    return previousSend.call(this, outgoing);
  };

  function handleMessage(message) {
    if (!message || typeof message !== "object") return;
    if (message.type === "joined") {
      state.playerId = String(message.playerId || "");
      state.arena = message.arena || state.arena;
      cameraReady = false;
      aim.initialized = false;
      return;
    }
    if (message.type === "lobby") {
      state.phase = message.phase || state.phase;
      state.teamNames = Array.isArray(message.teamNames) ? message.teamNames : state.teamNames;
      state.teamColors = Array.isArray(message.teamColors) ? message.teamColors : state.teamColors;
      return;
    }
    if (message.type === "state") {
      const now = performance.now();
      if (lastStateAt) {
        const interval = now - lastStateAt;
        averageInterval = averageInterval ? averageInterval * 0.82 + interval * 0.18 : interval;
      }
      lastStateAt = now;
      const sequence = Number(message.sequence) || 0;
      if (sequence && lastSequence && sequence > lastSequence + 1) droppedSnapshots += sequence - lastSequence - 1;
      if (sequence) lastSequence = sequence;

      const oldProjectiles = new Map(state.projectiles.map((projectile) => [projectile.id, projectile]));
      state.phase = message.phase || state.phase;
      state.arena = message.arena || state.arena;
      state.cohesionRadius = Number(message.cohesionRadius) || state.cohesionRadius;
      state.maxLives = Number(message.maxLives) || state.maxLives;
      state.maxAmmo = Number(message.maxAmmo) || state.maxAmmo;
      state.teamNames = Array.isArray(message.teamNames) ? message.teamNames : state.teamNames;
      state.teamColors = Array.isArray(message.teamColors) ? message.teamColors : state.teamColors;
      state.players = Array.isArray(message.players) ? message.players : state.players;
      state.projectiles = Array.isArray(message.projectiles) ? message.projectiles.map((projectile) => ({ ...projectile, previous: oldProjectiles.get(projectile.id), receivedAt: now })) : state.projectiles;
      state.pickups = Array.isArray(message.pickups) ? message.pickups : state.pickups;
      state.territory = Array.isArray(message.territory) ? message.territory : state.territory;
      state.territoryCounts = Array.isArray(message.territoryCounts) ? message.territoryCounts : state.territoryCounts;
      state.remainingMs = Number(message.remainingMs) || 0;
      state.serverNowOffset = Number(message.serverNow) - Date.now();
      const me = localTarget();
      if (me && !aim.initialized) { aim.angle = Number(me.angle) || 0; aim.initialized = true; }
      updateHud();
      return;
    }
    if (message.type === "pickup_collected") {
      showPickupToast(message.label || message.pickupType || "POWER COLLECTED");
      return;
    }
    if (message.type === "life_lost") {
      showPickupToast(`${message.lives} LIFE${message.lives === 1 ? "" : "S"} REMAINING`, true);
    }
  }

  function updateHud() {
    const me = localTarget();
    const lives = clamp(Number(me?.lives ?? state.maxLives), 0, state.maxLives);
    const ammo = clamp(Number(me?.ammo ?? state.maxAmmo), 0, state.maxAmmo);
    document.getElementById("lifeDisplay").textContent = `${"♥ ".repeat(lives)}${"♡ ".repeat(Math.max(0, state.maxLives - lives))}`.trim();
    document.getElementById("ammoDisplay").textContent = `${"● ".repeat(ammo)}${"○ ".repeat(Math.max(0, state.maxAmmo - ammo))}`.trim();

    const power = String(me?.activePower || "");
    const powerInfo = pickupStyles[power];
    document.getElementById("powerDisplay").textContent = powerInfo?.label || "NONE";
    document.getElementById("powerTimer").textContent = powerInfo ? `${(Math.max(0, Number(me?.powerRemainingMs) || 0) / 1000).toFixed(1)} s remaining` : "Collect a random box";

    const networkCard = resourceHud.querySelector(".network-card");
    const display = document.getElementById("networkDisplay");
    const detail = document.getElementById("networkDetail");
    if (!averageInterval) {
      networkCard.dataset.quality = "waiting";
      display.textContent = "WAITING";
      detail.textContent = "No server snapshots yet";
      return;
    }
    const quality = averageInterval <= 92 ? "excellent" : averageInterval <= 125 ? "good" : averageInterval <= 180 ? "fair" : "poor";
    networkCard.dataset.quality = quality;
    display.textContent = quality.toUpperCase();
    detail.textContent = `${Math.round(averageInterval)} ms snapshots · ${droppedSnapshots} dropped`;
  }

  function showPickupToast(text, danger = false) {
    pickupToast.textContent = text;
    pickupToast.dataset.danger = String(danger);
    pickupToast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => pickupToast.classList.remove("visible"), 1800);
  }

  function syncPlayers(dt, frameAt) {
    const ids = new Set();
    for (const target of state.players) {
      ids.add(target.id);
      let visual = visualPlayers.get(target.id);
      if (!visual) {
        visual = { ...target };
        visualPlayers.set(target.id, visual);
        continue;
      }
      if (target.id === state.playerId && target.alive) {
        let dx = input.dx;
        let dy = input.dy;
        const magnitude = Math.hypot(dx, dy);
        if (magnitude > 1) { dx /= magnitude; dy /= magnitude; }
        const baseSpeed = target.activePower === "speed" ? 652 : 450;
        const speed = frameAt < predictedDashUntil ? 1320 : baseSpeed;
        visual.x = clamp(visual.x + dx * speed * dt, 16, state.arena.width - 16);
        visual.y = clamp(visual.y + dy * speed * dt, 16, state.arena.height - 16);
        const correction = smoothing(4.2, dt);
        visual.x += (Number(target.x) - visual.x) * correction;
        visual.y += (Number(target.y) - visual.y) * correction;
        visual.angle = lerpAngle(Number(visual.angle) || 0, aim.initialized ? aim.angle : Number(target.angle) || 0, smoothing(18, dt));
      } else {
        const amount = smoothing(14, dt);
        visual.x += (Number(target.x) - visual.x) * amount;
        visual.y += (Number(target.y) - visual.y) * amount;
        visual.angle = lerpAngle(Number(visual.angle) || 0, Number(target.angle) || 0, amount);
      }
      Object.assign(visual, target, { x: visual.x, y: visual.y, angle: visual.angle });
    }
    for (const id of visualPlayers.keys()) if (!ids.has(id)) visualPlayers.delete(id);
  }

  function syncProjectiles(dt, frameAt) {
    const ids = new Set();
    for (const target of state.projectiles) {
      ids.add(target.id);
      const age = Math.min(0.11, Math.max(0, (frameAt - target.receivedAt) / 1000));
      const predictedX = Number(target.x) + Number(target.vx || 0) * age;
      const predictedY = Number(target.y) + Number(target.vy || 0) * age;
      let visual = visualProjectiles.get(target.id);
      if (!visual) {
        visual = { ...target, x: predictedX, y: predictedY };
        visualProjectiles.set(target.id, visual);
      } else {
        const amount = smoothing(20, dt);
        visual.x += (predictedX - visual.x) * amount;
        visual.y += (predictedY - visual.y) * amount;
        Object.assign(visual, target, { x: visual.x, y: visual.y });
      }
    }
    for (const id of visualProjectiles.keys()) if (!ids.has(id)) visualProjectiles.delete(id);
  }

  function drawTerritory(t) {
    const cellW = state.arena.width / state.arena.gridWidth;
    const cellH = state.arena.height / state.arena.gridHeight;
    const minX = Math.max(0, Math.floor(t.left / cellW));
    const maxX = Math.min(state.arena.gridWidth - 1, Math.ceil(t.right / cellW));
    const minY = Math.max(0, Math.floor(t.top / cellH));
    const maxY = Math.min(state.arena.gridHeight - 1, Math.ceil(t.bottom / cellH));

    for (let gy = minY; gy <= maxY; gy += 1) {
      for (let gx = minX; gx <= maxX; gx += 1) {
        const owner = state.territory[gy * state.arena.gridWidth + gx];
        const x = t.offsetX + gx * cellW * t.scale;
        const y = t.offsetY + gy * cellH * t.scale;
        if (owner >= 0 && owner < 3) {
          ctx.fillStyle = rgba(state.teamColors[owner], 0.31);
          ctx.fillRect(x, y, cellW * t.scale + 1, cellH * t.scale + 1);
        }
      }
    }

    ctx.strokeStyle = "rgba(16,24,40,.07)";
    ctx.lineWidth = 1;
    for (let gx = minX; gx <= maxX + 1; gx += 1) {
      const x = t.offsetX + gx * cellW * t.scale;
      ctx.beginPath(); ctx.moveTo(x, Math.max(0, t.offsetY + minY * cellH * t.scale)); ctx.lineTo(x, Math.min(height, t.offsetY + (maxY + 1) * cellH * t.scale)); ctx.stroke();
    }
    for (let gy = minY; gy <= maxY + 1; gy += 1) {
      const y = t.offsetY + gy * cellH * t.scale;
      ctx.beginPath(); ctx.moveTo(Math.max(0, t.offsetX + minX * cellW * t.scale), y); ctx.lineTo(Math.min(width, t.offsetX + (maxX + 1) * cellW * t.scale), y); ctx.stroke();
    }
  }

  function drawPickup(pickup, t, frameAt) {
    const x = t.offsetX + pickup.x * t.scale;
    const y = t.offsetY + pickup.y * t.scale;
    if (x < -50 || x > width + 50 || y < -50 || y > height + 50) return;
    const style = pickupStyles[pickup.type] || pickupStyles.ammo;
    const pulse = 1 + Math.sin(frameAt / 180 + pickup.x * 0.01) * 0.08;
    const size = 18 * pulse;
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = style.color;
    ctx.shadowBlur = 16;
    ctx.fillStyle = rgba(style.color, 0.2);
    ctx.strokeStyle = style.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-size, -size, size * 2, size * 2, 6);
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = style.color;
    ctx.font = "900 15px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(style.icon, 0, 1);
    ctx.restore();
  }

  function drawProjectile(projectile, t) {
    const x = t.offsetX + projectile.x * t.scale;
    const y = t.offsetY + projectile.y * t.scale;
    if (x < -30 || x > width + 30 || y < -30 || y > height + 30) return;
    const color = state.teamColors[projectile.team] || "#101828";
    const velocityLength = Math.hypot(Number(projectile.vx) || 0, Number(projectile.vy) || 0) || 1;
    const ux = (Number(projectile.vx) || 0) / velocityLength;
    const uy = (Number(projectile.vy) || 0) / velocityLength;
    ctx.strokeStyle = rgba(color, 0.65);
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x - ux * 24, y - uy * 24); ctx.lineTo(x, y); ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.fill();
  }

  function drawPlayer(player, t) {
    const x = t.offsetX + player.x * t.scale;
    const y = t.offsetY + player.y * t.scale;
    if (x < -90 || x > width + 90 || y < -90 || y > height + 90) return;
    const mine = player.id === state.playerId;
    const size = mine ? 22 : 18;
    const color = state.teamColors[player.team] || "#667085";

    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = player.connected === false ? 0.35 : 1;
    if (player.activePower) {
      const powerColor = pickupStyles[player.activePower]?.color || color;
      ctx.strokeStyle = rgba(powerColor, 0.62);
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, size * 1.9, 0, Math.PI * 2); ctx.stroke();
    }
    if (mine) {
      ctx.fillStyle = rgba(color, 0.14);
      ctx.beginPath(); ctx.arc(0, 0, size * 2.5, 0, Math.PI * 2); ctx.fill();
    }
    if (!player.alive) {
      ctx.strokeStyle = "#667085"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-size, -size); ctx.lineTo(size, size); ctx.moveTo(size, -size); ctx.lineTo(-size, size); ctx.stroke();
    } else {
      if (player.invulnerable) {
        ctx.strokeStyle = rgba(color, 0.52); ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(0, 0, size * 1.5, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.rotate(Number(player.angle) || 0);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(size * 1.5, 0); ctx.lineTo(-size, size * 0.92); ctx.lineTo(-size * 0.72, 0); ctx.lineTo(-size, -size * 0.92); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = mine ? "#101828" : "#ffffff"; ctx.lineWidth = mine ? 5 : 3; ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = "#101828";
    ctx.font = mine ? "900 13px system-ui" : "800 11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(`${player.pcLabel || "Player"}${player.isBot ? " · AI" : ""}`, x, y - size - 10);
    if (mine) {
      ctx.fillStyle = color;
      ctx.font = "900 10px system-ui";
      ctx.fillText(`L${player.lives ?? 3} · A${player.ammo ?? 5} · ×${player.volleySize || 1}`, x, y + size + 20);
    }
  }

  function drawCohesion(t) {
    const me = localVisual();
    if (!me?.alive) return;
    const startX = t.offsetX + me.x * t.scale;
    const startY = t.offsetY + me.y * t.scale;
    for (const teammate of visualPlayers.values()) {
      if (teammate.id === me.id || teammate.team !== me.team || !teammate.alive) continue;
      const distance = Math.hypot(teammate.x - me.x, teammate.y - me.y);
      if (distance > state.cohesionRadius) continue;
      ctx.strokeStyle = rgba(state.teamColors[me.team], 0.55);
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 9]);
      ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(t.offsetX + teammate.x * t.scale, t.offsetY + teammate.y * t.scale); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = rgba(state.teamColors[me.team], 0.16);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(startX, startY, state.cohesionRadius * t.scale, 0, Math.PI * 2); ctx.stroke();
  }

  function drawAim(t) {
    const me = localVisual();
    if (!me?.alive) return;
    const startX = t.offsetX + me.x * t.scale;
    const startY = t.offsetY + me.y * t.scale;
    const distance = 2600;
    const endX = t.offsetX + (me.x + Math.cos(aim.angle) * distance) * t.scale;
    const endY = t.offsetY + (me.y + Math.sin(aim.angle) * distance) * t.scale;
    const color = state.teamColors[me.team] || "#1f77b4";
    ctx.strokeStyle = rgba(color, aim.active ? 0.85 : 0.38);
    ctx.lineWidth = aim.active ? 3 : 2;
    ctx.setLineDash(aim.active ? [] : [12, 10]);
    ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(endX, endY); ctx.stroke(); ctx.setLineDash([]);
  }

  function drawFrame(frameAt) {
    resize();
    const dt = Math.min(0.045, Math.max(0.001, (frameAt - lastFrameAt) / 1000));
    lastFrameAt = frameAt;
    syncPlayers(dt, frameAt);
    syncProjectiles(dt, frameAt);
    const t = cameraTransform(dt);
    if (aim.active) updateAim(t);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#e7edf5";
    ctx.fillRect(0, 0, width, height);
    const backdrop = ctx.createRadialGradient(width / 2, height / 2, 100, width / 2, height / 2, Math.max(width, height));
    backdrop.addColorStop(0, "rgba(255,255,255,.55)");
    backdrop.addColorStop(1, "rgba(148,163,184,.09)");
    ctx.fillStyle = backdrop; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#fbfcfe";
    ctx.fillRect(t.offsetX, t.offsetY, state.arena.width * t.scale, state.arena.height * t.scale);

    drawTerritory(t);
    for (const pickup of state.pickups) drawPickup(pickup, t, frameAt);
    drawCohesion(t);
    for (const projectile of visualProjectiles.values()) drawProjectile(projectile, t);
    for (const player of visualPlayers.values()) drawPlayer(player, t);
    drawAim(t);

    ctx.strokeStyle = "#98a2b3"; ctx.lineWidth = 3;
    ctx.strokeRect(t.offsetX, t.offsetY, state.arena.width * t.scale, state.arena.height * t.scale);
    requestAnimationFrame(drawFrame);
  }

  addEventListener("pointermove", (event) => { pointer.x = event.clientX; pointer.y = event.clientY; }, { passive: true });
  addEventListener("pointerdown", (event) => {
    if (event.target !== baseCanvas || state.phase !== "playing") return;
    if (event.button === 2) {
      aim.active = true;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      event.preventDefault();
    }
  }, true);
  addEventListener("pointerup", (event) => { if (event.button === 2) aim.active = false; }, true);
  addEventListener("blur", () => { aim.active = false; input.dx = 0; input.dy = 0; input.dash = false; });
  addEventListener("resize", resize);

  window.setTimeout(() => {
    neutralizeOldRenderer(baseCanvas);
    neutralizeOldRenderer(document.getElementById("enhancedGameCanvas"));
  }, 50);

  resize();
  updateHud();
  requestAnimationFrame(drawFrame);
})();
