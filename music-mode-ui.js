(() => {
  "use strict";

  const ASSET_VERSION = "20260722-mapassets1";
  const replacements = [
    ["Three-student registration, voting and simple bots are available.", "Nine PC players, three teams and optional bots are available."],
    ["Teacher approved this PC group. Complete suggestions and voting.", "Teacher approved this PC player. Select an available team name, then mark Ready."],
    ["Approved · setup incomplete", "Approved · choose team and mark ready"],
    ["COMPLETE VOTING FIRST", "MARK THIS PLAYER READY"],
    ["VOTING COMPLETE", "3 TEAMS · 9 PLAYERS"],
    ["team-name voting incomplete", "team selection pending"],
    ["WASD / arrows move · mouse aims · SPACE fires · SHIFT dashes", "WASD / arrows move · hold RIGHT CLICK to aim · SPACE fires · SHIFT dashes"],
    ["Eliminated · solve trigonometry", "Eliminated · respawning or final-life question"],
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
      loadStyle("minimap-v10.css", "minimapV10Styles");
      loadScript("pickup-assets-v10.js", "pickupAssetsV10Script")
        .then(() => loadScript("gameplay-v9.js", "gameplayV9Script"))
        .then(() => loadScript("minimap-v10.js", "minimapV10Script"))
        .then(() => loadScript("team-selection-v8.js", "teamSelectionV8Script"))
        .then(() => loadScript("combat-feed.js", "combatFeedScript"))
        .catch(() => {});
      return;
    }

    loadStyle("master-live-v9.css", "masterLiveV9Styles");
    loadStyle("pickup-assets-v10.css", "pickupAssetsV10Styles");
    loadScript("pickup-assets-v10.js", "pickupAssetsV10Script")
      .then(() => loadScript("master-ready-control.js", "masterReadyControlScript"))
      .then(() => loadScript("master-live-v9.js", "masterLiveV9Script"))
      .then(() => loadScript("combat-feed.js", "combatFeedScript"))
      .catch(() => {});
  }

  function refresh() {
    [
      "serverHealthText",
      "lobbyStatus",
      "playerStateLabel",
      "readyButton",
      "startReadiness",
      "setupStatus"
    ].forEach((id) => rewriteText(document.getElementById(id)));
    rewriteText(document.querySelector(".controls-hint"));
    rewriteText(document.querySelector("#questionOverlay .eyebrow"));
    removeStudentVotingControls();
  }

  function start() {
    refresh();
    installGameplayAssets();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
