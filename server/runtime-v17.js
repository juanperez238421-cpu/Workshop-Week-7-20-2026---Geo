"use strict";

const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const baseRuntime = require("./runtime-v16.js");

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Triad v17 patch could not find: ${label}`);
  return source.replace(search, replacement);
}

function patchGatewaySource(input) {
  let source = baseRuntime.patchGatewaySource(input);
  source = replaceRequired(
    source,
    'architecture: "secure-teacher-gateway-fluid-projectile-gameplay-v20-and-reporting-v18"',
    'architecture: "one-master-code-nine-isolated-human-vs-bots-channels-v24"',
    "solo-channel gateway architecture label"
  );
  source = replaceRequired(
    source,
    '  "reset_room"\n]);',
    '  "reset_room",\n  "start_channel",\n  "end_channel",\n  "reset_channel"\n]);',
    "protected solo-channel commands"
  );
  return source;
}

function patchServerSource(input) {
  let source = baseRuntime.patchServerSource(input);

  source = replaceRequired(source, "const STATE_RATE = 15;", "const STATE_RATE = 10;", "low-bandwidth 10 Hz snapshots");
  source = replaceRequired(source, "const FULL_TERRITORY_EVERY = 30;", "const FULL_TERRITORY_EVERY = 20;", "two-second full territory recovery");
  source = replaceRequired(source, "const STATIC_META_EVERY = 75;", "const STATIC_META_EVERY = 50;", "five-second static metadata refresh");

  const soloClass = String.raw`

const SOLO_CHANNEL_CAPACITY = 9;
const SOLO_BOTS_PER_CHANNEL = 8;
const SOLO_MASTER_STATE_INTERVAL_MS = 1000;
const SOLO_CHANNEL_LABELS = Object.freeze(["A", "B", "C", "D", "E", "F", "G", "H", "I"]);

class SoloClassroom {
  constructor(code) {
    this.code = code;
    this.phase = "lobby";
    this.registrationLocked = false;
    this.controller = null;
    this.pending = new Map();
    this.channels = new Map();
    this.playerChannel = new Map();
    this.teamColors = randomTeamColors();
    this.teamNames = ["Human Squad A", "Human Squad B", "Human Squad C"];
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
    this.lastMasterStateAt = 0;
    this.aggregateFinalPayloadCache = null;
    this.roundSerial = 0;
    this.tickHandle = setInterval(() => this.tick(), 250);
  }

  publicStatus() {
    const channels = this.channelSummaries(false);
    return {
      roomCode: this.code,
      phase: this.phase,
      approved: channels.length,
      realPcGroups: channels.length,
      bots: channels.length * SOLO_BOTS_PER_CHANNEL,
      connected: channels.filter((channel) => channel.connected).length,
      pending: this.pending.size,
      controllerConnected: Boolean(this.controller?.connected),
      registrationLocked: this.registrationLocked,
      architecture: "nine-isolated-human-vs-bots-channels",
      channels: channels.map((channel) => ({ channelNumber: channel.channelNumber, phase: channel.phase, connected: channel.connected }))
    };
  }

  destroy() {
    clearInterval(this.tickHandle);
    for (const channel of this.channels.values()) {
      try { channel.room.destroy(); } catch {}
    }
    rooms.delete(this.code);
  }

  attachController(ws, reconnectToken = null) {
    if (this.controller && reconnectToken !== this.controller.token) throw new Error("This room already has a teacher controller. Use RESTORE PREVIOUS CONTROL.");
    if (!this.controller) this.controller = { token: id("master"), ws, connected: true, disconnectedAt: null };
    else Object.assign(this.controller, { ws, connected: true, disconnectedAt: null });
    ws.role = "controller";
    ws.roomCode = this.code;
    this.updatedAt = Date.now();
    safeSend(ws, {
      type: "controller_joined",
      protocol: PROTOCOL,
      roomCode: this.code,
      masterToken: this.controller.token,
      arena: ARENA,
      matchDurationMs: MATCH_DURATION_MS,
      reconnected: Boolean(reconnectToken),
      soloChannels: true,
      channelCapacity: SOLO_CHANNEL_CAPACITY,
      botsPerChannel: SOLO_BOTS_PER_CHANNEL,
      snapshotHz: STATE_RATE
    });
    this.sendLobby();
    if (this.phase === "ended" && this.aggregateFinalPayloadCache) safeSend(ws, this.aggregateFinalPayloadCache);
  }

  realEntries() {
    const entries = [];
    for (const [channelNumber, channel] of this.channels) {
      const player = [...channel.room.players.values()].find((candidate) => !candidate.isBot) || null;
      if (player) entries.push({ channelNumber, channel, player });
    }
    return entries.sort((a, b) => a.channelNumber - b.channelNumber);
  }

  duplicateRegistration(pcLabel, students) {
    const current = [
      ...this.pending.values(),
      ...this.realEntries().map((entry) => entry.player)
    ];
    const labels = current.map((item) => String(item.pcLabel || "").toLowerCase());
    if (labels.includes(String(pcLabel).toLowerCase())) return "That PC/group label is already registered.";
    const existing = new Set(current.flatMap((item) => (item.students || []).map((name) => String(name).toLowerCase())));
    const duplicate = students.find((name) => existing.has(String(name).toLowerCase()));
    return duplicate ? `${duplicate} is already registered in this classroom room.` : null;
  }

