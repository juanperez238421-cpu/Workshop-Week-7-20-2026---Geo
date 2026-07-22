(() => {
  "use strict";

  const PASSWORD_SHA256 = "d8c4d37261d7aaa4bbafe4ccfe334e09fbe181c84de22e9a561dfe02b0958aa0";
  const SESSION_KEY = "triadTeacherAuthenticated";
  const MAX_ATTEMPTS = 5;
  const LOCKOUT_MS = 30000;

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

  async function sha256(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function setMessage(message, isError = true) {
    dom.error.textContent = message;
    dom.error.classList.toggle("success", !isError);
  }

  function loadTeacherControls() {
    if (controlScriptLoaded || document.querySelector('script[data-teacher-controls="true"]')) return;
    controlScriptLoaded = true;
    const script = document.createElement("script");
    script.src = "master-v3.js";
    script.dataset.teacherControls = "true";
    script.addEventListener("error", () => {
      controlScriptLoaded = false;
      setMessage("Teacher controls could not be loaded. Refresh the page and try again.");
      lockInterface(false);
    });
    document.body.appendChild(script);
  }

  function unlockInterface() {
    sessionStorage.setItem(SESSION_KEY, "true");
    dom.body.classList.remove("teacher-auth-locked");
    dom.overlay.hidden = true;
    dom.app.hidden = false;
    loadTeacherControls();
  }

  function lockInterface(clearSession = true) {
    if (clearSession) sessionStorage.removeItem(SESSION_KEY);
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
    dom.submit.textContent = "CHECKING…";
    try {
      const candidateHash = await sha256(value);
      if (candidateHash === PASSWORD_SHA256) {
        attempts = 0;
        dom.password.value = "";
        setMessage("Access granted.", false);
        unlockInterface();
        return;
      }

      attempts += 1;
      dom.password.value = "";
      setMessage(`Incorrect password. ${Math.max(0, MAX_ATTEMPTS - attempts)} attempt(s) remaining.`);
      if (attempts >= MAX_ATTEMPTS) startLockout();
      else dom.password.focus();
    } catch {
      setMessage("Secure password verification is unavailable in this browser.");
    } finally {
      if (!lockoutTimer) dom.submit.disabled = false;
      dom.submit.textContent = "UNLOCK TEACHER CONTROL";
    }
  }

  dom.form.addEventListener("submit", authenticate);
  dom.logout.addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    location.reload();
  });

  if (sessionStorage.getItem(SESSION_KEY) === "true") unlockInterface();
  else lockInterface(false);
})();
