(() => {
  "use strict";

  const observedCards = new WeakSet();

  function teacherSocket() {
    const socket = window.__triadTeacherControlSocket;
    return socket?.readyState === WebSocket.OPEN ? socket : null;
  }

  function statusMessage(text, error = false) {
    const node = document.getElementById("setupStatus");
    if (!node) return;
    node.textContent = text;
    node.style.borderLeftColor = error ? "#b42318" : "#067647";
  }

  function cardReady(card) {
    return [...card.querySelectorAll(".tag")].some((tag) => tag.textContent.trim() === "READY");
  }

  function installButton(card) {
    if (!card || observedCards.has(card) || card.querySelector(".bot-tag")) return;
    const playerId = card.dataset.player;
    const actions = card.querySelector(".admin-actions");
    if (!playerId || !actions) return;

    observedCards.add(card);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button teacher-ready-toggle";
    const refreshLabel = () => {
      const ready = cardReady(card);
      button.dataset.ready = String(ready);
      button.textContent = ready ? "SET NOT READY" : "MARK READY";
      button.setAttribute("aria-pressed", String(ready));
    };
    refreshLabel();

    button.addEventListener("click", () => {
      const socket = teacherSocket();
      if (!socket) {
        statusMessage("Teacher control is not connected. Restore or create the room first.", true);
        return;
      }
      const nextReady = !cardReady(card);
      button.disabled = true;
      socket.send(JSON.stringify({ type: "set_player_ready", playerId, ready: nextReady }));
      statusMessage(`${nextReady ? "Marking" : "Clearing"} this player’s ready status…`);
      window.setTimeout(() => { button.disabled = false; }, 900);
    });

    actions.insertBefore(button, actions.querySelector(".remove-button") || null);
  }

  function refresh() {
    const roster = document.getElementById("rosterList");
    if (!roster) return;
    roster.querySelectorAll(".player-admin-card").forEach(installButton);
  }

  function start() {
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