  nextOpenChannelNumber() {
    for (let channelNumber = 1; channelNumber <= SOLO_CHANNEL_CAPACITY; channelNumber += 1) {
      if (!this.channels.has(channelNumber)) return channelNumber;
    }
    return 0;
  }

  registerStudent(ws, message) {
    if (this.registrationLocked) throw new Error("The teacher has locked registration.");
    if (this.channels.size + this.pending.size >= SOLO_CHANNEL_CAPACITY) throw new Error("All nine isolated PC channels are already assigned or pending.");
    if (this.pending.size >= MAX_PENDING) throw new Error("The registration queue is full.");
    const students = parseStudentNames(message.students);
    const queueNumber = this.channels.size + this.pending.size + 1;
    const requestedLabel = sanitizeText(message.pcLabel, "", 24);
    const pcLabel = /^AUTO$|^Assigned/i.test(requestedLabel) || requestedLabel.length < 2 ? `PC Team ${queueNumber}` : assertSafeName(requestedLabel, "PC/group label", 2, 24);
    const duplicate = this.duplicateRegistration(pcLabel, students);
    if (duplicate) throw new Error(duplicate);
    const registrationId = id("reg");
    const token = id("student");
    const registration = {
      id: registrationId,
      token,
      ws,
      pcLabel,
      students,
      preferredTeam: [0, 1, 2].includes(Number(message.preferredTeam)) ? Number(message.preferredTeam) : 0,
      connected: true,
      createdAt: Date.now()
    };
    this.pending.set(registrationId, registration);
    ws.role = "pending";
    ws.registrationId = registrationId;
    ws.roomCode = this.code;
    this.updatedAt = Date.now();
    safeSend(ws, {
      type: "registration_received",
      protocol: PROTOCOL,
      roomCode: this.code,
      registrationId,
      sessionToken: token,
      pcLabel,
      students,
      soloChannels: true
    });
    this.sendLobby();
  }

  reconnectStudent(ws, token) {
    const pending = [...this.pending.values()].find((item) => item.token === token);
    if (pending) {
      pending.ws = ws;
      pending.connected = true;
      ws.role = "pending";
      ws.registrationId = pending.id;
      ws.roomCode = this.code;
      safeSend(ws, {
        type: "registration_received",
        protocol: PROTOCOL,
        roomCode: this.code,
        registrationId: pending.id,
        sessionToken: pending.token,
        pcLabel: pending.pcLabel,
        students: pending.students,
        reconnected: true,
        soloChannels: true
      });
      this.sendLobby();
      return;
    }

    const entry = this.realEntries().find(({ player }) => player.token === token);
    if (!entry) throw new Error("The previous isolated PC-channel session could not be restored.");
    const { channelNumber, channel, player } = entry;
    player.ws = ws;
    player.connected = true;
    player.disconnectedAt = null;
    ws.role = "player";
    ws.playerId = player.id;
    ws.roomCode = this.code;
    ws.channelNumber = channelNumber;
    channel.room.sendJoined(player, true);
    if (player.currentQuestion) channel.room.sendQuestion(player);
    this.sendStudentLobby(channelNumber);
    this.sendMasterLobby();
    channel.room.broadcastEvent(`${player.pcLabel} restored channel ${channelNumber}.`);
    if (channel.room.phase === "ended") channel.room.sendFinalTo(ws);
  }

  makeFakeController(channelNumber) {
    return {
      role: "controller",
      readyState: -1,
      bufferedAmount: 0,
      channelNumber,
      send() {},
      close() {}
    };
  }

  configureChannelRoom(channelNumber, room, player) {
    const externalCode = this.code;
    const originalStatePayload = room.statePayload.bind(room);
    const originalReport = room.report.bind(room);
    const originalEndMatch = room.endMatch.bind(room);

    room.channelNumber = channelNumber;
    room.soloClassroomCode = externalCode;
    room._soloControllerSocket = this.makeFakeController(channelNumber);
    room.controller = { token: null, ws: room._soloControllerSocket, connected: false, disconnectedAt: null };

    room.sendJoined = (target, reconnected) => safeSend(target.ws, {
      type: "joined",
      protocol: PROTOCOL,
      roomCode: externalCode,
      playerId: target.id,
      sessionToken: target.token,
      pcLabel: target.pcLabel,
      students: target.students,
      team: target.team,
      ready: target.ready,
      arena: ARENA,
      matchDurationMs: MATCH_DURATION_MS,
      reconnected: Boolean(reconnected),
      soloChannel: true,
      channelNumber,
      channelLabel: SOLO_CHANNEL_LABELS[channelNumber - 1],
      botsInChannel: SOLO_BOTS_PER_CHANNEL,
      snapshotHz: STATE_RATE
    });

    room.statePayload = (now) => {
      const payload = originalStatePayload(now);
      payload.roomCode = externalCode;
      payload.soloChannel = true;
      payload.channelNumber = channelNumber;
      payload.channelLabel = SOLO_CHANNEL_LABELS[channelNumber - 1];
      payload.botsInChannel = SOLO_BOTS_PER_CHANNEL;
      payload.snapshotHz = STATE_RATE;
      return payload;
    };

    room.report = () => {
      const report = originalReport();
      report.roomCode = externalCode;
      report.channelNumber = channelNumber;
      report.channelLabel = SOLO_CHANNEL_LABELS[channelNumber - 1];
      report.soloChannel = true;
      report.botsInChannel = SOLO_BOTS_PER_CHANNEL;
      report.realPlayerId = player.id;
      return report;
    };

    room.sendLobby = () => {
      this.sendStudentLobby(channelNumber);
      this.sendMasterLobby();
    };

    room.endMatch = () => {
      const wasEnded = room.phase === "ended";
      originalEndMatch();
      if (!wasEnded && room.phase === "ended") this.onChannelEnded(channelNumber);
    };
  }

