(() => {
  "use strict";

  const BUILD = "20260723-studentrecovery16";
  const CONNECT_TIMEOUT_MS = 65000;
  const ATTEMPT_TIMEOUT_MS = 12000;
  const INPUT_INTERVAL_MS = 50;
  const FRAME_INTERVAL_MS = 34;
  const MINIMAP_INTERVAL_MS = 200;
  const MAX_SOCKET_BUFFER = 64 * 1024;
  const DEFAULT_NAMES = ["Team 1", "Team 2", "Team 3"];
  const DEFAULT_COLORS = ["#1f77b4", "#d62728", "#2ca02c"];

  const $ = (id) => document.getElementById(id);
  const dom = {
    canvas: $("gameCanvas"), minimap: $("minimapCanvas"), lobby: $("lobbyOverlay"),
    phase: $("phaseLabel"), clock: $("clockLabel"), connection: $("connectionBadge"), sound: $("soundButton"), event: $("eventBanner"),
    serverUrl: $("serverUrlInput"), roomInput: $("roomCodeInput"), pcLabel: $("pcLabelInput"), register: $("registerButton"),
    registrationForm: $("registrationForm"), lobbyStatus: $("lobbyStatus"), studentInputs: [$("student1Input"), $("student2Input"), $("student3Input")],
    healthDot: $("serverHealthDot"), healthTitle: $("serverHealthTitle"), healthText: $("serverHealthText"),
    waitingPanel: $("waitingPanel"), waitingStage: $("waitingStageLabel"), waitingMessage: $("waitingMessage"), waitingRoom: $("waitingRoomCode"), waitingPc: $("waitingPcLabel"), waitingStudents: $("waitingStudents"),
    approvedPanel: $("approvedPanel"), roomCodeLarge: $("roomCodeLarge"), ready: $("readyButton"), assignedColor: $("assignedTeamColor"), assignedName: $("assignedTeamName"), teamCapacity: $("teamCapacity"), roster: $("rosterList"),
    roomCodeLabel: $("roomCodeLabel"), playerTeamDot: $("playerTeamDot"), playerName: $("playerNameLabel"), playerState: $("playerStateLabel"), playerMembers: $("playerMembersLabel"), playerReady: $("playerReadyLabel"),
    playerTerritory: $("playerTerritoryLabel"), playerKills: $("playerKillsLabel"), playerDeaths: $("playerDeathsLabel"), playerAccuracy: $("playerAccuracyLabel"), shotCooldown: $("shotCooldown"), dashCooldown: $("dashCooldown"),
    lives: $("lifeDisplay"), ammo: $("ammoDisplay"), ammoTimer: $("ammoRegenTimer"), power: $("powerDisplay"), network: $("networkDisplay"),
    teamCards: [$("team0Card"), $("team1Card"), $("team2Card")], teamNames: [$("team0Name"), $("team1Name"), $("team2Name")], teamTerritory: [$("team0Territory"), $("team1Territory"), $("team2Territory")], teamKills: [$("team0Kills"), $("team1Kills"), $("team2Kills")],
    questionOverlay: $("questionOverlay"), questionTitle: $("questionTitle"), questionTimer: $("questionTimer"), questionCanvas: $("questionCanvas"), questionPrompt: $("questionPrompt"), questionOptions: $("questionOptions"), questionFeedback: $("questionFeedback"),
    endOverlay: $("endOverlay"), winnerSummary: $("winnerSummary"), finalRanking: $("finalRanking"), reportBody: $("reportTableBody"), downloadCsv: $("downloadCsvButton"), downloadJson: $("downloadJsonButton"), returnLobby: $("returnLobbyButton")
  };

  if (!dom.canvas || !dom.minimap || !dom.register) return;

  const ctx = dom.canvas.getContext("2d", { alpha: false });
  const miniCtx = dom.minimap.getContext("2d", { alpha: false });
  const questionCtx = dom.questionCanvas?.getContext("2d") || null;
  if (!ctx || !miniCtx) {
    document.body.classList.add("lobby-active");
    setStatus("This browser could not create the game canvas. Reload the page or disable hardware acceleration.", "error");
    return;
  }

  const state = {
    ws: null,
    connectPromise: null,
    reconnectTimer: null,
    registrationTimer: null,
    phase: "lobby",
    role: "none",
    protocol: 0,
    serverUrl: "",
    roomCode: "",
    registrationId: "",
    playerId: "",
    sessionToken: "",
    pcLabel: "AUTO",
    students: ["", "", ""],
    team: 0,
    ready: false,
    teamNames: [...DEFAULT_NAMES],
    teamColors: [...DEFAULT_COLORS],
    arena: { width: 9600, height: 6000, gridWidth: 40, gridHeight: 25 },
    players: [],
    projectiles: [],
    pickups: [],
    territory: new Array(1000).fill(-1),
    territoryCounts: [0, 0, 0],
    remainingMs: 300000,
    serverNowOffset: 0,
    currentQuestion: null,
    report: null,
    manuallyClosed: false,
    reconnectAttempt: 0,
    soundEnabled: true,
    audioContext: null,
    bannerTimer: null,
    canvasWidth: 0,
    canvasHeight: 0,
    lastFrameAt: 0,
    lastMinimapAt: 0,
    lastStateAt: 0,
    input: { up: false, down: false, left: false, right: false, shoot: false, dash: false, angle: 0, aiming: false }
  };

  function storageGet(key, fallback = "") {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  }

  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch {}
  }

  function storageRemove(key) {
    try { localStorage.removeItem(key); } catch {}
  }

  function parseJson(text, fallback = null) {
    try { return JSON.parse(text); } catch { return fallback; }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function rgba(hex, alpha) {
    const clean = String(hex || "#000000").replace("#", "");
    const normalized = clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean;
    const value = Number.parseInt(normalized, 16) || 0;
    return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
  }

  function setStatus(text, kind = "neutral") {
    if (!dom.lobbyStatus) return;
    dom.lobbyStatus.textContent = text;
    dom.lobbyStatus.dataset.kind = kind;
    dom.lobbyStatus.style.borderLeftColor = kind === "error" ? "#b42318" : kind === "success" ? "#067647" : "#344054";
  }

  function setHealth(mode, title, text) {
    if (dom.healthDot) dom.healthDot.className = `health-dot ${mode}`;
    if (dom.healthTitle) dom.healthTitle.textContent = title;
    if (dom.healthText) dom.healthText.textContent = text;
  }

  function setConnection(mode, text) {
    if (!dom.connection) return;
    dom.connection.className = `connection-badge ${mode}`;
    dom.connection.textContent = text;
  }

  function setLobbyActive(active) {
    document.body.classList.toggle("lobby-active", active);
    dom.lobby?.classList.toggle("visible", active);
  }

  function normalizeServerUrl(raw) {
    let value = String(raw || "").trim().replace(/\/$/, "");
    if (!value) throw new Error("The multiplayer server URL is missing.");
    if (value.startsWith("https://")) value = `wss://${value.slice(8)}`;
    if (value.startsWith("http://")) value = `ws://${value.slice(7)}`;
    if (!/^wss?:\/\//i.test(value)) throw new Error("The server URL must begin with wss:// or https://.");
    return value;
  }

  function configuredServer() {
    return normalizeServerUrl(window.TRIAD_CONFIG?.serverUrl || storageGet("triadServerUrl", ""));
  }

  function readSession() {
    return parseJson(storageGet("triadStudentSession", "null"), null);
  }

  function saveSession() {
    storageSet("triadStudentSession", JSON.stringify({ build: BUILD, serverUrl: state.serverUrl, roomCode: state.roomCode, sessionToken: state.sessionToken, role: state.role }));
  }

  function clearSession() {
    storageRemove("triadStudentSession");
    state.role = "none";
    state.registrationId = "";
    state.playerId = "";
    state.sessionToken = "";
  }

  function enableRegistrationInputs() {
    for (const input of dom.studentInputs) {
      if (!input) continue;
      input.disabled = false;
      input.readOnly = false;
      input.removeAttribute("aria-disabled");
      input.tabIndex = 0;
    }
    if (dom.roomInput) {
      dom.roomInput.disabled = false;
      dom.roomInput.readOnly = false;
      dom.roomInput.tabIndex = 0;
    }
    dom.register.disabled = false;
    dom.register.tabIndex = 0;
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function parseMessage(data) {
    if (typeof data !== "string") return null;
    return parseJson(data, null);
  }

  function closeSocket(ws, reason = "Closing connection") {
    try { ws?.close(1000, reason); } catch {}
  }

  function openSocket(url, timeoutMs) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      state.ws = ws;
      let settled = false;
      let opened = false;

      const finish = (error = null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        ws.removeEventListener("message", waitForHello);
        if (error) {
          if (state.ws === ws) state.ws = null;
          closeSocket(ws, "Connection attempt ended");
          reject(error);
        } else {
          resolve(ws);
        }
      };

      const waitForHello = (event) => {
        const message = parseMessage(event.data);
        if (message?.type !== "hello" || Number(message.protocol) < 3) return;
        state.protocol = Number(message.protocol);
        state.serverNowOffset = Number(message.serverTime) - Date.now();
        finish();
      };

      const timer = setTimeout(() => finish(new Error("The classroom server did not synchronize in time.")), timeoutMs);
      ws.addEventListener("open", () => { opened = true; setConnection("connecting", "SYNCING"); }, { once: true });
      ws.addEventListener("message", onMessage);
      ws.addEventListener("message", waitForHello);
      ws.addEventListener("error", () => { if (!settled) finish(new Error("Unable to reach the classroom server.")); }, { once: true });
      ws.addEventListener("close", () => {
        if (!settled) finish(new Error(opened ? "The server closed before synchronization." : "The server is still waking."));
        handleClose(ws);
      });
    });
  }

  async function ensureConnected(maxWaitMs = CONNECT_TIMEOUT_MS) {
    if (state.ws?.readyState === WebSocket.OPEN && state.protocol >= 3) return state.ws;
    if (state.connectPromise) return state.connectPromise;
    const url = normalizeServerUrl(dom.serverUrl?.value || configuredServer());
    state.serverUrl = url;
    storageSet("triadServerUrl", url);
    const startedAt = Date.now();

    state.connectPromise = (async () => {
      let lastError = new Error("Unable to connect.");
      while (Date.now() - startedAt < maxWaitMs) {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        setConnection("connecting", "CONNECTING");
        setHealth("", "Waking classroom server…", `Attempt in progress · ${elapsed} s elapsed.`);
        try {
          const remaining = Math.max(3000, maxWaitMs - (Date.now() - startedAt));
          const ws = await openSocket(url, Math.min(ATTEMPT_TIMEOUT_MS, remaining));
          state.reconnectAttempt = 0;
          setConnection("online", "ONLINE");
          setHealth("online", "Game server online", `Protocol ${state.protocol} synchronized.`);
          return ws;
        } catch (error) {
          lastError = error;
          await delay(1500);
        }
      }
      throw new Error(`${lastError.message} The server did not become ready within ${Math.round(maxWaitMs / 1000)} seconds.`);
    })().finally(() => { state.connectPromise = null; });

    return state.connectPromise;
  }

  function send(payload) {
    const ws = state.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > MAX_SOCKET_BUFFER) return false;
    try { ws.send(JSON.stringify(payload)); return true; } catch { return false; }
  }

  function handleClose(ws) {
    if (state.ws !== ws) return;
    state.ws = null;
    state.protocol = 0;
    setConnection("offline", "OFFLINE");
    if (state.manuallyClosed || state.connectPromise || state.phase === "ended") return;
    const session = readSession();
    if (!session?.sessionToken || !session?.roomCode || session.build !== BUILD) {
      if (state.role !== "none") setStatus("Connection lost. Reload the current room link to reconnect.", "error");
      return;
    }
    scheduleReconnect(session);
  }

  function scheduleReconnect(session) {
    clearTimeout(state.reconnectTimer);
    const wait = Math.min(1000 * 2 ** state.reconnectAttempt, 8000);
    state.reconnectAttempt += 1;
    setStatus(`Connection lost. Restoring the player in ${Math.ceil(wait / 1000)} seconds…`);
    state.reconnectTimer = setTimeout(async () => {
      try {
        await ensureConnected(CONNECT_TIMEOUT_MS);
        if (!send({ type: "reconnect_student", roomCode: session.roomCode, sessionToken: session.sessionToken })) throw new Error("Reconnect request was not sent.");
      } catch {
        scheduleReconnect(session);
      }
    }, wait);
  }

  function updateTeamMeta(names, colors) {
    if (Array.isArray(names) && names.length === 3) state.teamNames = names;
    if (Array.isArray(colors) && colors.length === 3) state.teamColors = colors;
    for (let team = 0; team < 3; team += 1) {
      if (dom.teamNames[team]) dom.teamNames[team].textContent = state.teamNames[team].toUpperCase();
      dom.teamCards[team]?.style.setProperty("--team-color", state.teamColors[team]);
    }
    if (dom.playerTeamDot) dom.playerTeamDot.style.background = state.teamColors[state.team];
  }

  function showWaiting(reconnected = false) {
    dom.registrationForm?.classList.add("hidden");
    dom.waitingPanel?.classList.remove("hidden");
    dom.approvedPanel?.classList.add("hidden");
    if (dom.waitingStage) dom.waitingStage.textContent = reconnected ? "REGISTRATION RESTORED" : "REGISTRATION RECEIVED";
    if (dom.waitingMessage) dom.waitingMessage.textContent = "Waiting for teacher approval…";
    if (dom.waitingRoom) dom.waitingRoom.textContent = state.roomCode;
    if (dom.waitingPc) dom.waitingPc.textContent = state.pcLabel;
    if (dom.waitingStudents) dom.waitingStudents.textContent = state.students.join(" · ");
  }

  function showApproved(reconnected = false) {
    dom.registrationForm?.classList.add("hidden");
    dom.waitingPanel?.classList.add("hidden");
    dom.approvedPanel?.classList.remove("hidden");
    if (dom.roomCodeLarge) dom.roomCodeLarge.textContent = state.roomCode;
    if (dom.roomCodeLabel) dom.roomCodeLabel.textContent = state.roomCode;
    if (dom.playerName) dom.playerName.textContent = state.pcLabel;
    if (dom.playerMembers) dom.playerMembers.textContent = state.students.join(" · ");
    setStatus(reconnected ? "Approved player session restored." : "Teacher approved this player. Mark Ready when your group is prepared.", "success");
    updateReadyButton();
  }

  function updateReadyButton() {
    if (!dom.ready) return;
    const allowed = state.role === "player" && state.phase === "lobby";
    dom.ready.disabled = !allowed;
    dom.ready.textContent = state.ready ? "READY — CLICK TO CANCEL" : "I AM READY";
    dom.ready.classList.toggle("secondary-button", state.ready);
    if (dom.playerReady) dom.playerReady.textContent = state.ready ? "YES" : "NO";
  }

  function renderLobby(message) {
    state.phase = message.phase || state.phase;
    state.roomCode = message.roomCode || state.roomCode;
    updateTeamMeta(message.teamNames, message.teamColors);

    if (state.role === "pending") {
      const pending = Array.isArray(message.pending) ? message.pending : [];
      const found = pending.some((item) => item.id === state.registrationId);
      if (dom.waitingStage) dom.waitingStage.textContent = message.registrationLocked ? "REGISTRATION LOCKED" : "IN APPROVAL QUEUE";
      if (dom.waitingMessage) dom.waitingMessage.textContent = found ? `Teacher sees this request · ${pending.length} waiting.` : "Waiting for teacher approval…";
      setStatus(`${message.realPcCount || 0} real player(s) · ${message.botCount || 0} AI · ${pending.length} pending.`, "success");
      return;
    }

    if (state.role !== "player") return;
    const players = Array.isArray(message.players) ? message.players : [];
    const me = players.find((player) => player.id === state.playerId);
    if (!me) return;

    state.team = Number(me.team) || 0;
    state.ready = Boolean(me.ready);
    state.pcLabel = me.pcLabel || state.pcLabel;
    state.students = Array.isArray(me.students) ? me.students : state.students;
    if (dom.assignedColor) dom.assignedColor.style.background = state.teamColors[state.team];
    if (dom.assignedName) dom.assignedName.textContent = state.teamNames[state.team];
    if (dom.playerName) dom.playerName.textContent = state.pcLabel;
    if (dom.playerMembers) dom.playerMembers.textContent = state.students.join(" · ");
    if (dom.playerState) dom.playerState.textContent = state.ready ? "Approved · ready" : "Approved · not ready";

    if (dom.teamCapacity) dom.teamCapacity.innerHTML = (message.teamCounts || [0, 0, 0]).map((count, team) => `<div class="capacity-card" style="--team-color:${escapeHtml(state.teamColors[team])}"><span>${escapeHtml(state.teamNames[team])}</span><b>${count}/3</b></div>`).join("");
    if (dom.roster) dom.roster.innerHTML = players.map((player) => `<div class="roster-card ${player.connected ? "" : "disconnected"} ${player.ready ? "" : "not-ready"}" style="--team-color:${escapeHtml(state.teamColors[player.team])}"><strong>${escapeHtml(player.pcLabel)}${player.id === state.playerId ? " · THIS PC" : ""}${player.isBot ? '<span class="bot-badge">AI</span>' : ""}</strong><small>${escapeHtml(state.teamNames[player.team])} · ${player.connected ? (player.ready ? "READY" : "NOT READY") : "OFFLINE"}</small><span class="member-line">${escapeHtml((player.students || []).join(" · "))}</span></div>`).join("");

    updateReadyButton();
    setStatus(`${message.realPcCount || 0} real player(s) · ${message.botCount || 0} AI · ${message.readyCount || 0} ready.`, message.startReady ? "success" : "neutral");
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

  function applyState(message) {
    state.phase = message.phase || state.phase;
    if (message.arena) state.arena = message.arena;
    if (Array.isArray(message.players)) state.players = message.players;
    if (Array.isArray(message.projectiles)) state.projectiles = message.projectiles;
    if (Array.isArray(message.pickups)) state.pickups = message.pickups;
    if (Array.isArray(message.territoryCounts)) state.territoryCounts = message.territoryCounts;
    if (Number.isFinite(Number(message.remainingMs))) state.remainingMs = Number(message.remainingMs);
    if (Number.isFinite(Number(message.serverNow))) state.serverNowOffset = Number(message.serverNow) - Date.now();
    updateTeamMeta(message.teamNames, message.teamColors);
    applyTerritory(message);
    state.lastStateAt = performance.now();
    if (dom.phase) dom.phase.textContent = String(state.phase).toUpperCase();
    if (["countdown", "playing"].includes(state.phase)) setLobbyActive(false);
    updateHud();
  }

  function updateHud() {
    const total = state.arena.gridWidth * state.arena.gridHeight;
    for (let team = 0; team < 3; team += 1) {
      if (dom.teamTerritory[team]) dom.teamTerritory[team].textContent = `${(total ? (Number(state.territoryCounts[team]) || 0) / total * 100 : 0).toFixed(1)}%`;
      if (dom.teamKills[team]) dom.teamKills[team].textContent = state.players.filter((player) => player.team === team).reduce((sum, player) => sum + (Number(player.kills) || 0), 0);
    }

    const me = state.players.find((player) => player.id === state.playerId);
    if (!me) return;
    if (dom.playerName) dom.playerName.textContent = me.pcLabel || state.pcLabel;
    if (dom.playerMembers) dom.playerMembers.textContent = (me.students || state.students).join(" · ");
    if (dom.playerState) dom.playerState.textContent = me.connected === false ? "Disconnected" : me.alive === false ? "Eliminated · solve the geometry challenge" : (me.invulnerable ? "Alive · shielded" : "Alive");
    if (dom.playerTerritory) dom.playerTerritory.textContent = Number(me.territory) || 0;
    if (dom.playerKills) dom.playerKills.textContent = Number(me.kills) || 0;
    if (dom.playerDeaths) dom.playerDeaths.textContent = Number(me.deaths) || 0;
    if (dom.playerAccuracy) dom.playerAccuracy.textContent = me.accuracy == null ? "—" : `${Math.round(Number(me.accuracy) * 100)}%`;

    const now = Date.now() + state.serverNowOffset;
    if (dom.shotCooldown) dom.shotCooldown.value = Number(me.shotReadyAt) <= now ? 1 : Math.max(0, 1 - (Number(me.shotReadyAt) - now) / 380);
    if (dom.dashCooldown) dom.dashCooldown.value = Number(me.dashReadyAt) <= now ? 1 : Math.max(0, 1 - (Number(me.dashReadyAt) - now) / 3200);

    const maxLives = Math.max(1, Number(me.maxLives) || 3);
    const lives = Math.max(0, Math.min(maxLives, Number(me.lives ?? maxLives)));
    if (dom.lives) dom.lives.textContent = `${"♥ ".repeat(lives)}${"♡ ".repeat(maxLives - lives)}`.trim();
    const maxAmmo = Math.max(1, Number(me.maxAmmo) || 5);
    const ammo = Math.max(0, Math.min(maxAmmo, Number(me.ammo ?? maxAmmo)));
    if (dom.ammo) dom.ammo.textContent = `${"● ".repeat(ammo)}${"○ ".repeat(maxAmmo - ammo)}`.trim();
    if (dom.ammoTimer) dom.ammoTimer.textContent = ammo >= maxAmmo ? "Full · +1 every 5 s" : `Next charge in ${(Math.max(0, Number(me.ammoRegenRemainingMs) || 0) / 1000).toFixed(1)} s`;
    if (dom.power) dom.power.textContent = String(me.activePower || "NONE").toUpperCase();
    if (dom.network) dom.network.textContent = performance.now() - state.lastStateAt < 1200 ? "LIVE" : "DELAYED";
  }

  function onMessage(event) {
    const message = parseMessage(event.data);
    if (!message) return;

    switch (message.type) {
      case "hello":
        state.protocol = Number(message.protocol) || state.protocol;
        state.serverNowOffset = Number(message.serverTime) - Date.now();
        break;
      case "registration_received":
        clearTimeout(state.registrationTimer);
        state.role = "pending";
        state.roomCode = message.roomCode;
        state.registrationId = message.registrationId;
        state.sessionToken = message.sessionToken;
        state.pcLabel = message.pcLabel;
        state.students = message.students;
        saveSession();
        showWaiting(Boolean(message.reconnected));
        if (dom.playerName) dom.playerName.textContent = state.pcLabel;
        if (dom.playerMembers) dom.playerMembers.textContent = state.students.join(" · ");
        if (dom.playerState) dom.playerState.textContent = "Pending teacher approval";
        if (dom.roomCodeLabel) dom.roomCodeLabel.textContent = state.roomCode;
        setStatus("Registration confirmed. The teacher can now approve this player.", "success");
        beep(520, 0.08);
        break;
      case "joined":
        clearTimeout(state.registrationTimer);
        state.role = "player";
        state.roomCode = message.roomCode;
        state.playerId = message.playerId;
        state.sessionToken = message.sessionToken;
        state.pcLabel = message.pcLabel;
        state.students = message.students;
        state.team = Number(message.team) || 0;
        state.ready = Boolean(message.ready);
        if (message.arena) state.arena = message.arena;
        saveSession();
        updateTeamMeta();
        showApproved(Boolean(message.reconnected));
        beep(720, 0.1);
        break;
      case "team_assigned":
        state.team = Number(message.team) || 0;
        state.ready = false;
        updateTeamMeta();
        showEvent(`Teacher assigned ${state.teamNames[state.team]}.`);
        break;
      case "lobby":
        renderLobby(message);
        break;
      case "countdown":
        state.phase = "countdown";
        setLobbyActive(false);
        showEvent(`Match starts in ${message.seconds}…`);
        break;
      case "state":
        applyState(message);
        break;
      case "question":
        showQuestion(message);
        break;
      case "answer_result":
        handleAnswerResult(message);
        break;
      case "respawned":
        state.currentQuestion = null;
        dom.questionOverlay?.classList.remove("visible");
        if (dom.questionFeedback) dom.questionFeedback.textContent = "";
        showEvent("Correct. Respawn authorized.");
        break;
      case "life_lost":
        showEvent(`${message.lives} life${message.lives === 1 ? "" : "s"} remaining.`);
        break;
      case "ammo_regenerated":
        showEvent(`Ammo regenerated · ${message.ammo}/${message.maxAmmo || 5}`);
        break;
      case "pickup_collected":
        showEvent(message.label || "Power collected.");
        break;
      case "event":
        showEvent(message.text);
        break;
      case "match_ended":
        state.phase = "ended";
        state.report = message.report;
        renderFinalReport(message.winners || [], message.report || {});
        break;
      case "removed":
        clearSession();
        state.manuallyClosed = true;
        closeSocket(state.ws, "Removed by teacher");
        alert(message.message || "This player was removed from the room.");
        location.reload();
        break;
      case "error":
        clearTimeout(state.registrationTimer);
        setStatus(message.message || "Server request failed.", "error");
        if (state.role === "none") {
          enableRegistrationInputs();
          dom.register.textContent = "TRY REGISTRATION AGAIN";
        }
        updateReadyButton();
        showEvent(message.message || "Server request failed.");
        break;
      case "pong":
        state.serverNowOffset = Number(message.serverTime) - Date.now();
        break;
      default:
        break;
    }
  }

  async function registerStudent() {
    const roomCode = String(dom.roomInput?.value || "").trim().toUpperCase();
    const students = dom.studentInputs.map((input) => String(input?.value || "").trim());

    try {
      if (!/^[A-Z2-9]{6}$/.test(roomCode)) throw new Error("Enter the current six-character room PIN.");
      if (students.some((name) => name.length < 2)) throw new Error("Enter all three student names.");
      if (new Set(students.map((name) => name.toLocaleLowerCase())).size !== 3) throw new Error("The three student names must be different.");

      storageSet("triadStudents", JSON.stringify(students));
      clearSession();
      state.roomCode = roomCode;
      state.students = students;
      state.pcLabel = "AUTO";
      if (dom.pcLabel) dom.pcLabel.value = "Assigned by server";
      dom.register.disabled = true;
      dom.register.textContent = "CONNECTING TO CLASSROOM…";
      setStatus("Connecting to the classroom server. A cold start may take up to one minute.");
      await ensureConnected(CONNECT_TIMEOUT_MS);
      if (!send({ type: "register_student", roomCode, pcLabel: "AUTO", students, preferredTeam: 0 })) throw new Error("The registration request could not be sent.");
      dom.register.textContent = "REGISTRATION SENT";
      setStatus(`Registration sent to room ${roomCode}. Waiting for confirmation…`);
      clearTimeout(state.registrationTimer);
      state.registrationTimer = setTimeout(() => {
        if (state.role !== "none") return;
        enableRegistrationInputs();
        dom.register.textContent = "TRY REGISTRATION AGAIN";
        setStatus("The room did not confirm registration. Verify the PIN and that the teacher room is still open.", "error");
      }, 20000);
    } catch (error) {
      enableRegistrationInputs();
      dom.register.textContent = "TRY REGISTRATION AGAIN";
      setStatus(error.message || "Registration failed.", "error");
      setConnection("offline", "OFFLINE");
    }
  }

  function showQuestion(message) {
    state.currentQuestion = message;
    dom.questionOverlay?.classList.add("visible");
    if (dom.questionTitle) dom.questionTitle.textContent = questionHeading(message.questionType || message.type || message.diagram?.type);
    if (dom.questionPrompt) dom.questionPrompt.textContent = message.prompt || "Solve the geometry challenge.";
    if (dom.questionFeedback) {
      dom.questionFeedback.textContent = "";
      dom.questionFeedback.className = "question-feedback";
    }
    if (dom.questionOptions) {
      dom.questionOptions.innerHTML = "";
      for (const [index, option] of (message.options || []).entries()) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "question-option";
        button.textContent = option;
        button.addEventListener("click", () => submitAnswer(index));
        dom.questionOptions.appendChild(button);
      }
    }
    drawQuestionDiagram(message.diagram || {}, message.questionType || message.type || "");
    beep(300, 0.1);
  }

  function questionHeading(type) {
    if (type === "thales_height") return "Use Thales' theorem to find the height";
    if (["ratio_sin", "ratio_cos", "sin", "cos"].includes(type)) return "Identify or apply the correct trigonometric ratio";
    return "Determine the unknown side";
  }

  function submitAnswer(selectedIndex) {
    if (!state.currentQuestion) return;
    for (const button of dom.questionOptions?.children || []) button.disabled = true;
    send({ type: "answer", questionId: state.currentQuestion.id || state.currentQuestion.questionId, selectedIndex });
  }

  function handleAnswerResult(message) {
    if (!dom.questionFeedback) return;
    if (message.correct) {
      dom.questionFeedback.textContent = "Correct. Server-authorized respawn in progress…";
      dom.questionFeedback.className = "question-feedback correct";
    } else {
      dom.questionFeedback.textContent = message.timeout ? "Time expired. A new question is loading." : "Incorrect. A new question is loading.";
      dom.questionFeedback.className = "question-feedback wrong";
      beep(170, 0.13);
    }
  }

  function drawQuestionDiagram(diagram, type) {
    if (!questionCtx || !dom.questionCanvas) return;
    const c = questionCtx;
    const w = dom.questionCanvas.width;
    const h = dom.questionCanvas.height;
    c.clearRect(0, 0, w, h);
    c.fillStyle = "#fbfcfe";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#111827";
    c.fillStyle = "#111827";
    c.lineJoin = "round";
    c.lineCap = "round";

    if (diagram.type === "thales_height" || type === "thales_height") {
      const ground = 205;
      c.lineWidth = 3;
      c.beginPath(); c.moveTo(20, ground); c.lineTo(w - 20, ground); c.stroke();
      c.lineWidth = 6;
      c.beginPath(); c.moveTo(80, ground); c.lineTo(80, 120); c.moveTo(335, ground); c.lineTo(335, 48); c.stroke();
      c.strokeStyle = "#e88b2b"; c.lineWidth = 3;
      c.beginPath(); c.moveTo(80, 120); c.lineTo(220, ground); c.moveTo(335, 48); c.lineTo(535, ground); c.stroke();
      c.fillStyle = "#111827"; c.font = "700 15px system-ui"; c.textAlign = "center";
      c.fillText(`${diagram.referenceHeight ?? "?"} m`, 48, 164);
      c.fillText(`${diagram.referenceShadow ?? "?"} m`, 150, 232);
      c.fillText("h = ?", 300, 130);
      c.fillText(`${diagram.targetShadow ?? "?"} m`, 435, 232);
      return;
    }

    const a = { x: 105, y: 205 };
    const b = { x: 460, y: 205 };
    const top = { x: 460, y: 48 };
    c.lineWidth = 4;
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(top.x, top.y); c.closePath(); c.stroke();
    c.lineWidth = 2;
    c.strokeRect(b.x - 22, b.y - 22, 22, 22);
    c.font = "700 16px system-ui"; c.textAlign = "center";
    const adjacent = diagram.legA ?? diagram.adjacent;
    const opposite = diagram.legB ?? diagram.opposite;
    if (adjacent != null) c.fillText(String(adjacent), (a.x + b.x) / 2, b.y + 30);
    if (opposite != null) c.fillText(String(opposite), b.x + 36, (b.y + top.y) / 2);
    if (diagram.hypotenuse != null) c.fillText(String(diagram.hypotenuse), (a.x + top.x) / 2 - 18, (a.y + top.y) / 2 - 12);
    const angle = diagram.angleDegrees ?? diagram.angle;
    if (angle != null) c.fillText(`${diagram.angleLabel || "θ"} = ${angle}°`, a.x + 62, a.y - 18);
  }

  function renderFinalReport(winners, report) {
    dom.questionOverlay?.classList.remove("visible");
    dom.endOverlay?.classList.add("visible");
    updateTeamMeta(report.teamNames, report.teamColors);
    const winnerNames = winners.map((team) => report.teamNames?.[team] || state.teamNames[team]);
    if (dom.winnerSummary) dom.winnerSummary.textContent = winners.length === 1 ? `${winnerNames[0]} wins by controlling the largest territory.` : `Territory tie: ${winnerNames.join(" and ")}.`;
    const total = state.arena.gridWidth * state.arena.gridHeight;
    const teams = Array.isArray(report.teams) ? report.teams : [];
    if (dom.finalRanking) dom.finalRanking.innerHTML = teams.map((team, index) => `<div class="rank-card" style="--team-color:${escapeHtml(team.color)}"><span>#${index + 1} ${escapeHtml(team.name)}</span><strong>${((Number(team.territory) || 0) / total * 100).toFixed(1)}%</strong><small>${Number(team.territory) || 0} cells</small></div>`).join("");
    const players = Array.isArray(report.players) ? report.players : [];
    if (dom.reportBody) dom.reportBody.innerHTML = players.map((player) => `<tr><td>${escapeHtml(player.pcLabel)}</td><td>${escapeHtml((player.students || []).join(" · "))}</td><td>${escapeHtml(player.teamName)}</td><td>${player.isBot ? "AI" : "REAL"}</td><td>${Number(player.territory) || 0}</td><td>${Number(player.deaths) || 0}</td><td>${Number(player.attempts) || 0}</td><td>${Number(player.correct) || 0}</td><td>${Number(player.wrong) || 0}</td><td>${Number(player.timeouts) || 0}</td><td>${player.accuracy == null ? "—" : `${Math.round(Number(player.accuracy) * 100)}%`}</td></tr>`).join("");
    beep(880, 0.18);
  }

  function reportToCsv(report) {
    const rows = [["room_code", "pc_player", "students", "team", "type", "territory", "kills", "deaths", "attempts", "correct", "wrong", "timeouts", "accuracy"]];
    for (const player of report.players || []) rows.push([report.roomCode, player.pcLabel, (player.students || []).join(" | "), player.teamName, player.isBot ? "AI" : "REAL", player.territory, player.kills, player.deaths, player.attempts, player.correct, player.wrong, player.timeouts, player.accuracy ?? ""]);
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
    if (!text || !dom.event) return;
    dom.event.textContent = text;
    dom.event.classList.add("visible");
    clearTimeout(state.bannerTimer);
    state.bannerTimer = setTimeout(() => dom.event.classList.remove("visible"), 2800);
  }

  function beep(frequency, duration) {
    if (!state.soundEnabled) return;
    try {
      state.audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = state.audioContext.createOscillator();
      const gain = state.audioContext.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.035, state.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, state.audioContext.currentTime + duration);
      oscillator.connect(gain).connect(state.audioContext.destination);
      oscillator.start();
      oscillator.stop(state.audioContext.currentTime + duration);
    } catch {}
  }

  function resizeCanvas() {
    const width = Math.max(1, innerWidth);
    const height = Math.max(1, innerHeight);
    const dpr = Math.min(devicePixelRatio || 1, 1);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (dom.canvas.width !== pixelWidth || dom.canvas.height !== pixelHeight) {
      dom.canvas.width = pixelWidth;
      dom.canvas.height = pixelHeight;
      dom.canvas.style.width = `${width}px`;
      dom.canvas.style.height = `${height}px`;
    }
    state.canvasWidth = width;
    state.canvasHeight = height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function cameraTransform() {
    const me = state.players.find((player) => player.id === state.playerId);
    const centerX = Number(me?.x) || state.arena.width / 2;
    const centerY = Number(me?.y) || state.arena.height / 2;
    const visibleWidth = Math.min(3850, state.arena.width);
    const visibleHeight = Math.min(2400, state.arena.height);
    const scale = Math.max(0.04, Math.min(state.canvasWidth / visibleWidth, state.canvasHeight / visibleHeight));
    const halfW = state.canvasWidth / scale / 2;
    const halfH = state.canvasHeight / scale / 2;
    const cameraX = state.arena.width <= halfW * 2 ? state.arena.width / 2 : Math.max(halfW, Math.min(state.arena.width - halfW, centerX));
    const cameraY = state.arena.height <= halfH * 2 ? state.arena.height / 2 : Math.max(halfH, Math.min(state.arena.height - halfH, centerY));
    return { scale, offsetX: state.canvasWidth / 2 - cameraX * scale, offsetY: state.canvasHeight / 2 - cameraY * scale, left: cameraX - halfW, right: cameraX + halfW, top: cameraY - halfH, bottom: cameraY + halfH };
  }

  function drawArena() {
    ctx.clearRect(0, 0, state.canvasWidth, state.canvasHeight);
    ctx.fillStyle = "#eef2f7";
    ctx.fillRect(0, 0, state.canvasWidth, state.canvasHeight);
    const t = cameraTransform();
    ctx.save();
    ctx.translate(t.offsetX, t.offsetY);
    ctx.scale(t.scale, t.scale);
    ctx.fillStyle = "#fbfcfe";
    ctx.fillRect(0, 0, state.arena.width, state.arena.height);

    const cellW = state.arena.width / state.arena.gridWidth;
    const cellH = state.arena.height / state.arena.gridHeight;
    const minX = Math.max(0, Math.floor(t.left / cellW));
    const maxX = Math.min(state.arena.gridWidth - 1, Math.ceil(t.right / cellW));
    const minY = Math.max(0, Math.floor(t.top / cellH));
    const maxY = Math.min(state.arena.gridHeight - 1, Math.ceil(t.bottom / cellH));

    for (let gy = minY; gy <= maxY; gy += 1) {
      for (let gx = minX; gx <= maxX; gx += 1) {
        const owner = state.territory[gy * state.arena.gridWidth + gx];
        if (owner < 0 || owner > 2) continue;
        ctx.fillStyle = rgba(state.teamColors[owner], 0.3);
        ctx.fillRect(gx * cellW, gy * cellH, cellW + 1, cellH + 1);
      }
    }

    ctx.strokeStyle = "rgba(17,24,39,.08)";
    ctx.lineWidth = 1 / t.scale;
    for (let gx = Math.ceil(minX / 5) * 5; gx <= maxX; gx += 5) {
      ctx.beginPath(); ctx.moveTo(gx * cellW, t.top); ctx.lineTo(gx * cellW, t.bottom); ctx.stroke();
    }
    for (let gy = Math.ceil(minY / 5) * 5; gy <= maxY; gy += 5) {
      ctx.beginPath(); ctx.moveTo(t.left, gy * cellH); ctx.lineTo(t.right, gy * cellH); ctx.stroke();
    }

    for (const pickup of state.pickups) {
      if (pickup.x < t.left || pickup.x > t.right || pickup.y < t.top || pickup.y > t.bottom) continue;
      const colors = { ammo: "#f79009", shield: "#2e90fa", speed: "#12b76a", rapid: "#f04438", paint: "#7f56d9" };
      ctx.fillStyle = colors[pickup.type] || "#667085";
      ctx.fillRect(pickup.x - 24, pickup.y - 24, 48, 48);
    }

    for (const projectile of state.projectiles) {
      if (projectile.x < t.left || projectile.x > t.right || projectile.y < t.top || projectile.y > t.bottom) continue;
      ctx.fillStyle = state.teamColors[projectile.team] || "#101828";
      ctx.beginPath(); ctx.arc(projectile.x, projectile.y, 12, 0, Math.PI * 2); ctx.fill();
    }

    for (const player of state.players) drawPlayer(player, t.scale);
    ctx.strokeStyle = "#98a2b3";
    ctx.lineWidth = 3 / t.scale;
    ctx.strokeRect(0, 0, state.arena.width, state.arena.height);
    ctx.restore();
  }

  function drawPlayer(player, scale) {
    const x = Number(player.x) || 0;
    const y = Number(player.y) || 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = player.connected === false ? 0.35 : 1;
    if (player.alive === false) {
      ctx.strokeStyle = "#667085";
      ctx.lineWidth = 6 / scale;
      ctx.beginPath(); ctx.moveTo(-28, -28); ctx.lineTo(28, 28); ctx.moveTo(28, -28); ctx.lineTo(-28, 28); ctx.stroke();
    } else {
      ctx.rotate(Number(player.angle) || 0);
      ctx.fillStyle = state.teamColors[player.team] || "#667085";
      ctx.beginPath(); ctx.moveTo(34, 0); ctx.lineTo(-24, 22); ctx.lineTo(-17, 0); ctx.lineTo(-24, -22); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = player.id === state.playerId ? "#101828" : "#ffffff";
      ctx.lineWidth = (player.id === state.playerId ? 6 : 4) / scale;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMinimap() {
    const w = dom.minimap.width;
    const h = dom.minimap.height;
    miniCtx.fillStyle = "#ffffff";
    miniCtx.fillRect(0, 0, w, h);
    const sx = w / state.arena.width;
    const sy = h / state.arena.height;
    const cellW = state.arena.width / state.arena.gridWidth;
    const cellH = state.arena.height / state.arena.gridHeight;
    for (let gy = 0; gy < state.arena.gridHeight; gy += 1) {
      for (let gx = 0; gx < state.arena.gridWidth; gx += 1) {
        const owner = state.territory[gy * state.arena.gridWidth + gx];
        if (owner < 0 || owner > 2) continue;
        miniCtx.fillStyle = rgba(state.teamColors[owner], 0.42);
        miniCtx.fillRect(gx * cellW * sx, gy * cellH * sy, cellW * sx + 1, cellH * sy + 1);
      }
    }
    for (const player of state.players) {
      miniCtx.fillStyle = player.alive === false ? "#98a2b3" : state.teamColors[player.team] || "#667085";
      miniCtx.beginPath(); miniCtx.arc(player.x * sx, player.y * sy, player.id === state.playerId ? 5 : 3, 0, Math.PI * 2); miniCtx.fill();
    }
  }

  function frame(frameAt) {
    const active = ["countdown", "playing"].includes(state.phase) && !document.hidden;
    if (active && frameAt - state.lastFrameAt >= FRAME_INTERVAL_MS) {
      state.lastFrameAt = frameAt;
      drawArena();
      const seconds = Math.max(0, Math.ceil(state.remainingMs / 1000));
      if (dom.clock) dom.clock.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
      if (state.currentQuestion && dom.questionTimer) dom.questionTimer.textContent = Math.max(0, Math.ceil((Number(state.currentQuestion.expiresAt) - (Date.now() + state.serverNowOffset)) / 1000));
    }
    if (active && frameAt - state.lastMinimapAt >= MINIMAP_INTERVAL_MS) {
      state.lastMinimapAt = frameAt;
      drawMinimap();
    }
    requestAnimationFrame(frame);
  }

  function inputPayload() {
    let dx = (state.input.right ? 1 : 0) - (state.input.left ? 1 : 0);
    let dy = (state.input.down ? 1 : 0) - (state.input.up ? 1 : 0);
    const magnitude = Math.hypot(dx, dy);
    if (magnitude > 1) { dx /= magnitude; dy /= magnitude; }
    return { type: "input", dx, dy, angle: state.input.angle, shoot: state.input.shoot, dash: state.input.dash };
  }

  function keyState(event, pressed) {
    const key = event.key.toLowerCase();
    if (["w", "arrowup"].includes(key)) state.input.up = pressed;
    if (["s", "arrowdown"].includes(key)) state.input.down = pressed;
    if (["a", "arrowleft"].includes(key)) state.input.left = pressed;
    if (["d", "arrowright"].includes(key)) state.input.right = pressed;
    if (key === " ") { state.input.shoot = pressed; event.preventDefault(); }
    if (key === "shift") state.input.dash = pressed;
  }

  function updateAim(event) {
    if (!state.input.aiming) return;
    const me = state.players.find((player) => player.id === state.playerId);
    if (!me) return;
    const t = cameraTransform();
    const worldX = (event.clientX - t.offsetX) / t.scale;
    const worldY = (event.clientY - t.offsetY) / t.scale;
    state.input.angle = Math.atan2(worldY - me.y, worldX - me.x);
  }

  function installEvents() {
    dom.register.addEventListener("click", registerStudent);
    dom.roomInput?.addEventListener("input", () => { dom.roomInput.value = dom.roomInput.value.toUpperCase().replace(/[^A-Z2-9]/g, ""); });
    dom.ready?.addEventListener("click", () => {
      if (state.role !== "player" || state.phase !== "lobby") return;
      state.ready = !state.ready;
      updateReadyButton();
      if (!send({ type: "set_ready", ready: state.ready })) {
        state.ready = !state.ready;
        updateReadyButton();
        setStatus("Ready state could not be sent. Check the connection.", "error");
      }
    });
    dom.sound?.addEventListener("click", () => {
      state.soundEnabled = !state.soundEnabled;
      dom.sound.textContent = state.soundEnabled ? "SOUND ON" : "SOUND OFF";
      dom.sound.setAttribute("aria-pressed", String(state.soundEnabled));
    });
    dom.downloadCsv?.addEventListener("click", () => state.report && download(reportToCsv(state.report), `triad-${state.report.roomCode || state.roomCode}-report.csv`, "text/csv;charset=utf-8"));
    dom.downloadJson?.addEventListener("click", () => state.report && download(JSON.stringify(state.report, null, 2), `triad-${state.report.roomCode || state.roomCode}-report.json`, "application/json"));
    dom.returnLobby?.addEventListener("click", () => { clearSession(); location.href = `index.html?v=${BUILD}`; });

    addEventListener("keydown", (event) => keyState(event, true));
    addEventListener("keyup", (event) => keyState(event, false));
    addEventListener("blur", () => Object.assign(state.input, { up: false, down: false, left: false, right: false, shoot: false, dash: false, aiming: false }));
    dom.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    dom.canvas.addEventListener("mousedown", (event) => { if (event.button === 2) { state.input.aiming = true; updateAim(event); } });
    dom.canvas.addEventListener("mousemove", updateAim);
    addEventListener("mouseup", (event) => { if (event.button === 2) state.input.aiming = false; });
    addEventListener("resize", resizeCanvas, { passive: true });
  }

  function warmServer() {
    const url = String(window.TRIAD_CONFIG?.serverUrl || "").replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
    if (!url) return;
    try { fetch(`${url}/health?wake=${Date.now()}`, { mode: "no-cors", cache: "no-store", credentials: "omit" }).catch(() => {}); } catch {}
  }

  async function restoreSession() {
    const session = readSession();
    const queryRoom = String(new URLSearchParams(location.search).get("room") || "").toUpperCase();
    if (!session?.sessionToken || !session?.roomCode || session.build !== BUILD) return;
    if (queryRoom && queryRoom !== session.roomCode) {
      clearSession();
      return;
    }
    setStatus("Restoring the previous player session…");
    try {
      await ensureConnected(CONNECT_TIMEOUT_MS);
      if (!send({ type: "reconnect_student", roomCode: session.roomCode, sessionToken: session.sessionToken })) throw new Error("The restore request could not be sent.");
    } catch (error) {
      clearSession();
      enableRegistrationInputs();
      setStatus(`Previous session could not be restored: ${error.message}`, "error");
    }
  }

  function start() {
    document.body.classList.add("lobby-active");
    enableRegistrationInputs();
    state.serverUrl = configuredServer();
    if (dom.serverUrl) {
      dom.serverUrl.value = state.serverUrl;
      dom.serverUrl.readOnly = true;
      dom.serverUrl.disabled = false;
    }
    if (dom.pcLabel) {
      dom.pcLabel.value = "Assigned by server";
      dom.pcLabel.readOnly = true;
      dom.pcLabel.disabled = false;
    }

    const savedStudents = parseJson(storageGet("triadStudents", "[]"), []);
    dom.studentInputs.forEach((input, index) => { if (input) input.value = savedStudents[index] || ""; });
    const queryRoom = String(new URLSearchParams(location.search).get("room") || "").toUpperCase();
    if (dom.roomInput) dom.roomInput.value = queryRoom;

    updateTeamMeta();
    setHealth("", "Classroom server standby", "Enter the room PIN and names. The server connects only after Register is pressed.");
    setStatus("Enter three different student names, then press Register.");
    warmServer();
    installEvents();
    resizeCanvas();
    requestAnimationFrame(frame);
    setInterval(() => { if (state.phase === "playing") send(inputPayload()); }, INPUT_INTERVAL_MS);
    setInterval(() => { if (state.ws?.readyState === WebSocket.OPEN) send({ type: "ping", clientTime: Date.now(), build: BUILD }); }, 10000);
    restoreSession();
    window.__triadStudentRecovery = Object.freeze({ build: BUILD, architecture: "input-first-single-socket", lobbyRenderer: "off", dpr: 1 });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
