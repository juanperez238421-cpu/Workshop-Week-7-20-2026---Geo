(() => {
  "use strict";

  if (typeof WebSocket === "undefined" || typeof HTMLCanvasElement === "undefined") return;

  const BUILD = "20260723-fluid-gameplay20";
  const DEFAULT_COLORS = ["#1f77b4", "#d62728", "#2ca02c"];
  const DEFAULT_NAMES = ["Team 1", "Team 2", "Team 3"];
  const observedSockets = new WeakSet();
  const nativeAddEventListener = WebSocket.prototype.addEventListener;
  const nativeSend = WebSocket.prototype.send;

  const state = {
    phase: "lobby",
    arena: { width: 12800, height: 8000, gridWidth: 40, gridHeight: 25 },
    territory: new Array(1000).fill(-1),
    teamColors: [...DEFAULT_COLORS],
    teamNames: [...DEFAULT_NAMES],
    players: new Map(),
    projectiles: new Map(),
    pickups: [],
    localPlayerId: "",
    serverOffset: 0,
    lastStateAt: 0,
    lastServerNow: 0,
    canvas: null,
    ctx: null,
    width: 0,
    height: 0,
    dpr: 1,
    cameraX: null,
    cameraY: null,
    transform: null,
    lastFrameAt: 0,
    shake: 0,
    particles: [],
    predictedBullets: [],
    dustAt: 0,
    input: {
      up: false,
      down: false,
      left: false,
      right: false,
      aiming: false,
      angle: 0,
      dashVisualUntil: 0
    }
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const nowServer = () => Date.now() + state.serverOffset;

  function parseJson(value) {
    if (typeof value !== "string") return null;
    try { return JSON.parse(value); } catch { return null; }
  }

  function rgba(hex, alpha) {
    const clean = String(hex || "#111827").replace("#", "");
    const normalized = clean.length === 3 ? clean.split("").map((character) => character + character).join("") : clean;
    const value = Number.parseInt(normalized, 16) || 0;
    return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
  }

  function editableTarget(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
  }

  function applyTerritory(message) {
    const expected = Number(state.arena.gridWidth) * Number(state.arena.gridHeight);
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

  function spawnBurst(x, y, color, count = 22, strength = 430) {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = strength * (0.35 + Math.random() * 0.75);
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 3 + Math.random() * 7,
        color,
        bornAt: performance.now(),
        lifetime: 360 + Math.random() * 420,
        drag: 0.9 + Math.random() * 0.06
      });
    }
    state.shake = Math.max(state.shake, 12);
  }

  function updatePlayers(players, serverNow) {
    const seen = new Set();
    for (const raw of players) {
      const id = String(raw.id || "");
      if (!id) continue;
      seen.add(id);
      let visual = state.players.get(id);
      if (!visual) {
        visual = {
          id,
          raw,
          x: Number(raw.x) || 0,
          y: Number(raw.y) || 0,
          targetX: Number(raw.x) || 0,
          targetY: Number(raw.y) || 0,
          velocityX: Number(raw.velocityX) || 0,
          velocityY: Number(raw.velocityY) || 0,
          snapshotAt: serverNow,
          alive: raw.alive !== false,
          initialized: true
        };
        state.players.set(id, visual);
      } else {
        const previousTargetX = visual.targetX;
        const previousTargetY = visual.targetY;
        const previousSnapshotAt = visual.snapshotAt;
        const wasAlive = visual.alive;
        visual.raw = raw;
        visual.targetX = Number(raw.x) || 0;
        visual.targetY = Number(raw.y) || 0;
        visual.snapshotAt = serverNow;
        const elapsed = Math.max(0.001, (serverNow - previousSnapshotAt) / 1000);
        visual.velocityX = Number.isFinite(Number(raw.velocityX)) ? Number(raw.velocityX) : (visual.targetX - previousTargetX) / elapsed;
        visual.velocityY = Number.isFinite(Number(raw.velocityY)) ? Number(raw.velocityY) : (visual.targetY - previousTargetY) / elapsed;
        visual.alive = raw.alive !== false;
        if (wasAlive && !visual.alive) spawnBurst(visual.x, visual.y, state.teamColors[Number(raw.team)] || "#667085", 30, 560);
      }

      if (id === state.localPlayerId) {
        const errorX = visual.targetX - visual.x;
        const errorY = visual.targetY - visual.y;
        const error = Math.hypot(errorX, errorY);
        if (error > 650) {
          visual.x = visual.targetX;
          visual.y = visual.targetY;
        } else {
          visual.x += errorX * 0.32;
          visual.y += errorY * 0.32;
        }
        if (!state.input.aiming) state.input.angle = Number(raw.angle) || state.input.angle;
      }
    }

    for (const [id] of state.players) {
      if (!seen.has(id)) state.players.delete(id);
    }
  }

  function updateProjectiles(projectiles, serverNow) {
    const seen = new Set();
    for (const raw of projectiles) {
      const id = String(raw.id || "");
      if (!id) continue;
      seen.add(id);
      const existing = state.projectiles.get(id);
      state.projectiles.set(id, {
        ...raw,
        id,
        x: Number(raw.x) || 0,
        y: Number(raw.y) || 0,
        vx: Number(raw.vx) || 0,
        vy: Number(raw.vy) || 0,
        snapshotAt: serverNow,
        firstSeenAt: existing?.firstSeenAt || performance.now()
      });
    }
    for (const [id] of state.projectiles) {
      if (!seen.has(id)) state.projectiles.delete(id);
    }
  }

  function handleMessage(message) {
    if (!message || typeof message !== "object") return;
    if (message.type === "hello") {
      state.serverOffset = Number(message.serverTime) - Date.now();
      return;
    }
    if (message.type === "joined") {
      state.localPlayerId = String(message.playerId || "");
      if (message.arena) state.arena = message.arena;
      return;
    }
    if (message.type === "countdown") {
      state.phase = "countdown";
      return;
    }
    if (message.type === "match_ended") {
      state.phase = "ended";
      return;
    }
    if (message.type !== "state") return;

    state.phase = String(message.phase || state.phase);
    if (message.arena) state.arena = message.arena;
    if (Array.isArray(message.teamColors) && message.teamColors.length === 3) state.teamColors = message.teamColors;
    if (Array.isArray(message.teamNames) && message.teamNames.length === 3) state.teamNames = message.teamNames;
    if (Number.isFinite(Number(message.serverNow))) state.serverOffset = Number(message.serverNow) - Date.now();
    const serverNow = Number(message.serverNow) || nowServer();
    state.lastServerNow = serverNow;
    state.lastStateAt = performance.now();
    applyTerritory(message);
    updatePlayers(Array.isArray(message.players) ? message.players : [], serverNow);
    updateProjectiles(Array.isArray(message.projectiles) ? message.projectiles : [], serverNow);
    state.pickups = Array.isArray(message.pickups) ? message.pickups : [];
  }

  function observe(socket) {
    if (!socket || observedSockets.has(socket)) return;
    observedSockets.add(socket);
    nativeAddEventListener.call(socket, "message", (event) => handleMessage(parseJson(event.data)));
  }

  WebSocket.prototype.addEventListener = function gameplayV20AddEventListener(type, listener, options) {
    if (type === "message") observe(this);
    return nativeAddEventListener.call(this, type, listener, options);
  };

  WebSocket.prototype.send = function gameplayV20Send(payload) {
    if (typeof payload === "string") {
      const message = parseJson(payload);
      if (message?.type === "input" && state.input.aiming && Number.isFinite(state.input.angle)) {
        message.angle = state.input.angle;
        payload = JSON.stringify(message);
      }
    }
    return nativeSend.call(this, payload);
  };

  function ensureCanvas() {
    if (state.canvas && state.ctx) return true;
    const app = document.getElementById("app") || document.body;
    const canvas = document.createElement("canvas");
    canvas.id = "gameplayCanvasV20";
    canvas.setAttribute("aria-hidden", "true");
    app.appendChild(canvas);
    const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!context) {
      canvas.remove();
      return false;
    }
    state.canvas = canvas;
    state.ctx = context;
    resize();
    return true;
  }

  function resize() {
    if (!state.canvas || !state.ctx) return;
    state.width = Math.max(1, innerWidth);
    state.height = Math.max(1, innerHeight);
    state.dpr = Math.min(devicePixelRatio || 1, 2);
    state.canvas.width = Math.round(state.width * state.dpr);
    state.canvas.height = Math.round(state.height * state.dpr);
    state.canvas.style.width = `${state.width}px`;
    state.canvas.style.height = `${state.height}px`;
    state.ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  }

  function localVisual() {
    return state.players.get(state.localPlayerId) || null;
  }

  function inputVector() {
    let dx = (state.input.right ? 1 : 0) - (state.input.left ? 1 : 0);
    let dy = (state.input.down ? 1 : 0) - (state.input.up ? 1 : 0);
    const magnitude = Math.hypot(dx, dy);
    if (magnitude > 1) { dx /= magnitude; dy /= magnitude; }
    return { dx, dy, magnitude };
  }

  function predictLocal(dt, now) {
    const visual = localVisual();
    if (!visual || visual.raw?.alive === false || visual.raw?.connected === false) return;
    const input = inputVector();
    const movementSpeed = Number(visual.raw?.movementSpeed) || 620;
    const dashSpeed = Number(visual.raw?.dashSpeed) || 1900;
    const speed = now < state.input.dashVisualUntil ? dashSpeed : movementSpeed;
    visual.x = clamp(visual.x + input.dx * speed * dt, 30, Number(state.arena.width) - 30);
    visual.y = clamp(visual.y + input.dy * speed * dt, 30, Number(state.arena.height) - 30);
    visual.velocityX = input.dx * speed;
    visual.velocityY = input.dy * speed;
    if (state.input.aiming) visual.raw = { ...visual.raw, angle: state.input.angle };

    if (input.magnitude > 0.05 && performance.now() >= state.dustAt) {
      state.dustAt = performance.now() + (now < state.input.dashVisualUntil ? 18 : 48);
      const angle = Math.atan2(input.dy, input.dx) + Math.PI + (Math.random() - 0.5) * 0.7;
      const color = state.teamColors[Number(visual.raw?.team)] || "#667085";
      state.particles.push({
        x: visual.x - input.dx * 26,
        y: visual.y - input.dy * 26,
        vx: Math.cos(angle) * (80 + Math.random() * 150),
        vy: Math.sin(angle) * (80 + Math.random() * 150),
        radius: now < state.input.dashVisualUntil ? 6 + Math.random() * 7 : 3 + Math.random() * 4,
        color,
        bornAt: performance.now(),
        lifetime: now < state.input.dashVisualUntil ? 300 : 210,
        drag: 0.91
      });
    }
  }

  function smoothRemotePlayers(dt, now) {
    const smoothing = 1 - Math.exp(-12 * dt);
    const serverTime = nowServer();
    for (const visual of state.players.values()) {
      if (visual.id === state.localPlayerId) continue;
      const age = clamp((serverTime - visual.snapshotAt) / 1000, 0, 0.12);
      const predictedX = visual.targetX + visual.velocityX * age;
      const predictedY = visual.targetY + visual.velocityY * age;
      visual.x = lerp(visual.x, predictedX, smoothing);
      visual.y = lerp(visual.y, predictedY, smoothing);
    }
  }

  function updateCamera(dt) {
    const local = localVisual();
    const fallbackX = Number(state.arena.width) / 2;
    const fallbackY = Number(state.arena.height) / 2;
    const input = inputVector();
    const lookAhead = state.input.aiming ? 145 : 95;
    const targetX = (local?.x ?? fallbackX) + Math.cos(state.input.angle) * lookAhead + input.dx * 75;
    const targetY = (local?.y ?? fallbackY) + Math.sin(state.input.angle) * lookAhead + input.dy * 75;
    if (!Number.isFinite(state.cameraX)) state.cameraX = targetX;
    if (!Number.isFinite(state.cameraY)) state.cameraY = targetY;
    const smoothing = 1 - Math.exp(-9 * dt);
    state.cameraX = lerp(state.cameraX, targetX, smoothing);
    state.cameraY = lerp(state.cameraY, targetY, smoothing);

    const visibleWidth = Math.min(3200, Number(state.arena.width));
    const visibleHeight = Math.min(1900, Number(state.arena.height));
    const scale = Math.max(0.05, Math.min(state.width / visibleWidth, state.height / visibleHeight));
    const halfW = state.width / scale / 2;
    const halfH = state.height / scale / 2;
    const cameraX = Number(state.arena.width) <= halfW * 2 ? Number(state.arena.width) / 2 : clamp(state.cameraX, halfW, Number(state.arena.width) - halfW);
    const cameraY = Number(state.arena.height) <= halfH * 2 ? Number(state.arena.height) / 2 : clamp(state.cameraY, halfH, Number(state.arena.height) - halfH);
    const shakeX = (Math.random() - 0.5) * state.shake;
    const shakeY = (Math.random() - 0.5) * state.shake;
    state.shake *= Math.pow(0.001, dt);
    state.transform = {
      scale,
      offsetX: state.width / 2 - cameraX * scale + shakeX,
      offsetY: state.height / 2 - cameraY * scale + shakeY,
      left: cameraX - halfW,
      right: cameraX + halfW,
      top: cameraY - halfH,
      bottom: cameraY + halfH
    };
  }

  function worldToScreen(x, y) {
    const transform = state.transform;
    return {
      x: Number(x) * transform.scale + transform.offsetX,
      y: Number(y) * transform.scale + transform.offsetY
    };
  }

  function drawPickup(ctx, pickup, now) {
    const type = String(pickup.type || "power");
    const colors = { ammo: "#f79009", shield: "#2e90fa", speed: "#12b76a", rapid: "#f04438", paint: "#7f56d9" };
    const labels = { ammo: "A", shield: "S", speed: ">", rapid: "R", paint: "P" };
    const color = colors[type] || "#667085";
    const pulse = 1 + Math.sin(now / 180 + Number(pickup.x) * 0.01) * 0.08;
    ctx.save();
    ctx.translate(Number(pickup.x), Number(pickup.y));
    ctx.rotate(now / 1250 + Number(pickup.x) * 0.001);
    ctx.shadowColor = rgba(color, 0.45);
    ctx.shadowBlur = 24;
    ctx.fillStyle = "rgba(255,255,255,.95)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.fillRect(-25 * pulse, -25 * pulse, 50 * pulse, 50 * pulse);
    ctx.strokeRect(-25 * pulse, -25 * pulse, 50 * pulse, 50 * pulse);
    ctx.rotate(-(now / 1250 + Number(pickup.x) * 0.001));
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.font = "900 26px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(labels[type] || "?", 0, 1);
    ctx.restore();
  }

  function drawProjectile(ctx, projectile, now) {
    const age = clamp((nowServer() - Number(projectile.snapshotAt)) / 1000, 0, 0.11);
    const x = Number(projectile.x) + Number(projectile.vx) * age;
    const y = Number(projectile.y) + Number(projectile.vy) * age;
    const speed = Math.hypot(Number(projectile.vx), Number(projectile.vy)) || 1;
    const ux = Number(projectile.vx) / speed;
    const uy = Number(projectile.vy) / speed;
    const tail = 72;
    const color = state.teamColors[Number(projectile.team)] || "#101828";
    ctx.save();
    ctx.lineCap = "round";
    ctx.shadowColor = rgba(color, 0.9);
    ctx.shadowBlur = 18;
    ctx.strokeStyle = "rgba(255,255,255,.96)";
    ctx.lineWidth = 11;
    ctx.beginPath(); ctx.moveTo(x - ux * tail, y - uy * tail); ctx.lineTo(x, y); ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x - ux * tail, y - uy * tail); ctx.lineTo(x, y); ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawPredictedBullet(ctx, bullet, now) {
    const age = now - bullet.bornAt;
    const remaining = clamp(1 - age / bullet.lifetime, 0, 1);
    const x = bullet.x + bullet.vx * age / 1000;
    const y = bullet.y + bullet.vy * age / 1000;
    const speed = Math.hypot(bullet.vx, bullet.vy) || 1;
    const ux = bullet.vx / speed;
    const uy = bullet.vy / speed;
    ctx.save();
    ctx.globalAlpha = remaining * 0.75;
    ctx.strokeStyle = rgba(bullet.color, 0.92);
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x - ux * 54, y - uy * 54); ctx.lineTo(x, y); ctx.stroke();
    ctx.restore();
  }

  function drawPlayer(ctx, visual, now) {
    const raw = visual.raw || {};
    const team = Number(raw.team) || 0;
    const color = state.teamColors[team] || "#667085";
    const angle = visual.id === state.localPlayerId && state.input.aiming ? state.input.angle : Number(raw.angle) || 0;
    const speed = Math.hypot(visual.velocityX, visual.velocityY);
    const local = visual.id === state.localPlayerId;

    ctx.save();
    ctx.translate(visual.x, visual.y);
    ctx.globalAlpha = raw.connected === false ? 0.35 : 1;

    ctx.fillStyle = "rgba(16,24,40,.18)";
    ctx.beginPath(); ctx.ellipse(5, 18, 37, 17, angle, 0, Math.PI * 2); ctx.fill();

    if (raw.alive === false) {
      ctx.strokeStyle = "#667085";
      ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(-30, -30); ctx.lineTo(30, 30); ctx.moveTo(30, -30); ctx.lineTo(-30, 30); ctx.stroke();
      ctx.restore();
      return;
    }

    if (raw.invulnerable) {
      ctx.strokeStyle = rgba(color, 0.55 + Math.sin(now / 80) * 0.2);
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(0, 0, 46 + Math.sin(now / 90) * 4, 0, Math.PI * 2); ctx.stroke();
    }

    if (local) {
      ctx.strokeStyle = "rgba(16,24,40,.48)";
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 9]);
      ctx.beginPath(); ctx.arc(0, 0, 54, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.rotate(angle);
    const stretch = clamp(speed / 1500, 0, 0.22);
    ctx.shadowColor = rgba(color, 0.52);
    ctx.shadowBlur = 18;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(43 + stretch * 24, 0);
    ctx.lineTo(-27, 24 - stretch * 4);
    ctx.lineTo(-18, 0);
    ctx.lineTo(-27, -24 + stretch * 4);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = local ? "#101828" : "#ffffff";
    ctx.lineWidth = local ? 7 : 4;
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(11, 0, 7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    const labelY = visual.y - 48;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${local ? 800 : 700} 16px system-ui`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(255,255,255,.95)";
    const label = `${raw.pcLabel || raw.name || "Player"}${raw.isBot ? " · AI" : ""}`;
    ctx.strokeText(label, visual.x, labelY);
    ctx.fillStyle = "#101828";
    ctx.fillText(label, visual.x, labelY);

    const lives = clamp(Number(raw.lives) || 0, 0, 3);
    for (let index = 0; index < 3; index += 1) {
      ctx.fillStyle = index < lives ? color : "rgba(152,162,179,.45)";
      ctx.beginPath(); ctx.arc(visual.x - 13 + index * 13, labelY + 19, 4.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function updateParticles(dt, now) {
    const next = [];
    for (const particle of state.particles) {
      const age = now - particle.bornAt;
      if (age >= particle.lifetime) continue;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.pow(particle.drag, dt * 60);
      particle.vy *= Math.pow(particle.drag, dt * 60);
      next.push(particle);
    }
    state.particles = next;
    state.predictedBullets = state.predictedBullets.filter((bullet) => now - bullet.bornAt < bullet.lifetime);
  }

  function drawParticles(ctx, now) {
    for (const particle of state.particles) {
      const life = clamp(1 - (now - particle.bornAt) / particle.lifetime, 0, 1);
      ctx.fillStyle = rgba(particle.color, life * 0.72);
      ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.radius * life, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawArena(now) {
    const ctx = state.ctx;
    const transform = state.transform;
    ctx.clearRect(0, 0, state.width, state.height);
    ctx.fillStyle = "#e9eef5";
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.save();
    ctx.translate(transform.offsetX, transform.offsetY);
    ctx.scale(transform.scale, transform.scale);
    ctx.fillStyle = "#fbfcfe";
    ctx.fillRect(0, 0, Number(state.arena.width), Number(state.arena.height));

    const cellW = Number(state.arena.width) / Number(state.arena.gridWidth);
    const cellH = Number(state.arena.height) / Number(state.arena.gridHeight);
    const minX = clamp(Math.floor(transform.left / cellW) - 1, 0, Number(state.arena.gridWidth) - 1);
    const maxX = clamp(Math.ceil(transform.right / cellW) + 1, 0, Number(state.arena.gridWidth) - 1);
    const minY = clamp(Math.floor(transform.top / cellH) - 1, 0, Number(state.arena.gridHeight) - 1);
    const maxY = clamp(Math.ceil(transform.bottom / cellH) + 1, 0, Number(state.arena.gridHeight) - 1);

    for (let gy = minY; gy <= maxY; gy += 1) {
      for (let gx = minX; gx <= maxX; gx += 1) {
        const owner = Number(state.territory[gy * Number(state.arena.gridWidth) + gx]);
        if (owner < 0 || owner > 2) continue;
        ctx.fillStyle = rgba(state.teamColors[owner], 0.29);
        ctx.fillRect(gx * cellW, gy * cellH, cellW + 1, cellH + 1);
      }
    }

    ctx.strokeStyle = "rgba(17,24,39,.075)";
    ctx.lineWidth = 1 / transform.scale;
    for (let gx = minX; gx <= maxX + 1; gx += 1) {
      ctx.beginPath(); ctx.moveTo(gx * cellW, transform.top); ctx.lineTo(gx * cellW, transform.bottom); ctx.stroke();
    }
    for (let gy = minY; gy <= maxY + 1; gy += 1) {
      ctx.beginPath(); ctx.moveTo(transform.left, gy * cellH); ctx.lineTo(transform.right, gy * cellH); ctx.stroke();
    }

    const local = localVisual();
    if (local && state.input.aiming && local.raw?.alive !== false) {
      ctx.save();
      ctx.strokeStyle = "rgba(16,24,40,.28)";
      ctx.lineWidth = 4;
      ctx.setLineDash([18, 16]);
      ctx.beginPath();
      ctx.moveTo(local.x + Math.cos(state.input.angle) * 45, local.y + Math.sin(state.input.angle) * 45);
      ctx.lineTo(local.x + Math.cos(state.input.angle) * 980, local.y + Math.sin(state.input.angle) * 980);
      ctx.stroke();
      ctx.restore();
    }

    for (const pickup of state.pickups) {
      if (Number(pickup.x) < transform.left - 100 || Number(pickup.x) > transform.right + 100 || Number(pickup.y) < transform.top - 100 || Number(pickup.y) > transform.bottom + 100) continue;
      drawPickup(ctx, pickup, now);
    }

    drawParticles(ctx, now);
    for (const bullet of state.predictedBullets) drawPredictedBullet(ctx, bullet, now);
    for (const projectile of state.projectiles.values()) drawProjectile(ctx, projectile, now);
    for (const visual of state.players.values()) drawPlayer(ctx, visual, now);

    ctx.strokeStyle = "#98a2b3";
    ctx.lineWidth = 5 / transform.scale;
    ctx.strokeRect(0, 0, Number(state.arena.width), Number(state.arena.height));
    ctx.restore();

    const gradient = ctx.createRadialGradient(state.width / 2, state.height / 2, Math.min(state.width, state.height) * 0.18, state.width / 2, state.height / 2, Math.max(state.width, state.height) * 0.72);
    gradient.addColorStop(0, "rgba(16,24,40,0)");
    gradient.addColorStop(1, "rgba(16,24,40,.11)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, state.width, state.height);
  }

  function updateCooldownHud() {
    const local = localVisual();
    if (!local?.raw) return;
    const raw = local.raw;
    const serverTime = nowServer();
    const shot = document.getElementById("shotCooldown");
    const dash = document.getElementById("dashCooldown");

    if (shot) {
      const cooldown = Math.max(1, Number(raw.shotCooldownMs) || 250);
      const readyAt = Number(raw.shotReadyAt) || 0;
      const lastShotAt = Number(raw.lastShotAt) || readyAt - cooldown;
      const progress = serverTime >= readyAt ? 1 : clamp((serverTime - lastShotAt) / cooldown, 0, 1);
      shot.value = progress;
      const row = shot.closest(".cooldown-row");
      row?.classList.toggle("is-ready", progress >= 0.999);
      row?.classList.toggle("is-cooling", progress < 0.999);
    }

    if (dash) {
      const cooldown = Math.max(1, Number(raw.dashCooldownMs) || 1800);
      const readyAt = Number(raw.dashReadyAt) || 0;
      const progress = serverTime >= readyAt ? 1 : clamp(1 - (readyAt - serverTime) / cooldown, 0, 1);
      dash.value = progress;
      const row = dash.closest(".cooldown-row");
      row?.classList.toggle("is-ready", progress >= 0.999);
      row?.classList.toggle("is-cooling", progress < 0.999);
    }

    const ammoTimer = document.getElementById("ammoRegenTimer");
    const ammo = Number(raw.ammo) || 0;
    const maxAmmo = Number(raw.maxAmmo) || 5;
    if (ammoTimer && ammo < maxAmmo) {
      const elapsedSinceSnapshot = Math.max(0, serverTime - Number(local.snapshotAt || serverTime));
      const remaining = Math.max(0, Number(raw.ammoRegenRemainingMs) - elapsedSinceSnapshot);
      ammoTimer.textContent = `Next charge in ${(remaining / 1000).toFixed(1)} s`;
    }
  }

  function spawnLocalShotFx() {
    if (state.phase !== "playing") return;
    const local = localVisual();
    if (!local?.raw || local.raw.alive === false || Number(local.raw.ammo) <= 0) return;
    const serverTime = nowServer();
    if (serverTime + 35 < Number(local.raw.shotReadyAt || 0)) return;
    const angle = Number.isFinite(state.input.angle) ? state.input.angle : Number(local.raw.angle) || 0;
    const speed = 2850;
    const color = state.teamColors[Number(local.raw.team)] || "#101828";
    const x = local.x + Math.cos(angle) * 45;
    const y = local.y + Math.sin(angle) * 45;
    state.predictedBullets.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, bornAt: performance.now(), lifetime: 165, color });
    spawnBurst(x, y, color, 7, 220);
    state.shake = Math.max(state.shake, 5.5);
  }

  function updateAim(event) {
    if (!state.input.aiming || !state.transform) return;
    const local = localVisual();
    if (!local) return;
    const worldX = (event.clientX - state.transform.offsetX) / state.transform.scale;
    const worldY = (event.clientY - state.transform.offsetY) / state.transform.scale;
    state.input.angle = Math.atan2(worldY - local.y, worldX - local.x);
  }

  function keyState(event, pressed) {
    if (editableTarget(event.target)) return;
    const key = event.key.toLowerCase();
    if (["w", "arrowup"].includes(key)) state.input.up = pressed;
    if (["s", "arrowdown"].includes(key)) state.input.down = pressed;
    if (["a", "arrowleft"].includes(key)) state.input.left = pressed;
    if (["d", "arrowright"].includes(key)) state.input.right = pressed;
    if (key === " " && pressed && !event.repeat) spawnLocalShotFx();
    if (key === "shift" && pressed && !event.repeat) {
      const local = localVisual();
      if (local?.raw && nowServer() >= Number(local.raw.dashReadyAt || 0) && inputVector().magnitude > 0.05) {
        state.input.dashVisualUntil = performance.now() + (Number(local.raw.dashDurationMs) || 210);
        state.shake = Math.max(state.shake, 4);
      }
    }
  }

  function frame(frameAt) {
    const active = ["countdown", "playing"].includes(state.phase) && !document.hidden;
    if (active && ensureCanvas()) {
      document.body.classList.add("gameplay-v20-active");
      const dt = state.lastFrameAt ? clamp((frameAt - state.lastFrameAt) / 1000, 0, 0.05) : 0;
      state.lastFrameAt = frameAt;
      predictLocal(dt, frameAt);
      smoothRemotePlayers(dt, frameAt);
      updateParticles(dt, frameAt);
      updateCamera(dt || 1 / 60);
      drawArena(frameAt);
      updateCooldownHud();
    } else {
      document.body.classList.remove("gameplay-v20-active");
      state.lastFrameAt = frameAt;
    }
    requestAnimationFrame(frame);
  }

  addEventListener("keydown", (event) => keyState(event, true));
  addEventListener("keyup", (event) => keyState(event, false));
  addEventListener("blur", () => Object.assign(state.input, { up: false, down: false, left: false, right: false, aiming: false }));
  addEventListener("resize", resize, { passive: true });
  addEventListener("mousemove", updateAim, { passive: true });
  addEventListener("mousedown", (event) => {
    if (event.button !== 2 || editableTarget(event.target)) return;
    state.input.aiming = true;
    updateAim(event);
  });
  addEventListener("mouseup", (event) => {
    if (event.button === 2) state.input.aiming = false;
  });

  requestAnimationFrame(frame);

  window.__triadGameplayV20 = Object.freeze({
    build: BUILD,
    renderer: "predicted-local-interpolated-remote",
    combat: "authoritative-swept-projectile-v20",
    smoothCamera: true,
    immediateShotFx: true,
    cooldownTelemetry: true
  });
})();