  createChannel(channelNumber, registration, humanTeam) {
    const internalCode = `${this.code}-C${String(channelNumber).padStart(2, "0")}`;
    const room = new Room(internalCode);
    const player = room.makePlayer(registration, humanTeam, false);
    player.ready = false;
    room.players.set(player.id, player);
    this.configureChannelRoom(channelNumber, room, player);

    room.controller.connected = true;
    room.addBots(room._soloControllerSocket);
    room.controller.connected = false;
    room.controller.ws = room._soloControllerSocket;

    const botNames = ["AI Geometry", "AI Vector", "AI Thales"];
    room.teamNames = [0, 1, 2].map((team) => team === humanTeam ? `${registration.pcLabel} Squad` : `${botNames[team]} ${SOLO_CHANNEL_LABELS[channelNumber - 1]}`);
    room.teamNamesFinalized = [true, true, true];
    room.registrationLocked = true;

    this.channels.set(channelNumber, {
      channelNumber,
      label: SOLO_CHANNEL_LABELS[channelNumber - 1],
      room,
      humanTeam,
      createdAt: Date.now(),
      endedAt: null,
      reportDelivered: false
    });
    this.playerChannel.set(player.id, channelNumber);
    return { room, player };
  }

  approveRegistration(controllerWs, registrationId, teamValue) {
    this.assertController(controllerWs);
    const registration = this.pending.get(String(registrationId || ""));
    if (!registration) throw new Error("Registration no longer exists.");
    const channelNumber = this.nextOpenChannelNumber();
    if (!channelNumber) throw new Error("All nine isolated channels are already assigned.");
    const requestedTeam = [0, 1, 2].includes(Number(teamValue)) ? Number(teamValue) : (channelNumber - 1) % 3;
    const teamCounts = this.humanTeamCounts();
    const humanTeam = teamCounts[requestedTeam] < 3 ? requestedTeam : teamCounts.indexOf(Math.min(...teamCounts));

    this.pending.delete(registration.id);
    registration.pcLabel = `PC Team ${channelNumber}`;
    const { room, player } = this.createChannel(channelNumber, registration, humanTeam);
    if (player.ws) {
      player.ws.role = "player";
      player.ws.playerId = player.id;
      player.ws.roomCode = this.code;
      player.ws.channelNumber = channelNumber;
      delete player.ws.registrationId;
      room.sendJoined(player, false);
    }
    this.aggregateFinalPayloadCache = null;
    this.updatedAt = Date.now();
    this.sendLobby();
    safeSend(controllerWs, { type: "channel_created", roomCode: this.code, channelNumber, channelLabel: SOLO_CHANNEL_LABELS[channelNumber - 1], playerId: player.id, pcLabel: player.pcLabel });
  }

  rejectRegistration(controllerWs, registrationId) {
    this.assertController(controllerWs);
    const registration = this.pending.get(String(registrationId || ""));
    if (!registration) throw new Error("Registration no longer exists.");
    this.pending.delete(registration.id);
    closeWithMessage(registration.ws, "Registration was declined by the teacher.");
    this.sendLobby();
  }

  movePlayer(controllerWs) {
    this.assertController(controllerWs);
    throw new Error("Each approved PC owns a fixed isolated channel. Remove and re-register the PC to change its channel assignment.");
  }

  removePlayer(controllerWs, playerId) {
    this.assertController(controllerWs);
    const channelNumber = this.playerChannel.get(String(playerId || ""));
    const channel = this.channels.get(channelNumber);
    if (!channel) throw new Error("Isolated channel not found.");
    if (["playing", "countdown"].includes(channel.room.phase)) throw new Error("End this channel before removing its real player.");
    const player = channel.room.players.get(String(playerId));
    this.playerChannel.delete(String(playerId));
    this.channels.delete(channelNumber);
    try { channel.room.destroy(); } catch {}
    closeWithMessage(player?.ws, "You were removed from the classroom room by the teacher.");
    this.aggregateFinalPayloadCache = null;
    this.recomputePhase();
    this.sendLobby();
  }

