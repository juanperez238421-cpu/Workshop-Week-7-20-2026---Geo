(() => {
  "use strict";

  const ASSET_VERSION = "20260724-stable-autostart26";
  const replacements = [
    ["Nine PC players, three teams and optional bots are available.", "Up to nine PC channels are available; each real PC receives five automatic bots."],
    ["One to nine PC players, three teams and optional bots are available.", "Up to nine isolated PC-versus-bots channels are available under one Master PIN."],
    ["Teacher approved this PC group. Complete suggestions and voting.", "Teacher approved this PC channel. The Master can start it immediately."],
    ["Teacher approved this PC channel. Mark Ready when the group is prepared.", "Teacher approved this PC channel. The Master can start it immediately."],
    ["Approved · setup incomplete", "Approved · Master-controlled start"],
    ["Approved · mark ready", "Approved · Master-controlled start"],
    ["Approved · not ready", "Approved · startable"],
    ["READY — CLICK TO CANCEL", "MASTER START"],
    ["I AM READY", "MASTER START"],
    ["START ALL READY CHANNELS", "START ALL APPROVED CHANNELS"],
    ["WAITING FOR A READY CHANNEL", "WAITING FOR AN APPROVED CHANNEL"],
    ["channel not ready", "channel awaiting Master start"],
    ["8 automatic bots", "5 automatic bots"],
    ["eight automatic bots", "five automatic bots"],
    ["eight optimized bots", "five optimized bots"],
    ["1 human + 8 bots", "1 human + 5 bots"],
    ["WASD / arrows move · mouse aims · SPACE fires · SHIFT dashes", "WASD / arrows move · hold RIGHT CLICK to aim · SPACE fires · SHIFT dashes"],
    ["Eliminated · solve trigonometry", "Eliminated · solve the assigned geometry respawn challenge"],
    ["automatic +1 every 10 s", "automatic +1 every 5 s"],
    ["FINAL-LIFE SERVER RESPawn", "FINAL-LIFE SERVER RESPAWN"],
    ["05:00", "10:00"],
    ["five minutes", "ten minutes"],
    ["after five minutes", "after ten minutes"],
    ["authoritative semi-auto hitscan", "authoritative swept-projectile combat"],
    ["server-resolved hitscan combat", "server-resolved projectile combat"]
  ];

  function rewriteText(node) {
    if (!node || typeof node.textContent !== "string") return;
    const value = node.textContent;
    let next = value;
    for (const [from, to] of replacements) next = next.replaceAll(from, to);
    if (next !== value) node.textContent = next;
  }

  function removeStudentVotingAndReadyControls() {
    if (!document.getElementById("gameCanvas")) return;
    ["proposalPanel", "votePanel", "teamNamingStatus", "readyButton"].forEach((id) => {
      const element = document.getElementById(id);
      if (element?.isConnected) element.remove();
    });
  }

  function removeMasterReadyControls() {
    document.querySelectorAll(".teacher-ready-toggle").forEach((element) => element.remove());
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
        .then(() => loadScript("team-selection-v8.js", "teamSelectionV8Script"))
        .then(() => loadScript("combat-feed.js", "combatFeedScript"));
    }

    loadStyle("master-team-score-v23.css", "masterTeamScoreV23Styles");
    loadStyle("master-solo-channels-v24.css", "masterSoloChannelsV24Styles");
    return loadScript("master-solo-channels-v24.js", "masterSoloChannelsV24Script")
      .then(() => loadScript("master-team-score-v23.js", "masterTeamScoreV23Script"))
      .then(() => loadScript("network-v12.js", "networkV12Script"))
      .then(() => loadScript("master-flex-start-v11.js", "masterFlexStartV11Script"));
  }

  function refresh() {
    [
      "serverHealthText",
      "lobbyStatus",
      "playerStateLabel",
      "startReadiness",
      "setupStatus",
      "ammoRegenTimer",
      "clockLabel",
      "automaticReportStatus",
      "startMatchButton",
      "approvedDetail",
      "botCountSummary"
    ].forEach((id) => rewriteText(document.getElementById(id)));
    rewriteText(document.querySelector(".controls-hint"));
    rewriteText(document.querySelector("#questionOverlay .eyebrow"));
    rewriteText(document.querySelector(".master-topbar span"));
    rewriteText(document.querySelector("#masterLiveGamePanel p"));
    rewriteText(document.querySelector(".start-console"));
    removeStudentVotingAndReadyControls();
    removeMasterReadyControls();
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
    observeTarget("lobbyStatus", textOptions);
    observeTarget("playerStateLabel", textOptions);
    observeTarget("ammoRegenTimer", textOptions);
    observeTarget("clockLabel", textOptions);
    observeTarget("automaticReportStatus", textOptions);
    observeTarget("startMatchButton", textOptions);
    observeTarget("startReadiness", textOptions);
    observeTarget("approvedDetail", textOptions);
    observeTarget("botCountSummary", textOptions);
    observeTarget("approvedPanel", { attributes: true, attributeFilter: ["class"] });
    observeTarget("rosterList", { subtree: true, childList: true, characterData: true });
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
