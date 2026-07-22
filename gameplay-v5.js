(() => {
  "use strict";

  const baseCanvas = document.getElementById("gameCanvas");
  if (!baseCanvas) return;

  const enhancedCanvas = document.createElement("canvas");
  enhancedCanvas.id = "enhancedGameCanvas";
  enhancedCanvas.setAttribute("aria-label", "Smooth camera-follow arena with right-click aiming");
  enhancedCanvas.setAttribute("aria-hidden", "true");
  baseCanvas.insertAdjacentElement("afterend", enhancedCanvas);

  const rolePanel = document.createElement("aside");
  rolePanel.id = "threeStudentControlPanel";
  rolePanel.className = "three-student-control-panel";
  rolePanel.innerHTML = `
    <div class="control-role"><span>STUDENT 1</span><strong id="movementRoleName">Movement</strong><small>WASD / arrows + Shift</small></div>
    <div class="control-role"><span>STUDENT 2</span><strong id="aimRoleName">Aim</strong><small>Hold right click + mouse</small></div>
    <div class="control-role"><span>STUDENT 3</span><strong id="shootRoleName">Shoot</strong><small>Spacebar only</small></div>
    <div id="cohesionBadge" class="cohesion-badge" data-level="1"><span>TEAM COHESION</span><strong>×1 SHOT</strong><small>Move near teammates for ×2 or ×3</small></div>
    <div id="aimModeBadge" class="aim-mode-badge" data-active="false"><span>AIM MODE</span><strong>LOCKED DIRECTION</strong><small>Hold right click to move guide</small></div>`;
  document.getElementById("app")?.appendChild(rolePanel);

  const randomTitleInput = document.getElementById("pcLabelInput");
  if (randomTitleInput) {
    randomTitleInput.value = "Assigned automatically";
    randomTitleInput.readOnly = true;
    randomTitleInput.autocomplete = "off";
    randomTitleInput.title = "The authoritative server assigns a unique random PC title when this registration is submitted.";
    const label = randomTitleInput.closest("label");
    if (label?.firstChild?.nodeType === Node.TEXT_NODE) label.firstChild.textContent = "Random PC / player title";
  }

  const ctx = enhancedCanvas.getContext("2d");
  const observedSockets = new WeakSet();
  const currentSend = WebSocket.prototype.send;
  const pointer = { clientX: innerWidth * 0.68, clientY: innerHeight * 0.5, worldX: 0, worldY: 0 };
  const aim = { active: false, angle: 0, initialized: false };
  const visualPlayers = new Map();
  const visualProjectiles = new Map();
  let spacePressed = false;
  let dpr = 1;
  let viewportWidth = innerWidth;
  let viewportHeight = innerHeight;
  let cameraX = 0;
  let cameraY = 0;
  let cameraReady = false;
  let lastFrameAt = performance.now();
  let lastTransform = null;
  let lastStateAt = performance.now();

  const state = {
    roomCode: "",
    playerId: "",
    pcLabel: "",
    students: ["Student 1", "Student 2", "Student 3"],
    phase: "lobby",
    arena: { width: 9600, height: 6000, gridWidth: 40, gridHeight: 25 },
    cohesionRadius: 760,
    teamNames: ["Team 1", "Team 2", "Team 3"],
    teamColors: ["#1f77b4", "#d62728", "#2ca02c"],
    players: [],
    projectiles: [],
    territory: [],
    territoryCounts: [0, 0, 0],
    remainingMs: 300000
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const smoothFactor = (rate, dt) => 1 - Math.exp(-rate * Math.max(0, dt));
  const lerpAngle = (from, to, amount) => {
    const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
    return from + delta * amount;
  };

  function rgba(hex, alpha) {
    const clean = String(hex || "#000000").replace("#", "");
    const normalized = clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean;
    const value = Number.parseInt(normalized, 16) || 0;
    return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
  }

  function localTargetPlayer() {
    return state.players.find((player) => player.id === state.playerId) || null;
  }

  function localVisualPlayer() {
    return visualPlayers.get(state.playerId) || localTargetPlayer();
  }

  function resize() {
    viewportWidth = innerWidth;
    viewportHeight = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(viewportWidth * dpr));
    const height = Math.max(1, Math.floor(viewportHeight * dpr));
    if (enhancedCanvas.width !== width || enhancedCanvas.height !== height) {
      enhancedCanvas.width = width;
      enhancedCanvas.height = height;
      enhancedCanvas.style.width = `${viewportWidth}px`;
      enhancedCanvas.style.height = `${viewportHeight}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function cameraTransform(dtSeconds = 0) {
    const me = localVisualPlayer();
    const directionX = Math.cos(aim.angle || Number(me?.angle) || 0);
    const directionY = Math.sin(aim.angle || Number(me?.angle) || 0);
    const lookAhead = aim.active ? 520 : 260;
    const targetX = (me?.x ?? state.arena.width / 2) + directionX * lookAhead;
    const targetY = (me?.y ?? state.arena.height / 2) + directionY * lookAhead;

    if (!cameraReady) {
      cameraX = targetX;
      cameraY = targetY;
      cameraReady = true;
    } else {
      const amount = smoothFactor(5.8, dtSeconds);
      cameraX += (targetX - cameraX) * amount;
      cameraY += (targetY - cameraY) * amount;
    }

    const desiredWorldWidth = Math.min(3600, state.arena.width);
    const desiredWorldHeight = Math.min(2250, state.arena.height);
    const scale = Math.max(0.06, Math.min(viewportWidth / desiredWorldWidth, viewportHeight / desiredWorldHeight));
    const halfWorldWidth = viewportWidth / scale / 2;
    const halfWorldHeight = viewportHeight / scale / 2;
    cameraX = clamp(cameraX, halfWorldWidth, Math.max(halfWorldWidth, state.arena.width - halfWorldWidth));
    cameraY = clamp(cameraY, halfWorldHeight, Math.max(halfWorldHeight, state.arena.height - halfWorldHeight));

    return {
      scale,
      offsetX: viewportWidth / 2 - cameraX * scale,
      offsetY: viewportHeight / 2 - cameraY * scale,
      worldLeft: cameraX - halfWorldWidth,
      worldRight: cameraX + halfWorldWidth,
      worldTop: cameraY - halfWorldHeight,
      worldBottom: cameraY + halfWorldHeight
    };
  }

  function worldFromClient(clientX, clientY) {
    const transform = lastTransform || cameraTransform(0);
    return {
      x: clamp((clientX - transform.offsetX) / transform.scale, 0, state.arena.width),
      y: clamp((clientY - transform.offsetY) / transform.scale, 0, state.arena.height)
    };
  }

  function updateAimFromPointer() {
    const me = localVisualPlayer() || localTargetPlayer();
    if (!me) return;
    const world = worldFromClient(pointer.clientX, pointer.clientY);
    pointer.worldX = world.x;
    pointer.worldY = world.y;
    aim.angle = Math.atan2(world.y - me.y, world.x - me.x);
    aim.initialized = true;
  }

  function updateRolePanel() {
    const names = state.students.length === 3 ? state.students : ["Student 1", "Student 2", "Student 3"];
    const movement = document.getElementById("movementRoleName");
    const aimName = document.getElementById("aimRoleName");
    const shoot = document.getElementById("shootRoleName");
    if (movement) movement.textContent = `${names[0]} · Movement`;
    if (aimName) aimName.textContent = `${names[1]} · Aim`;
    if (shoot) shoot.textContent = `${names[2]} · Shoot`;

    const me = localTargetPlayer();
    const volley = clamp(Number(me?.volleySize) || 1, 1, 3);
    const cohesionBadge = document.getElementById("cohesionBadge");
    if (cohesionBadge) {
      cohesionBadge.dataset.level = String(volley);
      const strong = cohesionBadge.querySelector("strong");
      const small = cohesionBadge.querySelector("small");
      if (strong) strong.textContent = `×${volley} SHOT${volley === 1 ? "" : "S"}`;
      if (small) small.textContent = volley === 3 ? "Full three-player formation active" : volley === 2 ? "Two allied players in formation" : "Move near teammates for ×2 or ×3";
    }

    const aimBadge = document.getElementById("aimModeBadge");
    if (aimBadge) {
      aimBadge.dataset.active = String(aim.active);
      const strong = aimBadge.querySelector("strong");
      const small = aimBadge.querySelector("small");
      if (strong) strong.textContent = aim.active ? "RIGHT-CLICK AIMING" : "LOCKED DIRECTION";
      if (small) small.textContent = aim.active ? "Move mouse to place guide" : "Hold right click to redirect";
    }
  }

  function handleMessage(message) {
    if (!message || typeof message !== "object") return;
    if (message.type === "joined") {
      state.playerId = String(message.playerId || "");
      state.roomCode = String(message.roomCode || "");
      state.pcLabel = String(message.pcLabel || "");
      state.students = Array.isArray(message.students) ? message.students : state.students;
      state.arena = message.arena || state.arena;
      cameraReady = false;
      aim.initialized = false;
      updateRolePanel();
      return;
    }
    if (message.type === "registration_received") {
      state.pcLabel = String(message.pcLabel || state.pcLabel);
      if (randomTitleInput) randomTitleInput.value = state.pcLabel || "Assigned automatically";
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
      const previousProjectiles = new Map(state.projectiles.map((projectile) => [projectile.id, projectile]));
      const elapsed = Math.max(0.016, (now - lastStateAt) / 1000);
      lastStateAt = now;
      state.phase = message.phase || state.phase;
      state.arena = message.arena || state.arena;
      state.cohesionRadius = Number(message.cohesionRadius) || state.cohesionRadius;
      state.teamNames = Array.isArray(message.teamNames) ? message.teamNames : state.teamNames;
      state.teamColors = Array.isArray(message.teamColors) ? message.teamColors : state.teamColors;
      state.players = Array.isArray(message.players) ? message.players : [];
      state.projectiles = Array.isArray(message.projectiles) ? message.projectiles.map((projectile) => {
        const previous = previousProjectiles.get(projectile.id);
        return {
          ...projectile,
          vx: previous ? (projectile.x - previous.x) / elapsed : 0,
          vy: previous ? (projectile.y - previous.y) / elapsed : 0,
          receivedAt: now
        };
      }) : [];
      state.territory = Array.isArray(message.territory) ? message.territory : [];
      state.territoryCounts = Array.isArray(message.territoryCounts) ? message.territoryCounts : [0, 0, 0];
      state.remainingMs = Number(message.remainingMs) || 0;
      const me = localTargetPlayer();
      if (me && !aim.initialized) {
        aim.angle = Number(me.angle) || 0;
        aim.initialized = true;
      }
      updateRolePanel();
    }
  }

  function observeSocket(socket) {
    if (!socket || observedSockets.has(socket)) return;
    observedSockets.add(socket);
    socket.addEventListener("message", (event) => {
      try { handleMessage(JSON.parse(event.data)); } catch {}
    });
  }

  WebSocket.prototype.send = function smoothGameplaySend(payload) {
    if (typeof payload === "string") {
      try {
        const message = JSON.parse(payload);
        if (["register_student", "reconnect_student", "input"].includes(message.type)) observeSocket(this);
        if (message.type === "register_student") {
          message.pcLabel = "AUTO";
          payload = JSON.stringify(message);
        } else if (message.type === "input") {
          if (aim.active) updateAimFromPointer();
          const me = localTargetPlayer();
          if (me && !aim.initialized) {
            aim.angle = Number(me.angle) || 0;
            aim.initialized = true;
          }
          message.angle = aim.angle;
          message.shoot = spacePressed;
          payload = JSON.stringify(message);
        }
      } catch {}
    }
    return currentSend.call(this, payload);
  };

  function syncVisualPlayers(dt) {
    const liveIds = new Set();
    const amount = smoothFactor(15, dt);
    for (const target of state.players) {
      liveIds.add(target.id);
      let visual = visualPlayers.get(target.id);
      if (!visual) {
        visual = { ...target };
        visualPlayers.set(target.id, visual);
      } else {
        visual.x += (Number(target.x) - visual.x) * amount;
        visual.y += (Number(target.y) - visual.y) * amount;
        visual.angle = lerpAngle(Number(visual.angle) || 0, Number(target.angle) || 0, amount);
        Object.assign(visual, target, { x: visual.x, y: visual.y, angle: visual.angle });
      }
    }
    for (const id of visualPlayers.keys()) if (!liveIds.has(id)) visualPlayers.delete(id);
  }

  function syncVisualProjectiles(dt, frameAt) {
    const liveIds = new Set();
    const amount = smoothFactor(22, dt);
    for (const target of state.projectiles) {
      liveIds.add(target.id);
      const age = Math.max(0, (frameAt - (target.receivedAt || frameAt)) / 1000);
      const predictedX = Number(target.x) + Number(target.vx || 0) * Math.min(age, 0.08);
      const predictedY = Number(target.y) + Number(target.vy || 0) * Math.min(age, 0.08);
      let visual = visualProjectiles.get(target.id);
      if (!visual) {
        visual = { ...target, x: predictedX, y: predictedY };
        visualProjectiles.set(target.id, visual);
      } else {
        visual.x += (predictedX - visual.x) * amount;
        visual.y += (predictedY - visual.y) * amount;
        Object.assign(visual, target, { x: visual.x, y: visual.y });
      }
    }
    for (const id of visualProjectiles.keys()) if (!liveIds.has(id)) visualProjectiles.delete(id);
  }

  function drawGrid(transform) {
    const cellWidth = state.arena.width / state.arena.gridWidth;
    const cellHeight = state.arena.height / state.arena.gridHeight;
    const minX = Math.max(0, Math.floor(transform.worldLeft / cellWidth));
    const maxX = Math.min(state.arena.gridWidth - 1, Math.ceil(transform.worldRight / cellWidth));
    const minY = Math.max(0, Math.floor(transform.worldTop / cellHeight));
    const maxY = Math.min(state.arena.gridHeight - 1, Math.ceil(transform.worldBottom / cellHeight));

    for (let gy = minY; gy <= maxY; gy += 1) {
      for (let gx = minX; gx <= maxX; gx += 1) {
        const owner = state.territory[gy * state.arena.gridWidth + gx];
        if (owner >= 0 && owner < 3) {
          ctx.fillStyle = rgba(state.teamColors[owner], 0.31);
          ctx.fillRect(
            transform.offsetX + gx * cellWidth * transform.scale,
            transform.offsetY + gy * cellHeight * transform.scale,
            cellWidth * transform.scale + 0.8,
            cellHeight * transform.scale + 0.8
          );
        }
      }
    }

    ctx.strokeStyle = "rgba(17,24,39,.075)";
    ctx.lineWidth = 1;
    for (let gx = minX; gx <= maxX + 1; gx += 1) {
      const x = transform.offsetX + gx * cellWidth * transform.scale;
      ctx.beginPath();
      ctx.moveTo(x, Math.max(0, transform.offsetY + minY * cellHeight * transform.scale));
      ctx.lineTo(x, Math.min(viewportHeight, transform.offsetY + (maxY + 1) * cellHeight * transform.scale));
      ctx.stroke();
    }
    for (let gy = minY; gy <= maxY + 1; gy += 1) {
      const y = transform.offsetY + gy * cellHeight * transform.scale;
      ctx.beginPath();
      ctx.moveTo(Math.max(0, transform.offsetX + minX * cellWidth * transform.scale), y);
      ctx.lineTo(Math.min(viewportWidth, transform.offsetX + (maxX + 1) * cellWidth * transform.scale), y);
      ctx.stroke();
    }
  }

  function drawCohesion(transform) {
    const me = localVisualPlayer();
    if (!me || !me.alive) return;
    const teammates = [...visualPlayers.values()].filter((player) => player.id !== me.id && player.team === me.team && player.alive && player.connected !== false);
    for (const teammate of teammates) {
      const distance = Math.hypot(teammate.x - me.x, teammate.y - me.y);
      if (distance > state.cohesionRadius) continue;
      const opacity = Math.max(0.18, 1 - distance / state.cohesionRadius);
      ctx.strokeStyle = rgba(state.teamColors[me.team], 0.24 + opacity * 0.48);
      ctx.lineWidth = 4;
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      ctx.moveTo(transform.offsetX + me.x * transform.scale, transform.offsetY + me.y * transform.scale);
      ctx.lineTo(transform.offsetX + teammate.x * transform.scale, transform.offsetY + teammate.y * transform.scale);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.strokeStyle = rgba(state.teamColors[me.team], 0.18);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(transform.offsetX + me.x * transform.scale, transform.offsetY + me.y * transform.scale, state.cohesionRadius * transform.scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawAimGuide(transform) {
    const me = localVisualPlayer();
    if (!me || !me.alive) return;
    const startX = transform.offsetX + me.x * transform.scale;
    const startY = transform.offsetY + me.y * transform.scale;
    const maxDistance = 2500;
    const targetWorldX = me.x + Math.cos(aim.angle) * maxDistance;
    const targetWorldY = me.y + Math.sin(aim.angle) * maxDistance;
    const endX = transform.offsetX + targetWorldX * transform.scale;
    const endY = transform.offsetY + targetWorldY * transform.scale;
    const color = state.teamColors[me.team] || "#1f77b4";

    ctx.save();
    ctx.strokeStyle = rgba(color, aim.active ? 0.82 : 0.38);
    ctx.lineWidth = aim.active ? 3 : 2;
    ctx.setLineDash(aim.active ? [] : [12, 10]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);

    const crossDistance = Math.min(maxDistance, Math.hypot(pointer.worldX - me.x, pointer.worldY - me.y) || 900);
    const crossX = transform.offsetX + (me.x + Math.cos(aim.angle) * crossDistance) * transform.scale;
    const crossY = transform.offsetY + (me.y + Math.sin(aim.angle) * crossDistance) * transform.scale;
    ctx.strokeStyle = rgba(color, aim.active ? 0.95 : 0.55);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(crossX, crossY, 11, 0, Math.PI * 2);
    ctx.moveTo(crossX - 17, crossY);
    ctx.lineTo(crossX + 17, crossY);
    ctx.moveTo(crossX, crossY - 17);
    ctx.lineTo(crossX, crossY + 17);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayer(player, transform) {
    const x = transform.offsetX + player.x * transform.scale;
    const y = transform.offsetY + player.y * transform.scale;
    if (x < -90 || x > viewportWidth + 90 || y < -90 || y > viewportHeight + 90) return;
    const me = player.id === state.playerId;
    const size = me ? 22 : 18;
    const color = state.teamColors[player.team] || "#667085";

    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = player.connected === false ? 0.35 : 1;
    if (player.alive === false) {
      ctx.strokeStyle = "#667085";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-size, -size);
      ctx.lineTo(size, size);
      ctx.moveTo(size, -size);
      ctx.lineTo(-size, size);
      ctx.stroke();
    } else {
      if (me) {
        ctx.fillStyle = rgba(color, 0.14);
        ctx.beginPath();
        ctx.arc(0, 0, size * 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (player.invulnerable) {
        ctx.strokeStyle = rgba(color, 0.6);
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, size * 1.55, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.rotate(Number(player.angle) || 0);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(size * 1.5, 0);
      ctx.lineTo(-size, size * 0.92);
      ctx.lineTo(-size * 0.72, 0);
      ctx.lineTo(-size, -size * 0.92);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = me ? "#101828" : "#ffffff";
      ctx.lineWidth = me ? 5 : 3;
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.font = me ? "900 13px system-ui" : "800 11px system-ui";
    ctx.textAlign = "center";
    ctx.fillStyle = "#101828";
    const label = `${player.pcLabel || player.name || "Player"}${player.isBot ? " · AI" : ""}`;
    ctx.fillText(label, x, y - size - 10);
    if (me) {
      const volley = clamp(Number(player.volleySize) || 1, 1, 3);
      ctx.fillStyle = color;
      ctx.font = "900 10px system-ui";
      ctx.fillText(`COHESION ×${volley}`, x, y + size + 19);
    }
    ctx.restore();
  }

  function drawProjectile(projectile, transform) {
    const x = transform.offsetX + projectile.x * transform.scale;
    const y = transform.offsetY + projectile.y * transform.scale;
    if (x < -30 || x > viewportWidth + 30 || y < -30 || y > viewportHeight + 30) return;
    const color = state.teamColors[projectile.team] || "#101828";
    const speed = Math.hypot(Number(projectile.vx) || 0, Number(projectile.vy) || 0) || 1;
    const trailX = x - ((Number(projectile.vx) || 0) / speed) * 22;
    const trailY = y - ((Number(projectile.vy) || 0) / speed) * 22;
    const gradient = ctx.createLinearGradient(trailX, trailY, x, y);
    gradient.addColorStop(0, rgba(color, 0));
    gradient.addColorStop(1, rgba(color, 0.85));
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(trailX, trailY);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.88)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawCompass(transform) {
    const me = localVisualPlayer();
    if (!me) return;
    const teammates = [...visualPlayers.values()].filter((player) => player.id !== me.id && player.team === me.team && player.alive);
    for (const teammate of teammates) {
      const x = transform.offsetX + teammate.x * transform.scale;
      const y = transform.offsetY + teammate.y * transform.scale;
      if (x >= 26 && x <= viewportWidth - 26 && y >= 132 && y <= viewportHeight - 104) continue;
      const angle = Math.atan2(y - viewportHeight / 2, x - viewportWidth / 2);
      const edgeX = clamp(viewportWidth / 2 + Math.cos(angle) * (viewportWidth / 2 - 54), 40, viewportWidth - 40);
      const edgeY = clamp(viewportHeight / 2 + Math.sin(angle) * (viewportHeight / 2 - 118), 144, viewportHeight - 108);
      const distance = Math.round(Math.hypot(teammate.x - me.x, teammate.y - me.y));
      ctx.save();
      ctx.translate(edgeX, edgeY);
      ctx.rotate(angle);
      ctx.fillStyle = state.teamColors[me.team];
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-9, 9);
      ctx.lineTo(-9, -9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.fillStyle = "#101828";
      ctx.font = "800 10px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`${Math.ceil(distance / 100)}u`, edgeX, edgeY + 23);
      ctx.restore();
    }
  }

  function draw(frameAt) {
    resize();
    const dt = Math.min(0.05, Math.max(0.001, (frameAt - lastFrameAt) / 1000));
    lastFrameAt = frameAt;
    syncVisualPlayers(dt);
    syncVisualProjectiles(dt, frameAt);
    const transform = cameraTransform(dt);
    lastTransform = transform;

    if (aim.active) updateAimFromPointer();

    ctx.clearRect(0, 0, viewportWidth, viewportHeight);
    ctx.fillStyle = "#e9eef5";
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);

    const backdrop = ctx.createRadialGradient(viewportWidth / 2, viewportHeight / 2, 80, viewportWidth / 2, viewportHeight / 2, Math.max(viewportWidth, viewportHeight) * 0.8);
    backdrop.addColorStop(0, "rgba(255,255,255,.52)");
    backdrop.addColorStop(1, "rgba(148,163,184,.08)");
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);

    ctx.fillStyle = "#fbfcfe";
    ctx.fillRect(transform.offsetX, transform.offsetY, state.arena.width * transform.scale, state.arena.height * transform.scale);

    drawGrid(transform);
    drawCohesion(transform);
    for (const projectile of visualProjectiles.values()) drawProjectile(projectile, transform);
    for (const player of visualPlayers.values()) drawPlayer(player, transform);
    drawAimGuide(transform);
    drawCompass(transform);

    ctx.strokeStyle = "#98a2b3";
    ctx.lineWidth = 3;
    ctx.strokeRect(transform.offsetX, transform.offsetY, state.arena.width * transform.scale, state.arena.height * transform.scale);

    requestAnimationFrame(draw);
  }

  function isArenaPointerEvent(event) {
    return event.target === baseCanvas && state.phase === "playing";
  }

  addEventListener("pointermove", (event) => {
    pointer.clientX = event.clientX;
    pointer.clientY = event.clientY;
    if (aim.active) updateAimFromPointer();
  }, { passive: true });

  addEventListener("pointerdown", (event) => {
    if (!isArenaPointerEvent(event)) return;
    if (event.button === 2) {
      aim.active = true;
      pointer.clientX = event.clientX;
      pointer.clientY = event.clientY;
      updateAimFromPointer();
      updateRolePanel();
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
    updateRolePanel();
    if (event.target === baseCanvas) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  baseCanvas.addEventListener("contextmenu", (event) => event.preventDefault());

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
    spacePressed = false;
    aim.active = false;
    updateRolePanel();
  });
  addEventListener("resize", resize);

  resize();
  updateRolePanel();
  requestAnimationFrame(draw);
})();