  setRegistrationLock(controllerWs, locked) {
    this.assertController(controllerWs);
    this.registrationLocked = Boolean(locked);
    this.sendLobby();
  }

  addBots(controllerWs) {
    this.assertController(controllerWs);
    safeSend(controllerWs, { type: "event", text: "Every isolated PC channel already contains eight optimized server bots.", at: Date.now() });
  }

  removeBots(controllerWs) {
    this.assertController(controllerWs);
    throw new Error("Bots are required in isolated-channel mode and cannot be removed.");
  }

  submitTeamProposals() {}
  submitTeamVotes() {}

  setReady(playerId, ready) {
    const channelNumber = this.playerChannel.get(String(playerId || ""));
    const channel = this.channels.get(channelNumber);
    const player = channel?.room.players.get(String(playerId || ""));
    if (!channel || !player || player.isBot || !player.connected || channel.room.phase !== "lobby") return;
    player.ready = Boolean(ready);
    this.sendStudentLobby(channelNumber);
    this.sendMasterLobby();
  }

  assertController(ws) {
    if (!this.controller || this.controller.ws !== ws || ws.role !== "controller") throw new Error("Teacher controller authorization required.");
  }

  humanTeamCounts() {
    const counts = [0, 0, 0];
    for (const { player } of this.realEntries()) counts[player.team] += 1;
    return counts;
  }

  connectedPlayers() {
    return this.realEntries().filter(({ player }) => player.connected).map(({ player }) => player);
  }

  readyPlayers() {
    return this.realEntries().filter(({ player, channel }) => player.connected && player.ready && channel.room.phase === "lobby").map(({ player }) => player);
  }

  startBlockers() {
    const blockers = [];
    if (!this.controller?.connected) blockers.push("teacher controller offline");
    if (!this.readyPlayers().length) blockers.push("at least one connected and ready isolated channel is required");
    return blockers;
  }

  channelLobbySnapshot(channelNumber) {
    const channel = this.channels.get(channelNumber);
    if (!channel) return null;
    const room = channel.room;
    const players = [...room.players.values()].map((player) => ({
      id: player.id,
      pcLabel: player.pcLabel,
      name: player.pcLabel,
      students: player.students,
      team: player.team,
      connected: player.isBot || player.connected,
      ready: player.isBot || player.ready,
      isBot: player.isBot,
      proposalsSubmitted: true,
      votesSubmitted: true
    }));
    const human = players.find((player) => !player.isBot);
    return {
      type: "lobby",
      roomCode: this.code,
      phase: room.phase,
      capacity: 9,
      minPlayersToStart: 1,
      flexibleStart: true,
      studentsPerPc: STUDENTS_PER_PC,
      registrationLocked: true,
      controllerConnected: Boolean(this.controller?.connected),
      teamCounts: room.teamCounts(false),
      connectedTeamCounts: room.teamCounts(true),
      readyCount: human?.ready ? 1 : 0,
      realPcCount: 1,
      botCount: SOLO_BOTS_PER_CHANNEL,
      teamNames: room.teamNames,
      teamColors: room.teamColors,
      teamNaming: [0, 1, 2].map((team) => ({ team, color: room.teamColors[team], name: room.teamNames[team], finalized: true, proposalCount: 0, proposalTarget: 0, voteCount: 0, voteTarget: 0, votingOpen: false, candidates: [] })),
      pending: [],
      players,
      startReady: Boolean(human?.connected && human?.ready && room.phase === "lobby"),
      startBlockers: human?.ready ? [] : ["mark this PC channel ready"],
      soloChannel: true,
      channelNumber,
      channelLabel: channel.label,
      botsInChannel: SOLO_BOTS_PER_CHANNEL
    };
  }

  pendingLobbySnapshot(registration) {
    return {
      type: "lobby",
      roomCode: this.code,
      phase: "lobby",
      capacity: SOLO_CHANNEL_CAPACITY,
      studentsPerPc: STUDENTS_PER_PC,
      registrationLocked: this.registrationLocked,
      controllerConnected: Boolean(this.controller?.connected),
      teamCounts: this.humanTeamCounts(),
      connectedTeamCounts: this.humanTeamCounts(),
      readyCount: this.readyPlayers().length,
      realPcCount: this.channels.size,
      botCount: this.channels.size * SOLO_BOTS_PER_CHANNEL,
      teamNames: this.teamNames,
      teamColors: this.teamColors,
      teamNaming: [0, 1, 2].map((team) => ({ team, color: this.teamColors[team], name: this.teamNames[team], finalized: true, proposalCount: 0, proposalTarget: 0, voteCount: 0, voteTarget: 0, votingOpen: false, candidates: [] })),
      pending: registration ? [{ id: registration.id, pcLabel: registration.pcLabel, students: registration.students, connected: registration.connected, createdAt: registration.createdAt }] : [],
      players: [],
      startReady: false,
      startBlockers: ["waiting for teacher approval"],
      soloChannels: true,
      channelCapacity: SOLO_CHANNEL_CAPACITY
    };
  }

