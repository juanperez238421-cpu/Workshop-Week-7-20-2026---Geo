(() => {
  "use strict";

  if (typeof WebSocket === "undefined" || !document.getElementById("teacherApp")) return;

  const BUILD = "20260727-clean-player27";
  const CHANNEL_CAPACITY = 9;
  const DEFAULT_BOTS = 5;
  const observedSockets = new WeakSet();
  const inheritedSend = WebSocket.prototype.send;
  const inheritedAddEventListener = WebSocket.prototype.addEventListener;

  const state = {
    socket: null,
    roomCode: "",
    channels: [],
    pending: [],
    phase: "lobby",
    completedReports: new Map(),
    lastMessageAt: 0
  };

  const byId = (id) => document.getElementById(id);

  function parse(value) {
    if (typeof value !== "string") return null;
    try { return JSON.parse(value); } catch { return null; }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  }

  function setText(id, value) {
    const element = byId(id);
    if (element && element.textContent !== String(value)) element.textContent = String(value);
  }

  function formatClock(milliseconds) {
    const seconds = Math.max(0, Math.ceil((Number(milliseconds) || 0) / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function botCount(channel) {
    const value = Number(channel?.bots);
    return Number.isFinite(value) && value >= 0 ? value : DEFAULT_BOTS;
  }

  function ensureDashboard() {
    let section = byId("soloChannelDashboardV27");
    if (section) return section;
    const controlPanel = byId("controlPanel");
    if (!controlPanel) return null;

    document.querySelectorAll("#soloChannelDashboardV24").forEach((node) => node.remove());

    section = document.createElement("section");
    section.id = "soloChannelDashboardV27";
    section.className = "master-card solo-channel-dashboard-v24";
    section.innerHTML = `
      <div class="section-heading solo-channel-heading-v24">
        <div>
          <p class="eyebrow">CLEAN PLAYER V27 · ONE MASTER PIN · NINE ISOLATED GAMES</p>
          <h2>Independent classroom channels</h2>
          <p>Each approved computer receives one human player and five balanced bots. Channels start, finish, reconnect and reset independently.</p>
        </div>
        <div class="solo-channel-actions-v24">
          <button id="soloStartAllApprovedV27" class="primary-button" type="button">START ALL APPROVED CHANNELS</button>
          <button id="soloEndAllActiveV27" class="danger-button" type="button">END ALL ACTIVE</button>
        </div>
      </div>
      <div class="solo-channel-summary-v24">
        <div><span>ROOM PIN</span><strong id="soloRoomCodeV27">------</strong></div>
        <div><span>REAL PCs</span><strong id="soloRealCountV27">0 / 9</strong></div>
        <div><span>SERVER BOTS</span><strong id="soloBotCountV27">0</strong></div>
        <div><span>ACTIVE</span><strong id="soloActiveCountV27">0</strong></div>
        <div><span>COMPLETED</span><strong id="soloCompletedCountV27">0</strong></div>
        <div><span>NETWORK</span><strong id="soloNetworkModeV27">10 Hz / CHANNEL</strong></div>
      </div>
      <div id="soloChannelGridV27" class="solo-channel-grid-v24"></div>
      <p id="soloChannelStatusV27" class="notice">Create the Master room and approve computer registrations.</p>
    `;

    const inbox = byId("registrationInbox");
    if (inbox?.nextSibling) controlPanel.insertBefore(section, inbox.nextSibling);
    else controlPanel.prepend(section);

    byId("soloStartAllApprovedV27")?.addEventListener("click", () => send({ type: "start_match" }));
    byId("soloEndAllActiveV27")?.addEventListener("click", () => {
      if (confirm("End every active channel?")) send({ type: "end_match" });
    });

    document.querySelector(".ai-control-card")?.classList.add("solo-hidden-legacy-v24");
    byId("masterLiveGamePanel")?.classList.add("solo-hidden-legacy-v24");
    return section;
  }

  function setStatus(value, error = false) {
    const element = byId("soloChannelStatusV27");
    if (!element) return;
    element.textContent = value;
    element.style.borderLeftColor = error ? "#b42318" : "#067647";
  }

  function send(message) {
    const socket = state.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setStatus("Master connection is not ready.", true);
      return false;
    }
    try {
      socket.send(JSON.stringify(message));
      return true;
    } catch {
      setStatus("The command could not be sent.", true);
      return false;
    }
  }

  function phaseLabel(channel) {
    if (!channel) return "OPEN SLOT";
    if (channel.phase === "countdown") return "COUNTDOWN";
    if (channel.phase === "playing") return "PLAYING";
    if (channel.phase === "ended") return "COMPLETED";
    if (!channel.connected) return "OFFLINE";
    return "STARTABLE";
  }

  function phaseClass(channel) {
    if (!channel) return "empty";
    if (!channel.connected) return "offline";
    if (channel.phase === "playing" || channel.phase === "countdown") return "active";
    if (channel.phase === "ended") return "ended";
    return "ready";
  }

  function emptyCard(channelNumber) {
    return `<article class="solo-channel-card-v24 empty" data-channel="${channelNumber}">
      <header><span>CHANNEL ${channelNumber}</span><b>OPEN SLOT</b></header>
      <div class="solo-empty-channel-v24"><strong>Waiting for approval</strong><small>The next approved computer receives this channel and five bots.</small></div>
    </article>`;
  }

  function channelCard(channelNumber) {
    const channel = state.channels.find((item) => Number(item.channelNumber) === channelNumber);
    if (!channel) return emptyCard(channelNumber);

    const canStart = channel.phase === "lobby" && channel.connected;
    const canEnd = channel.phase === "playing" || channel.phase === "countdown";
    const canReset = channel.phase === "ended";
    const names = Array.isArray(channel.students) ? channel.students.join(" · ") : "Student names unavailable";

    return `<article class="solo-channel-card-v24 ${phaseClass(channel)}" data-channel="${channelNumber}" style="--channel-color:${escapeHtml(channel.teamColor || "#344054")}">
      <header>
        <div><span>CHANNEL ${channelNumber}${channel.channelLabel ? ` · ${escapeHtml(channel.channelLabel)}` : ""}</span><strong>${escapeHtml(channel.pcLabel || `PC Team ${channelNumber}`)}</strong></div>
        <b>${phaseLabel(channel)}</b>
      </header>
      <p class="solo-channel-students-v24">${escapeHtml(names)}</p>
      <div class="solo-channel-metrics-v24">
        <div><span>SCORE</span><strong>${Number(channel.groupScore ?? 2.5).toFixed(2)}</strong></div>
        <div><span>RANK</span><strong>#${Number(channel.teamRank || 3)}</strong></div>
        <div><span>AREA</span><strong>${Number(channel.territory || 0)}</strong></div>
        <div><span>KOs</span><strong>${Number(channel.kills || 0)}</strong></div>
        <div><span>DEATHS</span><strong>${Number(channel.deaths || 0)}</strong></div>
        <div><span>CORRECT</span><strong>${Number(channel.correct || 0)}</strong></div>
        <div><span>WRONG</span><strong>${Number(channel.wrong || 0)}</strong></div>
        <div><span>TIME</span><strong>${formatClock(channel.remainingMs)}</strong></div>
      </div>
      <div class="solo-channel-meta-v24"><span>${channel.connected ? "ONLINE" : "OFFLINE"}</span><span>1 HUMAN + ${botCount(channel)} BOTS</span><span>10 Hz</span></div>
      <div class="solo-channel-buttons-v24">
        <button class="primary-button solo-start-channel-v27" type="button" ${canStart ? "" : "disabled"}>START</button>
        <button class="danger-button solo-end-channel-v27" type="button" ${canEnd ? "" : "disabled"}>END</button>
        <button class="secondary-button solo-reset-channel-v27" type="button" ${canReset ? "" : "disabled"}>RESET</button>
      </div>
    </article>`;
  }

  function normalizeStaticText() {
    const topbarText = document.querySelector(".master-topbar > div:first-child > span");
    if (topbarText) topbarText.textContent = "One Master PIN · up to nine independent 1-human + 5-bot channels · clean student HUD · individual reports";
    const eyebrow = document.querySelector(".master-topbar .eyebrow");
    if (eyebrow) eyebrow.textContent = "SECURE CLASSROOM CONTROL · CLEAN PLAYER V27 · PRIVATE REPORTING";
    const setupText = document.querySelector("#setupPanel .section-heading p");
    if (setupText) setupText.textContent = "Create one room PIN. Approve up to nine computers; every approved computer receives a separate ten-minute match against five bots.";
  }

  function render() {
    const dashboard = ensureDashboard();
    if (!dashboard) return;
    normalizeStaticText();

    const grid = byId("soloChannelGridV27");
    if (!grid) return;
    grid.innerHTML = Array.from({ length: CHANNEL_CAPACITY }, (_, index) => channelCard(index + 1)).join("");

    grid.querySelectorAll(".solo-channel-card-v24[data-channel]").forEach((card) => {
      const channelNumber = Number(card.dataset.channel);
      card.querySelector(".solo-start-channel-v27")?.addEventListener("click", () => send({ type: "start_channel", channelNumber }));
      card.querySelector(".solo-end-channel-v27")?.addEventListener("click", () => {
        if (confirm(`End Channel ${channelNumber}?`)) send({ type: "end_channel", channelNumber });
      });
      card.querySelector(".solo-reset-channel-v27")?.addEventListener("click", () => send({ type: "reset_channel", channelNumber }));
    });

    const active = state.channels.filter((channel) => channel.phase === "playing" || channel.phase === "countdown").length;
    const completed = state.channels.filter((channel) => channel.phase === "ended").length;
    const connected = state.channels.filter((channel) => channel.connected).length;
    const startable = state.channels.filter((channel) => channel.connected && channel.phase === "lobby").length;
    const bots = state.channels.reduce((sum, channel) => sum + botCount(channel), 0);

    setText("soloRoomCodeV27", state.roomCode || "------");
    setText("soloRealCountV27", `${state.channels.length} / ${CHANNEL_CAPACITY}`);
    setText("soloBotCountV27", bots);
    setText("soloActiveCountV27", active);
    setText("soloCompletedCountV27", completed);
    setText("approvedCount", `${state.channels.length} / ${CHANNEL_CAPACITY} CHANNELS`);
    setText("approvedDetail", `${connected} online · ${startable} startable`);
    setText("realPcCount", state.channels.length);
    setText("botCount", bots);
    setText("botCountSummary", `${bots} AI active · ${CHANNEL_CAPACITY - state.channels.length} open channels`);
    setText("playerListSummary", `${state.channels.length}/${CHANNEL_CAPACITY} real PC channels · ${bots} automatic bots`);

    const globalStart = byId("soloStartAllApprovedV27");
    if (globalStart) {
      globalStart.disabled = startable === 0;
      globalStart.textContent = startable ? `START ${startable} APPROVED CHANNEL${startable === 1 ? "" : "S"}` : "NO STARTABLE CHANNELS";
    }

    setStatus(`${state.channels.length} assigned · ${connected} online · ${active} active · ${completed} completed`);
  }

  function handleMessage(message) {
    if (!message || typeof message !== "object") return;
    state.lastMessageAt = Date.now();
    if (message.roomCode) state.roomCode = String(message.roomCode);

    if (message.type === "controller_joined" && message.soloChannels) {
      ensureDashboard();
      setStatus(`Master control ready for ${message.channelCapacity || CHANNEL_CAPACITY} channels.`);
      return;
    }

    if ((message.type === "lobby" || message.type === "state") && message.soloChannels) {
      state.phase = String(message.phase || state.phase);
      if (Array.isArray(message.channels)) state.channels = message.channels;
      if (Array.isArray(message.pending)) state.pending = message.pending;
      render();
      return;
    }

    if (message.type === "channel_created") {
      setStatus(`Channel ${message.channelNumber} approved for ${message.pcLabel}. Five bots were added.`);
      return;
    }

    if (message.type === "channel_ended") {
      state.completedReports.set(Number(message.channelNumber), message.report);
      setStatus(`Channel ${message.channelNumber} completed. Its private report is stored.`);
      return;
    }

    if (message.type === "match_ended" && message.soloChannels) {
      setStatus("All approved channels completed. Final exports are ready.");
    }
  }

  function observe(socket) {
    if (!socket || observedSockets.has(socket)) return;
    observedSockets.add(socket);
    inheritedAddEventListener.call(socket, "message", (event) => handleMessage(parse(event.data)));
  }

  WebSocket.prototype.addEventListener = function cleanSoloV27AddEventListener(type, listener, options) {
    if (type === "message") observe(this);
    return inheritedAddEventListener.call(this, type, listener, options);
  };

  WebSocket.prototype.send = function cleanSoloV27Send(payload) {
    const message = parse(payload);
    if (message && [
      "create_control_room", "restore_control", "approve_registration", "reject_registration",
      "start_match", "start_channel", "end_channel", "reset_channel", "reset_room"
    ].includes(message.type)) {
      state.socket = this;
      observe(this);
    }
    return inheritedSend.call(this, payload);
  };

  ensureDashboard();
  normalizeStaticText();

  window.__triadSoloChannelsV27 = Object.freeze({
    build: BUILD,
    oneMasterCode: true,
    channelCapacity: CHANNEL_CAPACITY,
    humansPerChannel: 1,
    botsPerChannel: DEFAULT_BOTS,
    playerReadyRequired: false,
    studentSnapshotHz: 10,
    masterAggregateHz: 1,
    opensAdditionalSocket: false,
    getCompletedChannelCount: () => state.completedReports.size
  });
})();
