(() => {
  "use strict";

  if (typeof WebSocket === "undefined") return;
  const BUILD = "20260725-master-corrections27";
  const inheritedSend = WebSocket.prototype.send;
  const observed = new WeakSet();
  let channels = [];

  function parse(value) {
    if (typeof value !== "string") return null;
    try { return JSON.parse(value); } catch { return null; }
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function applyCorrections() {
    const connected = channels.filter((channel) => channel.connected).length;
    const startable = channels.filter((channel) => channel.connected && channel.phase === "lobby").length;
    const active = channels.filter((channel) => channel.phase === "playing" || channel.phase === "countdown").length;
    const completed = channels.filter((channel) => channel.phase === "ended").length;
    const botCount = channels.length * 5;

    setText("soloBotCountV24", String(botCount));
    setText("botCount", String(botCount));
    setText("botCountSummary", `${botCount} AI active · ${Math.max(0, 9 - channels.length)} open channels`);
    setText("approvedDetail", `${connected} online · ${startable} startable`);
    setText("playerListSummary", `${channels.length}/9 real PC channels · ${botCount} automatic bots`);

    const startAll = document.getElementById("soloStartAllReadyV24");
    if (startAll) startAll.textContent = startable ? `START ${startable} CONNECTED CHANNEL${startable === 1 ? "" : "S"}` : "WAITING FOR A CONNECTED CHANNEL";
    const globalStart = document.getElementById("startMatchButton");
    if (globalStart) globalStart.textContent = startable ? `START ${startable} CONNECTED CHANNEL${startable === 1 ? "" : "S"}` : "WAITING FOR AN APPROVED CHANNEL";

    document.querySelectorAll(".solo-empty-channel-v24 small").forEach((element) => {
      element.textContent = "The next approved PC receives this isolated channel and five bots.";
    });
    document.querySelectorAll(".solo-channel-meta-v24 span:nth-child(2)").forEach((element) => {
      element.textContent = element.textContent.replace(/\d+ BOTS/i, "5 BOTS");
    });
    document.querySelectorAll(".solo-channel-card-v24 header > b").forEach((element) => {
      if (element.textContent === "READY" || element.textContent === "WAITING") element.textContent = "STARTABLE";
    });

    const heading = document.querySelector("#soloChannelDashboardV24 .solo-channel-heading-v24 p:not(.eyebrow)");
    if (heading) heading.textContent = "Each approved PC receives a private channel with one real player and five optimized server bots. Approval makes the connected channel immediately startable by the Master.";
    const eyebrow = document.querySelector("#soloChannelDashboardV24 .eyebrow");
    if (eyebrow) eyebrow.textContent = "LOCAL/ONLINE CHANNELS V27 · ONE MASTER PIN · NINE ISOLATED GAMES";
    const status = document.getElementById("soloChannelStatusV24");
    if (status) status.textContent = `${channels.length} channel(s) assigned · ${connected} online · ${active} active · ${completed} completed · five bots per channel.`;
  }

  function handleMessage(message) {
    if (!message || typeof message !== "object") return;
    if ((message.type === "lobby" || message.type === "state") && message.soloChannels && Array.isArray(message.channels)) {
      channels = message.channels;
      queueMicrotask(applyCorrections);
    }
    if (message.type === "channel_created") setTimeout(applyCorrections, 0);
  }

  function observe(socket) {
    if (!socket || observed.has(socket)) return;
    observed.add(socket);
    socket.addEventListener("message", (event) => handleMessage(parse(event.data)));
  }

  WebSocket.prototype.send = function masterV27CorrectionSend(payload) {
    observe(this);
    return inheritedSend.call(this, payload);
  };

  setTimeout(applyCorrections, 0);
  window.__triadMasterCorrectionsV27 = Object.freeze({ build: BUILD, botsPerChannel: 5, readyStepRequired: false });
})();