  channelSummaries(includePrivate = true) {
    return this.realEntries().map(({ channelNumber, channel, player }) => {
      const room = channel.room;
      const scores = room.teamScoreSnapshot();
      const score = scores.find((entry) => entry.team === player.team) || null;
      const territory = room.playerTerritoryCounts().get(player.id) || 0;
      return {
        channelNumber,
        channelLabel: channel.label,
        playerId: player.id,
        pcLabel: player.pcLabel,
        students: includePrivate ? player.students : undefined,
        humanTeam: player.team,
        teamName: room.teamNames[player.team],
        teamColor: room.teamColors[player.team],
        phase: room.phase,
        connected: Boolean(player.connected),
        ready: Boolean(player.ready),
        alive: Boolean(player.alive),
        remainingMs: room.phase === "playing" ? Math.max(0, room.endsAt - Date.now()) : MATCH_DURATION_MS,
        territory,
        kills: Number(player.kills) || 0,
        deaths: Number(player.deaths) || 0,
        correct: Number(player.questionStats?.correct) || 0,
        wrong: Number(player.questionStats?.wrong) || 0,
        timeouts: Number(player.questionStats?.timeouts) || 0,
        attempts: Number(player.questionStats?.attempts) || 0,
        groupScore: score?.score ?? GROUP_SCORE_MIN,
        teamRank: score?.rank ?? 3,
        wrongAnswerPenalty: score?.wrongPenalty ?? 0,
        bots: SOLO_BOTS_PER_CHANNEL
      };
    });
  }

  masterTeamScoreSnapshot(channels) {
    return [0, 1, 2].map((team) => {
      const members = channels.filter((channel) => channel.humanTeam === team);
      const territory = members.reduce((sum, channel) => sum + channel.territory, 0);
      const eliminations = members.reduce((sum, channel) => sum + channel.kills, 0);
      const correct = members.reduce((sum, channel) => sum + channel.correct, 0);
      const wrong = members.reduce((sum, channel) => sum + channel.wrong, 0);
      const score = members.length ? members.reduce((sum, channel) => sum + channel.groupScore, 0) / members.length : GROUP_SCORE_MIN;
      return { team, name: this.teamNames[team], color: this.teamColors[team], territory, eliminations, correct, wrong, score: Math.round(score * 100) / 100, rank: team + 1, baseScore: score, wrongPenalty: members.reduce((sum, channel) => sum + channel.wrongAnswerPenalty, 0), realPlayers: members.length, totalPlayers: members.length };
    });
  }

  lobbySnapshot() {
    const channels = this.channelSummaries(true);
    const players = channels.map((channel) => ({
      id: channel.playerId,
      pcLabel: channel.pcLabel,
      name: channel.pcLabel,
      students: channel.students,
      team: channel.humanTeam,
      connected: channel.connected,
      ready: channel.ready,
      isBot: false,
      proposalsSubmitted: true,
      votesSubmitted: true,
      channelNumber: channel.channelNumber,
      channelLabel: channel.channelLabel,
      groupScore: channel.groupScore,
      teamRank: channel.teamRank
    }));
    const blockers = this.startBlockers();
    return {
      type: "lobby",
      roomCode: this.code,
      phase: this.phase,
      capacity: SOLO_CHANNEL_CAPACITY,
      minPlayersToStart: 1,
      flexibleStart: true,
      studentsPerPc: STUDENTS_PER_PC,
      registrationLocked: this.registrationLocked,
      controllerConnected: Boolean(this.controller?.connected),
      teamCounts: this.humanTeamCounts(),
      connectedTeamCounts: this.humanTeamCounts(),
      readyCount: channels.filter((channel) => channel.connected && channel.ready && channel.phase === "lobby").length,
      realPcCount: channels.length,
      botCount: channels.length * SOLO_BOTS_PER_CHANNEL,
      channelBotCount: channels.length * SOLO_BOTS_PER_CHANNEL,
      teamNames: this.teamNames,
      teamColors: this.teamColors,
      teamNaming: [0, 1, 2].map((team) => ({ team, color: this.teamColors[team], name: this.teamNames[team], finalized: true, proposalCount: 0, proposalTarget: 0, voteCount: 0, voteTarget: 0, votingOpen: false, candidates: [] })),
      pending: [...this.pending.values()].map((item) => ({ id: item.id, pcLabel: item.pcLabel, students: item.students, preferredTeam: item.preferredTeam, connected: item.connected, createdAt: item.createdAt })),
      players,
      channels,
      startReady: blockers.length === 0,
      startBlockers: blockers,
      soloChannels: true,
      channelCapacity: SOLO_CHANNEL_CAPACITY,
      botsPerChannel: SOLO_BOTS_PER_CHANNEL,
      snapshotHz: STATE_RATE,
      architecture: "one-human-plus-eight-bots-per-isolated-channel"
    };
  }

  sendStudentLobby(channelNumber) {
    const channel = this.channels.get(channelNumber);
    const player = channel ? [...channel.room.players.values()].find((candidate) => !candidate.isBot) : null;
    if (player?.ws) safeSend(player.ws, this.channelLobbySnapshot(channelNumber));
  }

  sendMasterLobby() {
    if (this.controller?.connected && this.controller.ws) safeSend(this.controller.ws, this.lobbySnapshot());
  }

