(() => {
  "use strict";

  if (typeof WebSocket === "undefined") return;

  const BUILD = "20260723-solo-nine-channels24";
  const observedSockets = new WeakSet();
  const nativeAddEventListener = WebSocket.prototype.addEventListener;
  const nativeSend = WebSocket.prototype.send;
  const state = {
    socket: null,
    roomCode: "",
    channels: [],
    pending: [],
    phase: "lobby",
    completedReports: new Map(),
    lastMessageAt: 0
  };

  function parse(value) {
    if (typeof value !== "string") return null;
    try { return JSON.parse(value); } catch { return null; }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  }

  function ensureDashboard() {
    const existing = document.getElementById("soloChannelDashboardV24");
    if (existing) return existing;
    const controlPanel = document.getElementById("controlPanel");
    if (!controlPanel) return null;

    const section = document.createElement("section");
    section.id = "soloChannelDashboardV24";
    section.className = "master-card solo-channel-dashboard-v24";
    section.innerHTML = `
      <div class="section-heading solo-channel-heading-v24">
        <div>
          <p class="eyebrow">SOLO CHANNELS V24 · ONE MASTER PIN · NINE ISOLATED GAMES</p>
          <h2>Nine independent PC-versus-bots channels</h2>
          <p>Each approved PC receives a private channel with one real player and eight server bots. Channels may start, finish, reconnect and reset independently. The Master receives only a one-hertz aggregate overview instead of nine full arena streams.</p>
        </div>
        <div class="solo-channel-actions-v24">
          <button id="soloStartAllReadyV24" class="primary-button" type="button">START ALL READY CHANNELS</button>
          <button id="soloEndAllActiveV24" class="danger-button" type="button">END ALL ACTIVE</button>
        </div>
      </div>
      <div class="solo-channel-summary-v24">
        <div><span>ROOM PIN</span><strong id="soloRoomCodeV24">------</strong></div>
        <div><span>REAL PCs</span><strong id="soloRealCountV24">0 / 9</strong></div>
        <div><span>SERVER BOTS</span><strong id="soloBotCountV24">0</strong></div>
        <div><span>ACTIVE</span><strong id="soloActiveCountV24">0</strong></div>
        <div><span>COMPLETED</span><strong id="soloCompletedCountV24">0</strong></div>
        <div><span>NETWORK</span><strong id="soloNetworkModeV24">10 Hz / CHANNEL</strong></div>
      </div>
      <div id="soloChannelGridV24" class="solo-channel-grid-v24"></div>
      <p id="soloChannelStatusV24" class="notice">Create the Master room and approve PC registrations. Bots are created automatically inside each isolated channel.</p>
    `;

    const inbox = document.getElementById("registrationInbox");
    if (inbox?.nextSibling) controlPanel.insertBefore(section, inbox.nextSibling);
    else controlPanel.prepend(section);

    document.getElementById("soloStartAllReadyV24")?.addEventListener("click", () => send({ type: "start_match" }));
    document.getElementById("soloEndAllActiveV24")?.addEventListener("click", () => {
      if (confirm("End every currently active isolated channel?")) send({ type: "end_match" });
    });

    const aiCard = document.querySelector(".ai-control-card");
    if (aiCard) aiCard.classList.add("solo-hidden-legacy-v24");
    const arenaPanel = document.getElementById("masterLiveGamePanel");
    if (arenaPanel) arenaPanel.classList.add("solo-hidden-legacy-v24");

    const topbarText = document.querySelector(".master-topbar > div:first-child > span");
    if (topbarText) topbarText.textContent = "One Master PIN · up to nine independent human-vs-eight-bots channels · 10 Hz student snapshots · one-hertz Master aggregate";
    const eyebrow = document.querySelector(".master-topbar .eyebrow");
    if (eyebrow) eyebrow.textContent = "SECURE CLASSROOM CONTROL · SOLO CHANNELS V24 · PRIVATE REPORTING";
    const setupText = document.querySelector("#setupPanel .section-heading p");
    if (setupText) setupText.textContent = "Create one classroom PIN. Approve up to nine PCs; each approved PC receives its own isolated match channel and eight automatic server bots.";
    const structureText = document.querySelector("#controlPanel .master-card:nth-last-of-type(4) .section-heading p");
    if (structureText) structureText.textContent = "Each PC plays independently against eight bots while preserving the same powers, territory, geometry respawns, ten-minute timer and 2.50–5.00 score system.";
    return section;
  }

  function send(message) {
    const socket = state.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setStatus("Master socket is not connected.", true);
      return false;
    }
    try {
      socket.send(JSON.stringify(message));
      return true;
    } catch {
      setStatus("The channel command could not be sent.", true);
      return false;
    }
  }

  function setStatus(text, error = false) {
    const element = document.getElementById("soloChannelStatusV24");
    if (!element) return;
    element.textContent = text;
    element.style.borderLeftColor = error ? "#b42318" : "#067647";
  }

  function phaseLabel(channel) {
    if (!channel) return "OPEN SLOT";
    if (channel.phase === "countdown") return "COUNTDOWN";
    if (channel.phase === "playing") return "PLAYING";
    if (channel.phase === "ended") return "COMPLETED";
    if (!channel.connected) return "OFFLINE";
    return channel.ready ? "READY" : "WAITING";
  }

  function phaseClass(channel) {
    if (!channel) return "empty";
    if (!channel.connected) return "offline";
    if (channel.phase === "playing" || channel.phase === "countdown") return "active";
    if (channel.phase === "ended") return "ended";
    return channel.ready ? "ready" : "waiting";
  }

  function formatClock(milliseconds) {
    const seconds = Math.max(0, Math.ceil((Number(milliseconds) || 0) / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function channelCard(channelNumber) {
    const channel = state.channels.find((item) => Number(item.channelNumber) === channelNumber);
    if (!channel) {
      return `<article class="solo-channel-card-v24 empty" data-channel="${channelNumber}">
        <header><span>CHANNEL ${channelNumber}</span><b>OPEN SLOT</b></header>
        <div class="solo-empty-channel-v24"><strong>Waiting for approval</strong><small>The next approved PC receives this isolated channel and eight bots.</small></div>
      </article>`;
    }

    const canStart = channel.phase === "lobby" && channel.connected && channel.ready;
    const canEnd = channel.phase === "playing" || channel.phase === "countdown";
    const canReset = channel.phase === "ended";
    const names = Array.isArray(channel.students) ? channel.students.join(" · ") : "Master-only names unavailable";
    return `<article class="solo-channel-card-v24 ${phaseClass(channel)}" data-channel="${channelNumber}" style="--channel-color:${escapeHtml(channel.teamColor || "#344054")}">
      <header>
        <div><span>CHANNEL ${channelNumber}${channel.channelLabel ? ` · ${escapeHtml(channel.channelLabel)}` : ""}</span><strong>${escapeHtml(channel.pcLabel || `PC Team ${channelNumber}`)}</strong></div>
        <b>${phaseLabel(channel)}</b>
      </header>
      <p class="solo-channel-students-v24">${escapeHtml(names)}</p>
      <div class="solo-channel-metrics-v24">
        <div><span>SCORE</span><strong>${Number(channel.groupScore ?? 2.5).toFixed(2)}</strong></div>
        <div><span>RANK</span><strong>#${Number(channel.teamRank || 3)}</strong></div>
        <div><span>TERRITORY</span><strong>${Number(channel.territory || 0)}</strong></div>
        <div><span>KILLS</span><strong>${Number(channel.kills || 0)}</strong></div>
        <div><span>DEATHS</span><strong>${Number(channel.deaths || 0)}</strong></div>
        <div><span>CORRECT</span><strong>${Number(channel.correct || 0)}</strong></div>
        <div><span>WRONG</span><strong>${Number(channel.wrong || 0)}</strong></div>
        <div><span>TIME</span><strong>${formatClock(channel.remainingMs)}</strong></div>
      </div>
      <div class="solo-channel-meta-v24"><span>${channel.connected ? "ONLINE" : "OFFLINE"}</span><span>1 HUMAN + ${Number(channel.bots || 8)} BOTS</span><span>10 Hz</span></div>
      <div class="solo-channel-buttons-v24">
        <button class="primary-button solo-start-channel-v24" type="button" ${canStart ? "" : "disabled"}>START</button>
        <button class="danger-button solo-end-channel-v24" type="button" ${canEnd ? "" : "disabled"}>END</button>
        <button class="secondary-button solo-reset-channel-v24" type="button" ${canReset ? "" : "disabled"}>RESET</button>
      </div>
    </article>`;
  }

  function render() {
    const dashboard = ensureDashboard();
    if (!dashboard) return;
    const grid = document.getElementById("soloChannelGridV24");
    if (!grid) return;
    grid.innerHTML = Array.from({ length: 9 }, (_, index) => channelCard(index + 1)).join("");

    grid.querySelectorAll(".solo-channel-card-v24[data-channel]").forEach((card) => {
      const channelNumber = Number(card.dataset.channel);
      card.querySelector(".solo-start-channel-v24")?.addEventListener("click", () => send({ type: "start_channel", channelNumber }));
      card.querySelector(".solo-end-channel-v24")?.addEventListener("click", () => {
        if (confirm(`End isolated channel ${channelNumber}?`)) send({ type: "end_channel", channelNumber });
      });
      card.querySelector(".solo-reset-channel-v24")?.addEventListener("click", () => send({ type: "reset_channel", channelNumber }));
    });

    const active = state.channels.filter((channel) => channel.phase === "playing" || channel.phase === "countdown").length;
    const completed = state.channels.filter((channel) => channel.phase === "ended").length;
    const connected = state.channels.filter((channel) => channel.connected).length;
    const ready = state.channels.filter((channel) => channel.connected && channel.ready && channel.phase === "lobby").length;
    const setText = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
    setText("soloRoomCodeV24", state.roomCode || "------");
    setText("soloRealCountV24", `${state.channels.length} / 9`);
    setText("soloBotCountV24", String(state.channels.length * 8));
    setText("soloActiveCountV24", String(active));
    setText("soloCompletedCountV24", String(completed));
    setText("approvedCount", `${state.channels.length} / 9 CHANNELS`);
    setText("approvedDetail", `${connected} online · ${ready} ready`);
    setText("realPcCount", String(state.channels.length));
    setText("botCount", String(state.channels.length * 8));
    setText("playerListSummary", `${state.channels.length}/9 real PC channels · ${state.channels.length * 8} automatic bots`);

    const fillButton = document.getElementById("fillBotsButton");
    const removeButton = document.getElementById("removeBotsButton");
    if (fillButton) { fillButton.disabled = true; fillButton.textContent = "BOTS ADDED AUTOMATICALLY PER CHANNEL"; }
    if (removeButton) { removeButton.disabled = true; removeButton.textContent = "BOTS REQUIRED IN SOLO MODE"; }
    const globalStart = document.getElementById("startMatchButton");
    if (globalStart) globalStart.textContent = ready ? `START ${ready} READY CHANNEL${ready === 1 ? "" : "S"}` : "WAITING FOR A READY CHANNEL";
    setStatus(`${state.channels.length} isolated channel(s) assigned · ${connected} online · ${active} active · ${completed} completed · Master receives aggregate telemetry only.`);
  }

  function handleMessage(message) {
    if (!message || typeof message !== "object") return;
    state.lastMessageAt = Date.now();
    if (message.roomCode) state.roomCode = message.roomCode;
    if (message.type === "controller_joined" && message.soloChannels) {
      state.roomCode = message.roomCode;
      ensureDashboard();
      setStatus(`Master control restored for ${message.channelCapacity || 9} isolated channels.`);
      return;
    }
    if ((message.type === "lobby" || message.type === "state") && message.soloChannels) {
      state.phase = message.phase || state.phase;
      if (Array.isArray(message.channels)) state.channels = message.channels;
      if (Array.isArray(message.pending)) state.pending = message.pending;
      render();
      return;
    }
    if (message.type === "channel_created") {
      setStatus(`Channel ${message.channelNumber} created for ${message.pcLabel}. Eight bots were added automatically.`);
      return;
    }
    if (message.type === "channel_ended") {
      state.completedReports.set(Number(message.channelNumber), message.report);
      setStatus(`Channel ${message.channelNumber} completed. Its private report is stored on the Master page; combined automatic export occurs when all approved channels finish.`);
      return;
    }
    if (message.type === "match_ended" && message.soloChannels) {
      setStatus(`All ${message.report?.players?.length || 0} approved real PC channel(s) completed. Private JSON and real-player CSV export is being prepared automatically.`);
    }
  }

  function observe(socket) {
    if (!socket || observedSockets.has(socket)) return;
    observedSockets.add(socket);
    nativeAddEventListener.call(socket, "message", (event) => handleMessage(parse(event.data)));
  }

  WebSocket.prototype.addEventListener = function soloChannelsV24AddEventListener(type, listener, options) {
    if (type === "message") observe(this);
    return nativeAddEventListener.call(this, type, listener, options);
  };

  WebSocket.prototype.send = function soloChannelsV24Send(payload) {
    const message = parse(payload);
    if (message && ["create_control_room", "restore_control", "approve_registration", "start_match", "start_channel", "end_channel", "reset_channel"].includes(message.type)) {
      state.socket = this;
      observe(this);
    }
    return nativeSend.call(this, payload);
  };

  ensureDashboard();

  window.__triadSoloChannelsV24 = Object.freeze({
    build: BUILD,
    oneMasterCode: true,
    channelCapacity: 9,
    humansPerChannel: 1,
    botsPerChannel: 8,
    studentSnapshotHz: 10,
    masterAggregateHz: 1,
    opensAdditionalSocket: false,
    getCompletedChannelCount: () => state.completedReports.size
  });
})();
