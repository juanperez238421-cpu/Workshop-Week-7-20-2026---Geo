(() => {
  "use strict";

  const BUILD = "20260723-private-score23";
  const ACTIVE_PHASES = new Set(["countdown", "playing"]);
  const observedSockets = new WeakSet();
  const inheritedSend = WebSocket.prototype.send;
  let activeSocket = null;
  let phase = "lobby";
  let playerId = "";
  let playerTeam = 0;
  let teamNames = ["Team 1", "Team 2", "Team 3"];
  let teamColors = ["#22b8d6", "#ed4f86", "#f2b23b"];
  let teamScores = [];
  let lastMessageAt = performance.now();
  let lastStateAt = 0;
  let fallbackTimer = 0;

  const app = document.getElementById("app");
  if (!app) return;

  function parse(value) {
    if (typeof value !== "string") return null;
    try { return JSON.parse(value); } catch { return null; }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function safeSend(socket, payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    try {
      inheritedSend.call(socket, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  function ensureScoreUi() {
    for (let team = 0; team < 3; team += 1) {
      const card = document.getElementById(`team${team}Card`);
      if (!card || card.querySelector(".team-grade-v23")) continue;
      const grade = document.createElement("div");
      grade.className = "team-grade-v23";
      grade.innerHTML = `<span>LIVE SCORE</span><strong id="team${team}GradeV23">—</strong>`;
      card.appendChild(grade);
    }

    if (!document.getElementById("currentGroupScoreV23")) {
      const panel = document.createElement("aside");
      panel.id = "currentGroupScoreV23";
      panel.className = "current-group-score-v23";
      panel.innerHTML = `
        <div class="current-group-score-copy-v23">
          <span>YOUR GROUP SCORE</span>
          <strong id="currentGroupScoreValueV23">— / 5</strong>
          <small id="currentGroupScoreDetailV23">Waiting for the authoritative ranking</small>
        </div>
        <div class="current-group-score-rank-v23"><span>RANK</span><b id="currentGroupRankV23">—</b></div>
      `;
      app.appendChild(panel);
    }
  }

  function scoreFor(team) {
    return teamScores.find((entry) => Number(entry.team) === Number(team)) || null;
  }

  function renderScores() {
    ensureScoreUi();
    for (let team = 0; team < 3; team += 1) {
      const entry = scoreFor(team);
      const target = document.getElementById(`team${team}GradeV23`);
      if (target) target.textContent = entry ? `${Number(entry.score).toFixed(2)} / 5` : "—";
      const card = document.getElementById(`team${team}Card`);
      if (card) {
        card.dataset.rank = entry ? String(entry.rank) : "";
        card.style.setProperty("--team-color", teamColors[team] || "#667085");
      }
    }

    const own = scoreFor(playerTeam);
    const panel = document.getElementById("currentGroupScoreV23");
    const value = document.getElementById("currentGroupScoreValueV23");
    const detail = document.getElementById("currentGroupScoreDetailV23");
    const rank = document.getElementById("currentGroupRankV23");
    if (panel) panel.style.setProperty("--team-color", teamColors[playerTeam] || "#344054");
    if (value) value.textContent = own ? `${Number(own.score).toFixed(2)} / 5` : "— / 5";
    if (rank) rank.textContent = own ? `#${own.rank}` : "—";
    if (detail) {
      detail.textContent = own
        ? `${teamNames[playerTeam] || `Team ${playerTeam + 1}`} · base ${Number(own.baseScore).toFixed(1)} · wrong-answer penalty −${Number(own.wrongPenalty || 0).toFixed(2)}`
        : "Waiting for the authoritative ranking";
    }

    queueMicrotask(() => {
      const ranking = document.getElementById("finalRanking");
      if (!ranking) return;
      const cards = [...ranking.querySelectorAll(".rank-card")];
      cards.forEach((card, index) => {
        const entry = [...teamScores].sort((a, b) => Number(a.rank) - Number(b.rank))[index];
        if (!entry) return;
        let score = card.querySelector(".final-grade-v23");
        if (!score) {
          score = document.createElement("em");
          score.className = "final-grade-v23";
          card.appendChild(score);
        }
        score.textContent = `Score ${Number(entry.score).toFixed(2)} / 5`;
      });
    });
  }

  function setRecoveryState(text) {
    const network = document.getElementById("networkDisplay");
    if (network) network.textContent = text;
    const panel = document.getElementById("currentGroupScoreV23");
    if (panel) panel.dataset.connection = text.toLowerCase();
  }

  function clearFallback() {
    clearTimeout(fallbackTimer);
    fallbackTimer = 0;
  }

  function scheduleFallbackReload(delayMs = 18000) {
    clearFallback();
    if (!ACTIVE_PHASES.has(phase)) return;
    fallbackTimer = setTimeout(() => {
      const session = (() => {
        try { return JSON.parse(localStorage.getItem("triadStudentSession") || "null"); } catch { return null; }
      })();
      if (!session?.sessionToken || !session?.roomCode || !navigator.onLine || document.hidden) return;
      const url = new URL(location.href);
      url.searchParams.set("room", session.roomCode);
      url.searchParams.set("recover", String(Date.now()));
      location.replace(url.href);
    }, delayMs);
  }

  function requestRecoveryState() {
    if (activeSocket?.readyState === WebSocket.OPEN) {
      safeSend(activeSocket, { type: "ping", clientTime: Date.now(), build: BUILD });
      if (ACTIVE_PHASES.has(phase)) safeSend(activeSocket, { type: "request_state" });
      return;
    }
    scheduleFallbackReload(6000);
  }

  function handleMessage(message) {
    if (!message || typeof message !== "object") return;
    lastMessageAt = performance.now();
    clearFallback();
    setRecoveryState("LIVE");

    if (message.type === "joined") {
      playerId = String(message.playerId || playerId);
      playerTeam = Number(message.team) || 0;
      return;
    }

    if (message.type === "team_assigned") {
      playerTeam = Number(message.team) || 0;
      renderScores();
      return;
    }

    if (message.type === "lobby") {
      phase = String(message.phase || phase);
      if (Array.isArray(message.teamNames)) teamNames = message.teamNames;
      if (Array.isArray(message.teamColors)) teamColors = message.teamColors;
      const me = Array.isArray(message.players) ? message.players.find((player) => String(player.id) === playerId) : null;
      if (me) playerTeam = Number(me.team) || 0;
      renderScores();
      return;
    }

    if (message.type === "countdown") {
      phase = "countdown";
      const clock = document.getElementById("clockLabel");
      if (clock) clock.textContent = "10:00";
      return;
    }

    if (message.type === "state") {
      phase = String(message.phase || phase);
      lastStateAt = performance.now();
      if (Array.isArray(message.teamNames)) teamNames = message.teamNames;
      if (Array.isArray(message.teamColors)) teamColors = message.teamColors;
      if (Array.isArray(message.teamScores)) teamScores = message.teamScores;
      const me = Array.isArray(message.players) ? message.players.find((player) => String(player.id) === playerId) : null;
      if (me) playerTeam = Number(me.team) || 0;
      renderScores();
      return;
    }

    if (message.type === "match_ended") {
      phase = "ended";
      if (Array.isArray(message.teamScores)) teamScores = message.teamScores;
      else if (Array.isArray(message.report?.teamScores)) teamScores = message.report.teamScores;
      if (Number.isInteger(Number(message.yourTeam))) playerTeam = Number(message.yourTeam);
      renderScores();
    }
  }

  function observe(socket) {
    if (!socket || observedSockets.has(socket)) return;
    observedSockets.add(socket);
    activeSocket = socket;
    clearFallback();
    socket.addEventListener("message", (event) => handleMessage(parse(event.data)));
    socket.addEventListener("open", () => {
      activeSocket = socket;
      clearFallback();
      setRecoveryState("LIVE");
    });
    socket.addEventListener("close", () => {
      if (activeSocket !== socket) return;
      setRecoveryState("RECOVERING");
      scheduleFallbackReload();
    });
  }

  WebSocket.prototype.send = function triadStudentScoreV23Send(payload) {
    observe(this);
    return inheritedSend.call(this, payload);
  };

  setInterval(() => {
    const now = performance.now();
    if (activeSocket?.readyState === WebSocket.OPEN) {
      safeSend(activeSocket, { type: "ping", clientTime: Date.now(), build: BUILD });
      if (ACTIVE_PHASES.has(phase) && now - lastStateAt > 2600) {
        setRecoveryState("RESYNCING");
        safeSend(activeSocket, { type: "request_state" });
      }
      return;
    }
    if (ACTIVE_PHASES.has(phase) && now - lastMessageAt > 12000) scheduleFallbackReload();
  }, 5000);

  addEventListener("online", requestRecoveryState);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) requestRecoveryState();
  });

  const clock = document.getElementById("clockLabel");
  if (clock) clock.textContent = "10:00";
  ensureScoreUi();
  renderScores();

  window.__triadStudentScoreV23 = Object.freeze({
    build: BUILD,
    scoring: "rank-base-5-4-3-minus-0.25-per-wrong-floor-2.5",
    privateReports: true,
    opensAdditionalSocket: false,
    recovery: "existing-reconnect-plus-five-second-watchdog-and-state-resync"
  });
})();
