(() => {
  "use strict";

  const BUILD = "20260724-stable-autostart26";
  const OBSERVED_TYPES = new Set(["register_student", "reconnect_student", "input", "ping", "request_full_state"]);
  const observedSockets = new WeakSet();
  const nativeSend = WebSocket.prototype.send;
  let activeSocket = null;
  let roomCode = "";
  let playerId = "";
  let phase = "lobby";
  let lastStateAt = 0;
  let lastRecoveryAt = 0;
  let remainingAtState = 10 * 60 * 1000;
  let stateReceivedAt = 0;

  function parseJson(value) {
    if (typeof value !== "string") return null;
    try { return JSON.parse(value); } catch { return null; }
  }

  function ensureStudentPanel() {
    const parent = document.querySelector(".player-panel");
    if (!parent) return null;
    let panel = document.getElementById("individualStudentPanelV26");
    if (panel) return panel;
    panel = document.createElement("section");
    panel.id = "individualStudentPanelV26";
    panel.className = "individual-student-panel-v26";
    panel.innerHTML = '<div class="individual-heading-v26"><span>INDIVIDUAL RECORD</span><b>MASTER REPORT</b></div><div id="individualStudentRowsV26" class="individual-student-rows-v26"></div>';
    parent.appendChild(panel);
    return panel;
  }

  function ensureAssignedStudentBadge() {
    const header = document.querySelector("#questionOverlay .question-header > div");
    if (!header) return null;
    let badge = document.getElementById("assignedStudentBadgeV26");
    if (badge) return badge;
    badge = document.createElement("div");
    badge.id = "assignedStudentBadgeV26";
    badge.className = "assigned-student-badge-v26";
    badge.hidden = true;
    header.appendChild(badge);
    return badge;
  }

  function normalizeAutostartUi() {
    document.getElementById("readyButton")?.remove();
    const readyLabel = document.getElementById("playerReadyLabel");
    if (readyLabel) readyLabel.textContent = "MASTER";
    const stateLabel = document.getElementById("playerStateLabel");
    if (stateLabel && /approved/i.test(stateLabel.textContent || "")) stateLabel.textContent = "Approved · Master starts";
    const status = document.getElementById("lobbyStatus");
    if (status && /mark ready|ready when|not ready/i.test(status.textContent || "")) status.textContent = "Approved. This channel is startable immediately from the Master page.";
    document.querySelectorAll(".roster-card small").forEach((node) => {
      node.textContent = String(node.textContent || "").replace(/NOT READY|READY/g, "STARTABLE");
    });
  }

  function renderIndividualStudents(rows, assignedIndex = null) {
    ensureStudentPanel();
    const target = document.getElementById("individualStudentRowsV26");
    if (!target) return;
    const values = Array.isArray(rows) ? rows : [];
    target.innerHTML = values.map((row, index) => {
      const active = Number(assignedIndex) === Number(row.studentIndex ?? index);
      const attempts = Number(row.attempts) || 0;
      const accuracy = attempts ? Math.round((Number(row.correct) || 0) / attempts * 100) + "%" : "—";
      const name = String(row.studentName || `Student ${index + 1}`);
      return `<article class="${active ? "is-answering" : ""}"><span>${index + 1}</span><div><strong>${escapeHtml(name)}</strong><small>D ${Number(row.assignedDeaths) || 0} · ✓ ${Number(row.correct) || 0} · ✕ ${Number(row.wrong) || 0} · T ${Number(row.timeouts) || 0}</small></div><b>${accuracy}</b></article>`;
    }).join("");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  }

  function showAssignedStudent(message) {
    const badge = ensureAssignedStudentBadge();
    if (!badge) return;
    const index = Number(message.assignedStudentIndex);
    const name = String(message.assignedStudentName || `Student ${Number.isFinite(index) ? index + 1 : 1}`);
    badge.hidden = false;
    badge.innerHTML = `<span>ANSWERING STUDENT ${Number.isFinite(index) ? index + 1 : 1}</span><strong>${escapeHtml(name)}</strong><small>This death and every answer attempt are recorded under this student.</small>`;
  }

  function updateClock() {
    if (!stateReceivedAt || !["playing", "countdown"].includes(phase)) return;
    const elapsed = phase === "playing" ? performance.now() - stateReceivedAt : 0;
    const remaining = Math.max(0, remainingAtState - elapsed);
    const totalSeconds = Math.ceil(remaining / 1000);
    const clock = document.getElementById("clockLabel");
    if (clock) clock.textContent = `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
  }

  function requestRecovery() {
    const socket = activeSocket;
    if (!socket || socket.readyState !== WebSocket.OPEN || !roomCode) return;
    const now = performance.now();
    if (now - lastRecoveryAt < 900) return;
    lastRecoveryAt = now;
    try { nativeSend.call(socket, JSON.stringify({ type: "request_full_state", roomCode, build: BUILD })); } catch {}
  }

  function handleMessage(message) {
    if (!message || typeof message !== "object") return;
    if (message.roomCode) roomCode = String(message.roomCode);

    if (message.type === "joined") {
      playerId = String(message.playerId || playerId);
      phase = "lobby";
      setTimeout(normalizeAutostartUi, 0);
      return;
    }

    if (message.type === "lobby") {
      phase = String(message.phase || phase);
      setTimeout(normalizeAutostartUi, 0);
      return;
    }

    if (message.type === "countdown") {
      phase = "countdown";
      lastStateAt = performance.now();
      remainingAtState = 10 * 60 * 1000;
      stateReceivedAt = performance.now();
      setTimeout(requestRecovery, 750);
      return;
    }

    if (message.type === "state") {
      phase = String(message.phase || phase);
      lastStateAt = performance.now();
      remainingAtState = Number.isFinite(Number(message.remainingMs)) ? Number(message.remainingMs) : remainingAtState;
      stateReceivedAt = performance.now();
      const me = Array.isArray(message.players) ? message.players.find((player) => String(player.id) === playerId) : null;
      if (me) renderIndividualStudents(me.individualStudents, me.assignedStudentIndex);
      normalizeAutostartUi();
      return;
    }

    if (message.type === "question") {
      showAssignedStudent(message);
      return;
    }

    if (message.type === "respawned") {
      const badge = document.getElementById("assignedStudentBadgeV26");
      if (badge) badge.hidden = true;
      return;
    }

    if (message.type === "match_ended") phase = "ended";
  }

  function observeSocket(socket) {
    if (!socket || observedSockets.has(socket)) return;
    observedSockets.add(socket);
    activeSocket = socket;
    socket.addEventListener("message", (event) => handleMessage(parseJson(event.data)));
    socket.addEventListener("open", () => { activeSocket = socket; });
  }

  WebSocket.prototype.send = function stableAutostartV26Send(payload) {
    let message = null;
    if (typeof payload === "string") message = parseJson(payload);
    if (message && (OBSERVED_TYPES.has(message.type) || message.type === "set_ready")) observeSocket(this);
    if (message?.roomCode) roomCode = String(message.roomCode);
    if (message?.type === "set_ready") return undefined;
    return nativeSend.call(this, payload);
  };

  const mutationObserver = new MutationObserver(normalizeAutostartUi);
  mutationObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  setInterval(() => {
    updateClock();
    if (!["playing", "countdown"].includes(phase)) return;
    const age = lastStateAt ? performance.now() - lastStateAt : Number.POSITIVE_INFINITY;
    if (age > 1200) requestRecovery();
    const network = document.getElementById("networkDisplay");
    if (network && age > 1200) network.textContent = "RECOVERING";
  }, 250);

  ensureStudentPanel();
  ensureAssignedStudentBadge();
  normalizeAutostartUi();

  window.__triadStableV26 = Object.freeze({
    build: BUILD,
    playerReadyRequired: false,
    stateWatchdog: true,
    continuousClientClock: true,
    individualStudentTelemetry: true,
    opensAdditionalSocket: false
  });
})();
