(() => {
  "use strict";

  const root = document.documentElement;
  const body = document.body;
  const app = document.getElementById("teacherApp");
  const STUDENT_BUILD = String(window.TRIAD_CONFIG?.clientBuild || "20260723-studentstable15");

  function applyMasterViewport() {
    root.style.setProperty("width", "100%", "important");
    root.style.setProperty("height", "100%", "important");
    root.style.setProperty("overflow", "hidden", "important");

    body.style.setProperty("width", "100%", "important");
    body.style.setProperty("height", "100%", "important");
    body.style.setProperty("overflow", "hidden", "important");

    if (!app || body.classList.contains("teacher-auth-locked")) return;

    app.style.setProperty("position", "fixed", "important");
    app.style.setProperty("inset", "0", "important");
    app.style.setProperty("width", "100%", "important");
    app.style.setProperty("height", "100dvh", "important");
    app.style.setProperty("min-height", "0", "important");
    app.style.setProperty("max-height", "100dvh", "important");
    app.style.setProperty("overflow-x", "hidden", "important");
    app.style.setProperty("overflow-y", "scroll", "important");
    app.style.setProperty("scrollbar-gutter", "stable", "important");

    for (const element of [
      document.getElementById("controlPanel"),
      document.getElementById("registrationInbox"),
      document.getElementById("pendingList"),
      document.getElementById("rosterList")
    ]) {
      if (!element) continue;
      element.style.setProperty("height", "auto", "important");
      element.style.setProperty("max-height", "none", "important");
      element.style.setProperty("overflow", "visible", "important");
    }
  }

  function installRegistrationJump() {
    const jump = document.getElementById("pendingJumpButton");
    const inbox = document.getElementById("registrationInbox");
    if (!jump || !inbox || jump.dataset.scrollGuardBound === "true") return;

    jump.dataset.scrollGuardBound = "true";
    jump.addEventListener("click", (event) => {
      event.preventDefault();
      applyMasterViewport();
      window.requestAnimationFrame(() => {
        inbox.scrollIntoView({ behavior: "smooth", block: "start" });
        inbox.focus({ preventScroll: true });
      });
    });
  }

  function validRoomCode(value) {
    return /^[A-Z2-9]{6}$/.test(String(value || "").trim().toUpperCase());
  }

  function currentRoomCode() {
    const value = String(document.getElementById("roomCodeLarge")?.textContent || "").trim().toUpperCase();
    return validRoomCode(value) ? value : "";
  }

  function studentUrl(station = "") {
    const roomCode = currentRoomCode();
    if (!roomCode) return null;
    const base = window.TRIAD_CONFIG?.gameUrl || new URL("index.html", location.href).href;
    const url = new URL(base, location.href);
    url.searchParams.set("room", roomCode);
    url.searchParams.set("v", STUDENT_BUILD);
    if (station) url.searchParams.set("station", station);
    else url.searchParams.delete("station");
    return url;
  }

  function prepareStudentSession(roomCode, forceReset = false) {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem("triadStudentSession") || "null"); } catch {}
    if (forceReset || (saved?.roomCode && saved.roomCode !== roomCode)) {
      try { localStorage.removeItem("triadStudentSession"); } catch {}
    }
    if (forceReset) {
      try { localStorage.removeItem("triadPcLabel"); } catch {}
    }
  }

  function updateShareLink() {
    const link = studentUrl();
    const target = document.getElementById("studentLink");
    if (!target || !link) return;
    target.textContent = link.href;
    target.dataset.url = link.href;
  }

  function installFreshStudentEntry() {
    const joinButton = document.getElementById("masterJoinPlayerButton");
    const openButton = document.getElementById("masterOpenPlayerButton");
    const station = document.getElementById("masterPlayerStation");
    const frame = document.getElementById("masterPlayerFrame");
    const feed = document.getElementById("masterLiveFeedStatus");

    if (joinButton && joinButton.dataset.studentStableV15Bound !== "true") {
      joinButton.dataset.studentStableV15Bound = "true";
      joinButton.addEventListener("click", (event) => {
        const url = studentUrl("master");
        if (!url || !station || !frame) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        prepareStudentSession(currentRoomCode(), false);
        station.hidden = false;
        frame.src = url.href;
        joinButton.textContent = "SHOW MASTER PLAYER STATION";
        station.scrollIntoView({ behavior: "smooth", block: "start" });
      }, true);
    }

    if (openButton && openButton.dataset.studentStableV15Bound !== "true") {
      openButton.dataset.studentStableV15Bound = "true";
      openButton.addEventListener("click", (event) => {
        const url = studentUrl("master");
        if (!url) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        prepareStudentSession(currentRoomCode(), false);
        window.open(url.href, "_blank", "noopener");
      }, true);
    }

    if (!currentRoomCode() && feed) feed.textContent = "CREATE OR RESTORE A ROOM FIRST";
    updateShareLink();
  }

  function refresh() {
    applyMasterViewport();
    installRegistrationJump();
    installFreshStudentEntry();
    updateShareLink();
  }

  const bodyObserver = new MutationObserver(refresh);
  bodyObserver.observe(body, { attributes: true, attributeFilter: ["class"] });

  const roomCode = document.getElementById("roomCodeLarge");
  if (roomCode) {
    const roomObserver = new MutationObserver(refresh);
    roomObserver.observe(roomCode, { childList: true, characterData: true, subtree: true });
  }

  const controlPanel = document.getElementById("controlPanel");
  if (controlPanel) {
    const controlObserver = new MutationObserver(refresh);
    controlObserver.observe(controlPanel, { attributes: true, attributeFilter: ["class"] });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refresh, { once: true });
  else refresh();

  window.addEventListener("load", refresh, { once: true });
  window.addEventListener("pageshow", refresh);
  window.addEventListener("resize", applyMasterViewport);
})();
