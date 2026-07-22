(() => {
  "use strict";

  const ASSET_VERSION = "20260722-smooth2";
  const replacements = [
    ["Three-student registration, voting and simple bots are available.", "Nine PC players, three teams and optional bots are available."],
    ["Teacher approved this PC group. Complete suggestions and voting.", "Teacher approved this PC player. Its music team was assigned automatically."],
    ["Approved · setup incomplete", "Approved · mark ready"],
    ["COMPLETE VOTING FIRST", "MARK THIS PLAYER READY"],
    ["VOTING COMPLETE", "3 TEAMS · 9 PLAYERS"],
    ["team-name voting incomplete", "automatic team names pending"],
    ["WASD / arrows move · mouse aims · SPACE fires · SHIFT dashes", "WASD / arrows move · hold RIGHT CLICK to aim · SPACE fires · SHIFT dashes"]
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
      loadScript("gameplay-v5.js", "gameplayV5Script")
        .then(() => loadScript("combat-feed.js", "combatFeedScript"))
        .catch(() => {});
      return;
    }
    loadScript("master-ready-control.js", "masterReadyControlScript")
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
