(() => {
  "use strict";

  if (!document.getElementById("teacherApp")) return;

  const previousSend = WebSocket.prototype.send;
  const observed = new WeakSet();
  let lastLobby = null;

  function ensureFlexibleBadge() {
    const controls = document.querySelector(".ai-control-card .section-heading");
    if (!controls || document.getElementById("flexibleRoomBadge")) return;
    const badge = document.createElement("span");
    badge.id = "flexibleRoomBadge";
    badge.className = "registration-state-pill";
    badge.innerHTML = "FLEXIBLE ROOM · <b>1–9 PLAYERS</b>";
    controls.appendChild(badge);
  }

  function updateFixedStructureText() {
    const heading = [...document.querySelectorAll(".master-card h2")].find((node) => node.textContent.trim() === "Fixed match structure");
    const paragraph = heading?.closest(".master-card")?.querySelector("p");
    if (!paragraph) return;
    paragraph.innerHTML = "Start with <strong>any number from 1 to 9 approved players</strong>. Teams may be uneven during testing. Every real player currently in the room must be connected and Ready; AI remains optional. Each PC player still represents exactly <strong>3 student names</strong>.";
  }

  function renderFlexibleState(message) {
    lastLobby = message;
    const players = Array.isArray(message.players) ? message.players : [];
    const real = players.filter((player) => !player.isBot);
    const bots = players.filter((player) => player.isBot);
    const ready = players.filter((player) => player.isBot || player.ready).length;
    const activeCount = players.length;

    const approved = document.getElementById("approvedCount");
    const approvedDetail = document.getElementById("approvedDetail");
    const startButton = document.getElementById("startMatchButton");
    const readiness = document.getElementById("startReadiness");

    if (approved) approved.textContent = `${activeCount} / 9 CAPACITY`;
    if (approvedDetail) approvedDetail.textContent = `${ready}/${activeCount || 1} active ready`;

    if (startButton) {
      startButton.textContent = activeCount
        ? `START MATCH WITH ${activeCount} PLAYER${activeCount === 1 ? "" : "S"}`
        : "ADD AT LEAST ONE PLAYER";
      startButton.disabled = !message.startReady;
      startButton.title = message.startReady
        ? `Start now with ${activeCount} approved player${activeCount === 1 ? "" : "s"}.`
        : (message.startBlockers || []).join(" · ");
    }

    if (readiness) {
      readiness.textContent = message.startReady
        ? `READY: ${activeCount} ACTIVE · ${real.length} REAL · ${bots.length} AI · FLEXIBLE START ENABLED`
        : `WAITING: ${(message.startBlockers || ["add at least one approved player"]).join(" · ").toUpperCase()}`;
    }

    ensureFlexibleBadge();
    updateFixedStructureText();
  }

  function observe(socket) {
    if (!socket || observed.has(socket)) return;
    observed.add(socket);
    socket.addEventListener("message", (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === "lobby") setTimeout(() => renderFlexibleState(message), 0);
    });
  }

  WebSocket.prototype.send = function flexibleMasterSend(payload) {
    if (typeof payload === "string") {
      try {
        const message = JSON.parse(payload);
        if ([
          "create_control_room",
          "restore_control",
          "approve_registration",
          "reject_registration",
          "remove_player",
          "set_registration_lock",
          "set_player_ready",
          "fill_with_bots",
          "remove_bots",
          "start_match",
          "reset_room"
        ].includes(message.type)) observe(this);
      } catch {}
    }
    return previousSend.call(this, payload);
  };

  const observer = new MutationObserver(() => {
    ensureFlexibleBadge();
    updateFixedStructureText();
    if (lastLobby) renderFlexibleState(lastLobby);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  ensureFlexibleBadge();
  updateFixedStructureText();
})();
