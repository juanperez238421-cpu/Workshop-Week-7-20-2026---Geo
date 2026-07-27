(() => {
  "use strict";

  if (!window.TRIAD_CONFIG?.desktopMode || typeof WebSocket === "undefined") return;

  const BUILD = "20260726-neon-tactical29";
  const observedSockets = new WeakSet();
  const inheritedSend = WebSocket.prototype.send;
  const state = {
    playerId: "",
    phase: "lobby",
    lastPlayer: null,
    kills: 0,
    combo: 0,
    comboTimer: 0,
    deathTimer: 0
  };

  const parse = (value) => {
    if (typeof value !== "string") return null;
    try { return JSON.parse(value); } catch { return null; }
  };

  function ensureInterface() {
    document.body.classList.add("neon-tactical-v29");

    let hud = document.getElementById("neonTacticalHudV29");
    if (!hud) {
      hud = document.createElement("aside");
      hud.id = "neonTacticalHudV29";
      hud.className = "neon-tactical-hud-v29";
      hud.innerHTML = `
        <div class="neon-mode-v29"><span>LOCAL ARCADE PROTOCOL</span><strong>ONE HIT = ONE LIFE</strong></div>
        <div class="neon-strikes-v29" aria-label="Three-strike life counter">
          <span id="neonStrike0V29"></span><span id="neonStrike1V29"></span><span id="neonStrike2V29"></span>
        </div>
        <div class="neon-combo-v29"><span>CHAIN</span><strong id="neonComboValueV29">×0</strong></div>`;
      document.getElementById("app")?.appendChild(hud);
    }

    let feedback = document.getElementById("neonFeedbackV29");
    if (!feedback) {
      feedback = document.createElement("div");
      feedback.id = "neonFeedbackV29";
      feedback.className = "neon-feedback-v29";
      feedback.innerHTML = '<strong id="neonFeedbackTitleV29">FAST RESTART</strong><span id="neonFeedbackDetailV29">Re-entering the arena…</span>';
      document.getElementById("app")?.appendChild(feedback);
    }

    let feed = document.getElementById("neonKillFeedV29");
    if (!feed) {
      feed = document.createElement("div");
      feed.id = "neonKillFeedV29";
      feed.className = "neon-kill-feed-v29";
      document.getElementById("app")?.appendChild(feed);
    }

    const brand = document.querySelector(".brand span");
    if (brand) brand.textContent = "NEON TACTICAL v29 · one hit removes one life · three strikes unlock the geometry checkpoint · predictive local AI";

    const lifeCard = document.querySelector(".resource-card-v15:first-child small");
    if (lifeCard) lifeCard.textContent = "Three hits trigger geometry";

    const ruleCards = document.querySelectorAll("#lobbyOverlay .rule-grid > div");
    if (ruleCards[0]) ruleCards[0].innerHTML = "<b>1 HIT</b><span>removes one life</span>";
    if (ruleCards[2]) ruleCards[2].innerHTML = "<b>3 STRIKES</b><span>geometry checkpoint</span>";
    if (ruleCards[3]) ruleCards[3].innerHTML = "<b>FAST</b><span>automatic restart</span>";
  }

  function updateLives(lives = 3) {
    const count = Math.max(0, Math.min(3, Number(lives) || 0));
    for (let index = 0; index < 3; index += 1) {
      const pip = document.getElementById(`neonStrike${index}V29`);
      if (pip) pip.classList.toggle("is-lost", index >= count);
    }
    document.body.classList.toggle("neon-final-strike-v29", count === 0);
  }

  function showFeedback(title, detail, mode = "death", duration = 720) {
    const panel = document.getElementById("neonFeedbackV29");
    if (!panel) return;
    const titleNode = document.getElementById("neonFeedbackTitleV29");
    const detailNode = document.getElementById("neonFeedbackDetailV29");
    if (titleNode) titleNode.textContent = title;
    if (detailNode) detailNode.textContent = detail;
    panel.dataset.mode = mode;
    panel.classList.add("visible");
    clearTimeout(state.deathTimer);
    if (duration > 0) state.deathTimer = setTimeout(() => panel.classList.remove("visible"), duration);
  }

  function addFeed(text, kind = "event") {
    const feed = document.getElementById("neonKillFeedV29");
    if (!feed || !text) return;
    const item = document.createElement("div");
    item.dataset.kind = kind;
    item.textContent = String(text);
    feed.prepend(item);
    while (feed.children.length > 4) feed.lastElementChild?.remove();
    setTimeout(() => item.classList.add("leaving"), 2600);
    setTimeout(() => item.remove(), 3200);
  }

  function incrementCombo() {
    state.combo += 1;
    const value = document.getElementById("neonComboValueV29");
    if (value) value.textContent = `×${state.combo}`;
    document.getElementById("neonTacticalHudV29")?.classList.add("combo-pulse");
    setTimeout(() => document.getElementById("neonTacticalHudV29")?.classList.remove("combo-pulse"), 220);
    clearTimeout(state.comboTimer);
    state.comboTimer = setTimeout(() => {
      state.combo = 0;
      if (value) value.textContent = "×0";
    }, 3400);
  }

  function handleState(message) {
    state.phase = String(message.phase || state.phase);
    const player = Array.isArray(message.players)
      ? message.players.find((candidate) => String(candidate.id) === state.playerId)
      : null;
    if (!player) return;

    updateLives(player.lives);

    if (Number(player.kills) > state.kills) {
      const gained = Number(player.kills) - state.kills;
      for (let index = 0; index < gained; index += 1) incrementCombo();
      addFeed(`CONFIRMED · ${Number(player.kills)} ELIMINATIONS`, "kill");
    }

    if (state.lastPlayer?.alive !== false && player.alive === false) {
      const lives = Math.max(0, Number(player.lives) || 0);
      if (lives > 0) showFeedback("STRIKE REGISTERED", `${lives} life${lives === 1 ? "" : "s"} remaining · fast restart`, "death", 620);
      else showFeedback("THREE STRIKES", "Geometry checkpoint required", "question", 0);
    }

    if (state.lastPlayer?.alive === false && player.alive !== false) {
      document.getElementById("neonFeedbackV29")?.classList.remove("visible");
    }

    state.kills = Number(player.kills) || 0;
    state.lastPlayer = { alive: player.alive !== false, lives: Number(player.lives) || 0 };
  }

  function handleMessage(message) {
    if (!message || typeof message !== "object") return;
    if (message.type === "joined") {
      state.playerId = String(message.playerId || "");
      state.kills = 0;
      state.combo = 0;
      state.lastPlayer = null;
      updateLives(3);
      return;
    }
    if (message.type === "state") {
      handleState(message);
      return;
    }
    if (message.type === "life_lost") {
      updateLives(message.lives);
      showFeedback("STRIKE REGISTERED", `${Number(message.lives) || 0} lives remaining · redeploying`, "death", Math.max(440, Number(message.respawnInMs) || 460));
      return;
    }
    if (message.type === "question") {
      showFeedback("THREE STRIKES", `Geometry checkpoint · ${message.assignedStudentName || "assigned student"}`, "question", 520);
      document.body.classList.add("neon-question-active-v29");
      return;
    }
    if (message.type === "answer_result" && message.correct) {
      showFeedback("CHECKPOINT CLEARED", "Three lives restored", "success", Math.max(360, Number(message.respawnInMs) || 360));
      updateLives(3);
      document.body.classList.remove("neon-question-active-v29");
      return;
    }
    if (message.type === "respawned") {
      document.getElementById("neonFeedbackV29")?.classList.remove("visible");
      document.body.classList.remove("neon-question-active-v29");
      return;
    }
    if (message.type === "event") {
      addFeed(message.text, String(message.kind || "event"));
      return;
    }
    if (message.type === "match_ended") {
      state.phase = "ended";
      showFeedback("RUN COMPLETE", "Results saved locally · quick restart available", "success", 1300);
    }
  }

  function observe(socket) {
    if (!socket || observedSockets.has(socket)) return;
    observedSockets.add(socket);
    socket.addEventListener("message", (event) => handleMessage(parse(event.data)));
  }

  WebSocket.prototype.send = function neonTacticalSend(payload) {
    observe(this);
    return inheritedSend.call(this, payload);
  };

  ensureInterface();
  updateLives(3);

  window.__triadNeonTacticalV29 = Object.freeze({
    build: BUILD,
    visualIdentity: "original-neon-tactical-top-down-arcade",
    combat: "one-hit-one-life-three-strikes-question",
    opensAdditionalSocket: false
  });
})();
