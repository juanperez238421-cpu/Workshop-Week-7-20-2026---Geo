(() => {
  "use strict";

  const app = document.getElementById("app");
  const baseCanvas = document.getElementById("gameCanvas");
  if (!app || !baseCanvas || typeof WebSocket === "undefined") return;

  const BUILD = "20260723-master-view-aim21";
  const DEFAULT_COLORS = ["#1f77b4", "#d62728", "#2ca02c"];
  const DEFAULT_NAMES = ["Team 1", "Team 2", "Team 3"];
  const OBSERVED_SEND_TYPES = new Set(["register_student", "reconnect_student", "set_ready", "input"]);
  const observedSockets = new WeakSet();
  const nativeSend = WebSocket.prototype.send;

  const canvas = document.createElement("canvas");
  canvas.id = "studentMasterViewCanvasV21";
  canvas.setAttribute("aria-label", "Player-centered version of the teacher master live arena");
  canvas.setAttribute("aria-hidden", "true");
  baseCanvas.insertAdjacentElement("afterend", canvas);

  const aimHud = document.createElement("div");
  aimHud.id = "masterViewAimHudV21";
  aimHud.className = "master-view-aim-hud-v21";
  aimHud.dataset.active = "false";
  aimHud.innerHTML = `
    <span class="master-view-aim-icon-v21">⌖</span>
    <div class="master-view-aim-copy-v21">
      <strong id="masterViewAimTitleV21">MOUSE AIM READY</strong>
      <small id="masterViewAimDetailV21">Hold right click on the arena and move the mouse</small>
    </div>`;
  app.appendChild(aimHud);

  const state = {
    phase: "lobby",
    arena: { width: 12800, height: 8000, gridWidth: 40, gridHeight: 25 },
    hitboxes: { player: 30, projectile: 14, pickup: 60 },
    teamNames: [...DEFAULT_NAMES],
    teamColors: [...DEFAULT_COLORS],
    players: [],
    projectiles: [],
    pickups: [],
    territory: new Array(1000).fill(-1),
    territoryCounts: [0, 0, 0],
    remainingMs: 300000,
    localPlayerId: "",
    serverOffset: 0,
    lastStateAt: 0,
    lastSequence: 0,
    ctx: null,
    width: 0,
    height: 0,
    dpr: 1,
    transform: null,
    cameraX: null,
    cameraY: null,
    lastFrameAt: 0,
    predictedDashUntil: 0,
    lastDashInput: false,
    shake: 0,
    explosions: [],
    predictedBullets: [],
    visualPlayers: new Map(),
    visualProjectiles: new Map()
  };

  const pointer = {
    clientX: innerWidth * 0.72,
    clientY: innerHeight * 0.5,
    worldX: 0,
    worldY: 0
  };

  const aim = {
    active: false,
    initialized: false,
    angle: 0
  };

  const input = {
    dx: 0,
    dy: 0,
    dash: false,
    shoot: false
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const smoothing = (rate, dt) => 1 - Math.exp(-rate * Math.max(0, dt));
  const lerpAngle = (from, to, amount) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * amount;
  const serverNow = () => Date.now() + state.serverOffset;

  function parseJson(value) {
    if (typeof value !== "string") return null;
    try { return JSON.parse(value); } catch { return null; }
  }

  function rgba(hex, alpha) {
    const clean = String(hex || "#000000").replace("#", "");
    const normalized = clean.length === 3 ? clean.split("").map((character) => character + character).join("") : clean;
    const value = Number.parseInt(normalized, 16) || 0;
    return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
  }

  function editableTarget(target) {
    return target instanceof Element && Boolean(target.closest("input,textarea,select,[contenteditable='true']"));
  }

  function interactiveTarget(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest(
      "button,input,select,textarea,label,a,.overlay.visible,.topbar,.scoreboard,.player-panel,.minimap-panel,.resource-hud-v15,.controls-hint,.master-view-aim-hud-v21"
    ));
  }

  function localTarget() {
    return state.players.find((player) => String(player.id) === state.localPlayerId) || null;
  }

  function localVisual() {
    return state.visualPlayers.get(state.localPlayerId) || null;
  }

  function ensureContext() {
    if (state.ctx) return true;
    const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!context) return false;
    state.ctx = context;
    resize();
    return true;
  }

  function resize() {
    if (!state.ctx) return;
    state.width = Math.max(1, innerWidth);
    state.height = Math.max(1, innerHeight);
    state.dpr = Math.min(devicePixelRatio || 1, 1.75);
    const pixelWidth = Math.max(1, Math.round(state.width * state.dpr));
    const pixelHeight = Math.max(1, Math.round(state.height * state.dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      canvas.style.width = `${state.width}px`;
      canvas.style.height = `${state.height}px`;
    }
    state.ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  }

  function applyTerritory(message) {
    const expected = Number(state.arena.gridWidth) * Number(state.arena.gridHeight);
    if (Array.isArray(message.territory) && message.territory.length === expected) {
      state.territory = message.territory.slice();
      return;
    }
    if (!Array.isArray(state.territory) || state.territory.length !== expected) {
      state.territory = new Array(expected).fill(-1);
    }
    if (!Array.isArray(message.territoryDelta)) return;
    for (let index = 0; index + 1 < message.territoryDelta.length; index += 2) {
      const cell = Number(message.territoryDelta[index]);
      const owner = Number(message.territoryDelta[index + 1]);
      if (Number.isInteger(cell) && cell >= 0 && cell < expected) state.territory[cell] = owner;
    }
  }

  function spawnExplosion(player) {
    const visual = state.visualPlayers.get(String(player.id));
    const x = Number(visual?.x ?? player.x) || 0;
    const y = Number(visual?.y ?? player.y) || 0;
    const color = state.teamColors[Number(player.team)] || "#f04438";
    const particles = [];
    for (let index = 0; index < 34; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 380 + Math.random() * 1250;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 5 + Math.random() * 13,
        life: 0.38 + Math.random() * 0.5,
        age: 0,
        color: Math.random() < 0.25 ? "#ffffff" : color
      });
    }
    state.explosions.push({ x, y, color, age: 0, duration: 0.9, particles });
    state.shake = Math.max(state.shake, String(player.id) === state.localPlayerId ? 24 : 11);
  }

  function handleMessage(message) {
    if (!message || typeof message !== "object") return;

    if (message.type === "hello") {
      if (Number.isFinite(Number(message.serverTime))) state.serverOffset = Number(message.serverTime) - Date.now();
      return;
    }

    if (message.type === "joined") {
      state.localPlayerId = String(message.playerId || "");
      if (message.arena) state.arena = message.arena;
      state.cameraX = null;
      state.cameraY = null;
      aim.initialized = false;
      return;
    }

    if (message.type === "lobby") {
      state.phase = String(message.phase || state.phase);
      if (Array.isArray(message.teamNames)) state.teamNames = message.teamNames;
      if (Array.isArray(message.teamColors)) state.teamColors = message.teamColors;
      return;
    }

    if (message.type === "countdown") {
      state.phase = "countdown";
      return;
    }

    if (message.type === "match_ended") {
      state.phase = "ended";
      aim.active = false;
      updateAimHud();
      return;
    }

    if (message.type !== "state") return;

    const receivedAt = performance.now();
    const serverTimestamp = Number(message.serverNow) || serverNow();
    if (Number.isFinite(Number(message.serverNow))) state.serverOffset = Number(message.serverNow) - Date.now();
    const elapsedSeconds = state.lastStateAt ? clamp((receivedAt - state.lastStateAt) / 1000, 0.02, 0.2) : 0.05;
    state.lastStateAt = receivedAt;
    state.lastSequence = Number(message.sequence) || state.lastSequence;

    const oldPlayers = new Map(state.players.map((player) => [String(player.id), player]));
    const incomingPlayers = Array.isArray(message.players) ? message.players : state.players;
    for (const player of incomingPlayers) {
      const previous = oldPlayers.get(String(player.id));
      if (previous?.alive !== false && player.alive === false) spawnExplosion(player);
    }

    state.players = incomingPlayers.map((player) => {
      const previous = oldPlayers.get(String(player.id));
      const derivedVx = previous ? (Number(player.x) - Number(previous.x)) / elapsedSeconds : 0;
      const derivedVy = previous ? (Number(player.y) - Number(previous.y)) / elapsedSeconds : 0;
      return {
        ...player,
        velocityX: Number.isFinite(Number(player.velocityX)) ? Number(player.velocityX) : clamp(derivedVx, -2600, 2600),
        velocityY: Number.isFinite(Number(player.velocityY)) ? Number(player.velocityY) : clamp(derivedVy, -2600, 2600),
        snapshotAt: serverTimestamp,
        receivedAt
      };
    });

    state.projectiles = (Array.isArray(message.projectiles) ? message.projectiles : state.projectiles).map((projectile) => ({
      ...projectile,
      receivedAt,
      snapshotAt: serverTimestamp
    }));

    state.phase = String(message.phase || state.phase);
    if (message.arena) state.arena = message.arena;
    if (message.hitboxes) state.hitboxes = message.hitboxes;
    if (Array.isArray(message.teamNames)) state.teamNames = message.teamNames;
    if (Array.isArray(message.teamColors)) state.teamColors = message.teamColors;
    if (Array.isArray(message.pickups)) state.pickups = message.pickups;
    if (Array.isArray(message.territoryCounts)) state.territoryCounts = message.territoryCounts;
    if (Number.isFinite(Number(message.remainingMs))) state.remainingMs = Number(message.remainingMs);
    applyTerritory(message);

    const me = localTarget();
    if (me && !aim.initialized) {
      aim.angle = Number(me.angle) || 0;
      aim.initialized = true;
      updateAimHud();
    }
  }

  function observeSocket(socket) {
    if (!socket || observedSockets.has(socket)) return;
    observedSockets.add(socket);
    socket.addEventListener("message", (event) => handleMessage(parseJson(event.data)));
  }

  WebSocket.prototype.send = function masterViewV21Send(payload) {
    let outgoing = payload;
    if (typeof payload === "string") {
      const message = parseJson(payload);
      if (message && OBSERVED_SEND_TYPES.has(message.type)) observeSocket(this);
      if (message?.type === "input") {
        input.dx = clamp(Number(message.dx) || 0, -1, 1);
        input.dy = clamp(Number(message.dy) || 0, -1, 1);
        input.dash = Boolean(message.dash);
        input.shoot = Boolean(message.shoot);

        if (input.dash && !state.lastDashInput) {
          const me = localTarget();
          state.predictedDashUntil = performance.now() + (Number(me?.dashDurationMs) || 210);
          state.shake = Math.max(state.shake, 3.5);
        }
        state.lastDashInput = input.dash;

        if (aim.initialized && Number.isFinite(aim.angle)) message.angle = aim.angle;
        outgoing = JSON.stringify(message);
      }
    }
    return nativeSend.call(this, outgoing);
  };

  function normalizedInput() {
    let dx = input.dx;
    let dy = input.dy;
    const magnitude = Math.hypot(dx, dy);
    if (magnitude > 1) {
      dx /= magnitude;
      dy /= magnitude;
    }
    return { dx, dy, magnitude };
  }

  function syncPlayers(dt, frameAt) {
    const ids = new Set();
    const serverTime = serverNow();
    for (const target of state.players) {
      const id = String(target.id);
      ids.add(id);
      let visual = state.visualPlayers.get(id);
      if (!visual) {
        visual = { ...target, x: Number(target.x) || 0, y: Number(target.y) || 0, angle: Number(target.angle) || 0 };
        state.visualPlayers.set(id, visual);
      }

      if (id === state.localPlayerId && target.alive !== false && target.connected !== false) {
        const movement = normalizedInput();
        const normalSpeed = (Number(target.movementSpeed) || 620) * (target.activePower === "speed" ? 1.45 : 1);
        const dashSpeed = Number(target.dashSpeed) || 1900;
        const speed = frameAt < state.predictedDashUntil ? dashSpeed : normalSpeed;
        visual.x = clamp(Number(visual.x) + movement.dx * speed * dt, 30, Number(state.arena.width) - 30);
        visual.y = clamp(Number(visual.y) + movement.dy * speed * dt, 30, Number(state.arena.height) - 30);

        const errorX = Number(target.x) - visual.x;
        const errorY = Number(target.y) - visual.y;
        const error = Math.hypot(errorX, errorY);
        if (error > 720) {
          visual.x = Number(target.x);
          visual.y = Number(target.y);
        } else {
          const correction = smoothing(4.8, dt);
          visual.x += errorX * correction;
          visual.y += errorY * correction;
        }
        visual.angle = lerpAngle(Number(visual.angle) || 0, aim.initialized ? aim.angle : Number(target.angle) || 0, smoothing(21, dt));
      } else {
        const age = clamp((serverTime - Number(target.snapshotAt || serverTime)) / 1000, 0, 0.12);
        const predictedX = Number(target.x) + Number(target.velocityX || 0) * age;
        const predictedY = Number(target.y) + Number(target.velocityY || 0) * age;
        const amount = smoothing(17, dt);
        visual.x += (predictedX - visual.x) * amount;
        visual.y += (predictedY - visual.y) * amount;
        visual.angle = lerpAngle(Number(visual.angle) || 0, Number(target.angle) || 0, amount);
      }

      Object.assign(visual, target, { x: visual.x, y: visual.y, angle: visual.angle });
    }
    for (const id of state.visualPlayers.keys()) if (!ids.has(id)) state.visualPlayers.delete(id);
  }

  function syncProjectiles(dt, frameAt) {
    const ids = new Set();
    for (const target of state.projectiles) {
      const id = String(target.id);
      ids.add(id);
      const age = clamp((frameAt - Number(target.receivedAt || frameAt)) / 1000, 0, 0.12);
      const predictedX = Number(target.x) + Number(target.vx || 0) * age;
      const predictedY = Number(target.y) + Number(target.vy || 0) * age;
      let visual = state.visualProjectiles.get(id);
      if (!visual) {
        visual = { ...target, x: predictedX, y: predictedY };
        state.visualProjectiles.set(id, visual);
      } else {
        const amount = smoothing(24, dt);
        visual.x += (predictedX - visual.x) * amount;
        visual.y += (predictedY - visual.y) * amount;
        Object.assign(visual, target, { x: visual.x, y: visual.y });
      }
    }
    for (const id of state.visualProjectiles.keys()) if (!ids.has(id)) state.visualProjectiles.delete(id);
  }

  function updateTransform(dt) {
    const me = localVisual();
    const movement = normalizedInput();
    const direction = aim.initialized ? aim.angle : Number(me?.angle) || 0;
    const aimLookAhead = aim.active ? 560 : 330;
    const targetX = (Number(me?.x) || Number(state.arena.width) / 2) + Math.cos(direction) * aimLookAhead + movement.dx * 120;
    const targetY = (Number(me?.y) || Number(state.arena.height) / 2) + Math.sin(direction) * aimLookAhead + movement.dy * 120;

    if (!Number.isFinite(state.cameraX)) state.cameraX = targetX;
    if (!Number.isFinite(state.cameraY)) state.cameraY = targetY;
    const amount = smoothing(8.2, dt);
    state.cameraX += (targetX - state.cameraX) * amount;
    state.cameraY += (targetY - state.cameraY) * amount;

    const visibleWidth = Math.min(3650, Number(state.arena.width));
    const visibleHeight = Math.min(2300, Number(state.arena.height));
    const scale = Math.max(0.05, Math.min(state.width / visibleWidth, state.height / visibleHeight));
    const halfWidth = state.width / scale / 2;
    const halfHeight = state.height / scale / 2;
    const cameraX = Number(state.arena.width) <= halfWidth * 2
      ? Number(state.arena.width) / 2
      : clamp(state.cameraX, halfWidth, Number(state.arena.width) - halfWidth);
    const cameraY = Number(state.arena.height) <= halfHeight * 2
      ? Number(state.arena.height) / 2
      : clamp(state.cameraY, halfHeight, Number(state.arena.height) - halfHeight);

    const shakeX = state.shake > 0.1 ? (Math.random() - 0.5) * state.shake : 0;
    const shakeY = state.shake > 0.1 ? (Math.random() - 0.5) * state.shake : 0;
    state.shake *= Math.pow(0.035, dt);

    state.transform = {
      scale,
      offsetX: state.width / 2 - cameraX * scale + shakeX,
      offsetY: state.height / 2 - cameraY * scale + shakeY,
      left: cameraX - halfWidth,
      right: cameraX + halfWidth,
      top: cameraY - halfHeight,
      bottom: cameraY + halfHeight
    };
  }

  function worldToScreen(x, y) {
    const transform = state.transform;
    return {
      x: transform.offsetX + Number(x) * transform.scale,
      y: transform.offsetY + Number(y) * transform.scale
    };
  }

  function pointerToWorld() {
    if (!state.transform) return { x: 0, y: 0 };
    return {
      x: clamp((pointer.clientX - state.transform.offsetX) / state.transform.scale, 0, Number(state.arena.width)),
      y: clamp((pointer.clientY - state.transform.offsetY) / state.transform.scale, 0, Number(state.arena.height))
    };
  }

  function updateAimFromPointer() {
    const me = localVisual();
    if (!me || !state.transform) return;
    const world = pointerToWorld();
    pointer.worldX = world.x;
    pointer.worldY = world.y;
    aim.angle = Math.atan2(world.y - Number(me.y), world.x - Number(me.x));
    aim.initialized = true;
    updateAimHud();
  }

  function updateAimHud() {
    const title = document.getElementById("masterViewAimTitleV21");
    const detail = document.getElementById("masterViewAimDetailV21");
    aimHud.dataset.active = String(aim.active);
    document.body.classList.toggle("master-view-v21-aiming", aim.active && state.phase === "playing");
    const degrees = ((aim.angle * 180 / Math.PI) + 360) % 360;
    if (title) title.textContent = aim.active ? "MOUSE AIM ACTIVE" : aim.initialized ? "AIM DIRECTION LOCKED" : "MOUSE AIM READY";
    if (detail) {
      detail.innerHTML = aim.active
        ? `Move mouse · release right click to lock · <b>${degrees.toFixed(0)}°</b>`
        : aim.initialized
          ? `Direction <b>${degrees.toFixed(0)}°</b> · hold right click to adjust`
          : "Hold right click on the arena and move the mouse";
    }
  }

  function drawTerritory(ctx) {
    const transform = state.transform;
    const gridWidth = Number(state.arena.gridWidth);
    const gridHeight = Number(state.arena.gridHeight);
    const cellWidth = Number(state.arena.width) / gridWidth;
    const cellHeight = Number(state.arena.height) / gridHeight;
    const minX = clamp(Math.floor(transform.left / cellWidth) - 1, 0, gridWidth - 1);
    const maxX = clamp(Math.ceil(transform.right / cellWidth) + 1, 0, gridWidth - 1);
    const minY = clamp(Math.floor(transform.top / cellHeight) - 1, 0, gridHeight - 1);
    const maxY = clamp(Math.ceil(transform.bottom / cellHeight) + 1, 0, gridHeight - 1);

    for (let gy = minY; gy <= maxY; gy += 1) {
      for (let gx = minX; gx <= maxX; gx += 1) {
        const owner = Number(state.territory[gy * gridWidth + gx]);
        if (owner < 0 || owner > 2) continue;
        ctx.fillStyle = rgba(state.teamColors[owner], 0.34);
        ctx.fillRect(
          transform.offsetX + gx * cellWidth * transform.scale,
          transform.offsetY + gy * cellHeight * transform.scale,
          cellWidth * transform.scale + 0.5,
          cellHeight * transform.scale + 0.5
        );
      }
    }

    ctx.strokeStyle = "rgba(16,24,40,.08)";
    ctx.lineWidth = 1;
    for (let gx = minX; gx <= maxX + 1; gx += 1) {
      const x = transform.offsetX + gx * cellWidth * transform.scale;
      ctx.beginPath();
      ctx.moveTo(x, transform.offsetY + minY * cellHeight * transform.scale);
      ctx.lineTo(x, transform.offsetY + (maxY + 1) * cellHeight * transform.scale);
      ctx.stroke();
    }
    for (let gy = minY; gy <= maxY + 1; gy += 1) {
      const y = transform.offsetY + gy * cellHeight * transform.scale;
      ctx.beginPath();
      ctx.moveTo(transform.offsetX + minX * cellWidth * transform.scale, y);
      ctx.lineTo(transform.offsetX + (maxX + 1) * cellWidth * transform.scale, y);
      ctx.stroke();
    }
  }

  function drawPickup(ctx, pickup, frameAt) {
    const styles = {
      ammo: { color: "#f79009", icon: "A" },
      shield: { color: "#2e90fa", icon: "S" },
      speed: { color: "#12b76a", icon: "V" },
      rapid: { color: "#f04438", icon: "R" },
      paint: { color: "#7f56d9", icon: "P" }
    };
    const style = styles[pickup.type] || styles.ammo;
    const screen = worldToScreen(pickup.x, pickup.y);
    if (screen.x < -40 || screen.x > state.width + 40 || screen.y < -40 || screen.y > state.height + 40) return;
    const baseSize = clamp((Number(pickup.radius) || Number(state.hitboxes.pickup) || 60) * state.transform.scale, 8, 15);
    const size = baseSize * (1 + Math.sin(frameAt / 180 + Number(pickup.x) * 0.01) * 0.06);
    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.fillStyle = style.color;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-size, -size, size * 2, size * 2, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = `900 ${Math.max(8, size * 0.9)}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(style.icon, 0, 0.5);
    ctx.restore();
  }

  function drawProjectile(ctx, projectile, alpha = 1) {
    const screen = worldToScreen(projectile.x, projectile.y);
    const color = state.teamColors[Number(projectile.team)] || "#101828";
    const speed = Math.hypot(Number(projectile.vx) || 0, Number(projectile.vy) || 0) || 1;
    const ux = (Number(projectile.vx) || 0) / speed;
    const uy = (Number(projectile.vy) || 0) / speed;
    const radius = clamp((Number(projectile.radius) || Number(state.hitboxes.projectile) || 14) * state.transform.scale, 4, 8);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = rgba(color, 0.62);
    ctx.lineWidth = Math.max(3, radius * 0.75);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(screen.x - ux * radius * 4.2, screen.y - uy * radius * 4.2);
    ctx.lineTo(screen.x, screen.y);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radius + 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPlayer(ctx, player) {
    const screen = worldToScreen(player.x, player.y);
    const color = state.teamColors[Number(player.team)] || "#667085";
    const hitRadius = clamp((Number(state.hitboxes.player) || 30) * state.transform.scale, 9, 16);
    const size = clamp(hitRadius * 1.35, 13, 21);
    const local = String(player.id) === state.localPlayerId;

    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.globalAlpha = player.connected === false ? 0.38 : player.alive === false ? 0.2 : 1;
    ctx.strokeStyle = rgba(color, 0.25);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, hitRadius, 0, Math.PI * 2);
    ctx.stroke();

    if (local && player.alive !== false) {
      ctx.strokeStyle = "rgba(16,24,40,.62)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, hitRadius + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

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
      ctx.strokeStyle = local ? "#101828" : "#ffffff";
      ctx.lineWidth = local ? 2.8 : 2;
      ctx.stroke();
    }
    ctx.restore();

    const label = `${player.pcLabel || "Player"}${player.isBot ? " · AI" : ""}`;
    ctx.font = `${local ? 900 : 800} 10px system-ui`;
    const textWidth = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(255,255,255,.94)";
    ctx.fillRect(screen.x - textWidth / 2 - 4, screen.y - size - 20, textWidth + 8, 15);
    ctx.fillStyle = "#101828";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(label, screen.x, screen.y - size - 9);

    ctx.font = "800 9px system-ui";
    ctx.fillStyle = color;
    ctx.fillText(`L${player.lives ?? 3} · A${player.ammo ?? 5}`, screen.x, screen.y + size + 14);
  }

  function updateExplosions(dt) {
    for (let index = state.explosions.length - 1; index >= 0; index -= 1) {
      const explosion = state.explosions[index];
      explosion.age += dt;
      for (const particle of explosion.particles) {
        particle.age += dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vx *= Math.pow(0.055, dt);
        particle.vy *= Math.pow(0.055, dt);
      }
      if (explosion.age >= explosion.duration) state.explosions.splice(index, 1);
    }
  }

  function drawExplosions(ctx) {
    for (const explosion of state.explosions) {
      const progress = clamp(explosion.age / explosion.duration, 0, 1);
      const center = worldToScreen(explosion.x, explosion.y);
      ctx.save();
      ctx.strokeStyle = rgba(explosion.color, (1 - progress) * 0.78);
      ctx.lineWidth = Math.max(2, (1 - progress) * 8);
      ctx.beginPath();
      ctx.arc(center.x, center.y, 12 + progress * 72, 0, Math.PI * 2);
      ctx.stroke();
      for (const particle of explosion.particles) {
        if (particle.age >= particle.life) continue;
        const alpha = 1 - particle.age / particle.life;
        const screen = worldToScreen(particle.x, particle.y);
        ctx.fillStyle = rgba(particle.color, alpha);
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, Math.max(1.4, particle.size * state.transform.scale * alpha), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawAim(ctx, frameAt) {
    const me = localVisual();
    if (!me || me.alive === false || !aim.initialized) return;
    const start = worldToScreen(me.x, me.y);
    const shortEnd = worldToScreen(
      Number(me.x) + Math.cos(aim.angle) * 210,
      Number(me.y) + Math.sin(aim.angle) * 210
    );

    ctx.save();
    ctx.strokeStyle = aim.active ? "rgba(127,86,217,.78)" : "rgba(16,24,40,.34)";
    ctx.lineWidth = aim.active ? 2.5 : 1.8;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(shortEnd.x, shortEnd.y);
    ctx.stroke();

    if (aim.active) {
      const target = worldToScreen(pointer.worldX, pointer.worldY);
      ctx.strokeStyle = "rgba(127,86,217,.56)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 7]);
      ctx.beginPath();
      ctx.moveTo(shortEnd.x, shortEnd.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
      ctx.setLineDash([]);

      const pulse = 12 + Math.sin(frameAt / 90) * 2;
      ctx.strokeStyle = "#7f56d9";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(target.x, target.y, pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(target.x - 18, target.y);
      ctx.lineTo(target.x + 18, target.y);
      ctx.moveTo(target.x, target.y - 18);
      ctx.lineTo(target.x, target.y + 18);
      ctx.stroke();
    }
    ctx.restore();
  }

  function updateCooldownHud() {
    const me = localTarget();
    if (!me) return;
    const now = serverNow();
    const shot = document.getElementById("shotCooldown");
    const dash = document.getElementById("dashCooldown");

    if (shot) {
      const duration = Math.max(1, Number(me.shotCooldownMs) || 250);
      const readyAt = Number(me.shotReadyAt) || 0;
      const lastShotAt = Number(me.lastShotAt) || readyAt - duration;
      const progress = now >= readyAt ? 1 : clamp((now - lastShotAt) / duration, 0, 1);
      shot.value = progress;
      const row = shot.closest(".cooldown-row");
      row?.classList.toggle("is-ready", progress >= 0.999);
      row?.classList.toggle("is-cooling", progress < 0.999);
    }

    if (dash) {
      const duration = Math.max(1, Number(me.dashCooldownMs) || 1800);
      const readyAt = Number(me.dashReadyAt) || 0;
      const progress = now >= readyAt ? 1 : clamp(1 - (readyAt - now) / duration, 0, 1);
      dash.value = progress;
      const row = dash.closest(".cooldown-row");
      row?.classList.toggle("is-ready", progress >= 0.999);
      row?.classList.toggle("is-cooling", progress < 0.999);
    }
  }

  function spawnPredictedShot() {
    if (state.phase !== "playing") return;
    const me = localTarget();
    const visual = localVisual();
    if (!me || !visual || me.alive === false || Number(me.ammo) <= 0 || !aim.initialized) return;
    if (serverNow() + 35 < Number(me.shotReadyAt || 0)) return;
    const color = state.teamColors[Number(me.team)] || "#101828";
    const speed = 2850;
    state.predictedBullets.push({
      id: `predicted-${performance.now()}`,
      team: me.team,
      radius: 14,
      x: Number(visual.x) + Math.cos(aim.angle) * 46,
      y: Number(visual.y) + Math.sin(aim.angle) * 46,
      vx: Math.cos(aim.angle) * speed,
      vy: Math.sin(aim.angle) * speed,
      bornAt: performance.now(),
      lifetime: 170,
      color
    });
    state.shake = Math.max(state.shake, 4.5);
  }

  function updatePredictedBullets(frameAt) {
    state.predictedBullets = state.predictedBullets.filter((bullet) => frameAt - bullet.bornAt < bullet.lifetime);
  }

  function drawFrame(frameAt) {
    const active = ["countdown", "playing"].includes(state.phase) && !document.hidden;
    document.body.classList.toggle("master-view-v21-active", active);

    if (!active || !ensureContext()) {
      state.lastFrameAt = frameAt;
      requestAnimationFrame(drawFrame);
      return;
    }

    const dt = state.lastFrameAt ? clamp((frameAt - state.lastFrameAt) / 1000, 0.001, 0.05) : 1 / 60;
    state.lastFrameAt = frameAt;
    resize();
    syncPlayers(dt, frameAt);
    syncProjectiles(dt, frameAt);
    updateExplosions(dt);
    updatePredictedBullets(frameAt);
    updateTransform(dt);
    if (aim.active) updateAimFromPointer();
    updateCooldownHud();

    const ctx = state.ctx;
    ctx.clearRect(0, 0, state.width, state.height);
    ctx.fillStyle = "#e8eef6";
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.fillStyle = "#fbfcfe";
    ctx.fillRect(
      state.transform.offsetX,
      state.transform.offsetY,
      Number(state.arena.width) * state.transform.scale,
      Number(state.arena.height) * state.transform.scale
    );

    drawTerritory(ctx);
    for (const pickup of state.pickups) drawPickup(ctx, pickup, frameAt);
    for (const projectile of state.visualProjectiles.values()) drawProjectile(ctx, projectile);
    for (const bullet of state.predictedBullets) {
      const age = (frameAt - bullet.bornAt) / 1000;
      drawProjectile(ctx, { ...bullet, x: bullet.x + bullet.vx * age, y: bullet.y + bullet.vy * age }, clamp(1 - age * 5.8, 0, 0.72));
    }
    for (const player of state.visualPlayers.values()) drawPlayer(ctx, player);
    drawExplosions(ctx);
    drawAim(ctx, frameAt);

    ctx.strokeStyle = "#98a2b3";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      state.transform.offsetX,
      state.transform.offsetY,
      Number(state.arena.width) * state.transform.scale,
      Number(state.arena.height) * state.transform.scale
    );

    const seconds = Math.max(0, Math.ceil(Number(state.remainingMs) / 1000));
    const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    ctx.fillStyle = "rgba(255,255,255,.94)";
    ctx.strokeStyle = "#d0d5dd";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(14, state.height - 54, 132, 36, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#101828";
    ctx.font = "900 13px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(`${state.phase.toUpperCase()} · ${time}`, 80, state.height - 31);

    requestAnimationFrame(drawFrame);
  }

  function canAim(event) {
    return state.phase === "playing" && !interactiveTarget(event.target) && !editableTarget(event.target);
  }

  addEventListener("pointermove", (event) => {
    pointer.clientX = event.clientX;
    pointer.clientY = event.clientY;
    if (aim.active) updateAimFromPointer();
  }, { passive: true });

  addEventListener("pointerdown", (event) => {
    if (event.button !== 2 || !canAim(event)) return;
    aim.active = true;
    pointer.clientX = event.clientX;
    pointer.clientY = event.clientY;
    updateAimFromPointer();
    updateAimHud();
    try { canvas.setPointerCapture?.(event.pointerId); } catch {}
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  addEventListener("pointerup", (event) => {
    if (event.button !== 2) return;
    aim.active = false;
    try { canvas.releasePointerCapture?.(event.pointerId); } catch {}
    updateAimHud();
    if (state.phase === "playing") {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  addEventListener("pointercancel", () => {
    aim.active = false;
    updateAimHud();
  }, true);

  addEventListener("contextmenu", (event) => {
    if (state.phase === "playing" && !interactiveTarget(event.target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  addEventListener("keydown", (event) => {
    if (editableTarget(event.target)) return;
    if (event.code === "Space" && !event.repeat) spawnPredictedShot();
    if ((event.code === "ShiftLeft" || event.code === "ShiftRight") && !event.repeat) {
      const me = localTarget();
      if (me && serverNow() >= Number(me.dashReadyAt || 0) && normalizedInput().magnitude > 0.05) {
        state.predictedDashUntil = performance.now() + (Number(me.dashDurationMs) || 210);
      }
    }
  }, true);

  addEventListener("blur", () => {
    aim.active = false;
    input.dx = 0;
    input.dy = 0;
    input.dash = false;
    input.shoot = false;
    updateAimHud();
  });

  addEventListener("resize", resize, { passive: true });
  updateAimHud();
  requestAnimationFrame(drawFrame);

  window.__triadMasterViewV21 = Object.freeze({
    build: BUILD,
    visualReference: "master-live-v9",
    renderer: "player-centered-master-view",
    mouseAim: "right-click-pointer-capture-angle-lock",
    socketArchitecture: "observe-existing-single-socket",
    serverAuthority: true
  });
})();