  sendLobby() {
    this.recomputePhase();
    this.sendMasterLobby();
    for (const registration of this.pending.values()) if (registration.ws) safeSend(registration.ws, this.pendingLobbySnapshot(registration));
    for (const channelNumber of this.channels.keys()) this.sendStudentLobby(channelNumber);
  }

  startChannelInternal(channelNumber) {
    const channel = this.channels.get(channelNumber);
    if (!channel) throw new Error("Isolated channel not found.");
    const room = channel.room;
    const player = [...room.players.values()].find((candidate) => !candidate.isBot);
    if (room.phase !== "lobby") throw new Error(`Channel ${channelNumber} is not waiting in the lobby.`);
    if (!player?.connected) throw new Error(`Channel ${channelNumber} real player is offline.`);
    if (!player.ready) throw new Error(`Channel ${channelNumber} real player is not ready.`);
    room.controller.ws = room._soloControllerSocket;
    room.controller.connected = true;
    room.start(room._soloControllerSocket);
    room.controller.connected = false;
    this.aggregateFinalPayloadCache = null;
    this.roundSerial += 1;
    this.recomputePhase();
    return channel;
  }

  start(controllerWs) {
    this.assertController(controllerWs);
    const ready = this.realEntries().filter(({ channel, player }) => channel.room.phase === "lobby" && player.connected && player.ready);
    if (!ready.length) throw new Error("No isolated channel is connected and ready.");
    for (const { channelNumber } of ready) this.startChannelInternal(channelNumber);
    this.sendLobby();
    safeSend(controllerWs, { type: "event", text: `${ready.length} isolated human-vs-bots channel(s) started.`, at: Date.now() });
  }

  startChannel(controllerWs, channelNumber) {
    this.assertController(controllerWs);
    this.startChannelInternal(Number(channelNumber));
    this.sendLobby();
  }

  endChannel(controllerWs, channelNumber) {
    this.assertController(controllerWs);
    const channel = this.channels.get(Number(channelNumber));
    if (!channel || !["playing", "countdown"].includes(channel.room.phase)) throw new Error("That isolated channel is not active.");
    channel.room.controller.ws = channel.room._soloControllerSocket;
    channel.room.controller.connected = true;
    channel.room.endEarly(channel.room._soloControllerSocket);
    channel.room.controller.connected = false;
    this.recomputePhase();
    this.sendLobby();
  }

  endEarly(controllerWs) {
    this.assertController(controllerWs);
    const active = [...this.channels.values()].filter((channel) => ["playing", "countdown"].includes(channel.room.phase));
    if (!active.length) throw new Error("There is no active isolated channel to end.");
    for (const channel of active) {
      channel.room.controller.ws = channel.room._soloControllerSocket;
      channel.room.controller.connected = true;
      channel.room.endEarly(channel.room._soloControllerSocket);
      channel.room.controller.connected = false;
    }
    this.recomputePhase();
    this.sendLobby();
  }

  resetChannel(controllerWs, channelNumber) {
    this.assertController(controllerWs);
    const channel = this.channels.get(Number(channelNumber));
    if (!channel || channel.room.phase !== "ended") throw new Error("That isolated channel is not ready to reset.");
    channel.room.controller.ws = channel.room._soloControllerSocket;
    channel.room.controller.connected = true;
    channel.room.reset(channel.room._soloControllerSocket);
    channel.room.controller.connected = false;
    const player = [...channel.room.players.values()].find((candidate) => !candidate.isBot);
    if (player) player.ready = false;
    channel.reportDelivered = false;
    channel.endedAt = null;
    this.aggregateFinalPayloadCache = null;
    this.recomputePhase();
    this.sendLobby();
  }

  reset(controllerWs) {
    this.assertController(controllerWs);
    const ended = [...this.channels.values()].filter((channel) => channel.room.phase === "ended");
    if (!ended.length) throw new Error("No completed isolated channel is available to reset.");
    for (const channel of ended) this.resetChannel(controllerWs, channel.channelNumber);
    this.sendLobby();
  }

  handleInput(playerId, message) {
    const channelNumber = this.playerChannel.get(String(playerId || ""));
    this.channels.get(channelNumber)?.room.handleInput(String(playerId), message);
  }

  handleAnswer(playerId, message) {
    const channelNumber = this.playerChannel.get(String(playerId || ""));
    this.channels.get(channelNumber)?.room.handleAnswer(String(playerId), message);
  }

  sendFullStateTo(ws) {
    if (ws?.role === "controller") {
      safeSend(ws, this.masterStatePayload());
      return;
    }
    const channelNumber = this.playerChannel.get(String(ws?.playerId || ""));
    this.channels.get(channelNumber)?.room.sendFullStateTo(ws);
  }

