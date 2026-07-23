(() => {
  "use strict";

  const BUILD = "20260723-studentstable15";
  const DEFAULT_NAMES = ["Team 1", "Team 2", "Team 3"];
  const DEFAULT_COLORS = ["#1f77b4", "#d62728", "#2ca02c"];
  const LABEL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const CONNECT_WINDOW_MS = 65000;
  const CONNECT_ATTEMPT_TIMEOUT_MS = 12000;
  const RECONNECT_GRACE_MS = 65000;
  const INPUT_INTERVAL_MS = 50;
  const LOBBY_FRAME_INTERVAL_MS = 200;
  const GAME_FRAME_INTERVAL_MS = 33;
  const MINIMAP_INTERVAL_MS = 200;
  const MAX_SOCKET_BUFFER = 64 * 1024;

  const $ = (id) => document.getElementById(id);
  const dom = {
    canvas: $("gameCanvas"), minimap: $("minimapCanvas"), phase: $("phaseLabel"), clock: $("clockLabel"),
    connection: $("connectionBadge"), sound: $("soundButton"), event: $("eventBanner"),
    lobby: $("lobbyOverlay"), serverUrl: $("serverUrlInput"), roomInput: $("roomCodeInput"), pcLabel: $("pcLabelInput"),
    register: $("registerButton"), registrationForm: $("registrationForm"), lobbyStatus: $("lobbyStatus"),
    studentInputs: [$("student1Input"), $("student2Input"), $("student3Input")],
    healthDot: $("serverHealthDot"), healthTitle: $("serverHealthTitle"), healthText: $("serverHealthText"),
    waitingPanel: $("waitingPanel"), waitingStage: $("waitingStageLabel"), waitingMessage: $("waitingMessage"),
    waitingRoom: $("waitingRoomCode"), waitingPc: $("waitingPcLabel"), waitingStudents: $("waitingStudents"),
    approvedPanel: $("approvedPanel"), roomCodeLarge: $("roomCodeLarge"), readyButton: $("readyButton"),
    assignedColor: $("assignedTeamColor"), assignedName: $("assignedTeamName"), teamCapacity: $("teamCapacity"), roster: $("rosterList"),
    teamChoice: $("playerTeamChoice"), teamChoiceButton: $("confirmTeamChoice"), teamChoiceStatus: $("teamSelectionStatus"),
    roomCodeLabel: $("roomCodeLabel"), playerTeamDot: $("playerTeamDot"), playerName: $("playerNameLabel"),
    playerState: $("playerStateLabel"), playerMembers: $("playerMembersLabel"), playerReady: $("playerReadyLabel"),
    playerTerritory: $("playerTerritoryLabel"), playerKills: $("playerKillsLabel"), playerDeaths: $("playerDeathsLabel"),
    playerAccuracy: $("playerAccuracyLabel"), shotCooldown: $("shotCooldown"), dashCooldown: $("dashCooldown"),
    lives: $("lifeDisplay"), ammo: $("ammoDisplay"), ammoTimer: $("ammoRegenTimer"), power: $("powerDisplay"), network: $("networkDisplay"),
    teamCards: [$("team0Card"), $("team1Card"), $("team2Card")],
    teamNames: [$("team0Name"), $("team1Name"), $("team2Name")],
    teamTerritory: [$("team0Territory"), $("team1Territory"), $("team2Territory")],
    teamKills: [$("team0Kills"), $("team1Kills"), $("team2Kills")],
    questionOverlay: $("questionOverlay"), questionTitle: $("questionTitle"), questionTimer: $("questionTimer"),
    questionCanvas: $("questionCanvas"), questionPrompt: $("questionPrompt"), questionOptions: $("questionOptions"), questionFeedback: $("questionFeedback"),
    endOverlay: $("endOverlay"), winnerSummary: $("winnerSummary"), finalRanking: $("finalRanking"), reportBody: $("reportTableBody"),
    downloadCsv: $("downloadCsvButton"), downloadJson: $("downloadJsonButton"), returnLobby: $("returnLobbyButton")
  };

  if (!dom.canvas || !dom.minimap) return;

  const ctx = dom.canvas.getContext("2d", { alpha: false, desynchronized: true });
  const miniCtx = dom.minimap.getContext("2d", { alpha: false, desynchronized: true });
  const questionCtx = dom.questionCanvas?.getContext("2d") || null;

  const state = {
    ws: null,
    connectPromise: null,
    reconnectTimer: null,
    reconnectAttempt: 0,
    registrationAckTimer: null,
    manuallyClosed: false,
    phase: "lobby",
    role: "none",
    protocol: 0,
    serverUrl: "",
    roomCode: "",
    registrationId: "",
    playerId: "",
    sessionToken: "",
    pcLabel: "",
    students: ["", "", ""],
    team: 0,
    ready: false,
    arena: { width: 1600, height: 1000, gridWidth: 40, gridHeight: 25 },
    teamNames: [...DEFAULT_NAMES],
    teamColors: [...DEFAULT_COLORS],
    players: [],
    projectiles: [],
    pickups: [],
    territory: new Array(1000).fill(-1),
    territoryCounts: [0, 0, 0],
    remainingMs: 300000,
    serverNowOffset: 0,
    currentQuestion: null,
    report: null,
    soundEnabled: true,
    audioContext: null,
    bannerTimer: null,
    input: { up: false, down: false, left: false, right: false, shoot: false, dash: false, angle: 0, aimActive: false },
    canvas: { width: 0, height: 0, dpr: 1 },
    lastFrameAt: 0,
    lastMinimapAt: 0,
    lastStateAt: 0
  };

  function safeStorageGet(key, fallback = "") {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  }

  function safeStorageSet(key, value) {
    try { localStorage.setItem(key, value); } catch {}
  }

  function safeStorageRemove(key) {
    try { localStorage.removeItem(key); } catch {}
  }

  function createPlayerLabel() {
    const bytes = new Uint8Array(6);
    if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
    else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    const suffix = [...bytes].map((value) => LABEL_ALPHABET[value % LABEL_ALPHABET.length]).join("");
    return `Player-${suffix}`;
  }

  function ensurePlayerLabel(forceNew = false) {
    let label = String(safeStorageGet("triadPcLabel", "")).trim();
    if (forceNew || !/^Player-[A-Z2-9]{6}$/.test(label)) label = createPlayerLabel();
    safeStorageSet("triadPcLabel", label);
    state.pcLabel = label;
    if (dom.pcLabel) {
      dom.pcLabel.value = label;
      dom.pcLabel.readOnly = true;
      dom.pcLabel.setAttribute("aria-readonly", "true");
    }
    return label;
  }

  function normalizeServerUrl(raw) {
    let value = String(raw || "").trim().replace(/\/$/, "");
    if (!value) throw new Error("The multiplayer server URL is missing.");
    if (value.startsWith("https://")) value = `wss://${value.slice(8)}`;
    if (value.startsWith("http://")) value = `ws://${value.slice(7)}`;
    if (!/^wss?:\/\//i.test(value)) throw new Error("The server URL must begin with wss:// or https://.");
    return value;
  }

  function initialServerUrl() {
    const query = new URLSearchParams(location.search).get("server");
    return query || window.TRIAD_CONFIG?.serverUrl || safeStorageGet("triadServerUrl", "");
  }

  function readSession() {
    try { return JSON.parse(safeStorageGet("triadStudentSession", "null")); } catch { return null; }
  }

  function saveSession() {
    safeStorageSet("triadStudentSession", JSON.stringify({
      serverUrl: state.serverUrl,
      roomCode: state.roomCode,
      sessionToken: state.sessionToken,
      role: state.role,
      build: BUILD
    }));
  }

  function clearSession() {
    safeStorageRemove("triadStudentSession");
    state.roomCode = "";
    state.registrationId = "";
    state.playerId = "";
    state.sessionToken = "";
    state.role = "none";
  }

  function setConnection(mode, text) {
    if (!dom.connection) return;
    dom.connection.className = `connection-badge ${mode}`;
    dom.connection.textContent = text;
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

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function rgba(hex, alpha) {
    const clean = String(hex || "#000000").replace("#", "");
    const normalized = clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean;
    const value = Number.parseInt(normalized, 16) || 0;
    return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function closeSocket(ws, code = 1000, reason = "Replacing connection") {
    if (!ws) return;
    try { ws.close(code, reason); } catch {}
  }

  function parseMessage(data) {
    if (typeof data !== "string") return null;
    try { return JSON.parse(data); } catch { return null; }
  }

  function openSocketOnce(url, timeoutMs) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      let settled = false;
      let opened = false;
      state.ws = ws;
      const finish = (error = null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        ws.removeEventListener("message", waitForHello);
        if (error) {
          if (state.ws === ws) state.ws = null;
          closeSocket(ws, 1000, "Connection attempt ended");
          reject(error);
        } else resolve(ws);
      };
      const waitForHello = (event) => {
        const message = parseMessage(event.data);
        if (message?.type === "hello" && Number(message.protocol) >= 3) {
          state.protocol = Number(message.protocol);
          state.serverNowOffset = Number(message.serverTime) - Date.now();
          finish();
        }
      };
      const timer = setTimeout(() => finish(new Error("The game protocol did not respond in time.")), timeoutMs);

      ws.addEventListener("open", () => {
        opened = true;
        setConnection("connecting", "SYNCING");
      }, { once: true });
      ws.addEventListener("message", onSocketMessage);
      ws.addEventListener("message", waitForHello);
      ws.addEventListener("close", () => {
        if (!settled) finish(new Error(opened ? "The game server closed before synchronization." : "The game server is still waking."));
        onSocketClose(ws);
      });
      ws.addEventListener("error", () => {
        if (!settled) finish(new Error("Unable to reach the game server."));
      }, { once: true });
    });
  }

  async function ensureConnected(maxWaitMs = CONNECT_WINDOW_MS) {
    if (state.ws?.readyState === WebSocket.OPEN && state.protocol >= 3) return state.ws;
    if (state.connectPromise) return state.connectPromise;

    const url = normalizeServerUrl(dom.serverUrl?.value || initialServerUrl());
    state.serverUrl = url;
    safeStorageSet("triadServerUrl", url);
    const startedAt = Date.now();

    state.connectPromise = (async () => {
      let lastError = new Error("Unable to connect.");
      while (Date.now() - startedAt < maxWaitMs) {
        const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
        setConnection("connecting", "CONNECTING");
        setHealth("", "Waking classroom server…", `Connection attempt in progress · ${elapsedSeconds} s elapsed.`);
        try {
          const remaining = Math.max(3000, maxWaitMs - (Date.now() - startedAt));
          const ws = await openSocketOnce(url, Math.min(CONNECT_ATTEMPT_TIMEOUT_MS, remaining));
          state.reconnectAttempt = 0;
          setConnection("online", "ONLINE");
          setHealth("online", "Game server online", `Protocol ${state.protocol} synchronized.`);
          return ws;
        } catch (error) {
          lastError = error;
          await delay(1800);
        }
      }
      throw new Error(`${lastError.message} The server did not become ready within ${Math.round(maxWaitMs / 1000)} seconds.`);
    })().finally(() => {
      state.connectPromise = null;
    });

    return state.connectPromise;
  }

  function send(payload) {
    const ws = state.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > MAX_SOCKET_BUFFER) return false;
    try {
      ws.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  function onSocketClose(ws) {
    if (state.ws !== ws) return;
    state.ws = null;
    state.protocol = 0;
    setConnection("offline", "OFFLINE");
    if (state.manuallyClosed || state.connectPromise || state.phase === "ended") return;
    const session = readSession();
    if (!session?.sessionToken || !session?.roomCode) {
      setStatus("Disconnected. Press Register to reconnect.", "error");
      return;
    }
    scheduleReconnect(session);
  }

  function scheduleReconnect(session) {
    clearTimeout(state.reconnectTimer);
    const delayMs = Math.min(1000 * 2 ** state.reconnectAttempt, 8000);
    state.reconnectAttempt += 1;
    setStatus(`Connection lost. Restoring this player in ${Math.ceil(delayMs / 1000)} seconds…`);
    state.reconnectTimer = setTimeout(async () => {
      try {
        if (dom.serverUrl) dom.serverUrl.value = session.serverUrl || initialServerUrl();
        await ensureConnected(RECONNECT_GRACE_MS);
        if (!send({ type: "reconnect_student", roomCode: session.roomCode, sessionToken: session.sessionToken })) throw new Error("Reconnect send failed.");
      } catch {
        scheduleReconnect(session);
      }
    }, delayMs);
  }

  function updateTeamMeta(names = state.teamNames, colors = state.teamColors) {
    if (Array.isArray(names) && names.length === 3) state.teamNames = names;
    if (Array.isArray(colors) && colors.length === 3) state.teamColors = colors;
    for (let team = 0; team < 3; team += 1) {
      if (dom.teamNames[team]) dom.teamNames[team].textContent = state.teamNames[team].toUpperCase();
      dom.teamCards[team]?.style.setProperty("--team-color", state.teamColors[team]);
    }
    if (dom.playerTeamDot) dom.playerTeamDot.style.background = state.teamColors[state.team];
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

  function showWaiting(message) {
    dom.registrationForm?.classList.add("hidden");
    dom.waitingPanel?.classList.remove("hidden");
    dom.approvedPanel?.classList.add("hidden");
    if (dom.waitingRoom) dom.waitingRoom.textContent = state.roomCode;
    if (dom.waitingPc) dom.waitingPc.textContent = state.pcLabel;
    if (dom.waitingStudents) dom.waitingStudents.textContent = state.students.join(" · ");
    if (dom.waitingStage) dom.waitingStage.textContent = message?.reconnected ? "REGISTRATION RESTORED" : "REGISTRATION RECEIVED";
    if (dom.waitingMessage) dom.waitingMessage.textContent = "Waiting for teacher approval…";
  }

  function showApproved(reconnected = false) {
    dom.registrationForm?.classList.add("hidden");
    dom.waitingPanel?.classList.add("hidden");
    dom.approvedPanel?.classList.remove("hidden");
    if (dom.roomCodeLarge) dom.roomCodeLarge.textContent = state.roomCode;
    if (dom.roomCodeLabel) dom.roomCodeLabel.textContent = state.roomCode;
    if (dom.playerName) dom.playerName.textContent = state.pcLabel;
    if (dom.playerMembers) dom.playerMembers.textContent = state.students.join(" · ");
    setStatus(reconnected ? "Approved player session restored." : "Teacher approved this player. Select a team and mark Ready.", "success");
    updateReadyButton();
  }

  function updateReadyButton() {
    if (!dom.readyButton) return;
    const approved = state.role === "player" && state.phase === "lobby";
    dom.readyButton.disabled = !approved;
    dom.readyButton.textContent = state.ready ? "READY — CLICK TO CANCEL" : "I AM READY";
    dom.readyButton.classList.toggle("secondary-button", state.ready);
    if (dom.playerReady) dom.playerReady.textContent = state.ready ? "YES" : "NO";
  }

  function renderTeamChoice(message, me) {
    if (!dom.teamChoice) return;
    const counts = Array.isArray(message.teamCounts) ? message.teamCounts : [0, 0, 0];
    dom.teamChoice.innerHTML = state.teamNames.map((name, team) => {
      const count = Number(counts[team]) || 0;
      const full = count >= 3 && team !== me.team;
      return `<option value="${team}" ${team === me.team ? "selected" : ""} ${full ? "disabled" : ""}>${escapeHtml(name)} · ${count}/3${full ? " · FULL" : ""}</option>`;
    }).join("");
    dom.teamChoice.value = String(me.team);
    dom.teamChoice.disabled = state.ready || state.phase !== "lobby";
    if (dom.teamChoiceButton) dom.teamChoiceButton.disabled = state.ready || state.phase !== "lobby";
    if (dom.teamChoiceStatus) dom.teamChoiceStatus.textContent = state.ready
      ? "Cancel Ready before changing teams."
      : `Current team: ${state.teamNames[me.team]}.`;
  }

  function renderLobby(message) {
    state.phase = message.phase || state.phase;
    state.roomCode = message.roomCode || state.roomCode;
    updateTeamMeta(message.teamNames, message.teamColors);

    if (state.phase === "lobby" && state.role === "player") {
      dom.endOverlay?.classList.remove("visible");
      dom.lobby?.classList.add("visible");
      dom.approvedPanel?.classList.remove("hidden");
      state.report = null;
    }

    if (state.role === "pending") {
      const pending = Array.isArray(message.pending) ? message.pending : [];
      const me = pending.find((item) => item.id === state.registrationId);
      if (dom.waitingStage) dom.waitingStage.textContent = message.registrationLocked ? "REGISTRATION LOCKED" : "IN APPROVAL QUEUE";
      if (dom.waitingMessage) dom.waitingMessage.textContent = me ? `Teacher sees this registration · ${pending.length} waiting.` : "Waiting for approval…";
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
    updateTeamMeta(message.teamNames, message.teamColors);

    if (dom.assignedColor) dom.assignedColor.style.background = state.teamColors[state.team];
    if (dom.assignedName) dom.assignedName.textContent = state.teamNames[state.team];
    if (dom.teamCapacity) dom.teamCapacity.innerHTML = (message.teamCounts || [0, 0, 0]).map((count, team) => `<div class="capacity-card" style="--team-color:${escapeHtml(state.teamColors[team])}"><span>${escapeHtml(state.teamNames[team])}</span><b>${count}/3</b></div>`).join("");
    if (dom.roster) dom.roster.innerHTML = [...players].sort((a, b) => a.team - b.team || String(a.pcLabel).localeCompare(String(b.pcLabel))).map((player) => `<div class="roster-card ${player.connected ? "" : "disconnected"} ${player.ready ? "" : "not-ready"}" style="--team-color:${escapeHtml(state.teamColors[player.team])}"><strong>${escapeHtml(player.pcLabel)}${player.id === state.playerId ? " · THIS PC" : ""}${player.isBot ? '<span class="bot-badge">AI</span>' : ""}</strong><small>${escapeHtml(state.teamNames[player.team])} · ${player.connected ? (player.ready ? "READY" : "NOT READY") : "OFFLINE"}</small><span class="member-line">${escapeHtml((player.students || []).join(" · "))}</span></div>`).join("");
    if (dom.playerName) dom.playerName.textContent = state.pcLabel;
    if (dom.playerMembers) dom.playerMembers.textContent = state.students.join(" · ");
    if (dom.playerState) dom.playerState.textContent = state.ready ? "Approved · ready" : "Approved · select team and mark ready";
    renderTeamChoice(message, me);
    updateReadyButton();
    setStatus(`${message.realPcCount || 0} real player(s) · ${message.botCount || 0} AI · ${message.readyCount || 0} ready.`, message.startReady ? "success" : "neutral");
  }

  function applyState(message) {
    state.phase = message.phase || state.phase;
    state.arena = message.arena || state.arena;
    state.players = Array.isArray(message.players) ? message.players : state.players;
    state.projectiles = Array.isArray(message.projectiles) ? message.projectiles : state.projectiles;
    state.pickups = Array.isArray(message.pickups) ? message.pickups : state.pickups;
    state.territoryCounts = Array.isArray(message.territoryCounts) ? message.territoryCounts : state.territoryCounts;
    state.remainingMs = Number.isFinite(Number(message.remainingMs)) ? Number(message.remainingMs) : state.remainingMs;
    if (Number.isFinite(Number(message.serverNow))) state.serverNowOffset = Number(message.serverNow) - Date.now();
    updateTeamMeta(message.teamNames, message.teamColors);
    applyTerritory(message);
    state.lastStateAt = performance.now();
    if (dom.phase) dom.phase.textContent = String(state.phase).toUpperCase();
    if (["playing", "countdown"].includes(state.phase)) dom.lobby?.classList.remove("visible");
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
    if (dom.playerState) dom.playerState.textContent = me.connected === false ? "Disconnected" : me.alive === false ? "Eliminated · respawn challenge" : (me.invulnerable ? "Alive · shielded" : "Alive");
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
    if (dom.ammoTimer) dom.ammoTimer.textContent = ammo >= maxAmmo ? "Full · +1 every 5 s" : `Next +1 in ${(Math.max(0, Number(me.ammoRegenRemainingMs) || 0) / 1000).toFixed(1)} s`;
    if (dom.power) dom.power.textContent = String(me.activePower || "NONE").toUpperCase();
    if (dom.network) {
      const age = state.lastStateAt ? performance.now() - state.lastStateAt : Infinity;
      dom.network.textContent = age < 500 ? "LIVE" : age < 2000 ? "DELAYED" : "WAITING";
    }
  }

  function onSocketMessage(event) {
    const message = parseMessage(event.data);
    if (!message) return;
    switch (message.type) {
      case "hello":
        state.protocol = Number(message.protocol) || state.protocol;
        state.serverNowOffset = Number(message.serverTime) - Date.now();
        break;
      case "registration_received":
        clearTimeout(state.registrationAckTimer);
        state.role = "pending";
        state.roomCode = message.roomCode;
        state.registrationId = message.registrationId;
        state.sessionToken = message.sessionToken;
        state.pcLabel = message.pcLabel;
        state.students = message.students;
        saveSession();
        showWaiting(message);
        if (dom.roomCodeLabel) dom.roomCodeLabel.textContent = state.roomCode;
        if (dom.playerName) dom.playerName.textContent = state.pcLabel;
        if (dom.playerMembers) dom.playerMembers.textContent = state.students.join(" · ");
        if (dom.playerState) dom.playerState.textContent = "Pending teacher approval";
        setStatus("Registration confirmed. The teacher can now approve this player.", "success");
        beep(520, 0.08);
        break;
      case "joined":
        clearTimeout(state.registrationAckTimer);
        state.role = "player";
        state.roomCode = message.roomCode;
        state.playerId = message.playerId;
        state.sessionToken = message.sessionToken;
        state.pcLabel = message.pcLabel;
        state.students = message.students;
        state.team = Number(message.team) || 0;
        state.ready = Boolean(message.ready);
        state.arena = message.arena || state.arena;
        saveSession();
        showApproved(Boolean(message.reconnected));
        updateTeamMeta();
        beep(720, 0.1);
        break;
      case "team_selected":
      case "team_assigned":
        state.team = Number(message.team) || 0;
        state.ready = false;
        updateTeamMeta();
        if (dom.teamChoiceStatus) dom.teamChoiceStatus.textContent = `Team selected: ${message.teamName || state.teamNames[state.team]}.`;
        showEvent(`Team selected: ${message.teamName || state.teamNames[state.team]}.`);
        break;
      case "lobby":
        renderLobby(message);
        break;
      case "countdown":
        state.phase = "countdown";
        dom.lobby?.classList.remove("visible");
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
        showEvent("Correct. Respawn authorized.");
        break;
      case "life_lost":
        showEvent(`${message.lives} life${message.lives === 1 ? "" : "s"} remaining.`);
        break;
      case "ammo_regenerated":
        showEvent(`Ammo regenerated · ${message.ammo}/${message.maxAmmo || 5}`);
        break;
      case "pickup_collected":
        showEvent(message.label || "Power collected");
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
        closeSocket(state.ws, 1000, "Removed by teacher");
        alert(message.message || "This player was removed from the room.");
        location.reload();
        break;
      case "error": {
        clearTimeout(state.registrationAckTimer);
        const detail = String(message.message || "Server request failed.");
        if (/already registered|label/i.test(detail)) ensurePlayerLabel(true);
        if (dom.register) {
          dom.register.disabled = false;
          dom.register.textContent = "TRY REGISTRATION AGAIN";
        }
        if (dom.teamChoiceButton) dom.teamChoiceButton.disabled = false;
        setStatus(detail, "error");
        showEvent(detail);
        break;
      }
      case "pong":
        state.serverNowOffset = Number(message.serverTime) - Date.now();
        break;
      default:
        break;
    }
  }

  async function registerStudent() {
    const code = String(dom.roomInput?.value || "").trim().toUpperCase();
    const students = dom.studentInputs.map((input) => String(input?.value || "").trim());
    try {
      if (!/^[A-Z2-9]{6}$/.test(code)) throw new Error("Enter the current six-character room code.");
      if (students.some((name) => name.length < 2)) throw new Error("Enter all three student names.");
      if (new Set(students.map((name) => name.toLocaleLowerCase())).size !== 3) throw new Error("The three student names must be different.");

      const label = ensurePlayerLabel();
      safeStorageSet("triadStudents", JSON.stringify(students));
      clearSession();
      state.pcLabel = label;
      state.students = students;
      state.roomCode = code;
      if (dom.register) {
        dom.register.disabled = true;
        dom.register.textContent = "CONNECTING TO CLASSROOM…";
      }
      setStatus("Connecting to the classroom server. A cold start may take up to one minute.");
      await ensureConnected(CONNECT_WINDOW_MS);
      if (!send({ type: "register_student", roomCode: code, pcLabel: label, students, preferredTeam: 0 })) throw new Error("The registration request could not be sent.");
      if (dom.register) dom.register.textContent = "REGISTRATION SENT";
      setStatus(`Registration sent to room ${code}. Waiting for server confirmation…`);
      clearTimeout(state.registrationAckTimer);
      state.registrationAckTimer = setTimeout(() => {
        if (state.role !== "none") return;
        if (dom.register) {
          dom.register.disabled = false;
          dom.register.textContent = "TRY REGISTRATION AGAIN";
        }
        setStatus("The room did not confirm registration. Verify the PIN and that the teacher room is still open.", "error");
      }, 20000);
    } catch (error) {
      if (dom.register) {
        dom.register.disabled = false;
        dom.register.textContent = "TRY REGISTRATION AGAIN";
      }
      setStatus(error.message || "Registration failed.", "error");
      setConnection("offline", "OFFLINE");
    }
  }

  function showQuestion(message) {
    state.currentQuestion = message;
    dom.questionOverlay?.classList.add("visible");
    if (dom.questionTitle) dom.questionTitle.textContent = questionHeading(message.questionType || message.diagram?.type);
    if (dom.questionPrompt) dom.questionPrompt.textContent = message.prompt || "Solve the geometry challenge.";
    if (dom.questionFeedback) {
      dom.questionFeedback.textContent = "";
      dom.questionFeedback.className = "question-feedback";
    }
    if (dom.questionOptions) {
      dom.questionOptions.innerHTML = "";
      (message.options || []).forEach((option, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "question-option";
        button.textContent = option;
        button.addEventListener("click", () => submitAnswer(index));
        dom.questionOptions.appendChild(button);
      });
    }
    drawQuestionDiagram(message.diagram || {}, message.questionType || "");
    beep(300, 0.1);
  }

  function questionHeading(type) {
    if (type === "thales_height") return "Use Thales' theorem to find the height";
    if (type === "ratio_sin" || type === "ratio_cos" || type === "ratio") return "Identify the correct trigonometric ratio";
    return "Determine the unknown side";
  }

  function submitAnswer(selectedIndex) {
    if (!state.currentQuestion) return;
    [...(dom.questionOptions?.children || [])].forEach((button) => { button.disabled = true; });
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

  function drawQuestionDiagram(diagram, questionType) {
    if (!questionCtx || !dom.questionCanvas) return;
    const c = questionCtx;
    const w = dom.questionCanvas.width;
    const h = dom.questionCanvas.height;
    c.clearRect(0, 0, w, h);
    c.fillStyle = "#fbfcfe";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#111827";
    c.fillStyle = "#111827";
    c.lineCap = "round";
    c.lineJoin = "round";

    if (diagram.type === "thales_height" || questionType === "thales_height") {
      const ground = 205;
      const mirror = Boolean(diagram.mirror);
      const mapX = (x) => mirror ? w - x : x;
      const refX = mapX(75), refTop = 120, refShadow = mapX(220);
      const targetX = mapX(330), targetTop = 48, targetShadow = mapX(530);
      c.lineWidth = 3;
      c.beginPath(); c.moveTo(20, ground); c.lineTo(w - 20, ground); c.stroke();
      c.lineWidth = 6;
      c.beginPath(); c.moveTo(refX, ground); c.lineTo(refX, refTop); c.moveTo(targetX, ground); c.lineTo(targetX, targetTop); c.stroke();
      c.strokeStyle = "#e88b2b"; c.lineWidth = 3;
      c.beginPath(); c.moveTo(refX, refTop); c.lineTo(refShadow, ground); c.moveTo(targetX, targetTop); c.lineTo(targetShadow, ground); c.stroke();
      c.fillStyle = "#111827"; c.font = "700 15px system-ui"; c.textAlign = "center";
      c.fillText(`${diagram.referenceHeight ?? "?"} m`, refX + (mirror ? 30 : -30), (ground + refTop) / 2);
      c.fillText(`${diagram.referenceShadow ?? "?"} m`, (refX + refShadow) / 2, ground + 27);
      c.fillText("h = ?", targetX + (mirror ? 36 : -36), (ground + targetTop) / 2);
      c.fillText(`${diagram.targetShadow ?? "?"} m`, (targetX + targetShadow) / 2, ground + 27);
      return;
    }

    const orientation = diagram.orientation || "right-bottom";
    const points = orientation === "left-top"
      ? [{ x: 100, y: 50 }, { x: 100, y: 205 }, { x: 455, y: 50 }]
      : orientation === "left-bottom"
        ? [{ x: 100, y: 205 }, { x: 100, y: 50 }, { x: 455, y: 205 }]
        : orientation === "right-top"
          ? [{ x: 460, y: 50 }, { x: 460, y: 205 }, { x: 105, y: 50 }]
          : [{ x: 460, y: 205 }, { x: 460, y: 50 }, { x: 105, y: 205 }];
    const [right, vertical, horizontal] = points;
    c.strokeStyle = "#111827"; c.lineWidth = 4;
    c.beginPath(); c.moveTo(right.x, right.y); c.lineTo(vertical.x, vertical.y); c.lineTo(horizontal.x, horizontal.y); c.closePath(); c.stroke();
    c.lineWidth = 2;
    const sx = right.x < w / 2 ? 1 : -1;
    const sy = right.y < h / 2 ? 1 : -1;
    c.strokeRect(right.x, right.y, sx * 22, sy * 22);
    c.font = "700 16px system-ui"; c.fillStyle = "#111827"; c.textAlign = "center";
    const labels = [diagram.legB ?? diagram.opposite, diagram.legA ?? diagram.adjacent, diagram.hypotenuse];
    c.fillText(String(labels[0] ?? ""), (right.x + vertical.x) / 2 + sx * 32, (right.y + vertical.y) / 2);
    c.fillText(String(labels[1] ?? ""), (right.x + horizontal.x) / 2, (right.y + horizontal.y) / 2 + sy * 30);
    c.fillText(String(labels[2] ?? ""), (vertical.x + horizontal.x) / 2, (vertical.y + horizontal.y) / 2 - sy * 18);
    const angle = diagram.angleDegrees ?? diagram.angle;
    if (angle != null) c.fillText(`${diagram.angleLabel || "θ"} = ${angle}°`, horizontal.x + (right.x - horizontal.x) * 0.18, horizontal.y + (vertical.y - horizontal.y) * 0.18);
  }

  function renderFinalReport(winners, report) {
    dom.questionOverlay?.classList.remove("visible");
    dom.endOverlay?.classList.add("visible");
    updateTeamMeta(report.teamNames, report.teamColors);
    const winnerNames = winners.map((team) => report.teamNames?.[team] || state.teamNames[team]);
    if (dom.winnerSummary) dom.winnerSummary.textContent = winners.length === 1 ? `${winnerNames[0]} wins by controlling the largest territory.` : `Territory tie: ${winnerNames.join(" and ")}.`;
    const total = state.arena.gridWidth * state.arena.gridHeight;
    const teams = Array.isArray(report.teams) ? report.teams : [];
    if (dom.finalRanking) dom.finalRanking.innerHTML = [...teams].sort((a, b) => b.territory - a.territory).map((team, index) => `<div class="rank-card" style="--team-color:${escapeHtml(team.color)}"><span>#${index + 1} ${escapeHtml(team.name)}</span><strong>${((Number(team.territory) || 0) / total * 100).toFixed(1)}%</strong><small>${Number(team.territory) || 0} cells</small></div>`).join("");
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
    state.bannerTimer = setTimeout(() => dom.event.classList.remove("visible"), 2600);
  }

  function beep(frequency, duration) {
    if (!state.soundEnabled) return;
    try {
      state.audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = state.audioContext.createOscillator();
      const gain = state.audioContext.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.04, state.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, state.audioContext.currentTime + duration);
      oscillator.connect(gain).connect(state.audioContext.destination);
      oscillator.start();
      oscillator.stop(state.audioContext.currentTime + duration);
    } catch {}
  }

  function resizeCanvas() {
    const width = Math.max(1, innerWidth);
    const height = Math.max(1, innerHeight);
    const pixelBudget = 2_500_000;
    const requested = Math.min(devicePixelRatio || 1, 1.25);
    const budgetDpr = Math.sqrt(pixelBudget / (width * height));
    const dpr = Math.max(0.75, Math.min(requested, budgetDpr));
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (dom.canvas.width !== pixelWidth || dom.canvas.height !== pixelHeight) {
      dom.canvas.width = pixelWidth;
      dom.canvas.height = pixelHeight;
      dom.canvas.style.width = `${width}px`;
      dom.canvas.style.height = `${height}px`;
    }
    state.canvas = { width, height, dpr };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function cameraTransform() {
    const { width, height } = state.canvas;
    const me = state.players.find((player) => player.id === state.playerId);
    const centerX = Number(me?.x) || state.arena.width / 2;
    const centerY = Number(me?.y) || state.arena.height / 2;
    const worldWidth = Math.min(3850, state.arena.width);
    const worldHeight = Math.min(2400, state.arena.height);
    const scale = Math.max(0.04, Math.min(width / worldWidth, height / worldHeight));
    const halfW = width / scale / 2;
    const halfH = height / scale / 2;
    const cameraX = state.arena.width <= halfW * 2
      ? state.arena.width / 2
      : Math.max(halfW, Math.min(state.arena.width - halfW, centerX));
    const cameraY = state.arena.height <= halfH * 2
      ? state.arena.height / 2
      : Math.max(halfH, Math.min(state.arena.height - halfH, centerY));
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

  function drawArena() {
    const { width, height } = state.canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#eef2f7";
    ctx.fillRect(0, 0, width, height);
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
        if (owner >= 0 && owner < 3) {
          ctx.fillStyle = rgba(state.teamColors[owner], 0.3);
          ctx.fillRect(gx * cellW, gy * cellH, cellW + 1, cellH + 1);
        }
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
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 22px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(String(pickup.type || "P").charAt(0).toUpperCase(), pickup.x, pickup.y + 8);
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
    const size = 28;
    ctx.save();
    ctx.translate(Number(player.x) || 0, Number(player.y) || 0);
    ctx.globalAlpha = player.connected === false ? 0.35 : 1;
    if (player.alive === false) {
      ctx.strokeStyle = "#667085";
      ctx.lineWidth = 6 / scale;
      ctx.beginPath(); ctx.moveTo(-size, -size); ctx.lineTo(size, size); ctx.moveTo(size, -size); ctx.lineTo(-size, size); ctx.stroke();
    } else {
      if (player.invulnerable) {
        ctx.strokeStyle = "rgba(17,24,39,.45)";
        ctx.lineWidth = 4 / scale;
        ctx.beginPath(); ctx.arc(0, 0, 42, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.rotate(Number(player.angle) || 0);
      ctx.fillStyle = state.teamColors[player.team] || "#667085";
      ctx.beginPath(); ctx.moveTo(34, 0); ctx.lineTo(-24, 22); ctx.lineTo(-17, 0); ctx.lineTo(-24, -22); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = player.id === state.playerId ? "#101828" : "#ffffff";
      ctx.lineWidth = (player.id === state.playerId ? 6 : 4) / scale;
      ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.font = `${Math.max(14, 16 / scale)}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillStyle = "#101828";
    ctx.fillText(`${player.pcLabel || "Player"}${player.isBot ? " · AI" : ""}`, Number(player.x) || 0, (Number(player.y) || 0) - 42);
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
    miniCtx.strokeStyle = "#667085";
    miniCtx.strokeRect(0.5, 0.5, w - 1, h - 1);
  }

  function animationFrame(frameAt) {
    const interval = state.phase === "playing" || state.phase === "countdown" ? GAME_FRAME_INTERVAL_MS : LOBBY_FRAME_INTERVAL_MS;
    if (!document.hidden && frameAt - state.lastFrameAt >= interval) {
      state.lastFrameAt = frameAt;
      drawArena();
      const seconds = Math.max(0, Math.ceil(state.remainingMs / 1000));
      if (dom.clock) dom.clock.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
      if (state.currentQuestion && dom.questionTimer) dom.questionTimer.textContent = Math.max(0, Math.ceil((Number(state.currentQuestion.expiresAt) - (Date.now() + state.serverNowOffset)) / 1000));
    }
    if (!document.hidden && frameAt - state.lastMinimapAt >= MINIMAP_INTERVAL_MS) {
      state.lastMinimapAt = frameAt;
      drawMinimap();
    }
    requestAnimationFrame(animationFrame);
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
    if (!state.input.aimActive) return;
    const me = state.players.find((player) => player.id === state.playerId);
    if (!me) return;
    const t = cameraTransform();
    const worldX = (event.clientX - t.offsetX) / t.scale;
    const worldY = (event.clientY - t.offsetY) / t.scale;
    state.input.angle = Math.atan2(worldY - me.y, worldX - me.x);
  }

  function installEvents() {
    dom.register?.addEventListener("click", registerStudent);
    dom.roomInput?.addEventListener("input", () => { dom.roomInput.value = dom.roomInput.value.toUpperCase().replace(/[^A-Z2-9]/g, ""); });
    dom.readyButton?.addEventListener("click", () => {
      if (state.role !== "player") return;
      state.ready = !state.ready;
      updateReadyButton();
      send({ type: "set_ready", ready: state.ready });
    });
    dom.teamChoiceButton?.addEventListener("click", () => {
      const team = Number(dom.teamChoice?.value);
      if (![0, 1, 2].includes(team)) return;
      if (state.ready) {
        if (dom.teamChoiceStatus) dom.teamChoiceStatus.textContent = "Cancel Ready before changing teams.";
        return;
      }
      dom.teamChoiceButton.disabled = true;
      send({ type: "select_team", team });
      setTimeout(() => { if (!state.ready && dom.teamChoiceButton) dom.teamChoiceButton.disabled = false; }, 1000);
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
    addEventListener("blur", () => Object.assign(state.input, { up: false, down: false, left: false, right: false, shoot: false, dash: false, aimActive: false }));
    dom.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    dom.canvas.addEventListener("mousedown", (event) => { if (event.button === 2) { state.input.aimActive = true; updateAim(event); } });
    dom.canvas.addEventListener("mousemove", updateAim);
    addEventListener("mouseup", (event) => { if (event.button === 2) state.input.aimActive = false; });
    addEventListener("resize", resizeCanvas, { passive: true });
  }

  function warmHealthEndpoint() {
    const server = String(window.TRIAD_CONFIG?.serverUrl || "").trim();
    if (!server) return;
    const health = server.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:") + "/health";
    try { fetch(`${health}?wake=${Date.now()}`, { mode: "no-cors", cache: "no-store", credentials: "omit" }).catch(() => {}); } catch {}
  }

  async function restoreStoredSession() {
    const stored = readSession();
    const queryRoom = String(new URLSearchParams(location.search).get("room") || "").toUpperCase();
    if (!stored?.sessionToken || !stored?.roomCode) return;
    if (queryRoom && queryRoom !== stored.roomCode) {
      clearSession();
      return;
    }
    if (dom.serverUrl) dom.serverUrl.value = stored.serverUrl || initialServerUrl();
    setStatus("Restoring the previous player session…");
    try {
      await ensureConnected(RECONNECT_GRACE_MS);
      send({ type: "reconnect_student", roomCode: stored.roomCode, sessionToken: stored.sessionToken });
    } catch (error) {
      clearSession();
      setStatus(`Previous session could not be restored: ${error.message}`, "error");
      if (dom.register) dom.register.disabled = false;
    }
  }

  function start() {
    ensurePlayerLabel();
    state.serverUrl = normalizeServerUrl(initialServerUrl());
    if (dom.serverUrl) {
      dom.serverUrl.value = state.serverUrl;
      dom.serverUrl.readOnly = true;
      dom.serverUrl.setAttribute("aria-readonly", "true");
    }
    const savedStudents = (() => { try { return JSON.parse(safeStorageGet("triadStudents", "[]")); } catch { return []; } })();
    dom.studentInputs.forEach((input, index) => { if (input) input.value = savedStudents[index] || ""; });
    const queryRoom = String(new URLSearchParams(location.search).get("room") || "").toUpperCase();
    if (dom.roomInput) dom.roomInput.value = queryRoom;
    updateTeamMeta();
    setHealth("", "Classroom server standby", "The server will connect when registration is submitted.");
    setStatus("Enter the room PIN and three student names, then register.");
    warmHealthEndpoint();
    installEvents();
    resizeCanvas();
    requestAnimationFrame(animationFrame);
    setInterval(() => { if (state.phase === "playing") send(inputPayload()); }, INPUT_INTERVAL_MS);
    setInterval(() => { if (state.ws?.readyState === WebSocket.OPEN) send({ type: "ping", clientTime: Date.now(), build: BUILD }); }, 10000);
    restoreStoredSession();
    window.__triadStudentStable = Object.freeze({ build: BUILD, architecture: "single-socket-single-render-loop", maxCanvasPixels: 2_500_000 });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
