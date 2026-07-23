(() => {
  "use strict";

  const replacements = [
    ["automatic +1 every 10 s", "automatic +1 every 5 s"],
    ["automatic ammo recovery", "automatic ammo recovery every 5 seconds"],
    ["10 s", "5 s"],
    ["10 seconds", "5 seconds"]
  ];

  function rewrite(node) {
    if (!node || typeof node.textContent !== "string") return;
    let next = node.textContent;
    for (const [from, to] of replacements) next = next.replaceAll(from, to);
    if (next !== node.textContent) node.textContent = next;
  }

  function refresh() {
    rewrite(document.getElementById("ammoRegenTimer"));
    rewrite(document.querySelector(".ammo-card small"));
    document.querySelectorAll(".rule-grid span, .rule-grid b, .lead, .approval-note, .master-card p, .master-topbar span").forEach(rewrite);

    const networkCard = document.querySelector(".network-card");
    if (networkCard && !document.getElementById("networkRecoveryMode")) {
      const mode = document.createElement("small");
      mode.id = "networkRecoveryMode";
      mode.textContent = "Soft resync first · reconnect only after recovery fails";
      networkCard.appendChild(mode);
    }
  }

  const observer = new MutationObserver(refresh);
  if (document.documentElement) observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refresh, { once: true });
  else refresh();
})();
