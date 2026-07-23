(() => {
  "use strict";

  window.__triadFinishLegacyCapture?.();

  const configuredServer = String(window.TRIAD_CONFIG?.serverUrl || "").trim().replace(/\/$/, "");
  const acknowledgementTimers = new WeakMap();
  const observedSockets = new WeakSet();
  const nativeSend = WebSocket.prototype.send;
  const PC_LABEL_KEY = "triadPcLabel";
  const LABEL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  const $ = (id) => document.getElementById(id);

  function setRegistrationStatus(text, kind = "neutral") {
    const status = $("lobbyStatus");
    if (!status) return;
    status.textContent = text;
    status.style.borderLeftColor = kind === "error" ? "#b42318" : kind === "success" ? "#067647" : "#344054";
  }

  function createAutomaticPcLabel() {
    const bytes = new Uint8Array(6);
    if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
    else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    const suffix = [...bytes].map((value) => LABEL_ALPHABET[value % LABEL_ALPHABET.length]).join("");
    return `Player-${suffix}`;
  }

  function ensureAutomaticPcLabel(forceNew = false) {
    let label = String(localStorage.getItem(PC_LABEL_KEY) || "").trim();
    if (forceNew || !label || /^assigned automatically$/i.test(label)) {
      label = createAutomaticPcLabel();
      localStorage.setItem(PC_LABEL_KEY, label);
    }

    const input = $("pcLabelInput");
    if (input) {
      input.value = label;
      input.readOnly = true;
      input.setAttribute("aria-readonly", "true");
      input.title = "A unique player title was assigned automatically to this browser.";
    }
    return label;
  }

  function clearAcknowledgementTimer(socket) {
    const timer = acknowledgementTimers.get(socket);
    if (timer) clearTimeout(timer);
    acknowledgementTimers.delete(socket);
  }

  function synchronizeServer() {
    if (!configuredServer) return;
    localStorage.setItem("triadServerUrl", configuredServer);
    const input = $("serverUrlInput");
    if (input) {
      input.value = configuredServer;
      input.readOnly = true;
      input.setAttribute("aria-readonly", "true");
      input.title = "This classroom uses the same configured multiplayer server as the teacher panel.";
    }
  }

  function observeRegistrationSocket(socket) {
    if (observedSockets.has(socket)) return;
    observedSockets.add(socket);

    socket.addEventListener("message", (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }

      if (message.type === "registration_received") {
        clearAcknowledgementTimer(socket);
        setRegistrationStatus("Registration confirmed by the room server. The teacher can now see this PC player.", "success");
      } else if (message.type === "error") {
        clearAcknowledgementTimer(socket);
        const registerButton = $("registerButton");
        if (registerButton) registerButton.disabled = false;
        const detail = String(message.message || "Registration was rejected by the server.");
        let guidance = /room not found/i.test(detail)
          ? " Ask the teacher to create a new room and verify the current six-character PIN."
          : "";
        if (/pc\/?group label.*already|label is already registered|already registered/i.test(detail)) {
          const replacement = ensureAutomaticPcLabel(true);
          guidance += ` A new automatic title (${replacement}) is ready; press Register again.`;
        }
        setRegistrationStatus(`${detail}${guidance}`, "error");
      }
    });

    socket.addEventListener("close", () => {
      if (!acknowledgementTimers.has(socket)) return;
      clearAcknowledgementTimer(socket);
      const registerButton = $("registerButton");
      if (registerButton) registerButton.disabled = false;
      setRegistrationStatus("The server connection closed before confirming registration. Reopen the current room and try again.", "error");
    });
  }

  function armAcknowledgement(socket, message) {
    observeRegistrationSocket(socket);
    clearAcknowledgementTimer(socket);

    const roomCode = String(message.roomCode || "").toUpperCase();
    setTimeout(() => setRegistrationStatus(`Sending this PC player to room ${roomCode}… waiting for server confirmation.`), 0);

    const timer = setTimeout(() => {
      acknowledgementTimers.delete(socket);
      const registerButton = $("registerButton");
      if (registerButton) registerButton.disabled = false;
      setRegistrationStatus(
        `Room ${roomCode} did not confirm the registration. Verify that the teacher panel is using the same current PIN and create a new room if the server was recently redeployed.`,
        "error"
      );
    }, 12000);
    acknowledgementTimers.set(socket, timer);
  }

  WebSocket.prototype.send = function synchronizedStudentSend(payload) {
    if (typeof payload === "string") {
      try {
        const message = JSON.parse(payload);
        if (message.type === "register_student") {
          message.pcLabel = ensureAutomaticPcLabel();
          payload = JSON.stringify(message);
          armAcknowledgement(this, message);
        }
      } catch {}
    }
    return nativeSend.call(this, payload);
  };

  function start() {
    ensureAutomaticPcLabel();
    synchronizeServer();
    const summary = document.querySelector(".advanced-server summary");
    if (summary) summary.textContent = "Classroom server connection";
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
