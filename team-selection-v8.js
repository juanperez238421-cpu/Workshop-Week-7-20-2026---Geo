(() => {
  "use strict";

  const approvedPanel = document.getElementById("approvedPanel");
  const assignedCard = approvedPanel?.querySelector(".assigned-team-card");
  if (!approvedPanel || !assignedCard) return;

  const panel = document.createElement("section");
  panel.id = "teamSelectionPanel";
  panel.className = "team-selection-panel";
  panel.innerHTML = `
    <div>
      <span>PLAYER TEAM SELECTION</span>
      <strong>Choose an available team name</strong>
      <small>Team capacity is three players. Cancel Ready before changing teams.</small>
    </div>
    <label for="playerTeamChoice">Team name
      <select id="playerTeamChoice" aria-describedby="teamSelectionStatus"></select>
    </label>
    <button id="confirmTeamChoice" class="secondary-button" type="button">SELECT THIS TEAM</button>
    <p id="teamSelectionStatus" class="team-selection-status" aria-live="polite">Waiting for teacher approval.</p>`;
  assignedCard.insertAdjacentElement("afterend", panel);

  const select = document.getElementById("playerTeamChoice");
  const button = document.getElementById("confirmTeamChoice");
  const status = document.getElementById("teamSelectionStatus");
  const observedSockets = new WeakSet();
  const previousSend = WebSocket.prototype.send;
  let activeSocket = null;

  const view = {
    playerId: "",
    phase: "lobby",
    team: 0,
    ready: false,
    teamNames: ["Team 1", "Team 2", "Team 3"],
    teamColors: ["#1f77b4", "#d62728", "#2ca02c"],
    teamCounts: [0, 0, 0]
  };

  function setStatus(text, kind = "neutral") {
    status.textContent = text;
    status.dataset.kind = kind;
  }

  function observe(socket) {
    if (!socket || observedSockets.has(socket)) return;
    observedSockets.add(socket);
    socket.addEventListener("message", (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      handleMessage(message);
    });
  }

  WebSocket.prototype.send = function teamSelectionSend(payload) {
    if (typeof payload === "string") {
      try {
        const message = JSON.parse(payload);
        if (["register_student", "reconnect_student", "input", "set_ready", "select_team"].includes(message.type)) {
          activeSocket = this;
          observe(this);
        }
      } catch {}
    }
    return previousSend.call(this, payload);
  };

  function handleMessage(message) {
    if (!message || typeof message !== "object") return;
    if (message.type === "joined") {
      view.playerId = String(message.playerId || "");
      view.team = Number(message.team) || 0;
      view.ready = Boolean(message.ready);
      render();
      return;
    }
    if (message.type === "team_selected") {
      view.team = Number(message.team) || 0;
      view.ready = false;
      setStatus(`Team selected: ${message.teamName || view.teamNames[view.team]}.`, "success");
      render();
      return;
    }
    if (message.type === "lobby") {
      view.phase = message.phase || view.phase;
      view.teamNames = Array.isArray(message.teamNames) ? message.teamNames : view.teamNames;
      view.teamColors = Array.isArray(message.teamColors) ? message.teamColors : view.teamColors;
      view.teamCounts = Array.isArray(message.teamCounts) ? message.teamCounts : view.teamCounts;
      const me = Array.isArray(message.players) ? message.players.find((player) => player.id === view.playerId) : null;
      if (me) {
        view.team = Number(me.team) || 0;
        view.ready = Boolean(me.ready);
      }
      render();
      return;
    }
    if (message.type === "error" && /team|ready|capacity/i.test(String(message.message || ""))) {
      setStatus(message.message || "Team selection failed.", "error");
      button.disabled = false;
    }
  }

  function render() {
    const currentValue = String(view.team);
    select.innerHTML = view.teamNames.map((name, team) => {
      const count = Number(view.teamCounts[team]) || 0;
      const full = count >= 3 && team !== view.team;
      return `<option value="${team}" ${team === view.team ? "selected" : ""} ${full ? "disabled" : ""}>${name} · ${count}/3${full ? " · FULL" : ""}</option>`;
    }).join("");
    select.value = currentValue;
    select.style.setProperty("--selected-team-color", view.teamColors[view.team] || "#667085");

    const disabled = !view.playerId || view.phase !== "lobby" || view.ready;
    select.disabled = disabled;
    button.disabled = disabled;
    if (!view.playerId) setStatus("Waiting for teacher approval.");
    else if (view.phase !== "lobby") setStatus("Team selection is available only before the match starts.");
    else if (view.ready) setStatus("Cancel Ready before changing teams.", "warning");
    else setStatus(`Current team: ${view.teamNames[view.team]}. Choose another available team or keep this one.`, "success");
  }

  button.addEventListener("click", () => {
    if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
      setStatus("The game connection is not available. Reconnect and try again.", "error");
      return;
    }
    const team = Number(select.value);
    if (![0, 1, 2].includes(team)) {
      setStatus("Choose a valid team.", "error");
      return;
    }
    if (team === view.team) {
      setStatus(`You are already on ${view.teamNames[view.team]}.`, "success");
      return;
    }
    button.disabled = true;
    setStatus("Requesting team change…");
    activeSocket.send(JSON.stringify({ type: "select_team", team }));
    window.setTimeout(() => { if (!view.ready && view.phase === "lobby") button.disabled = false; }, 900);
  });

  render();
})();
