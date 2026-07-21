(() => {
  "use strict";

  const TEAM_NAMES = ["Cyan Circuit", "Magenta Pulse", "Amber Forge"];
  const TEAM_COLORS = ["#22b8d6", "#ed4f86", "#f2b23b"];
  const TEAM_PALE = ["rgba(34,184,214,.30)", "rgba(237,79,134,.28)", "rgba(242,178,59,.31)"];
  const $ = (id) => document.getElementById(id);

  const dom = {
    canvas: $("gameCanvas"), minimap: $("minimapCanvas"), phase: $("phaseLabel"), clock: $("clockLabel"),
    connection: $("connectionBadge"), sound: $("soundButton"), event: $("eventBanner"),
    lobby: $("lobbyOverlay"), serverUrl: $("serverUrlInput"), name: $("playerNameInput"), team: $("teamSelect"),
    roomInput: $("roomCodeInput"), createRoom: $("createRoomButton"), joinRoom: $("joinRoomButton"),
    lobbyStatus: $("lobbyStatus"), roomPanel: $("roomPanel"), roomCodeLarge: $("roomCodeLarge"),
    copyCode: $("copyRoomCodeButton"), teamCapacity: $("teamCapacity"), roster: $("rosterList"),
    startMatch: $("startMatchButton"), roomCodeLabel: $("roomCodeLabel"),
    playerTeamDot: $("playerTeamDot"), playerName: $("playerNameLabel"), playerState: $("playerStateLabel"),
    playerTerritory: $("playerTerritoryLabel"), playerKills: $("playerKillsLabel"),
    playerDeaths: $("playerDeathsLabel"), playerQuestions: $("playerQuestionsLabel"),
    playerAccuracy: $("playerAccuracyLabel"), shotCooldown: $("shotCooldown"), dashCooldown: $("dashCooldown"),
    teamTerritory: [$("team0Territory"), $("team1Territory"), $("team2Territory")],
    teamKills: [$("team0Kills"), $("team1Kills"), $("team2Kills")],
    questionOverlay: $("questionOverlay"), questionTitle: $("questionTitle"), questionTimer: $("questionTimer"),
    questionCanvas: $("questionCanvas"), questionPrompt: $("questionPrompt"), questionOptions: $("questionOptions"),
    questionFeedback: $("questionFeedback"), endOverlay: $("endOverlay"), winnerSummary: $("winnerSummary"),
    finalRanking: $("finalRanking"), reportBody: $("reportTableBody"), downloadCsv: $("downloadCsvButton"),
    downloadJson: $("downloadJsonButton"), returnLobby: $("returnLobbyButton")
  };

  const ctx = dom.canvas.getContext("2d");
  const miniCtx = dom.minimap.getContext("2d");
  const questionCtx = dom.questionCanvas.getContext("2d");

  const state = {
    ws: null,
    serverUrl: "",
    roomCode: "",
    playerId: "",
    sessionToken: "",
    team: 0,
    host: false,
    phase: "offline",
    arena: { width: 1600, height: 1000, gridWidth: 40, gridHeight: 25 },
    players: [],
    projectiles: [],
    territory: [],
    territoryCounts: [0, 0, 0],
    remainingMs: 5 * 60 * 1000,
    serverNowOffset: 0,
    currentQuestion: null,
    report: null,
    reconnectTimer: null,
    reconnectAttempt: 0,
    manuallyClosed: false,
    input: { up: false, down: false, left: false, right: false, shoot: false, dash: false, angle: 0 },
    soundEnabled: true,
    audioContext: null,
    bannerTimer: null
  };

  function initialServerUrl() {
    const query = new URLSearchParams(location.search).get("server");
    const saved = localStorage.getItem("triadServerUrl");
    return query || saved || window.TRIAD_CONFIG?.serverUrl || "";
  }

  dom.serverUrl.value = initialServerUrl();
  dom.name.value = localStorage.getItem("triadPlayerName") || dom.name.value;
  dom.team.value = localStorage.getItem("triadTeam") || "0";
  const storedSession = readStoredSession();
  if (storedSession?.roomCode) dom.roomInput.value = storedSession.roomCode;

  function normalizeServerUrl(raw) {
    let value = String(raw || "").trim().replace(/\/$/, "");
    if (!value) throw new Error("Paste the deployed multiplayer server URL.");
    if (value.startsWith("https://")) value = `wss://${value.slice(8)}`;
    if (value.startsWith("http://")) value = `ws://${value.slice(7)}`;
    if (!/^wss?:\/\//i.test(value)) throw new Error("The server URL must begin with wss:// or https://.");
    return value;
  }

  function setConnection(mode, text) {
    dom.connection.className = `connection-badge ${mode}`;
    dom.connection.textContent = text;
  }

  function setLobbyStatus(text, kind = "neutral") {
    dom.lobbyStatus.textContent = text;
    dom.lobbyStatus.style.borderLeftColor = kind === "error" ? "#b42318" : kind === "success" ? "#067647" : "#344054";
  }

  function readStoredSession() {
    try { return JSON.parse(localStorage.getItem("triadSession") || "null"); }
    catch { return null; }
  }

  function saveSession() {
    localStorage.setItem("triadSession", JSON.stringify({
      serverUrl: state.serverUrl,
      roomCode: state.roomCode,
      sessionToken: state.sessionToken
    }));
  }

  function clearSession() {
    localStorage.removeItem("triadSession");
    state.roomCode = "";
    state.playerId = "";
    state.sessionToken = "";
    state.host = false;
  }

  function connect() {
    const url = normalizeServerUrl(dom.serverUrl.value);
    state.serverUrl = url;
    localStorage.setItem("triadServerUrl", url);
    if (state.ws?.readyState === WebSocket.OPEN && state.ws.url === url) return Promise.resolve(state.ws);
    if (state.ws) state.ws.close();
    setConnection("connecting", "CONNECTING");
    setLobbyStatus("Connecting to the authoritative game server…");

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      state.ws = ws;
      const timeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) ws.close();
        reject(new Error("The server did not respond. Confirm that it is deployed and awake."));
      }, 12000);

      ws.addEventListener("open", () => {
        clearTimeout(timeout);
        state.reconnectAttempt = 0;
        setConnection("online", "ONLINE");
        resolve(ws);
      }, { once: true });
      ws.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("Unable to connect to the multiplayer server."));
      }, { once: true });
      ws.addEventListener("message", onMessage);
      ws.addEventListener("close", onClose);
    });
  }

  function send(payload) {
    if (state.ws?.readyState === WebSocket.OPEN) state.ws.send(JSON.stringify(payload));
  }

  async function createRoom() {
    try {
      persistPlayerForm();
      clearSession();
      await connect();
      send({ type: "create_room", name: dom.name.value, team: Number(dom.team.value) });
    } catch (error) {
      setConnection("offline", "OFFLINE");
      setLobbyStatus(error.message, "error");
    }
  }

  async function joinRoom() {
    try {
      persistPlayerForm();
      const code = dom.roomInput.value.trim().toUpperCase();
      if (!/^[A-Z2-9]{6}$/.test(code)) throw new Error("Enter the six-character room code.");
      clearSession();
      await connect();
      send({ type: "join_room", roomCode: code, name: dom.name.value, team: Number(dom.team.value) });
    } catch (error) {
      setConnection("offline", "OFFLINE");
      setLobbyStatus(error.message, "error");
    }
  }

  function persistPlayerForm() {
    localStorage.setItem("triadPlayerName", dom.name.value.trim());
    localStorage.setItem("triadTeam", dom.team.value);
  }

  function onMessage(event) {
    let message;
    try { message = JSON.parse(event.data); }
    catch { return; }

    switch (message.type) {
      case "hello":
        state.serverNowOffset = message.serverTime - Date.now();
        break;
      case "joined":
        state.roomCode = message.roomCode;
        state.playerId = message.playerId;
        state.sessionToken = message.sessionToken;
        state.team = message.team;
        state.host = Boolean(message.host);
        state.arena = message.arena || state.arena;
        dom.roomCodeLabel.textContent = state.roomCode;
        dom.roomCodeLarge.textContent = state.roomCode;
        dom.roomPanel.classList.remove("hidden");
        dom.playerTeamDot.style.background = TEAM_COLORS[state.team];
        dom.playerName.textContent = dom.name.value.trim() || "Student";
        dom.playerState.textContent = message.reconnected ? "Session restored" : "Waiting in room";
        saveSession();
        setLobbyStatus(message.reconnected ? "Reconnected to the match." : "Connected. Share the room code with the other eight computers.", "success");
        beep(520, 0.08);
        break;
      case "lobby":
        state.phase = "lobby";
        renderLobby(message);
        break;
      case "countdown":
        state.phase = "countdown";
        dom.lobby.classList.remove("visible");
        showEvent(`Match starts in ${message.seconds}…`);
        beep(660, 0.12);
        break;
      case "state":
        applyServerState(message);
        break;
      case "question":
        showQuestion(message);
        break;
      case "answer_result":
        handleAnswerResult(message);
        break;
      case "respawned":
        state.currentQuestion = null;
        dom.questionOverlay.classList.remove("visible");
        dom.questionFeedback.textContent = "";
        showEvent("Correct. Respawn authorized by the server.");
        beep(760, 0.12);
        break;
      case "event":
        showEvent(message.text);
        break;
      case "match_ended":
        state.phase = "ended";
        state.report = message.report;
        renderFinalReport(message.winners, message.report);
        break;
      case "error":
        setLobbyStatus(message.message || "Server request failed.", "error");
        showEvent(message.message || "Server request failed.");
        beep(180, 0.14);
        break;
      case "pong":
        state.serverNowOffset = message.serverTime - Date.now();
        break;
      default:
        break;
    }
  }

  function onClose() {
    setConnection("offline", "OFFLINE");
    state.ws = null;
    if (state.manuallyClosed) return;
    const session = readStoredSession();
    if (!session?.sessionToken || state.phase === "ended") {
      setLobbyStatus("Disconnected from the server.", "error");
      return;
    }
    scheduleReconnect(session);
  }

  function scheduleReconnect(session) {
    clearTimeout(state.reconnectTimer);
    const delay = Math.min(1000 * 2 ** state.reconnectAttempt, 8000);
    state.reconnectAttempt += 1;
    setLobbyStatus(`Connection lost. Reconnecting in ${Math.ceil(delay / 1000)} seconds…`);
    state.reconnectTimer = setTimeout(async () => {
      try {
        dom.serverUrl.value = session.serverUrl;
        await connect();
        send({ type: "reconnect", roomCode: session.roomCode, sessionToken: session.sessionToken });
      } catch {
        scheduleReconnect(session);
      }
    }, delay);
  }

  function renderLobby(message) {
    state.roomCode = message.roomCode;
    state.host = message.hostPlayerId === state.playerId;
    dom.roomPanel.classList.remove("hidden");
    dom.roomCodeLarge.textContent = message.roomCode;
    dom.roomCodeLabel.textContent = message.roomCode;
    dom.teamCapacity.innerHTML = message.teamCounts.map((count, team) =>
      `<div class="capacity-card team-${team}"><span>${escapeHtml(TEAM_NAMES[team])}</span><b>${count}/3</b></div>`
    ).join("");
    dom.roster.innerHTML = message.players
      .sort((a, b) => a.team - b.team || a.name.localeCompare(b.name))
      .map((player) => `<div class="roster-card team-${player.team} ${player.connected ? "" : "disconnected"}">
        <strong>${escapeHtml(player.name)}${player.id === state.playerId ? " · YOU" : ""}</strong>
        <small>${escapeHtml(TEAM_NAMES[player.team])}${player.host ? " · HOST" : ""}${player.connected ? "" : " · OFFLINE"}</small>
      </div>`).join("");
    const connectedCount = message.players.filter((player) => player.connected).length;
    const ready = connectedCount === 9 && message.teamCounts.every((count) => count === 3);
    dom.startMatch.disabled = !state.host || !ready;
    dom.startMatch.textContent = state.host
      ? ready ? "START 5-MINUTE MATCH" : `HOST: WAITING FOR ${9 - connectedCount} PLAYER(S)`
      : "WAITING FOR HOST TO START";
    setLobbyStatus(`${connectedCount}/9 connected. Each team must have exactly 3 students.`, ready ? "success" : "neutral");
  }

  function applyServerState(message) {
    state.phase = message.phase;
    state.players = message.players || [];
    state.projectiles = message.projectiles || [];
    state.territory = message.territory || [];
    state.territoryCounts = message.territoryCounts || [0, 0, 0];
    state.remainingMs = message.remainingMs;
    state.serverNowOffset = message.serverNow - Date.now();
    state.arena = message.arena || state.arena;
    dom.phase.textContent = String(message.phase || "").toUpperCase();
    if (message.phase === "playing") dom.lobby.classList.remove("visible");
    updateHud();
  }

  function updateHud() {
    const totalCells = state.arena.gridWidth * state.arena.gridHeight;
    for (let team = 0; team < 3; team += 1) {
      const percent = totalCells ? (state.territoryCounts[team] / totalCells) * 100 : 0;
      dom.teamTerritory[team].textContent = `${percent.toFixed(1)}%`;
      dom.teamKills[team].textContent = state.players.filter((player) => player.team === team).reduce((sum, player) => sum + player.kills, 0);
    }
    const me = state.players.find((player) => player.id === state.playerId);
    if (!me) return;
    dom.playerName.textContent = me.name;
    dom.playerState.textContent = !me.connected ? "Disconnected" : me.alive ? (me.invulnerable ? "Alive · shielded" : "Alive") : "Eliminated · solve trigonometry";
    dom.playerTerritory.textContent = me.territory;
    dom.playerKills.textContent = me.kills;
    dom.playerDeaths.textContent = me.deaths;
    dom.playerQuestions.textContent = me.questions;
    dom.playerAccuracy.textContent = me.accuracy == null ? "—" : `${Math.round(me.accuracy * 100)}%`;
    dom.playerTeamDot.style.background = TEAM_COLORS[me.team];
    const serverNow = Date.now() + state.serverNowOffset;
    dom.shotCooldown.value = me.shotReadyAt <= serverNow ? 1 : Math.max(0, 1 - (me.shotReadyAt - serverNow) / 380);
    dom.dashCooldown.value = me.dashReadyAt <= serverNow ? 1 : Math.max(0, 1 - (me.dashReadyAt - serverNow) / 3200);
  }

  function showQuestion(message) {
    state.currentQuestion = message;
    dom.questionOverlay.classList.add("visible");
    dom.questionTitle.textContent = "Solve correctly to respawn";
    dom.questionPrompt.textContent = message.prompt;
    dom.questionFeedback.textContent = "";
    dom.questionFeedback.className = "question-feedback";
    dom.questionOptions.innerHTML = "";
    message.options.forEach((option, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "question-option";
      button.textContent = option;
      button.addEventListener("click", () => submitAnswer(index));
      dom.questionOptions.appendChild(button);
    });
    drawQuestionDiagram(message.diagram);
    beep(300, 0.1);
  }

  function submitAnswer(selectedIndex) {
    if (!state.currentQuestion) return;
    [...dom.questionOptions.children].forEach((button) => { button.disabled = true; });
    send({ type: "answer", questionId: state.currentQuestion.id, selectedIndex });
  }

  function handleAnswerResult(message) {
    if (message.correct) {
      dom.questionFeedback.textContent = "Correct. Server-authorized respawn in progress…";
      dom.questionFeedback.className = "question-feedback correct";
    } else {
      dom.questionFeedback.textContent = message.timeout ? "Time expired. A new question is required." : "Incorrect. You remain eliminated; a new question is loading.";
      dom.questionFeedback.className = "question-feedback wrong";
      beep(170, 0.13);
    }
  }

  function drawQuestionDiagram(diagram = {}) {
    const c = questionCtx;
    const w = dom.questionCanvas.width;
    const h = dom.questionCanvas.height;
    c.clearRect(0, 0, w, h);
    c.fillStyle = "#fbfcfe";
    c.fillRect(0, 0, w, h);
    const a = { x: 110, y: 195 }, b = { x: 450, y: 195 }, top = { x: 450, y: 48 };
    c.strokeStyle = "#111827";
    c.lineWidth = 4;
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(top.x, top.y); c.closePath(); c.stroke();
    c.lineWidth = 2;
    c.strokeRect(b.x - 24, b.y - 24, 24, 24);
    c.font = "700 18px system-ui";
    c.fillStyle = "#111827";
    c.textAlign = "center";
    if (diagram.adjacent != null) c.fillText(String(diagram.adjacent), (a.x + b.x) / 2, b.y + 32);
    if (diagram.opposite != null) c.fillText(String(diagram.opposite), b.x + 42, (b.y + top.y) / 2);
    if (diagram.hypotenuse != null) c.fillText(String(diagram.hypotenuse), (a.x + top.x) / 2 - 20, (a.y + top.y) / 2 - 12);
    if (diagram.angle) {
      c.textAlign = "left";
      c.fillText(`${diagram.angle}°`, a.x + 48, a.y - 15);
      c.beginPath(); c.arc(a.x, a.y, 46, -Math.atan2(a.y - top.y, top.x - a.x), 0); c.stroke();
    }
  }

  function renderFinalReport(winners, report) {
    dom.questionOverlay.classList.remove("visible");
    dom.endOverlay.classList.add("visible");
    const winnerNames = winners.map((team) => TEAM_NAMES[team]);
    dom.winnerSummary.textContent = winners.length === 1
      ? `${winnerNames[0]} wins by controlling the largest territory after five minutes.`
      : `Territory tie: ${winnerNames.join(" and ")}.`;
    const sortedTeams = [...report.teams].sort((a, b) => b.territory - a.territory);
    const totalCells = state.arena.gridWidth * state.arena.gridHeight;
    dom.finalRanking.innerHTML = sortedTeams.map((team, index) => `<div class="rank-card team-${team.team}">
      <span>#${index + 1} ${escapeHtml(team.name)}</span>
      <strong>${((team.territory / totalCells) * 100).toFixed(1)}%</strong>
      <small>${team.territory} territory cells</small>
    </div>`).join("");
    dom.reportBody.innerHTML = report.players
      .sort((a, b) => a.team - b.team || a.name.localeCompare(b.name))
      .map((player) => `<tr>
        <td>${escapeHtml(player.name)}</td><td>${escapeHtml(player.teamName)}</td><td>${player.territory}</td><td>${player.deaths}</td>
        <td>${player.attempts}</td><td>${player.correct}</td><td>${player.wrong}</td><td>${player.timeouts}</td>
        <td>${player.accuracy == null ? "—" : `${Math.round(player.accuracy * 100)}%`}</td>
        <td>${player.averageResponseMs == null ? "—" : `${(player.averageResponseMs / 1000).toFixed(1)} s`}</td>
      </tr>`).join("");
    beep(880, 0.18);
  }

  function reportToCsv(report) {
    const rows = [["room_code", "player", "team", "territory", "kills", "deaths", "attempts", "correct", "wrong", "timeouts", "accuracy", "average_response_ms"]];
    report.players.forEach((player) => rows.push([
      report.roomCode, player.name, player.teamName, player.territory, player.kills, player.deaths,
      player.attempts, player.correct, player.wrong, player.timeouts,
      player.accuracy == null ? "" : player.accuracy, player.averageResponseMs ?? ""
    ]));
    rows.push([]);
    rows.push(["player", "question_type", "prompt", "selected_option", "correct_option", "outcome", "response_ms"]);
    report.players.forEach((player) => player.answers.forEach((answer) => rows.push([
      player.name, answer.type, answer.prompt,
      answer.selectedIndex == null ? "" : answer.options[answer.selectedIndex],
      answer.options[answer.correctIndex], answer.outcome, answer.responseMs
    ])));
    return rows.map((row) => row.map(csvCell).join(",")).join("\n");
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function download(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function showEvent(text) {
    if (!text) return;
    dom.event.textContent = text;
    dom.event.classList.add("visible");
    clearTimeout(state.bannerTimer);
    state.bannerTimer = setTimeout(() => dom.event.classList.remove("visible"), 3200);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function resizeCanvas() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    dom.canvas.width = Math.floor(innerWidth * dpr);
    dom.canvas.height = Math.floor(innerHeight * dpr);
    dom.canvas.style.width = `${innerWidth}px`;
    dom.canvas.style.height = `${innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function viewTransform(width = innerWidth, height = innerHeight) {
    const padX = 24;
    const padTop = 132;
    const padBottom = 92;
    const availableW = width - padX * 2;
    const availableH = height - padTop - padBottom;
    const scale = Math.max(0.1, Math.min(availableW / state.arena.width, availableH / state.arena.height));
    return {
      scale,
      offsetX: (width - state.arena.width * scale) / 2,
      offsetY: padTop + (availableH - state.arena.height * scale) / 2
    };
  }

  function worldFromClient(clientX, clientY) {
    const t = viewTransform();
    return { x: (clientX - t.offsetX) / t.scale, y: (clientY - t.offsetY) / t.scale };
  }

  function draw() {
    const width = innerWidth;
    const height = innerHeight;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#eef2f7";
    ctx.fillRect(0, 0, width, height);
    const t = viewTransform(width, height);

    ctx.save();
    ctx.translate(t.offsetX, t.offsetY);
    ctx.scale(t.scale, t.scale);
    ctx.fillStyle = "#fbfcfe";
    ctx.fillRect(0, 0, state.arena.width, state.arena.height);

    const cw = state.arena.width / state.arena.gridWidth;
    const ch = state.arena.height / state.arena.gridHeight;
    for (let gy = 0; gy < state.arena.gridHeight; gy += 1) {
      for (let gx = 0; gx < state.arena.gridWidth; gx += 1) {
        const owner = state.territory[gy * state.arena.gridWidth + gx];
        if (owner >= 0) {
          ctx.fillStyle = TEAM_PALE[owner];
          ctx.fillRect(gx * cw, gy * ch, cw + 0.5, ch + 0.5);
        }
      }
    }

    ctx.strokeStyle = "rgba(17,24,39,.08)";
    ctx.lineWidth = 1 / t.scale;
    for (let gx = 0; gx <= state.arena.gridWidth; gx += 1) {
      ctx.beginPath(); ctx.moveTo(gx * cw, 0); ctx.lineTo(gx * cw, state.arena.height); ctx.stroke();
    }
    for (let gy = 0; gy <= state.arena.gridHeight; gy += 1) {
      ctx.beginPath(); ctx.moveTo(0, gy * ch); ctx.lineTo(state.arena.width, gy * ch); ctx.stroke();
    }

    for (const projectile of state.projectiles) {
      ctx.fillStyle = TEAM_COLORS[projectile.team];
      ctx.beginPath(); ctx.arc(projectile.x, projectile.y, 6, 0, Math.PI * 2); ctx.fill();
    }

    for (const player of state.players) drawPlayer(ctx, player, t.scale);
    ctx.strokeStyle = "#98a2b3";
    ctx.lineWidth = 3 / t.scale;
    ctx.strokeRect(0, 0, state.arena.width, state.arena.height);
    ctx.restore();

    drawMinimap();
    const seconds = Math.max(0, Math.ceil(state.remainingMs / 1000));
    dom.clock.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    if (state.currentQuestion) {
      const remaining = Math.max(0, Math.ceil((state.currentQuestion.expiresAt - (Date.now() + state.serverNowOffset)) / 1000));
      dom.questionTimer.textContent = remaining;
    }
    requestAnimationFrame(draw);
  }

  function drawPlayer(target, player, scale) {
    target.save();
    target.translate(player.x, player.y);
    target.globalAlpha = player.connected ? 1 : 0.35;
    if (!player.alive) {
      target.strokeStyle = "#667085";
      target.lineWidth = 5 / scale;
      target.beginPath(); target.moveTo(-14, -14); target.lineTo(14, 14); target.moveTo(14, -14); target.lineTo(-14, 14); target.stroke();
    } else {
      if (player.invulnerable) {
        target.strokeStyle = "rgba(17,24,39,.45)";
        target.lineWidth = 4 / scale;
        target.beginPath(); target.arc(0, 0, 24, 0, Math.PI * 2); target.stroke();
      }
      target.rotate(player.angle);
      target.fillStyle = TEAM_COLORS[player.team];
      target.beginPath(); target.moveTo(22, 0); target.lineTo(-14, 14); target.lineTo(-10, 0); target.lineTo(-14, -14); target.closePath(); target.fill();
      target.strokeStyle = player.id === state.playerId ? "#111827" : "white";
      target.lineWidth = player.id === state.playerId ? 5 / scale : 3 / scale;
      target.stroke();
    }
    target.restore();
    target.save();
    target.font = `${Math.max(13, 15 / scale)}px system-ui`;
    target.textAlign = "center";
    target.fillStyle = "#111827";
    target.fillText(player.name, player.x, player.y - 27);
    target.restore();
  }

  function drawMinimap() {
    const w = dom.minimap.width;
    const h = dom.minimap.height;
    miniCtx.clearRect(0, 0, w, h);
    miniCtx.fillStyle = "#fff";
    miniCtx.fillRect(0, 0, w, h);
    const sx = w / state.arena.width;
    const sy = h / state.arena.height;
    const cw = state.arena.width / state.arena.gridWidth;
    const ch = state.arena.height / state.arena.gridHeight;
    for (let gy = 0; gy < state.arena.gridHeight; gy += 1) {
      for (let gx = 0; gx < state.arena.gridWidth; gx += 1) {
        const owner = state.territory[gy * state.arena.gridWidth + gx];
        if (owner >= 0) {
          miniCtx.fillStyle = TEAM_PALE[owner];
          miniCtx.fillRect(gx * cw * sx, gy * ch * sy, cw * sx + 1, ch * sy + 1);
        }
      }
    }
    for (const player of state.players) {
      miniCtx.fillStyle = player.alive ? TEAM_COLORS[player.team] : "#98a2b3";
      miniCtx.beginPath(); miniCtx.arc(player.x * sx, player.y * sy, player.id === state.playerId ? 5 : 3, 0, Math.PI * 2); miniCtx.fill();
    }
  }

  function currentInputPayload() {
    let dx = (state.input.right ? 1 : 0) - (state.input.left ? 1 : 0);
    let dy = (state.input.down ? 1 : 0) - (state.input.up ? 1 : 0);
    const magnitude = Math.hypot(dx, dy);
    if (magnitude > 1) { dx /= magnitude; dy /= magnitude; }
    return { type: "input", dx, dy, angle: state.input.angle, shoot: state.input.shoot, dash: state.input.dash };
  }

  setInterval(() => {
    if (state.phase === "playing") send(currentInputPayload());
  }, 1000 / 30);
  setInterval(() => send({ type: "ping", clientTime: Date.now() }), 15000);

  function keyState(event, pressed) {
    const key = event.key.toLowerCase();
    if (["w", "arrowup"].includes(key)) state.input.up = pressed;
    if (["s", "arrowdown"].includes(key)) state.input.down = pressed;
    if (["a", "arrowleft"].includes(key)) state.input.left = pressed;
    if (["d", "arrowright"].includes(key)) state.input.right = pressed;
    if (key === " ") { state.input.shoot = pressed; event.preventDefault(); }
    if (key === "shift") state.input.dash = pressed;
  }

  addEventListener("keydown", (event) => keyState(event, true));
  addEventListener("keyup", (event) => keyState(event, false));
  addEventListener("blur", () => Object.assign(state.input, { up: false, down: false, left: false, right: false, shoot: false, dash: false }));
  dom.canvas.addEventListener("mousemove", (event) => {
    const me = state.players.find((player) => player.id === state.playerId);
    if (!me) return;
    const world = worldFromClient(event.clientX, event.clientY);
    state.input.angle = Math.atan2(world.y - me.y, world.x - me.x);
  });
  dom.canvas.addEventListener("mousedown", (event) => { if (event.button === 0) state.input.shoot = true; });
  addEventListener("mouseup", (event) => { if (event.button === 0) state.input.shoot = false; });
  dom.canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  dom.createRoom.addEventListener("click", createRoom);
  dom.joinRoom.addEventListener("click", joinRoom);
  dom.roomInput.addEventListener("input", () => { dom.roomInput.value = dom.roomInput.value.toUpperCase().replace(/[^A-Z2-9]/g, ""); });
  dom.startMatch.addEventListener("click", () => send({ type: "start_match" }));
  dom.copyCode.addEventListener("click", async () => {
    await navigator.clipboard.writeText(state.roomCode);
    showEvent(`Room code ${state.roomCode} copied.`);
  });
  dom.downloadCsv.addEventListener("click", () => state.report && download(reportToCsv(state.report), `triad-${state.report.roomCode}-report.csv`, "text/csv;charset=utf-8"));
  dom.downloadJson.addEventListener("click", () => state.report && download(JSON.stringify(state.report, null, 2), `triad-${state.report.roomCode}-report.json`, "application/json"));
  dom.returnLobby.addEventListener("click", () => location.reload());
  dom.sound.addEventListener("click", () => {
    state.soundEnabled = !state.soundEnabled;
    dom.sound.textContent = state.soundEnabled ? "SOUND ON" : "SOUND OFF";
    dom.sound.setAttribute("aria-pressed", String(state.soundEnabled));
  });
  addEventListener("resize", resizeCanvas);

  function beep(frequency, duration) {
    if (!state.soundEnabled) return;
    try {
      state.audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = state.audioContext.createOscillator();
      const gain = state.audioContext.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.045, state.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, state.audioContext.currentTime + duration);
      oscillator.connect(gain).connect(state.audioContext.destination);
      oscillator.start();
      oscillator.stop(state.audioContext.currentTime + duration);
    } catch {}
  }

  resizeCanvas();
  requestAnimationFrame(draw);
  setConnection("offline", "OFFLINE");
  dom.phase.textContent = "LOBBY";
})();