  masterStatePayload() {
    const channels = this.channelSummaries(true);
    const aggregateScores = this.masterTeamScoreSnapshot(channels);
    const players = channels.map((channel) => ({
      id: channel.playerId,
      name: channel.pcLabel,
      pcLabel: channel.pcLabel,
      students: channel.students,
      team: channel.humanTeam,
      isBot: false,
      connected: channel.connected,
      ready: channel.ready,
      x: 0,
      y: 0,
      angle: 0,
      alive: channel.alive,
      kills: channel.kills,
      deaths: channel.deaths,
      territory: channel.territory,
      questions: channel.attempts,
      accuracy: channel.attempts ? channel.correct / channel.attempts : null,
      groupScore: channel.groupScore,
      teamRank: channel.teamRank,
      wrongAnswerPenalty: channel.wrongAnswerPenalty,
      channelNumber: channel.channelNumber,
      channelLabel: channel.channelLabel
    }));
    const activeRemaining = channels.filter((channel) => ["playing", "countdown"].includes(channel.phase)).map((channel) => channel.remainingMs);
    return {
      type: "state",
      roomCode: this.code,
      phase: this.phase,
      serverNow: Date.now(),
      remainingMs: activeRemaining.length ? Math.max(...activeRemaining) : MATCH_DURATION_MS,
      arena: ARENA,
      teamNames: this.teamNames,
      teamColors: this.teamColors,
      territoryCounts: aggregateScores.map((entry) => entry.territory),
      teamScores: aggregateScores,
      players,
      projectiles: [],
      pickups: [],
      channels,
      soloChannels: true,
      channelCapacity: SOLO_CHANNEL_CAPACITY,
      botsPerChannel: SOLO_BOTS_PER_CHANNEL,
      snapshotHz: STATE_RATE,
      aggregateOnly: true
    };
  }

  aggregateFinalPayload() {
    if (this.aggregateFinalPayloadCache) return this.aggregateFinalPayloadCache;
    const channelReports = [];
    const players = [];
    let latestGlobalScore = null;
    let earliestStart = null;
    let latestEnd = null;
    const aggregateTerritory = [0, 0, 0];

    for (const [channelNumber, channel] of [...this.channels.entries()].sort((a, b) => a[0] - b[0])) {
      if (channel.room.phase !== "ended") continue;
      const complete = channel.room.ensureFinalPayload();
      const report = complete.report;
      const realPlayer = report.players.find((player) => !player.isBot);
      if (realPlayer) {
        players.push({
          ...realPlayer,
          channelNumber,
          channelLabel: channel.label,
          soloChannel: true,
          botsFaced: SOLO_BOTS_PER_CHANNEL,
          channelWinnerTeams: complete.winners,
          groupScore: report.teamScores?.find((entry) => entry.team === realPlayer.team)?.score ?? realPlayer.groupScore ?? GROUP_SCORE_MIN,
          teamRank: report.teamScores?.find((entry) => entry.team === realPlayer.team)?.rank ?? realPlayer.teamRank ?? 3
        });
      }
      for (let team = 0; team < 3; team += 1) aggregateTerritory[team] += Number(report.territoryCounts?.[team]) || 0;
      earliestStart = earliestStart == null ? report.startedAt : Math.min(earliestStart, report.startedAt || earliestStart);
      latestEnd = Math.max(latestEnd || 0, report.endedAt || 0);
      latestGlobalScore = report.globalScore || latestGlobalScore;
      channelReports.push({
        channelNumber,
        channelLabel: channel.label,
        pcLabel: realPlayer?.pcLabel,
        students: realPlayer?.students,
        humanTeam: realPlayer?.team,
        winners: complete.winners,
        teamScores: report.teamScores,
        territoryCounts: report.territoryCounts,
        startedAt: report.startedAt,
        endedAt: report.endedAt,
        configuredDurationMs: report.configuredDurationMs,
        report
      });
    }

    const teams = this.teamNames.map((name, team) => ({ name, color: this.teamColors[team], team, territory: aggregateTerritory[team] }));
    const report = {
      roomCode: this.code,
      matchId: `solo_${this.code}_${Date.now()}`,
      startedAt: earliestStart,
      endedAt: latestEnd || Date.now(),
      matchDurationMs: earliestStart ? (latestEnd || Date.now()) - earliestStart : 0,
      configuredDurationMs: MATCH_DURATION_MS,
      winnerRule: "each-real-pc-is-ranked-inside-its-own-human-vs-eight-bots-channel",
      territoryCounts: aggregateTerritory,
      teamNames: this.teamNames,
      teamColors: this.teamColors,
      teams,
      players,
      channels: channelReports,
      teamScores: this.masterTeamScoreSnapshot(this.channelSummaries(true)),
      groupScoreFormula: GROUP_SCORE_FORMULA,
      globalScore: latestGlobalScore,
      architecture: "one-master-code-nine-independent-channels",
      privacy: "complete-real-player-data-is-sent-only-to-the-authenticated-master",
      metadata: {
        build: "20260723-solo-nine-channels24",
        generatedAt: new Date().toISOString(),
        channelCapacity: SOLO_CHANNEL_CAPACITY,
        completedChannels: channelReports.length,
        botsPerChannel: SOLO_BOTS_PER_CHANNEL,
        snapshotHz: STATE_RATE,
        totalRealPlayers: players.length,
        totalBotsSimulated: channelReports.length * SOLO_BOTS_PER_CHANNEL,
        networkModel: "one-browser-one-channel-one-socket-master-aggregate-at-one-hz",
        groupScoreFormula: GROUP_SCORE_FORMULA
      }
    };
    this.aggregateFinalPayloadCache = { type: "match_ended", winners: [0], report, channels: channelReports, soloChannels: true };
    return this.aggregateFinalPayloadCache;
  }

