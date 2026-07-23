(() => {
  "use strict";

  const ASSET_VERSION = "20260723-studentfix13";
  const replacements = [
    ["Nine PC players, three teams and optional bots are available.", "One to nine PC players, three teams and optional bots are available."],
    ["Teacher approved this PC group. Complete suggestions and voting.", "Teacher approved this PC player. Select an available team name, then mark Ready."],
    ["Approved · setup incomplete", "Approved · choose team and mark ready"],
    ["COMPLETE VOTING FIRST", "I AM READY"],
    ["VOTING COMPLETE", "FLEXIBLE ROOM · 1–9 PLAYERS"],
    ["team-name voting incomplete", "team selection pending"],
    ["WASD / arrows move · mouse aims · SPACE fires · SHIFT dashes", "WASD / arrows move · hold RIGHT CLICK to aim · SPACE fires · SHIFT dashes"],
    ["Eliminated · solve trigonometry", "Eliminated · respawning or final-life question"],
    ["automatic +1 every 10 s", "automatic +1 every 5 s"],
    ["FINAL-LIFE SERVER RESPawn", "FINAL-LIFE SERVER RESPAWN"]
  ];

  function rewriteText(node) {
    if (!node || typeof node.textContent !== "string") return;
    const value = node.textContent;
    let next = value;
    for (const [from, to] of replacements) next = next.replaceAll(from, to);
    if (next !== value) node.textContent = next;
  }

  function removeStudentVotingControls() {
    if (!document.getElementById("gameCanvas")) return;
    ["proposalPanel", "votePanel", "teamNamingStatus"].forEach((id) => {
      const element = document.getElementById(id);
      if (element?.isConnected) element.remove();
    });
  }

  function unlockStudentReadyControl() {
    const approvedPanel = document.getElementById("approvedPanel");
    const readyButton = document.getElementById("readyButton");
    const readyLabel = document.getElementById("playerReadyLabel");
    if (!approvedPanel || !readyButton || approvedPanel.classList.contains("hidden")) return;

    const isReady = String(readyLabel?.textContent || "").trim().toUpperCase() === "YES";
    readyButton.disabled = false;
    readyButton.textContent = isReady ? "READY — CLICK TO CANCEL" : "I AM READY";
    readyButton.classList.toggle("secondary-button", isReady);
  }

  function loadStyle(path, id) {
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `${path}?v=${ASSET_VERSION}`;
    document.head.appendChild(link);
  }

  function loadScript(path, id) {
    if (document.getElementById(id)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.id = id;
      script.src = `${path}?v=${ASSET_VERSION}`;
      script.async = false;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", reject, { once: true });
      document.body.appendChild(script);
    });
  }

  function installGameplayAssets() {
    const studentPage = Boolean(document.getElementById("gameCanvas"));
    if (studentPage) {
      loadStyle("gameplay-v5.css", "gameplayV5Styles");
      loadStyle("gameplay-v6.css", "gameplayV6Styles");
      loadStyle("gameplay-v9.css", "gameplayV9Styles");
      loadStyle("team-selection-v8.css", "teamSelectionV8Styles");
      loadStyle("pickup-assets-v10.css", "pickupAssetsV10Styles");
      return loadScript("network-v12.js", "networkV12Script")
        .then(() => loadScript("pickup-assets-v10.js", "pickupAssetsV10Script"))
        .then(() => loadScript("gameplay-v9.js", "gameplayV9Script"))
        .then(() => loadScript("gameplay-v12-ui.js", "gameplayV12UiScript"))
        .then(() => loadScript("team-selection-v8.js", "teamSelectionV8Script"))
        .then(() => loadScript("combat-feed.js", "combatFeedScript"));
    }

    loadStyle("master-live-v9.css", "masterLiveV9Styles");
    loadStyle("pickup-assets-v10.css", "pickupAssetsV10Styles");
    return loadScript("network-v12.js", "networkV12Script")
      .then(() => loadScript("pickup-assets-v10.js", "pickupAssetsV10Script"))
      .then(() => loadScript("master-ready-control.js", "masterReadyControlScript"))
      .then(() => loadScript("master-flex-start-v11.js", "masterFlexStartV11Script"))
      .then(() => loadScript("master-live-v9.js", "masterLiveV9Script"))
      .then(() => loadScript("gameplay-v12-ui.js", "gameplayV12UiScript"))
      .then(() => loadScript("combat-feed.js", "combatFeedScript"));
  }

  function refresh() {
    [
      "serverHealthText",
      "lobbyStatus",
      "playerStateLabel",
      "readyButton",
      "startReadiness",
      "setupStatus",
      "ammoRegenTimer"
    ].forEach((id) => rewriteText(document.getElementById(id)));
    rewriteText(document.querySelector(".controls-hint"));
    rewriteText(document.querySelector("#questionOverlay .eyebrow"));
    removeStudentVotingControls();
    unlockStudentReadyControl();
  }

  let refreshQueued = false;
  function queueRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    queueMicrotask(() => {
      refreshQueued = false;
      refresh();
    });
  }

  function observeTarget(id, options) {
    const target = document.getElementById(id);
    if (!target) return;
    const observer = new MutationObserver(queueRefresh);
    observer.observe(target, options);
  }

  function installTargetedObservers() {
    const textOptions = { subtree: true, childList: true, characterData: true };
    observeTarget("playerReadyLabel", textOptions);
    observeTarget("lobbyStatus", textOptions);
    observeTarget("playerStateLabel", textOptions);
    observeTarget("ammoRegenTimer", textOptions);
    observeTarget("approvedPanel", { attributes: true, attributeFilter: ["class"] });
  }

  function start() {
    refresh();
    installGameplayAssets()
      .catch(() => {})
      .finally(() => {
        refresh();
        installTargetedObservers();
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
