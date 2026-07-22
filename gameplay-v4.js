(() => {
  "use strict";

  const baseCanvas = document.getElementById("gameCanvas");
  if (!baseCanvas) return;

  const enhancedCanvas = document.createElement("canvas");
  enhancedCanvas.id = "enhancedGameCanvas";
  enhancedCanvas.setAttribute("aria-label", "Enhanced close-follow arena camera");
  enhancedCanvas.setAttribute("aria-hidden", "true");
  baseCanvas.insertAdjacentElement("afterend", enhancedCanvas);

  const rolePanel = document.createElement("aside");
  rolePanel.id = "threeStudentControlPanel";
  rolePanel.className = "three-student-control-panel";
  rolePanel.innerHTML = `
    <div class="control-role"><span>STUDENT 1</span><strong id="movementRoleName">Movement</strong><small>WASD / arrows + Shift</small></div>
    <div class="control-role"><span>STUDENT 2</span><strong id="aimRoleName">Aim</strong><small>Mouse only</small></div>
    <div class="control-role"><span>STUDENT 3</span><strong id="shootRoleName">Shoot</strong><small>Spacebar only</small></div>
    <div id="cohesionBadge" class="cohesion-badge" data-level="1"><span>TEAM COHESION</span><strong>×1 SHOT</strong><small>Move near teammates for ×2 or ×3</small></div>`;
  document.getElementById("app")?.appendChild(rolePanel);

  const ctx = enhancedCanvas.getContext("2d");
  const observedSockets = new WeakSet();
  const currentSend = WebSocket.prototype.send;
  const mouse = { x: innerWidth / 2, y: innerHeight / 2 };
  let spacePressed = false;
  let dpr = 1;
  let viewportWidth = innerWidth;
  let viewportHeight = innerHeight;
  let cameraX = 0;
  let cameraY = 0;
  let cameraReady = false;
  let lastFrameAt = performance.now();

  const state = {
    roomCode: "",
    playerId: "",
    pcLabel: "",
    students: ["Student 1", "Student 2", "Student 3"],
    phase: "lobby",
    arena: { width: 6400, height: 4000, gridWidth: 40, gridHeight: 25 },
    cohesionRadius: 520,
    teamNames: ["Team 1", "Team 2", "Team 3"],
    teamColors: ["#1f77b4", "#d62728", "#2ca02c"],
    players: [],
    projectiles: [],
    territory: [],
    territoryCounts: [0, 0, 0],
    remainingMs: 300000
  };

  function rgba(hex, alpha) {
    const clean = String(hex || "#000000").replace("#", "");
    const value = Number.parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16) || 0;
    return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
  }

  function localPlayer() {
    return state.players.find((player) => player.id === state.playerId) || null;
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
    const me = localPlayer();
    const targetX = me?.x ?? state.arena.width / 2;
    const targetY = me?.y ?? state.arena.height / 2;
    if (!cameraReady) {
      cameraX = targetX;
      cameraY = targetY;
      cameraReady = true;
    } else {
      const smoothing = Math.min(1, Math.max(0.08, dtSeconds * 7));
      cameraX += (targetX - cameraX) * smoothing;
      cameraY += (targetY - cameraY) * smoothing;
    }

    const desiredWorldWidth = Math.min(2050, state.arena.width);
    const desiredWorldHeight = Math.min(1280, state.arena.height);
    const scale = Math.max(0.08, Math.min(viewportWidth / desiredWorldWidth, viewportHeight / desiredWorldHeight));
    const halfWorldWidth = viewportWidth / scale / 2;
    const halfWorldHeight = viewportHeight / scale / 2;
    cameraX = Math.max(halfWorldWidth, Math.min(state.arena.width - halfWorldWidth, cameraX));
    cameraY = Math.max(halfWorldHeight, Math.min(state.arena.height - halfWorldHeight, cameraY));
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
    const t = cameraTransform(0);
    return {
      x: (clientX - t.offsetX) / t.scale,
      y: (clientY - t.offsetY) / t.scale
    };
  }

  function updateRolePanel() {
    const names = state.students.length === 3 ? state.students : ["Student 1", "Student 2", "Student 3"];
    const movement = document.getElementById("movementRoleName");
    const aim = document.getElementById("aimRoleName");
    const shoot = document.getElementById("shootRoleName");
    if (movement) movement.textContent = `${names[0]} · Movement`;
    if (aim) aim.textContent = `${names[1]} · Aim`;
    if (shoot) shoot.textContent = `${names[2]} · Shoot`;

    const me = localPlayer();
    const volley = Math.max(1, Math.min(3, Number(me?.volleySize) || 1));
    const badge = document.getElementById("cohesionBadge");
    if (badge) {
      badge.dataset.level = String(volley);
      const strong = badge.querySelector("strong");
      const small = badge.querySelector("small");
      if (strong) strong.textContent = `×${volley} SHOT${volley === 1 ? "" : "S"}`;
      if (small) small.textContent = volley === 3 ? "Full team formation active" : volley === 2 ? "Two allied players in formation" : "Move near teammates for ×2 or ×3";
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
      updateRolePanel();
      return;
    }
    if (message.type === "lobby") {
      state.phase = message.phase || state.phase;
      state.teamNames = Array.isArray(message.teamNames) ? message.teamNames : state.teamNames;
      state.teamColors = Array.isArray(message.teamColors) ? message.teamColors : state.teamColors;
      return;
    }
    if (message.type === "state") {
      state.phase = message.phase || state.phase;
      state.arena = message.arena || state.arena;
      state.cohesionRadius = Number(message.cohesionRadius) || state.cohesionRadius;
      state.teamNames = Array.isArray(message.teamNames) ? message.teamNames : state.teamNames;
      state.teamColors = Array.isArray(message.teamColors) ? message.teamColors : state.teamColors;
      state.players = Array.isArray(message.players) ? message.players : [];
      state.projectiles = Array.isArray(message.projectiles) ? message.projectiles : [];
      state.territory = Array.isArray(message.territory) ? message.territory : [];
      state.territoryCounts = Array.isArray(message.territoryCounts) ? message.territoryCounts : [0, 0, 0];
      state.remainingMs = Number(message.remainingMs) || 0;
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

  WebSocket.prototype.send = function enhancedGameplaySend(payload) {
    if (typeof payload === "string") {
      try {
        const message = JSON.parse(payload);
        if (["register_student", "reconnect_student", "input"].includes(message.type)) observeSocket(this);
        if (message.type === "input") {
          const me = localPlayer();
          if (me) {
            const worldMouse = worldFromClient(mouse.x, mouse.y);
            message.angle = Math.atan2(worldMouse.y - me.y, worldMouse.x - me.x);
          }
          message.shoot = spacePressed;
          payload = JSON.stringify(message);
        }
      } catch {}
    }
    return currentSend.call(this, payload);
  };

  function drawGrid(t) {
    const cellWidth = state.arena.width / state.arena.gridWidth;
    const cellHeight = state.arena.height / state.arena.gridHeight;
    const minX = Math.max(0, Math.floor(t.worldLeft / cellWidth));
    const maxX = Math.min(state.arena.gridWidth - 1, Math.ceil(t.worldRight / cellWidth));
    const minY = Math.max(0, Math.floor(t.worldTop / cellHeight));
    const maxY = Math.min(state.arena.gridHeight - 1, Math.ceil(t.worldBottom / cellHeight));

    for (let gy = minY; gy <= maxY; gy += 1) {
      for (let gx = minX; gx <= maxX; gx += 1) {
        const owner = state.territory[gy * state.arena.gridWidth + gx];
        if (owner >= 0 && owner < 3) {
          ctx.fillStyle = rgba(state.teamColors[owner], 0.29);
          ctx.fillRect(
            t.offsetX + gx * cellWidth * t.scale,
            t.offsetY + gy * cellHeight * t.scale,
            cellWidth * t.scale + 0.7,
            cellHeight * t.scale + 0.7
          );
        }
      }
    }

    ctx.strokeStyle = "rgba(17,24,39,.09)";
    ctx.lineWidth = 1;
    for (let gx = minX; gx <= maxX + 1; gx += 1) {
      const x = t.offsetX + gx * cellWidth * t.scale;
      ctx.beginPath();
      ctx.moveTo(x, Math.max(0, t.offsetY + minY * cellHeight * t.scale));
      ctx.lineTo(x, Math.min(viewportHeight, t.offsetY + (maxY + 1) * cellHeight * t.scale));
      ctx.stroke();
    }
    for (let gy = minY; gy <= maxY + 1; gy += 1) {
      const y = t.offsetY + gy * cellHeight * t.scale;
      ctx.beginPath();
      ctx.moveTo(Math.max(0, t.offsetX + minX * cellWidth * t.scale), y);
      ctx.lineTo(Math.min(viewportWidth, t.offsetX + (maxX + 1) * cellWidth * t.scale), y);
      ctx.stroke();
    }
  }

  function drawCohesion(t) {
    const me = localPlayer();
    if (!me || !me.alive) return;
    const teammates = state.players.filter((player) => player.id !== me.id && player.team === me.team && player.alive && player.connected !== false);
    for (const teammate of teammates) {
      const distance = Math.hypot(teammate.x - me.x, teammate.y - me.y);
      if (distance > state.cohesionRadius) continue;
      const opacity = Math.max(0.18, 1 - distance / state.cohesionRadius);
      ctx.strokeStyle = rgba(state.teamColors[me.team], 0.25 + opacity * 0.45);
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 9]);
      ctx.beginPath();
      ctx.moveTo(t.offsetX + me.x * t.scale, t.offsetY + me.y * t.scale);
      ctx.lineTo(t.offsetX + teammate.x * t.scale, t.offsetY + teammate.y * t.scale);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.strokeStyle = rgba(state.teamColors[me.team], 0.22);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(t.offsetX + me.x * t.scale, t.offsetY + me.y * t.scale, state.cohesionRadius * t.scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawPlayer(player, t) {
    const x = t.offsetX + player.x * t.scale;
    const y = t.offsetY + player.y * t.scale;
    if (x < -80 || x > viewportWidth + 80 || y < -80 || y > viewportHeight + 80) return;
    const me = player.id === state.playerId;
    const size = me ? 21 : 17;
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
      if (player.invulnerable) {
        ctx.strokeStyle = rgba(color, 0.55);
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, size * 1.55, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.rotate(Number(player.angle) || 0);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(size * 1.45, 0);
      ctx.lineTo(-size, size * 0.9);
      ctx.lineTo(-size * 0.72, 0);
      ctx.lineTo(-size, -size * 0.9);
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
    ctx.fillText(label, x, y - size - 9);
    if (me) {
      const volley = Math.max(1, Math.min(3, Number(player.volleySize) || 1));
      ctx.fillStyle = color;
      ctx.font = "900 10px system-ui";
      ctx.fillText(`COHESION ×${volley}`, x, y + size + 18);
    }
    ctx.restore();
  }

  function drawProjectile(projectile, t) {
    const x = t.offsetX + projectile.x * t.scale;
    const y = t.offsetY + projectile.y * t.scale;
    if (x < -20 || x > viewportWidth + 20 || y < -20 || y > viewportHeight + 20) return;
    ctx.fillStyle = state.teamColors[projectile.team] || "#101828";
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.85)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawCompass(t) {
    const me = localPlayer();
    if (!me) return;
    const teammates = state.players.filter((player) => player.id !== me.id && player.team === me.team && player.alive);
    for (const teammate of teammates) {
      const x = t.offsetX + teammate.x * t.scale;
      const y = t.offsetY + teammate.y * t.scale;
      if (x >= 24 && x <= viewportWidth - 24 && y >= 130 && y <= viewportHeight - 90) continue;
      const angle = Math.atan2(y - viewportHeight / 2, x - viewportWidth / 2);
      const edgeX = Math.max(38, Math.min(viewportWidth - 38, viewportWidth / 2 + Math.cos(angle) * (viewportWidth / 2 - 52)));
      const edgeY = Math.max(142, Math.min(viewportHeight - 105, viewportHeight / 2 + Math.sin(angle) * (viewportHeight / 2 - 115)));
      ctx.save();
      ctx.translate(edgeX, edgeY);
      ctx.rotate(angle);
      ctx.fillStyle = state.teamColors[me.team];
      ctx.beginPath();
      ctx.moveTo(13, 0);
      ctx.lineTo(-8, 8);
      ctx.lineTo(-8, -8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function draw(frameAt) {
    resize();
    const dt = Math.min(0.05, Math.max(0, (frameAt - lastFrameAt) / 1000));
    lastFrameAt = frameAt;
    const t = cameraTransform(dt);

    ctx.clearRect(0, 0, viewportWidth, viewportHeight);
    ctx.fillStyle = "#eef2f7";
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);

    ctx.fillStyle = "#fbfcfe";
    ctx.fillRect(
      t.offsetX,
      t.offsetY,
      state.arena.width * t.scale,
      state.arena.height * t.scale
    );

    drawGrid(t);
    drawCohesion(t);
    for (const projectile of state.projectiles) drawProjectile(projectile, t);
    for (const player of state.players) drawPlayer(player, t);
    drawCompass(t);

    ctx.strokeStyle = "#98a2b3";
    ctx.lineWidth = 3;
    ctx.strokeRect(t.offsetX, t.offsetY, state.arena.width * t.scale, state.arena.height * t.scale);

    requestAnimationFrame(draw);
  }

  addEventListener("mousemove", (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  }, { passive: true });
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
  addEventListener("blur", () => { spacePressed = false; });
  addEventListener("resize", resize);

  resize();
  updateRolePanel();
  requestAnimationFrame(draw);
})();
