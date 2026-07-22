(() => {
  "use strict";

  const replacements = [
    ["Three-student registration, voting and simple bots are available.", "Nine PC players, three teams and optional bots are available."],
    ["Teacher approved this PC group. Complete suggestions and voting.", "Teacher approved this PC player. Its music team was assigned automatically."],
    ["Approved · setup incomplete", "Approved · mark ready"],
    ["COMPLETE VOTING FIRST", "MARK THIS PLAYER READY"],
    ["VOTING COMPLETE", "3 TEAMS · 9 PLAYERS"],
    ["team-name voting incomplete", "automatic team names pending"]
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

  function refresh() {
    [
      "serverHealthText",
      "lobbyStatus",
      "playerStateLabel",
      "readyButton",
      "startReadiness",
      "setupStatus"
    ].forEach((id) => rewriteText(document.getElementById(id)));
    removeStudentVotingControls();
  }

  function start() {
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
