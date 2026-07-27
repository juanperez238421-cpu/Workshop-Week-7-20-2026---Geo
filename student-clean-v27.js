(() => {
  "use strict";

  const BUILD = "20260727-clean-player27";
  const app = document.getElementById("app");
  const body = document.body;
  if (!app || !body) return;

  document.documentElement.classList.add("triad-clean-hud-v27");
  body.classList.add("clean-player-view-v27");

  const byId = (id) => document.getElementById(id);
  const text = (id, fallback = "") => String(byId(id)?.textContent || fallback).trim();

  const shortMessages = [
    [/waiting for teacher approval[^.]*/i, "Waiting for teacher approval"],
    [/approved[^.]*master[^.]*/i, "Approved — teacher starts the match"],
    [/teacher approved this pc channel[^.]*/i, "Approved — wait for the teacher to start"],
    [/registration is ready[^.]*/i, "Enter the room PIN and three student names"],
    [/registration sent[^.]*/i, "Registration sent"],
    [/classroom server standby/i, "Server ready"],
    [/the server connects only after register is pressed\.?/i, "Connection starts after registration"],
    [/state stream[^.]*(stalled|delayed)[^.]*/i, "Connection delayed — recovering"],
    [/requesting (an )?immediate full state[^.]*/i, "Recovering game state"],
    [/restored channel \d+/i, "Connection restored"],
    [/ammunition regenerated/i, "Ammo +1"],
    [/supply box collected/i, "Power collected"],
    [/final-life server respawn/i, "Solve the geometry challenge to respawn"],
    [/you were eliminated/i, "You were eliminated"],
    [/match starts in/i, "Match starts in"],
    [/isolated channel/i, "channel"],
    [/optimized server bots/i, "bots"]
  ];

  function simplify(value) {
    let result = String(value || "").replace(/\s+/g, " ").trim();
    for (const [pattern, replacement] of shortMessages) result = result.replace(pattern, replacement);
    if (result.length > 150) result = `${result.slice(0, 147).trim()}…`;
    return result;
  }

  function setIfDifferent(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function ensureEssentialHud() {
    let hud = byId("essentialPlayerHudV27");
    if (hud) return hud;
    hud = document.createElement("aside");
    hud.id = "essentialPlayerHudV27";
    hud.className = "essential-player-hud-v27";
    hud.setAttribute("aria-label", "Essential player information");
    hud.innerHTML = `
      <span id="essentialTeamDotV27" class="essential-team-dot-v27"></span>
      <strong id="essentialPlayerNameV27" class="essential-player-name-v27">PC PLAYER</strong>
      <span class="essential-metric-v27"><span>AREA</span><strong id="essentialTerritoryV27">0</strong></span>
      <span class="essential-metric-v27"><span>KOs</span><strong id="essentialKillsV27">0</strong></span>
    `;
    app.appendChild(hud);
    return hud;
  }

  function ensureUtilities() {
    let utilities = byId("hudUtilityV27");
    if (utilities) return utilities;
    utilities = document.createElement("div");
    utilities.id = "hudUtilityV27";
    utilities.className = "hud-utility-v27";
    utilities.innerHTML = `
      <button id="mapToggleV27" type="button" aria-pressed="false" title="Show or hide map (M)">M MAP</button>
      <button id="helpToggleV27" type="button" aria-pressed="false" title="Show controls (H)">H HELP</button>
    `;
    app.appendChild(utilities);
    return utilities;
  }

  function ensureControlsToast() {
    let toast = byId("controlsToastV27");
    if (toast) return toast;
    toast = document.createElement("div");
    toast.id = "controlsToastV27";
    toast.className = "controls-toast-v27";
    toast.setAttribute("role", "status");
    toast.innerHTML = "<b>MOVE WASD</b><span>RIGHT CLICK AIM</span><span>SPACE FIRE</span><span>SHIFT DASH</span><span>M MAP</span>";
    app.appendChild(toast);
    return toast;
  }

  function ensureNetworkAlert() {
    let alert = byId("networkAlertV27");
    if (alert) return alert;
    alert = document.createElement("div");
    alert.id = "networkAlertV27";
    alert.className = "network-alert-v27";
    alert.setAttribute("role", "status");
    alert.textContent = "Connection delayed — recovering automatically";
    app.appendChild(alert);
    return alert;
  }

  ensureEssentialHud();
  ensureUtilities();
  ensureControlsToast();
  ensureNetworkAlert();

  let controlsTimer = 0;
  let lastPhase = "";

  function showControls(duration = 5200) {
    const toast = ensureControlsToast();
    toast.classList.add("visible");
    const button = byId("helpToggleV27");
    button?.setAttribute("aria-pressed", "true");
    clearTimeout(controlsTimer);
    controlsTimer = setTimeout(() => {
      toast.classList.remove("visible");
      button?.setAttribute("aria-pressed", "false");
    }, duration);
  }

  function hideControls() {
    clearTimeout(controlsTimer);
    byId("controlsToastV27")?.classList.remove("visible");
    byId("helpToggleV27")?.setAttribute("aria-pressed", "false");
  }

  function toggleMap(force) {
    const visible = typeof force === "boolean" ? force : !body.classList.contains("show-minimap-v27");
    body.classList.toggle("show-minimap-v27", visible);
    byId("mapToggleV27")?.setAttribute("aria-pressed", String(visible));
  }

  function toggleControls() {
    const toast = ensureControlsToast();
    if (toast.classList.contains("visible")) hideControls();
    else showControls(7000);
  }

  byId("mapToggleV27")?.addEventListener("click", () => toggleMap());
  byId("helpToggleV27")?.addEventListener("click", toggleControls);

  window.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest("input,textarea,select,[contenteditable='true']")) return;
    if (event.code === "KeyM" && !event.repeat) {
      event.preventDefault();
      toggleMap();
    }
    if (event.code === "KeyH" && !event.repeat) {
      event.preventDefault();
      toggleControls();
    }
    if (event.code === "Escape") {
      hideControls();
      toggleMap(false);
    }
  });

  function updateEssentialHud() {
    setIfDifferent(byId("essentialPlayerNameV27"), text("playerNameLabel", "PC PLAYER"));
    setIfDifferent(byId("essentialTerritoryV27"), text("playerTerritoryLabel", "0"));
    setIfDifferent(byId("essentialKillsV27"), text("playerKillsLabel", "0"));
    const sourceDot = byId("playerTeamDot");
    const targetDot = byId("essentialTeamDotV27");
    if (sourceDot && targetDot) {
      const computed = getComputedStyle(sourceDot);
      const color = sourceDot.style.backgroundColor || computed.backgroundColor || computed.borderColor;
      if (color) targetDot.style.backgroundColor = color;
    }
  }

  function updatePhase() {
    const phase = text("phaseLabel", "LOBBY").toUpperCase();
    body.dataset.cleanPhaseV27 = phase.toLowerCase();
    const playing = phase === "PLAYING" || phase === "COUNTDOWN";
    body.classList.toggle("clean-match-active-v27", playing);
    if (playing && phase !== lastPhase) showControls(5200);
    if (phase === "ENDED" || phase === "LOBBY") toggleMap(false);
    lastPhase = phase;
  }

  function updateNetwork() {
    const connection = text("connectionBadge", "OFFLINE").toUpperCase();
    const network = text("networkDisplay", "WAITING").toUpperCase();
    const problem = connection.includes("OFFLINE") || connection.includes("ERROR") || network.includes("RECOVER") || network.includes("STALL");
    body.classList.toggle("network-problem-v27", problem);
    const alert = ensureNetworkAlert();
    if (network.includes("RECOVER")) alert.textContent = "Connection delayed — recovering automatically";
    else if (connection.includes("OFFLINE")) alert.textContent = "Connection lost — trying to reconnect";
    else alert.textContent = "Connection delayed — recovering automatically";
  }

  function simplifyLiveMessages() {
    const banner = byId("eventBanner");
    if (banner?.textContent) setIfDifferent(banner, simplify(banner.textContent));
    const lobbyStatus = byId("lobbyStatus");
    if (lobbyStatus?.textContent) setIfDifferent(lobbyStatus, simplify(lobbyStatus.textContent));
    const waitingMessage = byId("waitingMessage");
    if (waitingMessage?.textContent) setIfDifferent(waitingMessage, simplify(waitingMessage.textContent));
    const stateLabel = byId("playerStateLabel");
    if (stateLabel?.textContent) setIfDifferent(stateLabel, simplify(stateLabel.textContent));
    const healthText = byId("serverHealthText");
    if (healthText?.textContent) setIfDifferent(healthText, simplify(healthText.textContent));
  }

  function refresh() {
    updateEssentialHud();
    updatePhase();
    updateNetwork();
    simplifyLiveMessages();
  }

  const observer = new MutationObserver(() => queueMicrotask(refresh));
  for (const id of [
    "playerNameLabel", "playerTerritoryLabel", "playerKillsLabel", "playerTeamDot",
    "phaseLabel", "connectionBadge", "networkDisplay", "eventBanner", "lobbyStatus",
    "waitingMessage", "playerStateLabel", "serverHealthText"
  ]) {
    const node = byId(id);
    if (node) observer.observe(node, { subtree: true, childList: true, characterData: true, attributes: id === "playerTeamDot" });
  }

  const controlsHint = byId("controlsHint") || document.querySelector(".controls-hint");
  if (controlsHint) controlsHint.textContent = "WASD move · right click aim · SPACE fire · SHIFT dash · M map · H help";

  const registrationLead = document.querySelector("#lobbyOverlay .lead");
  if (registrationLead) registrationLead.textContent = "Enter the shared room PIN and the three student names. After the teacher approves this computer, wait for the match to start. Your team will play a 10-minute round against five bots.";

  const recoveryNote = document.querySelector(".student-recovery-note");
  if (recoveryNote) recoveryNote.innerHTML = "<strong>Automatic recovery.</strong> If the connection pauses, the game requests a fresh state and continues the visible timer.";

  const approvalNote = document.querySelector("#registrationForm .approval-note");
  if (approvalNote) approvalNote.textContent = "One computer represents three students. The teacher approves the registration and starts the match.";

  refresh();

  window.__triadCleanPlayerV27 = Object.freeze({
    build: BUILD,
    essentialHudOnly: true,
    minimapOnDemand: true,
    conciseMessages: true,
    preservesArenaAssets: true,
    opensAdditionalSocket: false
  });
})();
