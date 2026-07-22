(() => {
  "use strict";

  const MAX_ATTEMPTS = 5;
  const LOCKOUT_MS = 30000;
  const AUTH_TIMEOUT_MS = 20000;
  const PROTECTED_TEACHER_MESSAGES = new Set([
    "create_control_room",
    "restore_control",
    "approve_registration",
    "reject_registration",
    "move_player",
    "remove_player",
    "set_registration_lock",
    "set_player_ready",
    "fill_with_bots",
    "remove_bots",
    "start_match",
    "end_match",
    "reset_room"
  ]);

  const $ = (id) => document.getElementById(id);
  const dom = {
    body: document.body,
    app: $("teacherApp"),
    overlay: $("teacherAuthOverlay"),
    form: $("teacherAuthForm"),
    password: $("teacherPassword"),
    submit: $("teacherAuthSubmit"),
    error: $("teacherAuthError"),
    logout: $("teacherLogoutButton")
  };

  let attempts = 0;
  let lockoutTimer = null;
  let controlScriptLoaded = false;
  let teacherAuthToken = "";
  let sendInterceptorInstalled = false;

  function normalizeServerUrl(raw) {
    let value = String(raw || "").trim().replace(/\/$/, "");
    if (!value) throw new Error("The multiplayer server URL is missing.");
    if (value.startsWith("https://")) value = `wss://${value.slice(8)}`;
    if (value.startsWith("http://")) value = `ws://${value.slice(7)}`;
    if (!/^wss?:\/\//i.test(value)) throw new Error("The multiplayer server URL is invalid.");
    return value;
  }

  function configuredServerUrl() {
    return normalizeServerUrl(localStorage.getItem("triadServerUrl") || window.TRIAD_CONFIG?.serverUrl || "");
  }

  function setMessage(message, isError = true) {
    dom.error.textContent = message;
    dom.error.classList.toggle("success", !isError);
  }

  function installAuthenticatedSendInterceptor() {
    if (sendInterceptorInstalled) return;
    sendInterceptorInstalled = true;
    const nativeSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function authenticatedTeacherSend(payload) {
      let outgoing = payload;
      if (teacherAuthToken && typeof payload === "string") {
        try {
          const message = JSON.parse(payload);
          if (PROTECTED_TEACHER_MESSAGES.has(message.type)) {
            message.teacherAuthToken = teacherAuthToken;
            outgoing = JSON.stringify(message);
          }
        } catch {}
      }
      return nativeSend.call(this, outgoing);
    };
  }

  function requestTeacherToken(password) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(configuredServerUrl());
      let settled = false;
      const finish = (error, token = "") => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { ws.close(1000, "Teacher authentication complete"); } catch {}
        if (error) reject(error);
        else resolve(token);
      };
      const timer = setTimeout(() => finish(new Error("Teacher authentication timed out. Wake the Render server and retry.")), AUTH_TIMEOUT_MS);

      ws.addEventListener("open", () => {
        ws.send(JSON.stringify({ type: "authenticate_teacher", password }));
      }, { once: true });

      ws.addEventListener("message", (event) => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === "teacher_authenticated" && message.teacherAuthToken) {
          finish(null, message.teacherAuthToken);
        } else if (message.type === "teacher_auth_failed") {
          finish(new Error(message.message || "Incorrect teacher password."));
        } else if (message.type === "error") {
          finish(new Error(message.message || "The secure teacher gateway rejected the request."));
        }
      });

      ws.addEventListener("error", () => finish(new Error("Unable to reach the secure multiplayer server.")), { once: true });
      ws.addEventListener("close", () => {
        if (!settled) finish(new Error("The secure teacher gateway closed the connection."));
      });
    });
  }

  function loadTeacherControls() {
    if (controlScriptLoaded || document.querySelector('script[data-teacher-controls="true"]')) return;
    controlScriptLoaded = true;
    const script = document.createElement("script");
    script.src = "master-v3.js?v=20260722-smooth2";
    script.dataset.teacherControls = "true";
    script.addEventListener("error", () => {
      controlScriptLoaded = false;
      setMessage("Teacher controls could not be loaded. Refresh the page and try again.");
      lockInterface(false);
    });
    document.body.appendChild(script);
  }

  function unlockInterface(token) {
    teacherAuthToken = token;
    installAuthenticatedSendInterceptor();
    dom.body.classList.remove("teacher-auth-locked");
    dom.overlay.hidden = true;
    dom.app.hidden = false;
    loadTeacherControls();
  }

  function lockInterface(clearToken = true) {
    if (clearToken) teacherAuthToken = "";
    dom.body.classList.add("teacher-auth-locked");
    dom.app.hidden = true;
    dom.overlay.hidden = false;
    window.setTimeout(() => dom.password.focus(), 0);
  }

  function startLockout() {
    const unlockAt = Date.now() + LOCKOUT_MS;
    dom.password.disabled = true;
    dom.submit.disabled = true;
    clearInterval(lockoutTimer);
    lockoutTimer = window.setInterval(() => {
      const seconds = Math.max(0, Math.ceil((unlockAt - Date.now()) / 1000));
      setMessage(`Too many attempts. Try again in ${seconds} seconds.`);
      if (seconds <= 0) {
        clearInterval(lockoutTimer);
        lockoutTimer = null;
        attempts = 0;
        dom.password.disabled = false;
        dom.submit.disabled = false;
        setMessage("Enter the four-digit teacher password.", false);
        dom.password.focus();
      }
    }, 250);
  }

  async function authenticate(event) {
    event.preventDefault();
    const value = dom.password.value.trim();
    if (!/^\d{4}$/.test(value)) {
      setMessage("Enter a four-digit numeric password.");
      dom.password.select();
      return;
    }

    dom.submit.disabled = true;
    dom.submit.textContent = "VERIFYING WITH SERVER…";
    setMessage("Connecting to the secure teacher gateway…", false);
    try {
      const token = await requestTeacherToken(value);
      attempts = 0;
      dom.password.value = "";
      setMessage("Server-verified access granted.", false);
      unlockInterface(token);
    } catch (error) {
      attempts += 1;
      dom.password.value = "";
      setMessage(`${error.message} ${Math.max(0, MAX_ATTEMPTS - attempts)} attempt(s) remaining.`);
      if (attempts >= MAX_ATTEMPTS) startLockout();
      else dom.password.focus();
    } finally {
      if (!lockoutTimer) dom.submit.disabled = false;
      dom.submit.textContent = "UNLOCK TEACHER CONTROL";
    }
  }

  dom.form.addEventListener("submit", authenticate);
  dom.logout.addEventListener("click", () => {
    teacherAuthToken = "";
    location.reload();
  });

  lockInterface(false);
})();
