(() => {
  "use strict";

  const CONTROL_MESSAGE_TYPES = new Set([
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

  const nativeSend = WebSocket.prototype.send;
  WebSocket.prototype.send = function rememberTeacherControlSocket(payload) {
    if (typeof payload === "string") {
      try {
        const message = JSON.parse(payload);
        if (CONTROL_MESSAGE_TYPES.has(message.type)) window.__triadTeacherControlSocket = this;
      } catch {}
    }
    return nativeSend.call(this, payload);
  };

  const $ = (id) => document.getElementById(id);

  function numericText(id) {
    const value = $(id)?.textContent || "0";
    return Number.parseInt(value, 10) || 0;
  }

  function updatePinControls() {
    const input = $("newRoomCodeInput");
    const button = $("changeRoomCodeButton");
    const status = $("roomPinStatus");
    if (!input || !button || !status) return;

    const approved = numericText("approvedCount");
    const pending = numericText("pendingCount");
    const currentCode = ($("roomCodeLarge")?.textContent || "").trim();
    const lockedByPlayers = approved > 0 || pending > 0;

    button.disabled = lockedByPlayers;
    input.disabled = lockedByPlayers;
    status.textContent = lockedByPlayers
      ? "PIN locked because player registration has started."
      : currentCode && currentCode !== "------"
        ? `Current player PIN: ${currentCode}`
        : "Create a room before changing the player PIN.";
  }

  function updateRosterPresentation() {
    const roster = $("rosterList");
    if (!roster) return;

    const cards = [...roster.querySelectorAll(".player-admin-card")];
    let botCards = 0;
    for (const card of cards) {
      card.querySelector(".naming-tags")?.remove();
      const botTag = card.querySelector(".bot-tag");
      if (botTag) {
        botCards += 1;
        botTag.textContent = "AI PLAYER";
        card.classList.add("ai-player-card");
        const serverTag = [...card.querySelectorAll(".tag")].find((tag) => tag.textContent.includes("SERVER BOT"));
        if (serverTag) serverTag.textContent = "AUTONOMOUS AI";
      }
    }

    const realCards = cards.length - botCards;
    const summary = $("playerListSummary");
    if (summary) summary.textContent = `${cards.length}/9 total players · ${realCards} real · ${botCards} AI`;

    const botSummary = $("botCountSummary");
    if (botSummary) {
      const openSlots = Math.max(0, 9 - cards.length);
      botSummary.textContent = `${botCards} AI active · ${openSlots} open slot${openSlots === 1 ? "" : "s"}`;
    }
  }

  function setPinStatus(message, isError = false) {
    const status = $("roomPinStatus");
    if (!status) return;
    status.textContent = message;
    status.style.color = isError ? "#b42318" : "#067647";
  }

  function installPinEvents() {
    const input = $("newRoomCodeInput");
    const button = $("changeRoomCodeButton");
    if (!input || !button || button.dataset.bound === "true") return;
    button.dataset.bound = "true";

    input.addEventListener("input", () => {
      input.value = input.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
    });

    button.addEventListener("click", () => {
      const newRoomCode = input.value.trim().toUpperCase();
      if (!/^[A-Z2-9]{6}$/.test(newRoomCode)) {
        setPinStatus("Enter exactly six characters using A-Z and 2-9.", true);
        input.focus();
        return;
      }

      const socket = window.__triadTeacherControlSocket;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        setPinStatus("Teacher control is not connected. Restore or create the room first.", true);
        return;
      }

      socket.send(JSON.stringify({ type: "set_registration_lock", newRoomCode }));
      setPinStatus("Changing the player room PIN…");
      input.value = "";
    });
  }

  function refresh() {
    installPinEvents();
    updatePinControls();
    updateRosterPresentation();
  }

  function start() {
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
