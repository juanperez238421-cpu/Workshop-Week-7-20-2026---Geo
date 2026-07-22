(() => {
  "use strict";

  const configuredServer = String(window.TRIAD_CONFIG?.serverUrl || "").trim().replace(/\/$/, "");
  const observedSockets = new WeakSet();
  const CONTROL_TYPES = new Set([
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
  const $ = (id) => document.getElementById(id);

  function setStatus(text, kind = "neutral") {
    const status = $("setupStatus");
    if (!status) return;
    status.textContent = text;
    status.style.borderLeftColor = kind === "error" ? "#b42318" : kind === "success" ? "#067647" : "#344054";
  }

  function synchronizeServer() {
    if (!configuredServer) return;
    localStorage.setItem("triadServerUrl", configuredServer);
    const input = $("serverUrlInput");
    if (input) {
      input.value = configuredServer;
      input.readOnly = true;
      input.setAttribute("aria-readonly", "true");
      input.title = "Teacher and student pages are locked to the same classroom multiplayer server.";
    }
  }

  function observeControlSocket(socket) {
    if (observedSockets.has(socket)) return;
    observedSockets.add(socket);

    socket.addEventListener("message", (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }

      if (message.type === "registration_pending") {
        const pending = Number(message.pendingCount) || 1;
        const pendingCount = $("pendingCount");
        if (pendingCount) pendingCount.textContent = String(pending);
        setStatus(`${message.pcLabel || "A PC player"} registered successfully. The pending-player list is updating.`, "success");
      } else if (message.type === "lobby") {
        const pending = Array.isArray(message.pending) ? message.pending.length : 0;
        if (pending > 0) setStatus(`${pending} PC player registration${pending === 1 ? " is" : "s are"} waiting for teacher approval.`, "success");
      } else if (message.type === "error" && /room not found/i.test(String(message.message || ""))) {
        localStorage.removeItem("triadMasterSession");
        setStatus("This room no longer exists on the active server. Create a new room and give students the new PIN.", "error");
      }
    });
  }

  WebSocket.prototype.send = function synchronizedMasterSend(payload) {
    if (typeof payload === "string") {
      try {
        const message = JSON.parse(payload);
        if (CONTROL_TYPES.has(message.type)) observeControlSocket(this);
      } catch {}
    }
    return nativeSend.call(this, payload);
  };

  function start() {
    synchronizeServer();
    const summary = document.querySelector("#setupPanel details summary");
    if (summary) summary.textContent = "Classroom server connection";
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
