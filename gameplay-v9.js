(() => {
  "use strict";

  const baseCanvas = document.getElementById("gameCanvas");
  const app = document.getElementById("app");
  if (!baseCanvas || !app) return;

  for (const id of ["enhancedGameCanvas", "fluidGameCanvas", "gameplayV8Canvas"]) {
    document.getElementById(id)?.remove();
  }

  const canvas = document.createElement("canvas");
  canvas.id = "gameplayV9Canvas";
  canvas.setAttribute("aria-label", "Realtime predicted arena renderer");
  canvas.setAttribute("aria-hidden", "true");
  baseCanvas.insertAdjacentElement("afterend", canvas);

  function ensureElement(id, tag, className, html) {
    const existing = document.getElementById(id);
    if (existing) return existing;
    const element = document.createElement(tag);
    element.id = id;
    element.className = className;
    element.innerHTML = html;
    app.appendChild(element);
    return element;
  }

  const resourceHud = ensureElement("resourceHud", "aside", "resource-hud", `
    <div class="resource-card lives-card"><span>LIVES</span><strong id="lifeDisplay">♥ ♥ ♥</strong><small>Question after life 3</small></div>
    <div class="resource-card ammo-card"><span>AMMO</span><strong id="ammoDisplay">● ● ● ● ●</strong><small id="ammoRegenTimer">Full · automatic +1 every 10 s</small></div>
    <div class="resource-card power-card"><span>POWER</span><strong id="powerDisplay">NONE</strong><small id="powerTimer">Collect a random box</small></div>
    <div class="resource-card network-card" data-quality="waiting"><span>REALTIME STREAM</span><strong id="networkDisplay">WAITING</strong><small id="networkDetail">No server snapshots yet</small></div>`);

  const rolePanel = ensureElement("threeStudentControlPanel", "aside", "three-student-control-panel", `
    <div class="control-role"><span>STUDENT 1</span><strong id="movementRoleName">Movement</strong><small>WASD / arrows + Shift</small></div>
    <div class="control-role"><span>STUDENT 2</span><strong id="aimRoleName">Aim</strong><small>Hold right click + move mouse</small></div>
    <div class="control-role"><span>STUDENT 3</span><strong id="shootRoleName">Shoot</strong><small>Spacebar only</small></div>
    <div id="cohesionBadge" class="cohesion-badge" data-level="1"><span>TEAM COHESION</span><strong>×1 SHOT</strong><small>Move near teammates for ×2 or ×3</small></div>`);

  const aimHud = ensureElement("aimHud", "div", "aim-hud", `
    <span class="aim-hud-icon">⌖</span>
    <div><strong id="aimHudTitle">AIM LOCKED</strong><small id="aimHudDetail">Hold right click and move the mouse</small></div>`);

  ensureElement("pickupLegend", "div", "pickup-legend", `
    <span><b data-type="ammo">A</b>Ammo</span>
    <span><b data-type="shield">S</b>Shield</span>
    <span><b data-type="speed">V</b>Speed</span>
    <span><b data-type="rapid">R</b>Rapid</span>
    <span><b data-type="paint">P</b>Paint</span>`);

  const pickupToast = ensureElement("pickupToast", "div", "pickup-toast", "");

  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  const nativeSend = WebSocket.prototype.send;
  const observedSockets = new WeakSet();
  const visualPlayers = new Map();
  const visualProjectiles = new Map();
  const explosions = [];
  const recentGaps = [];
  const pointer = { x: innerWidth * 0.7, y: innerHeight * 0.5, worldX: 0, worldY: 0 };
  const aim = { active: false, angle: 0, initialized: false };
  const input = { dx: 0, dy: 0, dash: false };
  const state = {
    playerId: "",
    phase: "lobby",
    arena: { width: 9600, height: 6000, gridWidth: 40, gridHeight: 25 },
    hitboxes: { player: 30, projectile: 18, pickup: 60 },
    cohesionRadius: 760,
    maxLives: 3,
    maxAmmo: 5,
    teamNames: ["Team 1", "Team 2", "Team 3"],
    teamColors: ["#1f77b4", "#d62728", "#2ca02c"],
    players: [],
    projectiles: [],
    pickups: [],
    territory: new Array(1000).fill(-1),
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

  let width = innerWidth;
  let height = innerHeight;
  let dpr = 1;
  let cameraX = 0;
  let cameraY = 0;
  let cameraReady = false;
  let cameraShake = 0;
  let localDeathFlash = 0;
  let lastFrameAt = performance.now();
  let lastStateAt = 0;
  let lastSequence = 0;
  let averageInterval = 0;
  let roundTripMs = 0;
  let predictedDashUntil = 0;
  let lastDashInput = false;
  let spacePressed = false;
  let toastTimer = 0;
  let lastTransform = null;

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

  function neutralizeBaseRenderer() {
    try {
      const old = baseCanvas.getContext("2d");
      for (const method of ["clearRect", "fillRect", "strokeRect", "beginPath", "closePath", "moveTo", "lineTo", "arc", "fill", "stroke", "save", "restore", "translate", "rotate", "scale", "setTransform", "fillText", "strokeText", "setLineDash"]) {
        try { old[method] = () => {}; } catch {}
      }
    } catch {}
    Object.assign(baseCanvas.style, {
      position: "fixed",
      inset: "0",
      width: "100%",
      height: "100%",
      opacity: "0",
      zIndex: "1",
      pointerEvents: "auto"
    });
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
    const lookAhead = aim.active ? 560 : 300;
    const heading = aim.initialized ? aim.angle : Number(me?.angle) || 0;
    const targetX = (me?.x ?? state.arena.width / 2) + Math.cos(heading) * lookAhead;
    const targetY = (me?.y ?? state.arena.height / 2) + Math.sin(heading) * lookAhead;
    if (!cameraReady) {
      cameraX = targetX;
      cameraY = targetY;
      cameraReady = true;
    } else {
      const amount = smoothing(8.5, dt);
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
    const shakeX = cameraShake > 0.1 ? (Math.random() - 0.5) * cameraShake : 0;
    const shakeY = cameraShake > 0.1 ? (Math.random() - 0.5) * cameraShake : 0;
    return {
      scale,
      offsetX: width / 2 - cameraX * scale + shakeX,
      offsetY: height / 2 - cameraY * scale + shakeY,
      left: cameraX - halfW,
      right: cameraX + halfW,
      top: cameraY - halfH,
      bottom: cameraY + halfH
    };
  }

  function worldFromPointer(transform = lastTransform) {
    if (!transform) return { x: 0, y: 0 };
    return {
      x: clamp((pointer.x - transform.offsetX) / transform.scale, 0, state.arena.width),
      y: clamp((pointer.y - transform.offsetY) / transform.scale, 0, state.arena.height)
    };
  }

  function updateAim(transform = lastTransform) {
    const me = localVisual();
    if (!me || !transform) return;
    const world = worldFromPointer(transform);
    pointer.worldX = world.x;
    pointer.worldY = world.y;
    aim.angle = Math.atan2(world.y - me.y, world.x - me.x);
    aim.initialized = true;
  }

  function updateAimHud() {
    aimHud.dataset.active = String(aim.active);
    document.body.classList.toggle("gameplay-aiming", aim.active);
    document.getElementById("aimHudTitle").textContent = aim.active ? "AIMING WITH MOUSE" : "AIM LOCKED";
    document.getElementById("aimHudDetail").textContent = aim.active
      ? "Move mouse · release right click to lock"
      : "Hold right click anywhere in the arena";
  }

  function applyTerritory(message) {
    const expected = state.arena.gridWidth * state.arena.gridHeight;
    if (Array.isArray(message.territory) && message.territory.length === expected) {
      state.territory = message.territory.slice();
      return;
    }
    if (!Array.isArray(state.territory) || state.territory.length !== expected) state.territory = new Array(expected).fill(-1);
    if (!Array.isArray(message.territoryDelta)) return;
    for (let index = 0; index + 1 < message.territoryDelta.length; index += 2) {
      const cell = Number(message.territoryDelta[index]);
      const owner = Number(message.territoryDelta[index + 1]);
      if (Number.isInteger(cell) && cell >= 0 && cell < expected) state.territory[cell] = owner;
    }
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

  WebSocket.prototype.send = function gameplayV9Send(payload) {
    let outgoing = payload;
    if (typeof payload === "string") {
      try {
        const message = JSON.parse(payload);
        if (["register_student", "reconnect_student", "input", "set_ready", "select_team", "ping"].includes(message.type)) observeSocket(this);
        if (message.type === "input") {
          input.dx = clamp(Number(message.dx) || 0, -1, 1);
          input.dy = clamp(Number(message.dy) || 0, -1, 1);
          input.dash = Boolean(message.dash);
          message.shoot = spacePressed;
          if (input.dash && !lastDashInput) predictedDashUntil = performance.now() + 220;
          lastDashInput = input.dash;
          if (aim.initialized) message.angle = aim.angle;
          outgoing = JSON.stringify(message);
        }
      } catch {}
    }
    return nativeSend.call(this, outgoing);
  };

  function pruneRecentGaps(now = performance.now()) {
    while (recentGaps.length && now - recentGaps[0].at > 10000) recentGaps.shift();
    return recentGaps.reduce((sum, item) => sum + item.count, 0);
  }

  function spawnExplosion(player) {
    const color = state.teamColors[player.team] || "#f04438";
    const particles = [];
    for (let index = 0; index < 38; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 420 + Math.random() * 1500;
      particles.push({
        x: Number(player.x) || 0,
        y: Number(player.y) || 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 5 + Math.random() * 15,
        life: 0.42 + Math.random() * 0.58,
        age: 0,
        color: Math.random() < 0.28 ? "#ffffff" : color
      });
    }
    explosions.push({ x: Number(player.x) || 0, y: Number(player.y) || 0, color, age: 0, duration: 1, particles });
    cameraShake = Math.max(cameraShake, player.id === state.playerId ? 28 : 12);
    if (player.id === state.playerId) localDeathFlash = 0.62;
  }

  function handleMessage(message) {
    if (!message || typeof message !== "object") return;
    if (message.type === "joined") {
      state.playerId = String(message.playerId || "");
      state.arena = message.arena || state.arena;
      state.territory = new Array(state.arena.gridWidth * state.arena.gridHeight).fill(-1);
      cameraReady = false;
      aim.initialized = false;
      return;
    }
    if (message.type === "lobby") {
      state.phase = message.phase || state.phase;
      state.teamNames = Array.isArray(message.teamNames) ? message.teamNames : state.teamNames;
      state.teamColors = Array.isArray(message.teamColors) ? message.teamColors : state.teamColors;
      updateHud();
      return;
    }
    if (message.type === "pong") {
      const clientTime = Number(message.clientTime);
      if (Number.isFinite(clientTime)) roundTripMs = Math.max(0, Date.now() - clientTime);
      return;
    }
    if (message.type === "state") {
      const now = performance.now();
      const interval = lastStateAt ? now - lastStateAt : 0;
      if (interval) averageInterval = averageInterval ? averageInterval * 0.84 + interval * 0.16 : interval;
      lastStateAt = now;

      const sequence = Number(message.sequence) || 0;
      if (sequence && lastSequence && sequence > lastSequence + 1) recentGaps.push({ at: now, count: sequence - lastSequence - 1 });
      if (sequence) lastSequence = sequence;

      const oldPlayers = new Map(state.players.map((player) => [player.id, player]));
      const oldProjectiles = new Map(state.projectiles.map((projectile) => [projectile.id, projectile]));
      const incomingPlayers = Array.isArray(message.players) ? message.players : state.players;
      const snapshotSeconds = clamp((interval || averageInterval || 50) / 1000, 0.02, 0.2);
      state.players = incomingPlayers.map((player) => {
        const previous = oldPlayers.get(player.id);
        if (previous?.alive && player.alive === false) spawnExplosion(player);
        const vx = previous ? clamp((Number(player.x) - Number(previous.x)) / snapshotSeconds, -2200, 2200) : 0;
        const vy = previous ? clamp((Number(player.y) - Number(previous.y)) / snapshotSeconds, -2200, 2200) : 0;
        return { ...player, vx, vy, receivedAt: now };
      });

      state.phase = message.phase || state.phase;
      state.arena = message.arena || state.arena;
      state.hitboxes = message.hitboxes || state.hitboxes;
      state.cohesionRadius = Number(message.cohesionRadius) || state.cohesionRadius;
      state.maxLives = Number(message.maxLives) || state.maxLives;
      state.maxAmmo = Number(message.maxAmmo) || state.maxAmmo;
      state.teamNames = Array.isArray(message.teamNames) ? message.teamNames : state.teamNames;
      state.teamColors = Array.isArray(message.teamColors) ? message.teamColors : state.teamColors;
      state.projectiles = Array.isArray(message.projectiles)
        ? message.projectiles.map((projectile) => ({ ...projectile, previous: oldProjectiles.get(projectile.id), receivedAt: now }))
        : state.projectiles;
      state.pickups = Array.isArray(message.pickups) ? message.pickups : state.pickups;
      applyTerritory(message);
      state.territoryCounts = Array.isArray(message.territoryCounts) ? message.territoryCounts : state.territoryCounts;
      state.remainingMs = Number(message.remainingMs) || 0;
      state.serverNowOffset = Number(message.serverNow) - Date.now();
      const me = localTarget();
      if (me && !aim.initialized) {
        aim.angle = Number(me.angle) || 0;
        aim.initialized = true;
      }
      updateHud();
      return;
    }
    if (message.type === "pickup_collected") {
      showToast(message.label || message.pickupType || "POWER COLLECTED");
      return;
    }
    if (message.type === "ammo_regenerated") {
      showToast(`AMMO REGENERATED · ${message.ammo}/${message.maxAmmo || state.maxAmmo}`);
      return;
    }
    if (message.type === "life_lost") showToast(`${message.lives} LIFE${message.lives === 1 ? "" : "S"} REMAINING`, true);
  }

  function updateHud() {
    const me = localTarget();
    const lives = clamp(Number(me?.lives ?? state.maxLives), 0, state.maxLives);
    const ammo = clamp(Number(me?.ammo ?? state.maxAmmo), 0, state.maxAmmo);
    document.getElementById("lifeDisplay").textContent = `${"♥ ".repeat(lives)}${"♡ ".repeat(Math.max(0, state.maxLives - lives))}`.trim();
    document.getElementById("ammoDisplay").textContent = `${"● ".repeat(ammo)}${"○ ".repeat(Math.max(0, state.maxAmmo - ammo))}`.trim();
    const regen = document.getElementById("ammoRegenTimer");
    if (regen) regen.textContent = ammo >= state.maxAmmo
      ? "Full · automatic +1 every 10 s"
      : `Next +1 in ${(Math.max(0, Number(me?.ammoRegenRemainingMs) || 0) / 1000).toFixed(1)} s`;

    const names = Array.isArray(me?.students) && me.students.length === 3 ? me.students : ["Student 1", "Student 2", "Student 3"];
    document.getElementById("movementRoleName").textContent = `${names[0]} · Movement`;
    document.getElementById("aimRoleName").textContent = `${names[1]} · Aim`;
    document.getElementById("shootRoleName").textContent = `${names[2]} · Shoot`;

    const volley = clamp(Number(me?.volleySize) || 1, 1, 3);
    const cohesionBadge = document.getElementById("cohesionBadge");
    cohesionBadge.dataset.level = String(volley);
    cohesionBadge.querySelector("strong").textContent = `×${volley} SHOT${volley === 1 ? "" : "S"}`;
    cohesionBadge.querySelector("small").textContent = volley === 3
      ? "Full three-player formation active"
      : volley === 2
        ? "Two allied players in formation"
        : "Move near teammates for ×2 or ×3";

    const power = String(me?.activePower || "");
    const powerInfo = pickupStyles[power];
    document.getElementById("powerDisplay").textContent = powerInfo?.label || "NONE";
    document.getElementById("powerTimer").textContent = powerInfo
      ? `${(Math.max(0, Number(me?.powerRemainingMs) || 0) / 1000).toFixed(1)} s remaining`
      : "Collect a random box";

    const networkCard = resourceHud.querySelector(".network-card");
    const networkDisplay = document.getElementById("networkDisplay");
    const networkDetail = document.getElementById("networkDetail");
    if (!averageInterval) {
      networkCard.dataset.quality = "waiting";
      networkDisplay.textContent = "WAITING";
      networkDetail.textContent = "No server snapshots yet";
      return;
    }
    const recent = pruneRecentGaps();
    const quality = averageInterval <= 62 && recent <= 2 ? "excellent" : averageInterval <= 85 && recent <= 5 ? "good" : averageInterval <= 130 ? "fair" : "poor";
    networkCard.dataset.quality = quality;
    networkDisplay.textContent = quality.toUpperCase();
    const rtt = roundTripMs ? ` · ${Math.round(roundTripMs)} ms RTT` : "";
    networkDetail.textContent = `${Math.round(averageInterval)} ms stream${rtt} · ${recent} recent skip${recent === 1 ? "" : "s"}`;
  }

  function showToast(text, danger = false) {
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
        visual.x = clamp(visual.x + dx * speed * dt, state.hitboxes.player, state.arena.width - state.hitboxes.player);
        visual.y = clamp(visual.y + dy * speed * dt, state.hitboxes.player, state.arena.height - state.hitboxes.player);
        const correction = smoothing(4.6, dt);
        visual.x += (Number(target.x) - visual.x) * correction;
        visual.y += (Number(target.y) - visual.y) * correction;
        visual.angle = lerpAngle(Number(visual.angle) || 0, aim.initialized ? aim.angle : Number(target.angle) || 0, smoothing(20, dt));
      } else {
        const age = Math.min(0.12, Math.max(0, (frameAt - Number(target.receivedAt || frameAt)) / 1000));
        const predictedX = Number(target.x) + Number(target.vx || 0) * age;
        const predictedY = Number(target.y) + Number(target.vy || 0) * age;
        const amount = smoothing(17, dt);
        visual.x += (predictedX - visual.x) * amount;
        visual.y += (predictedY - visual.y) * amount;
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
          ctx.fillStyle = rgba(state.teamColors[owner], 0.32);
          ctx.fillRect(x, y, cellW * t.scale + 1, cellH * t.scale + 1);
        }
      }
    }

    ctx.strokeStyle = "rgba(16,24,40,.07)";
    ctx.lineWidth = 1;
    for (let gx = minX; gx <= maxX + 1; gx += 1) {
      const x = t.offsetX + gx * cellW * t.scale;
      ctx.beginPath();
      ctx.moveTo(x, Math.max(0, t.offsetY + minY * cellH * t.scale));
      ctx.lineTo(x, Math.min(height, t.offsetY + (maxY + 1) * cellH * t.scale));
      ctx.stroke();
    }
    for (let gy = minY; gy <= maxY + 1; gy += 1) {
      const y = t.offsetY + gy * cellH * t.scale;
      ctx.beginPath();
      ctx.moveTo(Math.max(0, t.offsetX + minX * cellW * t.scale), y);
      ctx.lineTo(Math.min(width, t.offsetX + (maxX + 1) * cellW * t.scale), y);
      ctx.stroke();
    }
  }

  function drawPickup(pickup, t, frameAt) {
    const x = t.offsetX + Number(pickup.x) * t.scale;
    const y = t.offsetY + Number(pickup.y) * t.scale;
    if (x < -60 || x > width + 60 || y < -60 || y > height + 60) return;
    const style = pickupStyles[pickup.type] || pickupStyles.ammo;
    const hitRadius = Number(pickup.radius) || state.hitboxes.pickup;
    const size = clamp(hitRadius * t.scale, 12, 21) * (1 + Math.sin(frameAt / 180 + Number(pickup.x) * 0.01) * 0.07);
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = style.color;
    ctx.shadowBlur = 17;
    ctx.fillStyle = rgba(style.color, 0.22);
    ctx.strokeStyle = style.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-size, -size, size * 2, size * 2, 6);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = style.color;
    ctx.font = "900 15px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(style.icon, 0, 1);
    ctx.restore();
  }

  function drawProjectile(projectile, t) {
    const x = t.offsetX + Number(projectile.x) * t.scale;
    const y = t.offsetY + Number(projectile.y) * t.scale;
    if (x < -40 || x > width + 40 || y < -40 || y > height + 40) return;
    const color = state.teamColors[projectile.team] || "#101828";
    const velocityLength = Math.hypot(Number(projectile.vx) || 0, Number(projectile.vy) || 0) || 1;
    const ux = (Number(projectile.vx) || 0) / velocityLength;
    const uy = (Number(projectile.vy) || 0) / velocityLength;
    const radius = clamp((Number(projectile.radius) || state.hitboxes.projectile) * t.scale, 5, 9);
    ctx.strokeStyle = rgba(color, 0.62);
    ctx.lineWidth = Math.max(4, radius * 0.8);
    ctx.beginPath();
    ctx.moveTo(x - ux * radius * 4, y - uy * radius * 4);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlayer(player, t) {
    const x = t.offsetX + Number(player.x) * t.scale;
    const y = t.offsetY + Number(player.y) * t.scale;
    if (x < -100 || x > width + 100 || y < -100 || y > height + 100) return;
    const mine = player.id === state.playerId;
    const color = state.teamColors[player.team] || "#667085";
    const hitRadius = clamp((Number(state.hitboxes.player) || 30) * t.scale, 10, 18);
    const size = clamp(hitRadius * 1.18, 14, 20);

    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = player.connected === false ? 0.38 : player.alive ? 1 : 0.16;

    ctx.strokeStyle = rgba(color, mine ? 0.42 : 0.2);
    ctx.lineWidth = mine ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, hitRadius, 0, Math.PI * 2);
    ctx.stroke();

    if (player.activePower) {
      const powerColor = pickupStyles[player.activePower]?.color || color;
      ctx.strokeStyle = rgba(powerColor, 0.7);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, size * 1.8, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (mine) {
      ctx.fillStyle = rgba(color, 0.13);
      ctx.beginPath();
      ctx.arc(0, 0, size * 2.45, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!player.alive) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.72, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      if (player.invulnerable) {
        ctx.strokeStyle = rgba(color, 0.56);
        ctx.lineWidth = 4;
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
      ctx.strokeStyle = mine ? "#101828" : "#ffffff";
      ctx.lineWidth = mine ? 4 : 3;
      ctx.stroke();
    }
    ctx.restore();

    const label = `${player.pcLabel || "Player"}${player.isBot ? " · AI" : ""}`;
    ctx.font = mine ? "900 13px system-ui" : "800 11px system-ui";
    const textWidth = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(255,255,255,.9)";
    ctx.fillRect(x - textWidth / 2 - 5, y - size - 23, textWidth + 10, 17);
    ctx.fillStyle = "#101828";
    ctx.textAlign = "center";
    ctx.fillText(label, x, y - size - 10);
    if (mine) {
      ctx.fillStyle = color;
      ctx.font = "900 10px system-ui";
      ctx.fillText(`L${player.lives ?? 3} · A${player.ammo ?? 5} · ×${player.volleySize || 1}`, x, y + size + 21);
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
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(t.offsetX + teammate.x * t.scale, t.offsetY + teammate.y * t.scale);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = rgba(state.teamColors[me.team], 0.16);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(startX, startY, state.cohesionRadius * t.scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawAim(t, frameAt) {
    const me = localVisual();
    if (!me?.alive || !aim.initialized) return;
    const startX = t.offsetX + me.x * t.scale;
    const startY = t.offsetY + me.y * t.scale;
    const distance = 2600;
    const endX = t.offsetX + (me.x + Math.cos(aim.angle) * distance) * t.scale;
    const endY = t.offsetY + (me.y + Math.sin(aim.angle) * distance) * t.scale;
    const color = state.teamColors[me.team] || "#1f77b4";
    const pulse = 0.76 + Math.sin(frameAt / 95) * 0.18;

    ctx.save();
    ctx.shadowColor = aim.active ? color : "transparent";
    ctx.shadowBlur = aim.active ? 14 : 0;
    ctx.strokeStyle = rgba(color, aim.active ? 0.95 : 0.46);
    ctx.lineWidth = aim.active ? 4 : 2;
    ctx.setLineDash(aim.active ? [] : [13, 10]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    const arrowSize = aim.active ? 15 : 11;
    ctx.fillStyle = rgba(color, aim.active ? 0.95 : 0.62);
    ctx.save();
    ctx.translate(endX, endY);
    ctx.rotate(aim.angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-arrowSize * 1.8, arrowSize);
    ctx.lineTo(-arrowSize * 1.8, -arrowSize);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    const crossDistance = clamp(Math.hypot(pointer.worldX - me.x, pointer.worldY - me.y), 300, distance);
    const crossX = t.offsetX + (me.x + Math.cos(aim.angle) * crossDistance) * t.scale;
    const crossY = t.offsetY + (me.y + Math.sin(aim.angle) * crossDistance) * t.scale;
    ctx.strokeStyle = rgba(color, aim.active ? pulse : 0.52);
    ctx.lineWidth = aim.active ? 3 : 2;
    ctx.beginPath();
    ctx.arc(crossX, crossY, aim.active ? 15 : 11, 0, Math.PI * 2);
    ctx.moveTo(crossX - 22, crossY);
    ctx.lineTo(crossX + 22, crossY);
    ctx.moveTo(crossX, crossY - 22);
    ctx.lineTo(crossX, crossY + 22);
    ctx.stroke();
    ctx.restore();
  }

  function drawExplosions(t, dt) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let index = explosions.length - 1; index >= 0; index -= 1) {
      const explosion = explosions[index];
      explosion.age += dt;
      const progress = clamp(explosion.age / explosion.duration, 0, 1);
      const centerX = t.offsetX + explosion.x * t.scale;
      const centerY = t.offsetY + explosion.y * t.scale;
      ctx.strokeStyle = rgba(explosion.color, (1 - progress) * 0.82);
      ctx.lineWidth = Math.max(1, 8 * (1 - progress));
      ctx.beginPath();
      ctx.arc(centerX, centerY, (34 + progress * 280) * t.scale, 0, Math.PI * 2);
      ctx.stroke();

      for (const particle of explosion.particles) {
        particle.age += dt;
        if (particle.age >= particle.life) continue;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vx *= Math.pow(0.045, dt);
        particle.vy *= Math.pow(0.045, dt);
        const alpha = 1 - particle.age / particle.life;
        const x = t.offsetX + particle.x * t.scale;
        const y = t.offsetY + particle.y * t.scale;
        ctx.fillStyle = rgba(particle.color, alpha);
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.4, particle.size * t.scale * alpha), 0, Math.PI * 2);
        ctx.fill();
      }
      if (progress >= 1) explosions.splice(index, 1);
    }
    ctx.restore();
  }

  function isInteractiveTarget(target) {
    return Boolean(target?.closest?.("button,input,select,textarea,label,a,.overlay.visible,.topbar,.scoreboard,.player-panel,.minimap-panel,.resource-hud,.three-student-control-panel,.pickup-legend,.team-selection-panel"));
  }

  function canAimFromEvent(event) {
    return state.phase === "playing" && !isInteractiveTarget(event.target);
  }

  function drawFrame(frameAt) {
    resize();
    const dt = Math.min(0.045, Math.max(0.001, (frameAt - lastFrameAt) / 1000));
    lastFrameAt = frameAt;
    cameraShake *= Math.pow(0.035, dt);
    localDeathFlash = Math.max(0, localDeathFlash - dt * 1.45);
    syncPlayers(dt, frameAt);
    syncProjectiles(dt, frameAt);
    const t = cameraTransform(dt);
    lastTransform = t;
    if (aim.active) updateAim(t);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#e7edf5";
    ctx.fillRect(0, 0, width, height);
    const backdrop = ctx.createRadialGradient(width / 2, height / 2, 100, width / 2, height / 2, Math.max(width, height));
    backdrop.addColorStop(0, "rgba(255,255,255,.58)");
    backdrop.addColorStop(1, "rgba(148,163,184,.09)");
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#fbfcfe";
    ctx.fillRect(t.offsetX, t.offsetY, state.arena.width * t.scale, state.arena.height * t.scale);

    drawTerritory(t);
    for (const pickup of state.pickups) drawPickup(pickup, t, frameAt);
    drawCohesion(t);
    for (const projectile of visualProjectiles.values()) drawProjectile(projectile, t);
    for (const player of visualPlayers.values()) drawPlayer(player, t);
    drawExplosions(t, dt);
    drawAim(t, frameAt);

    ctx.strokeStyle = "#98a2b3";
    ctx.lineWidth = 3;
    ctx.strokeRect(t.offsetX, t.offsetY, state.arena.width * t.scale, state.arena.height * t.scale);
    if (localDeathFlash > 0) {
      ctx.fillStyle = `rgba(240,68,56,${localDeathFlash * 0.34})`;
      ctx.fillRect(0, 0, width, height);
    }
    requestAnimationFrame(drawFrame);
  }

  addEventListener("pointermove", (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (aim.active) updateAim();
  }, { passive: true });

  addEventListener("pointerdown", (event) => {
    if (!canAimFromEvent(event)) return;
    if (event.button === 2) {
      aim.active = true;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      updateAim();
      updateAimHud();
      event.preventDefault();
      event.stopImmediatePropagation();
    } else if (event.button === 0 || event.button === 1) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  addEventListener("pointerup", (event) => {
    if (event.button !== 2) return;
    aim.active = false;
    updateAimHud();
    if (state.phase === "playing") event.preventDefault();
  }, true);

  app.addEventListener("contextmenu", (event) => {
    if (state.phase === "playing" && !isInteractiveTarget(event.target)) event.preventDefault();
  });

  addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      spacePressed = true;
      event.preventDefault();
    }
  }, true);

  addEventListener("keyup", (event) => {
    if (event.code === "Space") {
      spacePressed = false;
      event.preventDefault();
    }
  }, true);

  addEventListener("blur", () => {
    aim.active = false;
    spacePressed = false;
    input.dx = 0;
    input.dy = 0;
    input.dash = false;
    updateAimHud();
  });

  addEventListener("resize", resize);
  window.setTimeout(neutralizeBaseRenderer, 60);
  resize();
  updateHud();
  updateAimHud();
  requestAnimationFrame(drawFrame);
})();