  onChannelEnded(channelNumber) {
    const channel = this.channels.get(channelNumber);
    if (!channel) return;
    channel.endedAt = Date.now();
    const complete = channel.room.ensureFinalPayload();
    if (!channel.reportDelivered && this.controller?.connected && this.controller.ws) {
      channel.reportDelivered = true;
      safeSend(this.controller.ws, {
        type: "channel_ended",
        roomCode: this.code,
        channelNumber,
        channelLabel: channel.label,
        report: complete.report,
        winners: complete.winners,
        soloChannels: true
      });
    }
    this.aggregateFinalPayloadCache = null;
    this.recomputePhase();
    const allApprovedFinished = this.channels.size > 0 && [...this.channels.values()].every((item) => item.room.phase === "ended");
    if (allApprovedFinished && this.controller?.connected && this.controller.ws) safeSend(this.controller.ws, this.aggregateFinalPayload());
    this.sendLobby();
  }

  recomputePhase() {
    const phases = [...this.channels.values()].map((channel) => channel.room.phase);
    if (phases.some((phase) => phase === "playing")) this.phase = "playing";
    else if (phases.some((phase) => phase === "countdown")) this.phase = "countdown";
    else if (phases.length && phases.every((phase) => phase === "ended")) this.phase = "ended";
    else this.phase = "lobby";
  }

  tick() {
    const now = Date.now();
    this.recomputePhase();
    if (this.controller?.connected && now - this.lastMasterStateAt >= SOLO_MASTER_STATE_INTERVAL_MS) {
      this.lastMasterStateAt = now;
      safeSend(this.controller.ws, this.masterStatePayload());
    }
    if (!this.controller?.connected && this.channels.size === 0 && this.pending.size === 0 && now - this.updatedAt > ROOM_IDLE_TTL_MS) this.destroy();
  }

  disconnect(ws) {
    if (ws.role === "controller" && this.controller?.ws === ws) {
      this.controller.ws = null;
      this.controller.connected = false;
      this.controller.disconnectedAt = Date.now();
      return;
    }
    if (ws.role === "pending" && ws.registrationId) {
      const pending = this.pending.get(ws.registrationId);
      if (!pending || pending.ws !== ws) return;
      pending.connected = false;
      pending.ws = null;
      setTimeout(() => {
        const current = this.pending.get(pending.id);
        if (current && !current.connected) {
          this.pending.delete(current.id);
          this.sendMasterLobby();
        }
      }, RECONNECT_GRACE_MS);
      this.sendMasterLobby();
      return;
    }
    if (ws.role === "player" && ws.playerId) {
      const channelNumber = this.playerChannel.get(String(ws.playerId));
      const channel = this.channels.get(channelNumber);
      if (!channel) return;
      channel.room.disconnect(ws);
      this.sendMasterLobby();
    }
  }
}
`;

  source = replaceRequired(source, "\nfunction roomFromMessage(message)", `${soloClass}\nfunction roomFromMessage(message)`, "solo classroom insertion");
  source = replaceRequired(source, "const room = new Room(code); rooms.set(code, room);", "const room = new SoloClassroom(code); rooms.set(code, room);", "solo classroom room creation");
  source = replaceRequired(
    source,
    '  case "start_match": rooms.get(ws.roomCode)?.start(ws); break;',
    '  case "start_match": rooms.get(ws.roomCode)?.start(ws); break;\n  case "start_channel": rooms.get(ws.roomCode)?.startChannel(ws, message.channelNumber); break;\n  case "end_channel": rooms.get(ws.roomCode)?.endChannel(ws, message.channelNumber); break;\n  case "reset_channel": rooms.get(ws.roomCode)?.resetChannel(ws, message.channelNumber); break;',
    "solo channel message routing"
  );
  source = source.replaceAll("teacher-controller-nine-pc-groups-voting-and-ai", "one-master-code-nine-isolated-human-vs-bots-channels-v24");

  return source;
}

const currentNodeOptions = String(process.env.NODE_OPTIONS || "");
if (!currentNodeOptions.includes("runtime-v17.js")) process.env.NODE_OPTIONS = `${currentNodeOptions} --require=${__filename}`.trim();

const inheritedLoader = Module._extensions[".js"];
Module._extensions[".js"] = function triadV17Loader(module, filename) {
  if (path.dirname(filename) === __dirname && path.basename(filename) === "server-v3.js") {
    module._compile(patchServerSource(fs.readFileSync(filename, "utf8")), filename);
    return;
  }
  if (path.dirname(filename) === __dirname && path.basename(filename) === "secure-gateway.js") {
    module._compile(patchGatewaySource(fs.readFileSync(filename, "utf8")), filename);
    return;
  }
  inheritedLoader(module, filename);
};

module.exports = { patchGatewaySource, patchServerSource };
