(() => {
  "use strict";

  const CONTROL_TYPES = new Set([
    "create_control_room",
    "restore_control",
    "approve_registration",
    "reject_registration",
    "remove_player",
    "set_registration_lock",
    "fill_with_bots",
    "remove_bots",
    "start_match",
    "end_match",
    "reset_room"
  ]);

  const $ = (id) => document.getElementById(id);
  const panel = $("masterLiveGamePanel");
  const arenaShell = $("masterArenaShell");
  const canvas = $("masterGameCanvas");
  const overlay = $("masterArenaOverlay");
  const roomLabel = $("masterLiveRoom");
  const phaseLabel = $("masterLivePhase");
  const feedLabel = $("masterLiveFeedStatus");
  const legend = $("masterTeamLegend");
  const fullscreenButton = $("masterFullscreenButton");
  const joinButton = $("masterJoinPlayerButton");
  const openButton = $("masterOpenPlayerButton");
  const station = $("masterPlayerStation");
  const frame = $("masterPlayerFrame");
  const hideButton = $("masterHidePlayerButton");
  const resetButton = $("masterResetPlayerButton");

  if (!panel || !canvas) return;

  const ctx = canvas.getContext("2d");
  const observedSockets = new WeakSet();
  const nativeSend = WebSocket.prototype.send;
  const view = {
    roomCode: "",
    phase: "lobby",
    arena: { width: 1600, height: 1000, gridWidth: 40, gridHeight: 25 },
    teamNames: ["Team 1", "Team 2", "Team 3"],
    teamColors: ["#1f77b4", "#d62728", "#2ca02c"],
    players: [],
    projectiles: [],
    territory: [],
    territoryCounts: [0, 0, 0],
    remainingMs: 300000,
    hasStateFeed: false
  };

  function rgba(hex, alpha) {
    const clean = String(hex || "#000000").replace("#", "");
    const value = Number.parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16) || 0;
    return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
  }

  function validRoomCode(value) {
    return /^[A-Z2-9]{6}$/.test(String(value || "").trim().toUpperCase());
  }

  function currentRoomCode() {
    const domCode = String($("roomCodeLarge")?.textContent || "").trim().toUpperCase();
    return validRoomCode(view.roomCode) ? view.roomCode : validRoomCode(domCode) ? domCode : "";
  }

  function updateRoom(roomCode) {
    const clean = String(roomCode || "").trim().toUpperCase();
    if (validRoomCode(clean)) view.roomCode = clean;
    const active = currentRoomCode();
    roomLabel.textContent = active || "NO ROOM";
    joinButton.disabled = !active;
    openButton.disabled = !active;
  }

  function updatePhase(phase) {
    view.phase = String(phase || "lobby").toLowerCase();
    phaseLabel.textContent = view.phase.toUpperCase();
    if (view.hasStateFeed) {
      overlay.classList.add("hidden-feed");
      feedLabel.textContent = "LIVE SERVER STATE";
    } else {
      overlay.classList.remove("hidden-feed");
      overlay.textContent = view.phase === "lobby"
        ? "Live arena feed will appear here when the match begins."
        : view.phase === "countdown"
          ? "Match countdown in progress…"
          : "Waiting for authoritative game state…";
      feedLabel.textContent = "WAITING FOR MATCH";
    }
  }

  function updateLegend() {
    const total = view.arena.gridWidth * view.arena.gridHeight;
    legend.innerHTML = view.teamNames.map((name, team) => {
      const count = Number(view.territoryCounts[team]) || 0;
      const percentage = total ? (count / total) * 100 : 0;
      const players = view.players.filter((player) => player.team === team).length;
      return `<article style="--team-color:${view.teamColors[team]}"><span class="master-team-dot"></span><strong>${escapeHtml(name)}</strong><span>${percentage.toFixed(1)}% · ${players}/3</span></article>`;
    }).join("");
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function handleMessage(message) {
    if (!message || typeof message !== "object") return;

    if (message.type === "controller_joined") {
      updateRoom(message.roomCode);
      if (message.arena) view.arena = message.arena;
      updatePhase("lobby");
      return;
    }

    if (message.type === "lobby") {
      updateRoom(message.roomCode);
      view.phase = message.phase || view.phase;
      view.teamNames = Array.isArray(message.teamNames) ? message.teamNames : view.teamNames;
      view.teamColors = Array.isArray(message.teamColors) ? message.teamColors : view.teamColors;
      view.players = Array.isArray(message.players) ? message.players : view.players;
      view.hasStateFeed = false;
      updatePhase(view.phase);
      updateLegend();
      return;
    }

    if (message.type === "countdown") {
      updatePhase("countdown");
      return;
    }

    if (message.type === "state") {
      view.phase = message.phase || view.phase;
      view.arena = message.arena || view.arena;
      view.teamNames = Array.isArray(message.teamNames) ? message.teamNames : view.teamNames;
      view.teamColors = Array.isArray(message.teamColors) ? message.teamColors : view.teamColors;
      view.players = Array.isArray(message.players) ? message.players : [];
      view.projectiles = Array.isArray(message.projectiles) ? message.projectiles : [];
      view.territory = Array.isArray(message.territory) ? message.territory : [];
      view.territoryCounts = Array.isArray(message.territoryCounts) ? message.territoryCounts : [0, 0, 0];
      view.remainingMs = Number(message.remainingMs) || 0;
      view.hasStateFeed = true;
      updatePhase(view.phase);
      updateLegend();
      return;
    }

    if (message.type === "match_ended") {
      updatePhase("ended");
      feedLabel.textContent = "FINAL ARENA STATE";
    }
  }

  function observeSocket(socket) {
    if (!socket || observedSockets.has(socket)) return;
    observedSockets.add(socket);
    socket.addEventListener("message", (event) => {
      try { handleMessage(JSON.parse(event.data)); } catch {}
    });
  }

  WebSocket.prototype.send = function masterLiveFeedSend(payload) {
    if (typeof payload === "string") {
      try {
        const message = JSON.parse(payload);
        if (CONTROL_TYPES.has(message.type)) observeSocket(this);
      } catch {}
    }
    return nativeSend.call(this, payload);
  };

  function resizeCanvas() {
    const rect = arenaShell.getBoundingClientRect();
    const width = Math.max(320, rect.width);
    const height = Math.max(220, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width, height };
  }

  function drawPlayer(player, transform) {
    const x = transform.offsetX + player.x * transform.scale;
    const y = transform.offsetY + player.y * transform.scale;
    const size = Math.max(7, 16 * transform.scale);
    const color = view.teamColors[player.team] || "#667085";

    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = player.connected === false ? 0.38 : 1;

    if (player.alive === false) {
      ctx.strokeStyle = "#667085";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-size, -size);
      ctx.lineTo(size, size);
      ctx.moveTo(size, -size);
      ctx.lineTo(-size, size);
      ctx.stroke();
    } else {
      if (player.invulnerable) {
        ctx.strokeStyle = "rgba(17,24,39,.42)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, size * 1.45, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.rotate(Number(player.angle) || 0);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(size * 1.35, 0);
      ctx.lineTo(-size, size * 0.85);
      ctx.lineTo(-size * 0.7, 0);
      ctx.lineTo(-size, -size * 0.85);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.font = "700 11px system-ui";
    ctx.textAlign = "center";
    ctx.fillStyle = "#101828";
    const label = `${player.pcLabel || "Player"}${player.isBot ? " · AI" : ""}`;
    ctx.fillText(label, x, y - size - 8);
    ctx.restore();
  }

  function draw() {
    const { width, height } = resizeCanvas();
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#eef2f7";
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

    const cellWidth = view.arena.width / view.arena.gridWidth;
    const cellHeight = view.arena.height / view.arena.gridHeight;
    for (let gy = 0; gy < view.arena.gridHeight; gy += 1) {
      for (let gx = 0; gx < view.arena.gridWidth; gx += 1) {
        const owner = view.territory[gy * view.arena.gridWidth + gx];
        if (owner >= 0 && owner < 3) {
          ctx.fillStyle = rgba(view.teamColors[owner], 0.3);
          ctx.fillRect(
            transform.offsetX + gx * cellWidth * scale,
            transform.offsetY + gy * cellHeight * scale,
            cellWidth * scale + 0.5,
            cellHeight * scale + 0.5
          );
        }
      }
    }

    ctx.strokeStyle = "rgba(17,24,39,.08)";
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= view.arena.gridWidth; gx += 1) {
      const x = transform.offsetX + gx * cellWidth * scale;
      ctx.beginPath();
      ctx.moveTo(x, transform.offsetY);
      ctx.lineTo(x, transform.offsetY + arenaHeight);
      ctx.stroke();
    }
    for (let gy = 0; gy <= view.arena.gridHeight; gy += 1) {
      const y = transform.offsetY + gy * cellHeight * scale;
      ctx.beginPath();
      ctx.moveTo(transform.offsetX, y);
      ctx.lineTo(transform.offsetX + arenaWidth, y);
      ctx.stroke();
    }

    for (const projectile of view.projectiles) {
      ctx.fillStyle = view.teamColors[projectile.team] || "#101828";
      ctx.beginPath();
      ctx.arc(
        transform.offsetX + projectile.x * scale,
        transform.offsetY + projectile.y * scale,
        Math.max(2.5, 6 * scale),
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    for (const player of view.players) {
      if (!Number.isFinite(player.x) || !Number.isFinite(player.y)) continue;
      drawPlayer(player, transform);
    }

    ctx.strokeStyle = "#98a2b3";
    ctx.lineWidth = 2;
    ctx.strokeRect(transform.offsetX, transform.offsetY, arenaWidth, arenaHeight);

    const seconds = Math.max(0, Math.ceil(view.remainingMs / 1000));
    const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    ctx.fillStyle = "rgba(16,24,40,.86)";
    ctx.fillRect(transform.offsetX + 10, transform.offsetY + 10, 96, 30);
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 14px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(time, transform.offsetX + 58, transform.offsetY + 30);

    window.requestAnimationFrame(draw);
  }

  function gameUrl() {
    const roomCode = currentRoomCode();
    if (!roomCode) return null;
    const base = window.TRIAD_CONFIG?.gameUrl || new URL("index.html", location.href).href;
    const url = new URL(base, location.href);
    url.searchParams.set("room", roomCode);
    url.searchParams.set("station", "master");
    url.searchParams.set("v", "20260722-live1");
    return url;
  }

  function preparePlayerSession(roomCode, forceReset = false) {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem("triadStudentSession") || "null"); } catch {}
    if (forceReset || (saved?.roomCode && saved.roomCode !== roomCode)) {
      localStorage.removeItem("triadStudentSession");
    }
    if (!localStorage.getItem("triadPcLabel")) localStorage.setItem("triadPcLabel", "Teacher Player");
  }

  function showPlayerStation(forceReload = false) {
    const url = gameUrl();
    if (!url) {
      feedLabel.textContent = "CREATE OR RESTORE A ROOM FIRST";
      return;
    }
    const roomCode = currentRoomCode();
    preparePlayerSession(roomCode, forceReload);
    station.hidden = false;
    if (forceReload || !frame.src || frame.src === "about:blank") frame.src = url.href;
    joinButton.textContent = "SHOW MASTER PLAYER STATION";
    station.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  joinButton.addEventListener("click", () => showPlayerStation(false));
  openButton.addEventListener("click", () => {
    const url = gameUrl();
    if (!url) return;
    preparePlayerSession(currentRoomCode(), false);
    window.open(url.href, "_blank", "noopener");
  });
  hideButton.addEventListener("click", () => {
    station.hidden = true;
    joinButton.textContent = "JOIN AS PLAYER HERE";
  });
  resetButton.addEventListener("click", () => {
    if (!confirm("Reset the master player session and reopen a fresh registration form?")) return;
    localStorage.removeItem("triadStudentSession");
    frame.src = "about:blank";
    showPlayerStation(true);
  });

  fullscreenButton.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement === panel) await document.exitFullscreen();
      else await panel.requestFullscreen();
    } catch {}
  });
  document.addEventListener("fullscreenchange", () => {
    fullscreenButton.textContent = document.fullscreenElement === panel ? "EXIT FULLSCREEN" : "FULLSCREEN LIVE ARENA";
  });

  new ResizeObserver(() => resizeCanvas()).observe(arenaShell);
  updateRoom("");
  updatePhase("lobby");
  updateLegend();
  window.requestAnimationFrame(draw);

  const existingSocketTimer = window.setInterval(() => {
    if (window.__triadTeacherControlSocket) observeSocket(window.__triadTeacherControlSocket);
  }, 1000);
  window.addEventListener("beforeunload", () => window.clearInterval(existingSocketTimer), { once: true });
})();
