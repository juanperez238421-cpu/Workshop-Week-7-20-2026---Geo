(() => {
  "use strict";

  const app = document.getElementById("app");
  const baseCanvas = document.getElementById("gameCanvas");
  if (!app || !baseCanvas || typeof WebSocket === "undefined") return;

  const BUILD = "20260723-recovered-arena22";
  const DEFAULT_COLORS = ["#22b8d6", "#ed4f86", "#f2b23b"];
  const DEFAULT_NAMES = ["Team 1", "Team 2", "Team 3"];
  const OBSERVED_SEND_TYPES = new Set(["register_student", "reconnect_student", "set_ready", "input", "ping"]);
  const ACTIVE_PHASES = new Set(["countdown", "playing"]);
  const MAX_PARTICLES = 460;
  const MAX_TRAILS = 120;
  const REMOTE_INTERPOLATION_MS = 92;
  const MAX_REMOTE_EXTRAPOLATION_MS = 125;
  const observedSockets = new WeakSet();
  const nativeSend = WebSocket.prototype.send;

  for (const id of ["studentMasterViewCanvasV21", "gameplayCanvasV20", "gameplayV9Canvas", "enhancedGameCanvas", "fluidGameCanvas"]) {
    document.getElementById(id)?.remove();
  }
  document.getElementById("masterViewAimHudV21")?.remove();

  const canvas = document.createElement("canvas");
  canvas.id = "studentRecoveredArenaCanvasV22";
  canvas.setAttribute("aria-label", "Recovered player-centered arena with mouse aiming, dedicated supply assets and fluid motion");
  canvas.setAttribute("aria-hidden", "true");
  baseCanvas.insertAdjacentElement("afterend", canvas);

  function ensureElement(id, tag, className, html) {
    const current = document.getElementById(id);
    if (current) return current;
    const element = document.createElement(tag);
    element.id = id;
    element.className = className;
    element.innerHTML = html;
    app.appendChild(element);
    return element;
  }

  const aimHud = ensureElement("recoveredAimHudV22", "div", "recovered-aim-hud-v22", `
    <span class="recovered-aim-icon-v22">⌖</span>
    <div><strong id="recoveredAimTitleV22">AIM READY</strong><small id="recoveredAimDetailV22">Hold right click on the arena</small></div>
  `);

  const rolePanel = ensureElement("threeStudentRolePanelV22", "aside", "three-student-role-panel-v22", `
    <div class="role-panel-heading-v22"><span>ONE PC · THREE ENGINEERING ROLES</span><strong id="cohesionLabelV22">COHESION ×1</strong></div>
    <div class="role-grid-v22">
      <div><span>STUDENT 1</span><strong id="movementStudentV22">Movement</strong><small>WASD / arrows · Shift dash</small></div>
      <div><span>STUDENT 2</span><strong id="aimStudentV22">Aim</strong><small>Hold right click · move mouse</small></div>
      <div><span>STUDENT 3</span><strong id="shootStudentV22">Shoot</strong><small>Spacebar only</small></div>
    </div>
  `);

  const pickupLegend = ensureElement("pickupLegendV22", "div", "pickup-legend-v22", `
    <span data-type="ammo"><img alt="Ammunition" />Ammo</span>
    <span data-type="shield"><img alt="Shield" />Shield</span>
    <span data-type="speed"><img alt="Speed" />Speed</span>
    <span data-type="rapid"><img alt="Rapid fire" />Rapid</span>
    <span data-type="paint"><img alt="Paint boost" />Paint</span>
  `);

  const pickupToast = ensureElement("pickupToastV22", "div", "pickup-toast-v22", "");

  const pickupDefinitions = Object.freeze({
    ammo: { color: "#f79009", label: "AMMUNITION", src: "assets/pickups/ammo.svg" },
    shield: { color: "#2e90fa", label: "SHIELD", src: "assets/pickups/shield.svg" },
    speed: { color: "#12b76a", label: "SPEED", src: "assets/pickups/speed.svg" },
    rapid: { color: "#f04438", label: "RAPID FIRE", src: "assets/pickups/rapid.svg" },
    paint: { color: "#7f56d9", label: "PAINT BOOST", src: "assets/pickups/paint.svg" }
  });
  const pickupImages = {};
  for (const [type, definition] of Object.entries(pickupDefinitions)) {
    const image = new Image();
    image.decoding = "async";
    image.src = `${definition.src}?v=${BUILD}`;
    pickupImages[type] = image;
    const legendImage = pickupLegend.querySelector(`[data-type="${type}"] img`);
    if (legendImage) legendImage.src = image.src;
  }

  const state = {
    phase: "lobby",
    arena: { width: 12800, height: 8000, gridWidth: 40, gridHeight: 25 },
    hitboxes: { player: 30, projectile: 14, pickup: 60 },
    cohesionRadius: 760,
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
    averageStateInterval: 0,
    lastSequence: 0,
    ctx: null,
    width: 0,
    height: 0,
    dpr: 1,
    transform: null,
    cameraX: null,
    cameraY: null,
    cameraZoom: 1,
    lastFrameAt: 0,
    predictedDashUntil: 0,
    lastDashInput: false,
    shake: 0,
    flash: 0,
    visualPlayers: new Map(),
    playerHistories: new Map(),
    visualProjectiles: new Map(),
    knownProjectileIds: new Set(),
    particles: [],
    explosions: [],
    dashTrails: [],
    predictedBullets: [],
    muzzleBursts: [],
    lastDustAt: 0,
    lastTrailAt: 0,
    toastTimer: 0
  };

  const pointer = {
    clientX: innerWidth * 0.72,
    clientY: innerHeight * 0.5,
    worldX: 0,
    worldY: 0,
    pointerId: null
  };

  const aim = { active: false, initialized: false, angle: 0 };
  const input = { dx: 0, dy: 0, dash: false, shoot: false };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const smoothing = (rate, dt) => 1 - Math.exp(-rate * Math.max(0, dt));
  const lerp = (from, to, amount) => from + (to - from) * amount;
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

  function localTarget() {
    return state.players.find((player) => String(player.id) === state.localPlayerId) || null;
  }

  function localVisual() {
    return state.visualPlayers.get(state.localPlayerId) || null;
  }

  function normalizedInput() {
    let dx = input.dx;
    let dy = input.dy;
    const magnitude = Math.hypot(dx, dy);
    if (magnitude > 1) {
      dx /= magnitude;
      dy /= magnitude;
    }
    return { dx, dy, magnitude: Math.min(1, magnitude) };
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
    state.dpr = Math.min(devicePixelRatio || 1, 1.5);
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
    if (!Array.isArray(state.territory) || state.territory.length !== expected) state.territory = new Array(expected).fill(-1);
    if (!Array.isArray(message.territoryDelta)) return;
    for (let index = 0; index + 1 < message.territoryDelta.length; index += 2) {
      const cell = Number(message.territoryDelta[index]);
      const owner = Number(message.territoryDelta[index + 1]);
      if (Number.isInteger(cell) && cell >= 0 && cell < expected) state.territory[cell] = owner;
    }
  }

  function addHistory(player, timestamp, receivedAt) {
    const id = String(player.id);
    const history = state.playerHistories.get(id) || [];
    history.push({
      time: timestamp,
      receivedAt,
      x: Number(player.x) || 0,
      y: Number(player.y) || 0,
      angle: Number(player.angle) || 0,
      vx: Number(player.velocityX) || 0,
      vy: Number(player.velocityY) || 0
    });
    while (history.length > 12 || (history.length > 2 && timestamp - history[0].time > 1000)) history.shift();
    state.playerHistories.set(id, history);
  }

  function spawnParticle(particle) {
    state.particles.push(particle);
    if (state.particles.length > MAX_PARTICLES) state.particles.splice(0, state.particles.length - MAX_PARTICLES);
  }

  function spawnExplosion(player) {
    const visual = state.visualPlayers.get(String(player.id));
    const x = Number(visual?.x ?? player.x) || 0;
    const y = Number(visual?.y ?? player.y) || 0;
    const color = state.teamColors[Number(player.team)] || "#f04438";
    state.explosions.push({ x, y, color, age: 0, duration: 0.92 });
    for (let index = 0; index < 42; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 450 + Math.random() * 1350;
      spawnParticle({
        kind: index % 4 === 0 ? "smoke" : "shard",
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rotation: angle,
        spin: (Math.random() - 0.5) * 13,
        size: 5 + Math.random() * 13,
        age: 0,
        life: 0.42 + Math.random() * 0.62,
        color: Math.random() < 0.18 ? "#ffffff" : color
      });
    }
    state.shake = Math.max(state.shake, String(player.id) === state.localPlayerId ? 27 : 13);
    state.flash = Math.max(state.flash, String(player.id) === state.localPlayerId ? 0.28 : 0.1);
  }

  function spawnMuzzle(projectile) {
    const color = state.teamColors[Number(projectile.team)] || "#101828";
    const speed = Math.hypot(Number(projectile.vx) || 0, Number(projectile.vy) || 0) || 1;
    const ux = (Number(projectile.vx) || 0) / speed;
    const uy = (Number(projectile.vy) || 0) / speed;
    const x = Number(projectile.previousX ?? projectile.x) || 0;
    const y = Number(projectile.previousY ?? projectile.y) || 0;
    state.muzzleBursts.push({ x, y, ux, uy, color, age: 0, life: 0.16 });
    for (let index = 0; index < 7; index += 1) {
      const spread = (Math.random() - 0.5) * 1.1;
      const angle = Math.atan2(uy, ux) + spread;
      const particleSpeed = 250 + Math.random() * 550;
      spawnParticle({ kind: "spark", x, y, vx: Math.cos(angle) * particleSpeed, vy: Math.sin(angle) * particleSpeed, size: 2 + Math.random() * 4, age: 0, life: 0.14 + Math.random() * 0.16, color });
    }
  }

  function showPickupToast(type, label) {
    const definition = pickupDefinitions[type] || pickupDefinitions.ammo;
    pickupToast.innerHTML = `<img src="${definition.src}?v=${BUILD}" alt="" /><div><strong>${definition.label}</strong><small>${label || "Supply collected"}</small></div>`;
    pickupToast.style.setProperty("--pickup-color", definition.color);
    pickupToast.classList.add("visible");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => pickupToast.classList.remove("visible"), 1900);
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
      state.cameraZoom = 1;
      aim.initialized = false;
      return;
    }

    if (message.type === "lobby") {
      state.phase = String(message.phase || state.phase);
      if (Array.isArray(message.teamNames)) state.teamNames = message.teamNames;
      if (Array.isArray(message.teamColors)) state.teamColors = message.teamColors;
      updateRolePanel();
      return;
    }

    if (message.type === "countdown") {
      state.phase = "countdown";
      return;
    }

    if (message.type === "pickup_collected") {
      showPickupToast(String(message.pickupType || message.power || "ammo"), message.label);
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
    const timestamp = Number(message.serverNow) || serverNow();
    if (Number.isFinite(Number(message.serverNow))) state.serverOffset = Number(message.serverNow) - Date.now();
    if (state.lastStateAt) {
      const interval = receivedAt - state.lastStateAt;
      state.averageStateInterval = state.averageStateInterval ? lerp(state.averageStateInterval, interval, 0.15) : interval;
    }
    state.lastStateAt = receivedAt;
    state.lastSequence = Number(message.sequence) || state.lastSequence;

    const previousPlayers = new Map(state.players.map((player) => [String(player.id), player]));
    const incomingPlayers = Array.isArray(message.players) ? message.players : state.players;
    for (const player of incomingPlayers) {
      const previous = previousPlayers.get(String(player.id));
      if (previous?.alive !== false && player.alive === false) spawnExplosion(player);
      addHistory(player, timestamp, receivedAt);
    }

    const incomingProjectiles = Array.isArray(message.projectiles) ? message.projectiles : state.projectiles;
    const currentIds = new Set();
    for (const projectile of incomingProjectiles) {
      const id = String(projectile.id);
      currentIds.add(id);
      if (!state.knownProjectileIds.has(id)) spawnMuzzle(projectile);
    }
    state.knownProjectileIds = currentIds;

    state.players = incomingPlayers.map((player) => ({ ...player, snapshotAt: timestamp, receivedAt }));
    state.projectiles = incomingProjectiles.map((projectile) => ({ ...projectile, snapshotAt: timestamp, receivedAt }));
    state.phase = String(message.phase || state.phase);
    if (message.arena) state.arena = message.arena;
    if (message.hitboxes) state.hitboxes = message.hitboxes;
    if (Number.isFinite(Number(message.cohesionRadius))) state.cohesionRadius = Number(message.cohesionRadius);
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
    updateRolePanel();
  }

  function observeSocket(socket) {
    if (!socket || observedSockets.has(socket)) return;
    observedSockets.add(socket);
    socket.addEventListener("message", (event) => handleMessage(parseJson(event.data)));
  }

  WebSocket.prototype.send = function recoveredArenaV22Send(payload) {
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
          state.shake = Math.max(state.shake, 4.5);
        }
        state.lastDashInput = input.dash;
        if (aim.initialized && Number.isFinite(aim.angle)) message.angle = aim.angle;
        outgoing = JSON.stringify(message);
      }
    }
    return nativeSend.call(this, outgoing);
  };

  function sampleRemotePose(target) {
    const history = state.playerHistories.get(String(target.id)) || [];
    if (!history.length) return { x: Number(target.x) || 0, y: Number(target.y) || 0, angle: Number(target.angle) || 0, vx: Number(target.velocityX) || 0, vy: Number(target.velocityY) || 0 };
    const renderAt = serverNow() - Math.max(REMOTE_INTERPOLATION_MS, Number(target.interpolationHintMs) || 0);
    let older = history[0];
    let newer = history[history.length - 1];
    for (let index = 0; index < history.length - 1; index += 1) {
      if (history[index].time <= renderAt && history[index + 1].time >= renderAt) {
        older = history[index];
        newer = history[index + 1];
        const span = Math.max(1, newer.time - older.time);
        const amount = clamp((renderAt - older.time) / span, 0, 1);
        return {
          x: lerp(older.x, newer.x, amount),
          y: lerp(older.y, newer.y, amount),
          angle: lerpAngle(older.angle, newer.angle, amount),
          vx: lerp(older.vx, newer.vx, amount),
          vy: lerp(older.vy, newer.vy, amount)
        };
      }
    }
    if (renderAt > newer.time) {
      const extrapolation = clamp(renderAt - newer.time, 0, MAX_REMOTE_EXTRAPOLATION_MS) / 1000;
      return { x: newer.x + newer.vx * extrapolation, y: newer.y + newer.vy * extrapolation, angle: newer.angle, vx: newer.vx, vy: newer.vy };
    }
    return { x: older.x, y: older.y, angle: older.angle, vx: older.vx, vy: older.vy };
  }

  function spawnDust(visual, color, speed) {
    if (state.particles.length > MAX_PARTICLES - 25) return;
    const angle = Number(visual.angle) + Math.PI + (Math.random() - 0.5) * 1.2;
    const amount = 35 + Math.random() * Math.min(180, speed * 0.3);
    spawnParticle({
      kind: "dust",
      x: Number(visual.x) - Math.cos(Number(visual.angle)) * 24,
      y: Number(visual.y) - Math.sin(Number(visual.angle)) * 24,
      vx: Math.cos(angle) * amount,
      vy: Math.sin(angle) * amount,
      size: 5 + Math.random() * 8,
      age: 0,
      life: 0.28 + Math.random() * 0.28,
      color
    });
  }

  function syncPlayers(dt, frameAt) {
    const ids = new Set();
    const movement = normalizedInput();
    for (const target of state.players) {
      const id = String(target.id);
      ids.add(id);
      let visual = state.visualPlayers.get(id);
      if (!visual) {
        visual = { ...target, x: Number(target.x) || 0, y: Number(target.y) || 0, angle: Number(target.angle) || 0, vx: Number(target.velocityX) || 0, vy: Number(target.velocityY) || 0 };
        state.visualPlayers.set(id, visual);
      }

      if (id === state.localPlayerId && target.alive !== false && target.connected !== false) {
        const normalSpeed = (Number(target.movementSpeed) || 620) * (target.activePower === "speed" ? 1.45 : 1);
        const dashSpeed = Number(target.dashSpeed) || 1900;
        const dashing = frameAt < state.predictedDashUntil || serverNow() < Number(target.dashUntil || 0);
        const desiredSpeed = dashing ? dashSpeed : normalSpeed;
        const desiredVx = movement.dx * desiredSpeed;
        const desiredVy = movement.dy * desiredSpeed;
        const acceleration = smoothing(dashing ? 34 : 15, dt);
        visual.vx += (desiredVx - Number(visual.vx || 0)) * acceleration;
        visual.vy += (desiredVy - Number(visual.vy || 0)) * acceleration;
        if (movement.magnitude < 0.02 && !dashing) {
          visual.vx *= Math.pow(0.006, dt);
          visual.vy *= Math.pow(0.006, dt);
        }
        visual.x = clamp(Number(visual.x) + visual.vx * dt, Number(state.hitboxes.player) || 30, Number(state.arena.width) - (Number(state.hitboxes.player) || 30));
        visual.y = clamp(Number(visual.y) + visual.vy * dt, Number(state.hitboxes.player) || 30, Number(state.arena.height) - (Number(state.hitboxes.player) || 30));

        const errorX = Number(target.x) - visual.x;
        const errorY = Number(target.y) - visual.y;
        const error = Math.hypot(errorX, errorY);
        if (error > 900) {
          visual.x = Number(target.x);
          visual.y = Number(target.y);
          visual.vx = Number(target.velocityX) || 0;
          visual.vy = Number(target.velocityY) || 0;
        } else {
          const correction = smoothing(error > 260 ? 8.5 : 3.4, dt);
          visual.x += errorX * correction;
          visual.y += errorY * correction;
        }
        visual.angle = lerpAngle(Number(visual.angle) || 0, aim.initialized ? aim.angle : Number(target.angle) || 0, smoothing(24, dt));

        const speed = Math.hypot(visual.vx, visual.vy);
        if (speed > 90 && frameAt - state.lastDustAt > (dashing ? 24 : 58)) {
          spawnDust(visual, state.teamColors[Number(target.team)] || "#667085", speed);
          state.lastDustAt = frameAt;
        }
        if (dashing && frameAt - state.lastTrailAt > 18) {
          state.dashTrails.push({ x: visual.x, y: visual.y, angle: visual.angle, color: state.teamColors[Number(target.team)] || "#667085", age: 0, life: 0.28, size: Number(state.hitboxes.player) || 30 });
          if (state.dashTrails.length > MAX_TRAILS) state.dashTrails.shift();
          state.lastTrailAt = frameAt;
        }
      } else {
        const pose = sampleRemotePose(target);
        const amount = smoothing(22, dt);
        visual.x += (pose.x - Number(visual.x)) * amount;
        visual.y += (pose.y - Number(visual.y)) * amount;
        visual.vx = lerp(Number(visual.vx) || 0, pose.vx, amount);
        visual.vy = lerp(Number(visual.vy) || 0, pose.vy, amount);
        visual.angle = lerpAngle(Number(visual.angle) || 0, pose.angle, amount);
      }

      const preserved = { x: visual.x, y: visual.y, angle: visual.angle, vx: visual.vx, vy: visual.vy };
      Object.assign(visual, target, preserved);
    }
    for (const id of state.visualPlayers.keys()) if (!ids.has(id)) state.visualPlayers.delete(id);
  }

  function syncProjectiles(dt, frameAt) {
    const ids = new Set();
    for (const target of state.projectiles) {
      const id = String(target.id);
      ids.add(id);
      const age = clamp((frameAt - Number(target.receivedAt || frameAt)) / 1000, 0, 0.13);
      const predictedX = Number(target.x) + Number(target.vx || 0) * age;
      const predictedY = Number(target.y) + Number(target.vy || 0) * age;
      let visual = state.visualProjectiles.get(id);
      if (!visual) {
        visual = { ...target, x: predictedX, y: predictedY, trail: [] };
        state.visualProjectiles.set(id, visual);
      } else {
        visual.trail ||= [];
        visual.trail.push({ x: visual.x, y: visual.y, age: 0 });
        if (visual.trail.length > 9) visual.trail.shift();
        const amount = smoothing(30, dt);
        visual.x += (predictedX - visual.x) * amount;
        visual.y += (predictedY - visual.y) * amount;
        const preserved = { x: visual.x, y: visual.y, trail: visual.trail };
        Object.assign(visual, target, preserved);
      }
    }
    for (const [id, visual] of state.visualProjectiles) {
      if (!ids.has(id)) state.visualProjectiles.delete(id);
      else for (const point of visual.trail || []) point.age += dt;
    }
  }

  function updateEffects(dt) {
    for (let index = state.particles.length - 1; index >= 0; index -= 1) {
      const particle = state.particles[index];
      particle.age += dt;
      particle.x += Number(particle.vx || 0) * dt;
      particle.y += Number(particle.vy || 0) * dt;
      particle.vx *= Math.pow(particle.kind === "smoke" ? 0.12 : 0.04, dt);
      particle.vy *= Math.pow(particle.kind === "smoke" ? 0.12 : 0.04, dt);
      particle.rotation = Number(particle.rotation || 0) + Number(particle.spin || 0) * dt;
      if (particle.age >= particle.life) state.particles.splice(index, 1);
    }
    for (let index = state.explosions.length - 1; index >= 0; index -= 1) {
      state.explosions[index].age += dt;
      if (state.explosions[index].age >= state.explosions[index].duration) state.explosions.splice(index, 1);
    }
    for (let index = state.dashTrails.length - 1; index >= 0; index -= 1) {
      state.dashTrails[index].age += dt;
      if (state.dashTrails[index].age >= state.dashTrails[index].life) state.dashTrails.splice(index, 1);
    }
    for (let index = state.muzzleBursts.length - 1; index >= 0; index -= 1) {
      state.muzzleBursts[index].age += dt;
      if (state.muzzleBursts[index].age >= state.muzzleBursts[index].life) state.muzzleBursts.splice(index, 1);
    }
    state.flash *= Math.pow(0.012, dt);
  }

  function updateCamera(dt) {
    const me = localVisual();
    const movement = normalizedInput();
    const direction = aim.initialized ? aim.angle : Number(me?.angle) || 0;
    const lookAhead = aim.active ? 720 : 390;
    const movementLookAhead = 190;
    const targetX = (Number(me?.x) || Number(state.arena.width) / 2) + Math.cos(direction) * lookAhead + movement.dx * movementLookAhead;
    const targetY = (Number(me?.y) || Number(state.arena.height) / 2) + Math.sin(direction) * lookAhead + movement.dy * movementLookAhead;

    if (!Number.isFinite(state.cameraX)) state.cameraX = targetX;
    if (!Number.isFinite(state.cameraY)) state.cameraY = targetY;
    const cameraAmount = smoothing(7.4, dt);
    state.cameraX += (targetX - state.cameraX) * cameraAmount;
    state.cameraY += (targetY - state.cameraY) * cameraAmount;

    const desiredZoom = aim.active ? 0.9 : performance.now() < state.predictedDashUntil ? 0.94 : 1;
    state.cameraZoom += (desiredZoom - state.cameraZoom) * smoothing(5.2, dt);
    const visibleWidth = Math.min(4700 / state.cameraZoom, Number(state.arena.width));
    const visibleHeight = Math.min(2920 / state.cameraZoom, Number(state.arena.height));
    const scale = Math.max(0.045, Math.min(state.width / visibleWidth, state.height / visibleHeight));
    const halfWidth = state.width / scale / 2;
    const halfHeight = state.height / scale / 2;
    const cameraX = Number(state.arena.width) <= halfWidth * 2 ? Number(state.arena.width) / 2 : clamp(state.cameraX, halfWidth, Number(state.arena.width) - halfWidth);
    const cameraY = Number(state.arena.height) <= halfHeight * 2 ? Number(state.arena.height) / 2 : clamp(state.cameraY, halfHeight, Number(state.arena.height) - halfHeight);

    const shakeX = state.shake > 0.1 ? (Math.random() - 0.5) * state.shake : 0;
    const shakeY = state.shake > 0.1 ? (Math.random() - 0.5) * state.shake : 0;
    state.shake *= Math.pow(0.025, dt);

    state.transform = {
      scale,
      offsetX: state.width / 2 - cameraX * scale + shakeX,
      offsetY: state.height / 2 - cameraY * scale + shakeY,
      left: cameraX - halfWidth,
      right: cameraX + halfWidth,
      top: cameraY - halfHeight,
      bottom: cameraY + halfHeight,
      cameraX,
      cameraY
    };
  }

  function worldToScreen(x, y) {
    return { x: state.transform.offsetX + Number(x) * state.transform.scale, y: state.transform.offsetY + Number(y) * state.transform.scale };
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
    const title = document.getElementById("recoveredAimTitleV22");
    const detail = document.getElementById("recoveredAimDetailV22");
    const degrees = ((aim.angle * 180 / Math.PI) + 360) % 360;
    aimHud.dataset.active = String(aim.active);
    document.body.classList.toggle("recovered-arena-v22-aiming", aim.active && ACTIVE_PHASES.has(state.phase));
    if (title) title.textContent = aim.active ? "MOUSE AIM ACTIVE" : aim.initialized ? "DIRECTION LOCKED" : "AIM READY";
    if (detail) detail.innerHTML = aim.active
      ? `Move mouse · release to lock · <b>${degrees.toFixed(0)}°</b>`
      : aim.initialized
        ? `Locked at <b>${degrees.toFixed(0)}°</b> · Space fires · right click adjusts`
        : "Hold right click on the arena";
  }

  function updateRolePanel() {
    const me = localTarget();
    const students = Array.isArray(me?.students) ? me.students : [];
    const values = [students[0] || "Movement", students[1] || "Aim", students[2] || "Shoot"];
    const ids = ["movementStudentV22", "aimStudentV22", "shootStudentV22"];
    ids.forEach((id, index) => {
      const target = document.getElementById(id);
      if (target) target.textContent = values[index];
    });
    const cohesion = document.getElementById("cohesionLabelV22");
    if (cohesion) cohesion.textContent = `COHESION ×${clamp(Number(me?.volleySize) || 1, 1, 3)}`;
    rolePanel.style.setProperty("--team-color", state.teamColors[Number(me?.team)] || "#344054");
  }

  function drawBackground(ctx) {
    ctx.fillStyle = "#e7edf5";
    ctx.fillRect(0, 0, state.width, state.height);
    ctx.fillStyle = "#fbfcfe";
    ctx.fillRect(state.transform.offsetX, state.transform.offsetY, Number(state.arena.width) * state.transform.scale, Number(state.arena.height) * state.transform.scale);

    const spacing = 180 * state.transform.scale;
    if (spacing >= 13) {
      ctx.fillStyle = "rgba(52,64,84,.055)";
      const startX = ((state.transform.offsetX % spacing) + spacing) % spacing;
      const startY = ((state.transform.offsetY % spacing) + spacing) % spacing;
      for (let x = startX; x < state.width; x += spacing) {
        for (let y = startY; y < state.height; y += spacing) {
          ctx.beginPath();
          ctx.arc(x, y, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function drawTerritory(ctx) {
    const t = state.transform;
    const gridWidth = Number(state.arena.gridWidth);
    const gridHeight = Number(state.arena.gridHeight);
    const cellWidth = Number(state.arena.width) / gridWidth;
    const cellHeight = Number(state.arena.height) / gridHeight;
    const minX = clamp(Math.floor(t.left / cellWidth) - 1, 0, gridWidth - 1);
    const maxX = clamp(Math.ceil(t.right / cellWidth) + 1, 0, gridWidth - 1);
    const minY = clamp(Math.floor(t.top / cellHeight) - 1, 0, gridHeight - 1);
    const maxY = clamp(Math.ceil(t.bottom / cellHeight) + 1, 0, gridHeight - 1);

    for (let gy = minY; gy <= maxY; gy += 1) {
      for (let gx = minX; gx <= maxX; gx += 1) {
        const index = gy * gridWidth + gx;
        const owner = Number(state.territory[index]);
        const x = t.offsetX + gx * cellWidth * t.scale;
        const y = t.offsetY + gy * cellHeight * t.scale;
        const width = cellWidth * t.scale;
        const height = cellHeight * t.scale;
        if (owner >= 0 && owner < 3) {
          const color = state.teamColors[owner];
          ctx.fillStyle = rgba(color, 0.28);
          ctx.fillRect(x, y, width + 0.5, height + 0.5);
          ctx.fillStyle = rgba(color, 0.075);
          ctx.fillRect(x + 3, y + 3, Math.max(0, width - 6), Math.max(0, height - 6));

          ctx.strokeStyle = rgba(color, 0.58);
          ctx.lineWidth = 2;
          ctx.beginPath();
          if (gx === 0 || state.territory[index - 1] !== owner) { ctx.moveTo(x, y); ctx.lineTo(x, y + height); }
          if (gx === gridWidth - 1 || state.territory[index + 1] !== owner) { ctx.moveTo(x + width, y); ctx.lineTo(x + width, y + height); }
          if (gy === 0 || state.territory[index - gridWidth] !== owner) { ctx.moveTo(x, y); ctx.lineTo(x + width, y); }
          if (gy === gridHeight - 1 || state.territory[index + gridWidth] !== owner) { ctx.moveTo(x, y + height); ctx.lineTo(x + width, y + height); }
          ctx.stroke();
        }
      }
    }

    ctx.strokeStyle = "rgba(16,24,40,.075)";
    ctx.lineWidth = 1;
    for (let gx = minX; gx <= maxX + 1; gx += 1) {
      const x = t.offsetX + gx * cellWidth * t.scale;
      ctx.beginPath();
      ctx.moveTo(x, t.offsetY + minY * cellHeight * t.scale);
      ctx.lineTo(x, t.offsetY + (maxY + 1) * cellHeight * t.scale);
      ctx.stroke();
    }
    for (let gy = minY; gy <= maxY + 1; gy += 1) {
      const y = t.offsetY + gy * cellHeight * t.scale;
      ctx.beginPath();
      ctx.moveTo(t.offsetX + minX * cellWidth * t.scale, y);
      ctx.lineTo(t.offsetX + (maxX + 1) * cellWidth * t.scale, y);
      ctx.stroke();
    }
  }

  function drawPickup(ctx, pickup, frameAt) {
    const screen = worldToScreen(pickup.x, pickup.y);
    if (screen.x < -70 || screen.x > state.width + 70 || screen.y < -70 || screen.y > state.height + 70) return;
    const definition = pickupDefinitions[pickup.type] || pickupDefinitions.ammo;
    const hitRadius = Number(pickup.radius) || Number(state.hitboxes.pickup) || 60;
    const size = clamp(hitRadius * state.transform.scale, 15, 25) * (1 + Math.sin(frameAt / 180 + Number(pickup.x) * 0.01) * 0.065);
    const rotation = frameAt / 1350 + Number(pickup.x) * 0.0004;
    const image = pickupImages[pickup.type];

    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.shadowColor = definition.color;
    ctx.shadowBlur = 20;
    ctx.fillStyle = rgba(definition.color, 0.18);
    ctx.strokeStyle = definition.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(-size, -size, size * 2, size * 2, 7);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.save();
    ctx.rotate(rotation);
    ctx.strokeStyle = rgba(definition.color, 0.75);
    ctx.lineWidth = 2;
    const arm = size * 1.35;
    const corner = size * 0.36;
    for (let index = 0; index < 4; index += 1) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(arm - corner, -arm);
      ctx.lineTo(arm, -arm);
      ctx.lineTo(arm, -arm + corner);
      ctx.stroke();
    }
    ctx.restore();

    if (image?.complete && image.naturalWidth) ctx.drawImage(image, -size * 0.72, -size * 0.72, size * 1.44, size * 1.44);
    else {
      ctx.fillStyle = definition.color;
      ctx.font = `900 ${Math.max(12, size)}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(definition.label[0], 0, 1);
    }
    ctx.restore();

    ctx.font = "800 9px system-ui";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(16,24,40,.78)";
    ctx.fillText(definition.label, screen.x, screen.y + size + 16);
  }

  function drawCohesion(ctx) {
    const me = localVisual();
    if (!me || me.alive === false) return;
    const color = state.teamColors[Number(me.team)] || "#344054";
    const center = worldToScreen(me.x, me.y);
    const radius = Number(state.cohesionRadius) * state.transform.scale;
    ctx.save();
    ctx.strokeStyle = rgba(color, 0.16);
    ctx.lineWidth = 2;
    ctx.setLineDash([9, 10]);
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const teammate of state.visualPlayers.values()) {
      if (String(teammate.id) === state.localPlayerId || Number(teammate.team) !== Number(me.team) || teammate.alive === false) continue;
      const distance = Math.hypot(Number(teammate.x) - Number(me.x), Number(teammate.y) - Number(me.y));
      if (distance > Number(state.cohesionRadius)) continue;
      const target = worldToScreen(teammate.x, teammate.y);
      ctx.strokeStyle = rgba(color, 0.52);
      ctx.lineWidth = 2.5;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
      ctx.setLineDash([]);
      const middleX = (center.x + target.x) / 2;
      const middleY = (center.y + target.y) / 2;
      ctx.fillStyle = "rgba(255,255,255,.92)";
      ctx.beginPath();
      ctx.arc(middleX, middleY, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.font = "900 9px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("+", middleX, middleY + 0.5);
    }
    ctx.restore();
  }

  function drawDashTrails(ctx) {
    for (const trail of state.dashTrails) {
      const alpha = 1 - trail.age / trail.life;
      const screen = worldToScreen(trail.x, trail.y);
      const size = clamp(Number(trail.size) * state.transform.scale * 1.35, 13, 24);
      ctx.save();
      ctx.translate(screen.x, screen.y);
      ctx.rotate(trail.angle);
      ctx.globalAlpha = alpha * 0.35;
      ctx.fillStyle = trail.color;
      ctx.beginPath();
      ctx.moveTo(size * 1.4, 0);
      ctx.lineTo(-size, size * 0.9);
      ctx.lineTo(-size * 0.7, 0);
      ctx.lineTo(-size, -size * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawProjectile(ctx, projectile, alpha = 1) {
    const screen = worldToScreen(projectile.x, projectile.y);
    if (screen.x < -60 || screen.x > state.width + 60 || screen.y < -60 || screen.y > state.height + 60) return;
    const color = state.teamColors[Number(projectile.team)] || "#101828";
    const speed = Math.hypot(Number(projectile.vx) || 0, Number(projectile.vy) || 0) || 1;
    const ux = (Number(projectile.vx) || 0) / speed;
    const uy = (Number(projectile.vy) || 0) / speed;
    const radius = clamp((Number(projectile.radius) || Number(state.hitboxes.projectile) || 14) * state.transform.scale, 5, 10);

    ctx.save();
    ctx.globalAlpha = alpha;
    for (const [index, point] of (projectile.trail || []).entries()) {
      const trailAlpha = ((index + 1) / Math.max(1, projectile.trail.length)) * 0.22;
      const trailScreen = worldToScreen(point.x, point.y);
      ctx.fillStyle = rgba(color, trailAlpha);
      ctx.beginPath();
      ctx.arc(trailScreen.x, trailScreen.y, Math.max(1.5, radius * (index + 1) / Math.max(1, projectile.trail.length)), 0, Math.PI * 2);
      ctx.fill();
    }
    const gradient = ctx.createLinearGradient(screen.x - ux * radius * 7, screen.y - uy * radius * 7, screen.x, screen.y);
    gradient.addColorStop(0, rgba(color, 0));
    gradient.addColorStop(0.5, rgba(color, 0.28));
    gradient.addColorStop(1, rgba(color, 0.9));
    ctx.strokeStyle = gradient;
    ctx.lineWidth = Math.max(5, radius * 0.95);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(screen.x - ux * radius * 7, screen.y - uy * radius * 7);
    ctx.lineTo(screen.x, screen.y);
    ctx.stroke();
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radius + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPlayer(ctx, player) {
    const screen = worldToScreen(player.x, player.y);
    if (screen.x < -120 || screen.x > state.width + 120 || screen.y < -120 || screen.y > state.height + 120) return;
    const team = Number(player.team) || 0;
    const color = state.teamColors[team] || "#667085";
    const local = String(player.id) === state.localPlayerId;
    const hitRadius = clamp((Number(state.hitboxes.player) || 30) * state.transform.scale, 11, 19);
    const size = clamp(hitRadius * 1.22, 15, 23);
    const velocity = Math.hypot(Number(player.vx) || 0, Number(player.vy) || 0);

    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.globalAlpha = player.connected === false ? 0.38 : player.alive === false ? 0.2 : 1;

    ctx.fillStyle = "rgba(16,24,40,.16)";
    ctx.beginPath();
    ctx.ellipse(3, size * 0.72, size * 1.05, size * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();

    if (local && player.alive !== false) {
      ctx.fillStyle = rgba(color, 0.11);
      ctx.beginPath();
      ctx.arc(0, 0, size * 2.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba(color, 0.6);
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, hitRadius + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = rgba(color, 0.28);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, hitRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (player.activePower === "shield" || player.invulnerable) {
      const shieldPulse = 1 + Math.sin(performance.now() / 110) * 0.04;
      ctx.strokeStyle = rgba("#2e90fa", 0.72);
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(0, 0, size * 1.75 * shieldPulse, 0, Math.PI * 2);
      ctx.stroke();
    } else if (player.activePower) {
      const powerColor = pickupDefinitions[player.activePower]?.color || color;
      ctx.strokeStyle = rgba(powerColor, 0.7);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, size * 1.65, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (player.alive === false) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-size * 0.55, -size * 0.55);
      ctx.lineTo(size * 0.55, size * 0.55);
      ctx.moveTo(size * 0.55, -size * 0.55);
      ctx.lineTo(-size * 0.55, size * 0.55);
      ctx.stroke();
      ctx.restore();
      return;
    }

    ctx.rotate(Number(player.angle) || 0);
    if (velocity > 110) {
      const flame = clamp(velocity / 800, 0.25, 1);
      ctx.fillStyle = rgba(color, 0.45);
      ctx.beginPath();
      ctx.moveTo(-size * 0.7, size * 0.42);
      ctx.lineTo(-size * (1.4 + flame * 0.65), 0);
      ctx.lineTo(-size * 0.7, -size * 0.42);
      ctx.closePath();
      ctx.fill();
    }

    ctx.shadowColor = rgba(color, 0.5);
    ctx.shadowBlur = local ? 13 : 7;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(size * 1.5, 0);
    ctx.lineTo(-size, size * 0.92);
    ctx.lineTo(-size * 0.72, size * 0.25);
    ctx.lineTo(-size * 0.72, -size * 0.25);
    ctx.lineTo(-size, -size * 0.92);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = local ? "#101828" : rgba("#101828", 0.55);
    ctx.lineWidth = local ? 2.5 : 1.5;
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,.88)";
    ctx.beginPath();
    ctx.moveTo(size * 0.65, 0);
    ctx.lineTo(-size * 0.28, size * 0.3);
    ctx.lineTo(-size * 0.28, -size * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#101828";
    ctx.beginPath();
    ctx.arc(size * 0.72, 0, Math.max(2, size * 0.12), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const label = `${player.pcLabel || "Player"}${player.isBot ? " · AI" : ""}`;
    const teamName = state.teamNames[team] || `Team ${team + 1}`;
    ctx.font = `${local ? 900 : 800} ${local ? 12 : 10}px system-ui`;
    const width = Math.max(ctx.measureText(label).width, ctx.measureText(teamName).width) + 16;
    const labelY = screen.y - size - 34;
    ctx.fillStyle = "rgba(255,255,255,.95)";
    ctx.strokeStyle = rgba(color, 0.65);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(screen.x - width / 2, labelY, width, 29, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#101828";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(label, screen.x, labelY + 12);
    ctx.fillStyle = color;
    ctx.font = "800 8px system-ui";
    ctx.fillText(teamName.toUpperCase(), screen.x, labelY + 23);

    ctx.font = "900 10px system-ui";
    ctx.fillStyle = color;
    ctx.fillText(`L${player.lives ?? 3} · A${player.ammo ?? 5} · ×${clamp(Number(player.volleySize) || 1, 1, 3)}`, screen.x, screen.y + size + 20);
  }

  function drawParticles(ctx) {
    for (const particle of state.particles) {
      const progress = clamp(particle.age / particle.life, 0, 1);
      const alpha = 1 - progress;
      const screen = worldToScreen(particle.x, particle.y);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(screen.x, screen.y);
      ctx.rotate(Number(particle.rotation) || 0);
      if (particle.kind === "shard") {
        ctx.fillStyle = particle.color;
        const size = Math.max(1.5, particle.size * state.transform.scale);
        ctx.fillRect(-size, -size * 0.35, size * 2, size * 0.7);
      } else if (particle.kind === "spark") {
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-particle.size * 1.5, 0);
        ctx.lineTo(particle.size * 1.5, 0);
        ctx.stroke();
      } else {
        ctx.fillStyle = particle.kind === "smoke" ? `rgba(71,84,103,${alpha * 0.35})` : rgba(particle.color, alpha * 0.34);
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(1.5, particle.size * state.transform.scale * (particle.kind === "smoke" ? 1 + progress : 1)), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    for (const explosion of state.explosions) {
      const progress = clamp(explosion.age / explosion.duration, 0, 1);
      const center = worldToScreen(explosion.x, explosion.y);
      ctx.save();
      ctx.strokeStyle = rgba(explosion.color, (1 - progress) * 0.86);
      ctx.lineWidth = Math.max(2, (1 - progress) * 9);
      ctx.beginPath();
      ctx.arc(center.x, center.y, 12 + progress * 92, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${(1 - progress) * 0.7})`;
      ctx.lineWidth = Math.max(1, (1 - progress) * 4);
      ctx.beginPath();
      ctx.arc(center.x, center.y, 6 + progress * 54, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (const burst of state.muzzleBursts) {
      const alpha = 1 - burst.age / burst.life;
      const screen = worldToScreen(burst.x, burst.y);
      ctx.save();
      ctx.translate(screen.x, screen.y);
      ctx.rotate(Math.atan2(burst.uy, burst.ux));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(28 * alpha, 0);
      ctx.lineTo(0, 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = burst.color;
      ctx.beginPath();
      ctx.arc(0, 0, 7 * alpha + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawAim(ctx, frameAt) {
    const me = localVisual();
    if (!me || me.alive === false || !aim.initialized) return;
    const color = state.teamColors[Number(me.team)] || "#7f56d9";
    const start = worldToScreen(me.x, me.y);
    const maxDistance = aim.active ? 3600 : 900;
    let targetWorld = {
      x: Number(me.x) + Math.cos(aim.angle) * maxDistance,
      y: Number(me.y) + Math.sin(aim.angle) * maxDistance
    };
    if (aim.active) {
      const pointerDistance = Math.hypot(pointer.worldX - Number(me.x), pointer.worldY - Number(me.y));
      const distance = clamp(pointerDistance, 120, 3600);
      targetWorld = { x: Number(me.x) + Math.cos(aim.angle) * distance, y: Number(me.y) + Math.sin(aim.angle) * distance };
    }
    const end = worldToScreen(targetWorld.x, targetWorld.y);

    ctx.save();
    const gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
    gradient.addColorStop(0, rgba(color, aim.active ? 0.92 : 0.52));
    gradient.addColorStop(1, rgba(color, aim.active ? 0.18 : 0));
    ctx.strokeStyle = gradient;
    ctx.lineWidth = aim.active ? 3 : 2;
    ctx.setLineDash(aim.active ? [13, 9] : [8, 9]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.setLineDash([]);

    const pulse = 12 + Math.sin(frameAt / 90) * 2.5;
    ctx.strokeStyle = aim.active ? color : rgba(color, 0.58);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(end.x, end.y, pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(end.x - 20, end.y);
    ctx.lineTo(end.x - 7, end.y);
    ctx.moveTo(end.x + 7, end.y);
    ctx.lineTo(end.x + 20, end.y);
    ctx.moveTo(end.x, end.y - 20);
    ctx.lineTo(end.x, end.y - 7);
    ctx.moveTo(end.x, end.y + 7);
    ctx.lineTo(end.x, end.y + 20);
    ctx.stroke();
    if (aim.active) {
      ctx.fillStyle = "rgba(255,255,255,.92)";
      ctx.beginPath();
      ctx.roundRect(end.x - 27, end.y + 25, 54, 18, 6);
      ctx.fill();
      ctx.fillStyle = "#101828";
      ctx.font = "900 9px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("SPACE", end.x, end.y + 37);
    }
    ctx.restore();
  }

  function drawOffscreenTeammates(ctx) {
    const me = localVisual();
    if (!me) return;
    const margin = 42;
    const centerX = state.width / 2;
    const centerY = state.height / 2;
    for (const teammate of state.visualPlayers.values()) {
      if (String(teammate.id) === state.localPlayerId || Number(teammate.team) !== Number(me.team) || teammate.alive === false) continue;
      const screen = worldToScreen(teammate.x, teammate.y);
      if (screen.x >= margin && screen.x <= state.width - margin && screen.y >= margin && screen.y <= state.height - margin) continue;
      const angle = Math.atan2(screen.y - centerY, screen.x - centerX);
      const radiusX = state.width / 2 - margin;
      const radiusY = state.height / 2 - margin;
      const scale = Math.min(Math.abs(radiusX / (Math.cos(angle) || 0.0001)), Math.abs(radiusY / (Math.sin(angle) || 0.0001)));
      const x = centerX + Math.cos(angle) * scale;
      const y = centerY + Math.sin(angle) * scale;
      const color = state.teamColors[Number(teammate.team)] || "#344054";
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = color;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(13, 0);
      ctx.lineTo(-8, 8);
      ctx.lineTo(-8, -8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      const distance = Math.round(Math.hypot(Number(teammate.x) - Number(me.x), Number(teammate.y) - Number(me.y)) / 100);
      ctx.fillStyle = "rgba(255,255,255,.92)";
      ctx.beginPath();
      ctx.roundRect(x - 22, y + 14, 44, 16, 5);
      ctx.fill();
      ctx.fillStyle = "#101828";
      ctx.font = "800 8px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`${distance}u`, x, y + 25);
    }
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
      shot.closest(".cooldown-row")?.classList.toggle("is-ready", progress >= 0.999);
      shot.closest(".cooldown-row")?.classList.toggle("is-cooling", progress < 0.999);
    }
    if (dash) {
      const duration = Math.max(1, Number(me.dashCooldownMs) || 1800);
      const readyAt = Number(me.dashReadyAt) || 0;
      const progress = now >= readyAt ? 1 : clamp(1 - (readyAt - now) / duration, 0, 1);
      dash.value = progress;
      dash.closest(".cooldown-row")?.classList.toggle("is-ready", progress >= 0.999);
      dash.closest(".cooldown-row")?.classList.toggle("is-cooling", progress < 0.999);
    }
  }

  function spawnPredictedShot() {
    if (state.phase !== "playing") return;
    const me = localTarget();
    const visual = localVisual();
    if (!me || !visual || me.alive === false || Number(me.ammo) <= 0 || !aim.initialized) return;
    if (serverNow() + 35 < Number(me.shotReadyAt || 0)) return;
    const speed = 2850;
    state.predictedBullets.push({
      id: `predicted-${performance.now()}`,
      team: me.team,
      radius: 14,
      x: Number(visual.x) + Math.cos(aim.angle) * 48,
      y: Number(visual.y) + Math.sin(aim.angle) * 48,
      vx: Math.cos(aim.angle) * speed,
      vy: Math.sin(aim.angle) * speed,
      bornAt: performance.now(),
      lifetime: 175,
      trail: []
    });
    spawnMuzzle({ team: me.team, previousX: visual.x + Math.cos(aim.angle) * 42, previousY: visual.y + Math.sin(aim.angle) * 42, vx: Math.cos(aim.angle) * speed, vy: Math.sin(aim.angle) * speed });
    state.shake = Math.max(state.shake, 5.5);
  }

  function updatePredictedBullets(frameAt) {
    state.predictedBullets = state.predictedBullets.filter((bullet) => frameAt - bullet.bornAt < bullet.lifetime);
  }

  function drawFrame(frameAt) {
    const active = ACTIVE_PHASES.has(state.phase) && !document.hidden;
    document.body.classList.toggle("recovered-arena-v22-active", active);
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
    updateEffects(dt);
    updatePredictedBullets(frameAt);
    updateCamera(dt);
    if (aim.active) updateAimFromPointer();
    updateCooldownHud();

    const ctx = state.ctx;
    ctx.clearRect(0, 0, state.width, state.height);
    drawBackground(ctx);
    drawTerritory(ctx);
    drawCohesion(ctx);
    drawDashTrails(ctx);
    for (const pickup of state.pickups) drawPickup(ctx, pickup, frameAt);
    for (const projectile of state.visualProjectiles.values()) drawProjectile(ctx, projectile);
    for (const bullet of state.predictedBullets) {
      const age = (frameAt - bullet.bornAt) / 1000;
      drawProjectile(ctx, { ...bullet, x: bullet.x + bullet.vx * age, y: bullet.y + bullet.vy * age }, clamp(1 - age * 5.6, 0, 0.76));
    }
    for (const player of state.visualPlayers.values()) drawPlayer(ctx, player);
    drawParticles(ctx);
    drawAim(ctx, frameAt);
    drawOffscreenTeammates(ctx);

    ctx.strokeStyle = "#667085";
    ctx.lineWidth = 3;
    ctx.strokeRect(state.transform.offsetX, state.transform.offsetY, Number(state.arena.width) * state.transform.scale, Number(state.arena.height) * state.transform.scale);

    if (state.flash > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${clamp(state.flash, 0, 0.32)})`;
      ctx.fillRect(0, 0, state.width, state.height);
    }

    requestAnimationFrame(drawFrame);
  }

  function canAim() {
    return ACTIVE_PHASES.has(state.phase);
  }

  canvas.addEventListener("pointermove", (event) => {
    pointer.clientX = event.clientX;
    pointer.clientY = event.clientY;
    if (aim.active) updateAimFromPointer();
  }, { passive: true });

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 2 || !canAim()) return;
    aim.active = true;
    pointer.pointerId = event.pointerId;
    pointer.clientX = event.clientX;
    pointer.clientY = event.clientY;
    updateAimFromPointer();
    updateAimHud();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
    event.preventDefault();
    event.stopPropagation();
  });

  canvas.addEventListener("pointerup", (event) => {
    if (event.button !== 2) return;
    aim.active = false;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
    pointer.pointerId = null;
    updateAimHud();
    event.preventDefault();
    event.stopPropagation();
  });

  canvas.addEventListener("pointercancel", (event) => {
    aim.active = false;
    pointer.pointerId = null;
    updateAimHud();
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
  });

  canvas.addEventListener("lostpointercapture", () => {
    aim.active = false;
    pointer.pointerId = null;
    updateAimHud();
  });

  canvas.addEventListener("contextmenu", (event) => {
    if (!canAim()) return;
    event.preventDefault();
    event.stopPropagation();
  });

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
    pointer.pointerId = null;
    input.dx = 0;
    input.dy = 0;
    input.dash = false;
    input.shoot = false;
    updateAimHud();
  });

  addEventListener("resize", resize, { passive: true });
  updateAimHud();
  updateRolePanel();
  requestAnimationFrame(drawFrame);

  window.__triadRecoveredArenaV22 = Object.freeze({
    build: BUILD,
    visualReference: "gameplay-v9-plus-conversation-assets",
    renderer: "player-centered-recovered-arena",
    movement: "local-acceleration-prediction-and-remote-snapshot-interpolation",
    mouseAim: "right-click-direct-canvas-pointer-capture-angle-lock",
    mouseShoot: false,
    pickupAssets: Object.keys(pickupDefinitions),
    socketArchitecture: "observe-existing-single-socket",
    serverAuthority: true,
    connectionConfigurationPreserved: true
  });
})();
