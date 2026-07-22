(() => {
  "use strict";

  const CONTROL_TYPES = new Set([
    "create_control_room",
    "restore_control",
    "register_student",
    "reconnect_student",
    "input"
  ]);
  const observedSockets = new WeakSet();
  const currentSend = WebSocket.prototype.send;
  const entries = [];
  let feed = null;

  function ensureStyles() {
    if (document.getElementById("combatFeedStyles")) return;
    const style = document.createElement("style");
    style.id = "combatFeedStyles";
    style.textContent = `
      .kill-feed{position:fixed;top:148px;right:18px;z-index:17;display:grid;gap:7px;width:min(390px,calc(100% - 36px));pointer-events:none}
      .kill-feed-title{justify-self:end;padding:5px 8px;border-radius:999px;background:rgba(16,24,40,.85);color:#fff;font-size:.58rem;font-weight:900;letter-spacing:.09em}
      .kill-feed-list{display:grid;gap:7px}
      .kill-feed-entry{padding:9px 11px;border:1px solid rgba(16,24,40,.14);border-left:5px solid var(--feed-color,#98a2b3);border-radius:11px;background:rgba(255,255,255,.95);color:#101828;font-size:.68rem;font-weight:800;line-height:1.35;box-shadow:0 8px 24px rgba(16,24,40,.1);animation:combatFeedIn 180ms ease-out}
      .master-live-game-card .kill-feed{position:static;width:100%;margin-top:10px;pointer-events:auto}
      .master-live-game-card .kill-feed-title{justify-self:start}
      @keyframes combatFeedIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
      @media(max-width:820px){.kill-feed{top:190px;right:8px;width:min(340px,calc(100% - 16px))}}
    `;
    document.head.appendChild(style);
  }

  function ensureFeed() {
    ensureStyles();
    if (feed?.isConnected) return feed;
    feed = document.createElement("section");
    feed.className = "kill-feed";
    feed.setAttribute("aria-live", "polite");
    feed.innerHTML = '<div class="kill-feed-title">LIVE ELIMINATION FEED</div><div class="kill-feed-list"></div>';
    const masterPanel = document.getElementById("masterLiveGamePanel");
    if (masterPanel) {
      const arena = document.getElementById("masterArenaShell");
      arena?.insertAdjacentElement("afterend", feed);
    } else {
      document.getElementById("app")?.appendChild(feed);
    }
    return feed;
  }

  function colorFor(message) {
    const team = Number(message?.killer?.team);
    const colors = ["#1f77b4", "#d62728", "#2ca02c"];
    return colors[team] || "#98a2b3";
  }

  function addEntry(message) {
    const text = String(message?.text || "").trim();
    if (!text || message.kind !== "elimination") return;
    entries.unshift({ text, color: colorFor(message), at: Date.now() });
    entries.splice(6);
    const root = ensureFeed();
    const list = root.querySelector(".kill-feed-list");
    if (!list) return;
    list.innerHTML = entries.map((entry) => `<article class="kill-feed-entry" style="--feed-color:${entry.color}">${escapeHtml(entry.text)}</article>`).join("");
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function observe(socket) {
    if (!socket || observedSockets.has(socket)) return;
    observedSockets.add(socket);
    socket.addEventListener("message", (event) => {
      try { addEntry(JSON.parse(event.data)); } catch {}
    });
  }

  WebSocket.prototype.send = function combatFeedSend(payload) {
    if (typeof payload === "string") {
      try {
        const message = JSON.parse(payload);
        if (CONTROL_TYPES.has(message.type)) observe(this);
      } catch {}
    }
    return currentSend.call(this, payload);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensureFeed, { once: true });
  else ensureFeed();
})();
