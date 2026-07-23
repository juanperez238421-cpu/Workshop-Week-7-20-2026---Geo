"use strict";

const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const baseRuntime = require("./runtime-v19.js");

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Triad v20 patch could not find: ${label}`);
  return source.replace(search, replacement);
}

function replacePattern(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`Triad v20 patch could not find: ${label}`);
  return source.replace(pattern, replacement);
}

function patchGatewaySource(input) {
  let source = baseRuntime.patchGatewaySource(input);
  source = source.replaceAll("fluid-clean-nine-isolated-channels-v25", "stable-autostart-individual-channels-v26");
  return source;
}

function patchServerSource(input) {
  let source = baseRuntime.patchServerSource(input);

  source = replaceRequired(source, "const SOLO_BOTS_PER_CHANNEL = 8;", "const SOLO_BOTS_PER_CHANNEL = 5;", "five balanced bots per channel");
  source = replaceRequired(source, "const MAX_PROJECTILES = 78;", "const MAX_PROJECTILES = 54;", "smaller projectile ceiling");
  source = replaceRequired(source, "const SOLO_BOT_THINK_INTERVAL_MS = 140;", "const SOLO_BOT_THINK_INTERVAL_MS = 180;", "lower bot decision frequency");
  source = replaceRequired(source, "const SOLO_BOT_SHOOT_RANGE_SQ = 3100 * 3100;", "const SOLO_BOT_SHOOT_RANGE_SQ = 2700 * 2700;", "bounded bot fire range");
  source = replaceRequired(source, "const SOLO_PROJECTILE_STREAM_RADIUS_SQ = 5200 * 5200;", "const SOLO_PROJECTILE_STREAM_RADIUS_SQ = 4600 * 4600;", "smaller useful projectile stream");
  source = replaceRequired(source, "const SOLO_TICK_STAGGER_STEP_MS = Math.max(1, Math.floor((1000 / TICK_RATE) / SOLO_CHANNEL_CAPACITY));", `function createIndividualStudentStats(students) {
  return (Array.isArray(students) ? students : []).map((studentName, studentIndex) => ({
    studentIndex,
    studentName,
    assignedDeaths: 0,
    attempts: 0,
    correct: 0,
    wrong: 0,
    timeouts: 0,
    totalResponseMs: 0,
    answers: []
  }));
}
function publicIndividualStudentStats(player) {
  const rows = Array.isArray(player?.studentStats) ? player.studentStats : createIndividualStudentStats(player?.students);
  return rows.map((row) => ({
    studentIndex: Number(row.studentIndex) || 0,
    studentName: String(row.studentName || ""),
    assignedDeaths: Number(row.assignedDeaths) || 0,
    attempts: Number(row.attempts) || 0,
    correct: Number(row.correct) || 0,
    wrong: Number(row.wrong) || 0,
    timeouts: Number(row.timeouts) || 0,
    averageResponseMs: Number(row.attempts) ? Math.round((Number(row.totalResponseMs) || 0) / Number(row.attempts)) : null,
    accuracy: Number(row.attempts) ? (Number(row.correct) || 0) / Number(row.attempts) : null,
    answers: Array.isArray(row.answers) ? row.answers.slice() : []
  }));
}`, "individual student helpers and native room timer policy");

  source = replaceRequired(
    source,
    `    const room = new Room(internalCode);
    clearInterval(room.tickHandle);
    room.tickHandle = null;
    room._soloTickStartTimer = setTimeout(() => {
      room.tickHandle = setInterval(() => room.tick(), 1000 / TICK_RATE);
    }, Math.max(0, (channelNumber - 1) * SOLO_TICK_STAGGER_STEP_MS));
    const originalRoomDestroy = room.destroy.bind(room);
    room.destroy = () => {
      clearTimeout(room._soloTickStartTimer);
      originalRoomDestroy();
    };`,
    `    const room = new Room(internalCode);`,
    "restore native authoritative room tick"
  );

  source = replaceRequired(
    source,
    `    const player = room.makePlayer(registration, humanTeam, false);
    player.ready = false;`,
    `    const player = room.makePlayer(registration, humanTeam, false);
    player.ready = true;
    player.studentStats = createIndividualStudentStats(player.students);
    player.studentDeathTurn = 0;
    player.currentStudentIndex = null;`,
    "automatic start eligibility and student counters"
  );

  source = replaceRequired(
    source,
    `    room.controller.connected = true;
    room.addBots(room._soloControllerSocket);
    room.controller.connected = false;
    room.controller.ws = room._soloControllerSocket;`,
    `    room.controller.connected = true;
    const targetTeamSize = 2;
    for (const team of [0, 1, 2]) {
      let needed = Math.max(0, targetTeamSize - room.teamCounts(false)[team]);
      while (needed > 0) {
        room.botSerial += 1;
        const serial = room.botSerial;
        const data = {
          pcLabel: "AI Player " + serial,
          students: ["AI " + serial + "-A", "AI " + serial + "-B", "AI " + serial + "-C"]
        };
        const bot = room.makePlayer(data, team, true);
        bot.ready = true;
        room.players.set(bot.id, bot);
        needed -= 1;
      }
    }
    room.controller.connected = false;
    room.controller.ws = room._soloControllerSocket;`,
    "balanced one-human-plus-five-bot construction"
  );

  source = replaceRequired(
    source,
    `  readyPlayers() {
    return this.realEntries().filter(({ player, channel }) => player.connected && player.ready && channel.room.phase === "lobby").map(({ player }) => player);
  }`,
    `  readyPlayers() {
    return this.realEntries().filter(({ player, channel }) => player.connected && channel.room.phase === "lobby").map(({ player }) => player);
  }`,
    "registered player is immediately startable"
  );

  source = replaceRequired(
    source,
    `  setReady(playerId, ready) {
    const channelNumber = this.playerChannel.get(String(playerId || ""));
    const channel = this.channels.get(channelNumber);
    const player = channel?.room.players.get(String(playerId || ""));
    if (!channel || !player || player.isBot || !player.connected || channel.room.phase !== "lobby") return;
    player.ready = Boolean(ready);
    this.sendStudentLobby(channelNumber);
    this.sendMasterLobby();
  }`,
    `  setReady(playerId) {
    const channelNumber = this.playerChannel.get(String(playerId || ""));
    const channel = this.channels.get(channelNumber);
    const player = channel?.room.players.get(String(playerId || ""));
    if (!channel || !player || player.isBot) return;
    player.ready = true;
    this.sendStudentLobby(channelNumber);
    this.sendMasterLobby();
  }`,
    "remove player ready toggle"
  );

  source = replaceRequired(source, `    if (!player.ready) throw new Error("Channel ${channelNumber} real player is not ready.");\n`, "", "remove ready start blocker");
  source = replaceRequired(
    source,
    `    const ready = this.realEntries().filter(({ channel, player }) => channel.room.phase === "lobby" && player.connected && player.ready);
    if (!ready.length) throw new Error("No isolated channel is connected and ready.");`,
    `    const ready = this.realEntries().filter(({ channel, player }) => channel.room.phase === "lobby" && player.connected);
    if (!ready.length) throw new Error("No approved isolated channel is connected.");`,
    "master starts every approved connected channel"
  );
  source = replaceRequired(source, "at least one connected and ready isolated channel is required", "at least one approved connected isolated channel is required", "autostart blocker wording");
  source = replaceRequired(source, "mark this PC channel ready", "wait for the Master to start this approved channel", "student lobby blocker wording");

  source = replaceRequired(
    source,
    `    room.controller.ws = room._soloControllerSocket;
    room.controller.connected = true;
    room.start(room._soloControllerSocket);`,
    `    player.ready = true;
    player.studentStats = createIndividualStudentStats(player.students);
    player.studentDeathTurn = 0;
    player.currentStudentIndex = null;
    room.controller.ws = room._soloControllerSocket;
    room.controller.connected = true;
    room.start(room._soloControllerSocket);`,
    "reset individual counters at authoritative start"
  );

  source = replaceRequired(source, "    if (player) player.ready = false;", `    if (player) {
      player.ready = true;
      player.studentStats = createIndividualStudentStats(player.students);
      player.studentDeathTurn = 0;
      player.currentStudentIndex = null;
    }`, "automatic reset eligibility");
  source = replaceRequired(source, `    player.disconnectedAt = null;\n`, `    player.disconnectedAt = null;
    player.ready = true;
`, "automatic reconnect eligibility");

  source = replaceRequired(
    source,
    "victim.alive = false; victim.deaths += 1; victim.lives = Math.max(0, victim.lives - 1); victim.input = { dx: 0, dy: 0, angle: victim.angle, shoot: false, dash: false };",
    `victim.alive = false; victim.deaths += 1;
    if (!victim.isBot) {
      if (!Array.isArray(victim.studentStats) || victim.studentStats.length !== victim.students.length) victim.studentStats = createIndividualStudentStats(victim.students);
      const studentCount = Math.max(1, victim.studentStats.length);
      const assignedIndex = (Number(victim.studentDeathTurn) || 0) % studentCount;
      victim.studentDeathTurn = assignedIndex + 1;
      victim.currentStudentIndex = assignedIndex;
      const assigned = victim.studentStats[assignedIndex];
      if (assigned) assigned.assignedDeaths = (Number(assigned.assignedDeaths) || 0) + 1;
    }
    victim.lives = Math.max(0, victim.lives - 1); victim.input = { dx: 0, dy: 0, angle: victim.angle, shoot: false, dash: false };`,
    "round-robin individual death attribution"
  );

  source = replacePattern(
    source,
    /  recordAnswer\(player, question, selectedIndex, outcome, elapsedMs\) \{[^\n]+\}/,
    `  recordAnswer(player, question, selectedIndex, outcome, elapsedMs) {
    const stats = player.questionStats;
    stats.attempts += 1;
    if (outcome === "correct") stats.correct += 1;
    if (outcome === "wrong") stats.wrong += 1;
    if (outcome === "timeout") stats.timeouts += 1;
    stats.totalResponseMs += elapsedMs;
    const studentIndex = Number.isInteger(question.assignedStudentIndex) ? question.assignedStudentIndex : 0;
    const studentName = String(question.assignedStudentName || player.students?.[studentIndex] || "Student " + (studentIndex + 1));
    const answer = { questionId: question.id, type: question.type, prompt: question.prompt, options: question.options, selectedIndex, correctIndex: question.answerIndex, outcome, responseMs: elapsedMs, answeredAt: Date.now(), studentIndex, studentName };
    stats.history.push(answer);
    if (!Array.isArray(player.studentStats) || player.studentStats.length !== player.students.length) player.studentStats = createIndividualStudentStats(player.students);
    const individual = player.studentStats[studentIndex];
    if (individual) {
      individual.attempts += 1;
      if (outcome === "correct") individual.correct += 1;
      if (outcome === "wrong") individual.wrong += 1;
      if (outcome === "timeout") individual.timeouts += 1;
      individual.totalResponseMs += elapsedMs;
      individual.answers.push(answer);
    }
  }`,
    "individual answer attribution"
  );

  source = replacePattern(
    source,
    /  assignQuestion\(player, delayMs = 0\) \{[^\n]+\}/,
    `  assignQuestion(player, delayMs = 0) {
    player.currentQuestion = null;
    setTimeout(() => {
      if (this.phase !== "playing" || player.isBot || player.alive || player.respawnAt) return;
      if (!Array.isArray(player.studentStats) || player.studentStats.length !== player.students.length) player.studentStats = createIndividualStudentStats(player.students);
      const studentCount = Math.max(1, player.studentStats.length);
      const assignedIndex = Number.isInteger(player.currentStudentIndex) ? player.currentStudentIndex : ((Number(player.studentDeathTurn) || 0) % studentCount);
      player.currentStudentIndex = assignedIndex;
      const question = createQuestion();
      question.assignedStudentIndex = assignedIndex;
      question.assignedStudentName = String(player.students?.[assignedIndex] || "Student " + (assignedIndex + 1));
      player.currentQuestion = question;
      this.sendQuestion(player);
    }, delayMs);
  }`,
    "stable per-student question assignment"
  );

  source = replacePattern(
    source,
    /  sendQuestion\(player\) \{[^\n]+\}/,
    `  sendQuestion(player) {
    const question = player.currentQuestion;
    if (question) safeSend(player.ws, { type: "question", id: question.id, questionType: question.type, prompt: question.prompt, options: question.options, diagram: question.diagram, expiresAt: question.expiresAt, assignedStudentIndex: question.assignedStudentIndex, assignedStudentName: question.assignedStudentName });
  }`,
    "send assigned student with question"
  );

  source = replaceRequired(
    source,
    "player.x = spawn.x; player.y = spawn.y; player.alive = true; player.respawnAt = 0; player.invulnerableUntil = Date.now() + 1600;",
    "player.x = spawn.x; player.y = spawn.y; player.alive = true; player.respawnAt = 0; if (!player.isBot) player.currentStudentIndex = null; player.invulnerableUntil = Date.now() + 1600;",
    "clear assigned student after respawn"
  );

  source = replaceRequired(
    source,
    "        students: player.isBot ? undefined : player.students,",
    `        students: player.isBot ? undefined : player.students,
        individualStudents: player.isBot ? undefined : publicIndividualStudentStats(player),
        assignedStudentIndex: player.isBot ? undefined : player.currentStudentIndex,`,
    "live individual student telemetry"
  );

  source = replacePattern(
    source,
    /    room\.report = \(\) => \{[\s\S]*?      return report;\n    \};/,
    `    room.report = () => {
      const report = originalReport();
      report.roomCode = externalCode;
      report.channelNumber = channelNumber;
      report.channelLabel = SOLO_CHANNEL_LABELS[channelNumber - 1];
      report.soloChannel = true;
      report.botsInChannel = SOLO_BOTS_PER_CHANNEL;
      report.realPlayerId = player.id;
      const realPlayerReport = report.players.find((entry) => entry.id === player.id) || null;
      const individualStudents = publicIndividualStudentStats(player).map((entry) => ({
        ...entry,
        roomCode: externalCode,
        channelNumber,
        channelLabel: SOLO_CHANNEL_LABELS[channelNumber - 1],
        pcLabel: player.pcLabel,
        team: player.team,
        teamName: room.teamNames[player.team],
        sharedGroupKills: Number(realPlayerReport?.kills) || 0,
        sharedGroupTerritory: Number(realPlayerReport?.territory) || 0,
        sharedShotsFired: Number(realPlayerReport?.shotsFired) || 0,
        sharedShotsHit: Number(realPlayerReport?.shotsHit) || 0,
        groupScore: Number(realPlayerReport?.groupScore) || GROUP_SCORE_MIN,
        teamRank: Number(realPlayerReport?.teamRank) || 3
      }));
      report.individualStudents = individualStudents;
      if (realPlayerReport) realPlayerReport.individualStudents = individualStudents;
      return report;
    };`,
    "private individual student report"
  );

  source = replaceRequired(
    source,
    `        wrongAnswerPenalty: score?.wrongPenalty ?? 0,
        bots: SOLO_BOTS_PER_CHANNEL`,
    `        wrongAnswerPenalty: score?.wrongPenalty ?? 0,
        individualStudents: publicIndividualStudentStats(player),
        bots: SOLO_BOTS_PER_CHANNEL`,
    "master individual telemetry"
  );

  source = replaceRequired(
    source,
    `  case "ping": safeSend(ws, { type: "pong", clientTime: message.clientTime, serverTime: Date.now() }); break;`,
    `  case "request_full_state": rooms.get(ws.roomCode)?.sendFullStateTo(ws); break;
  case "ping": safeSend(ws, { type: "pong", clientTime: message.clientTime, serverTime: Date.now() }); break;`,
    "client full-state recovery request"
  );

  source = source.replaceAll("20260723-fluid-clean25", "20260724-stable-autostart26");
  source = source.replaceAll("fluid-clean-nine-independent-channels-v25", "stable-autostart-individual-channels-v26");
  source = source.replaceAll("fluid-clean-nine-isolated-channels-v25", "stable-autostart-individual-channels-v26");
  source = source.replaceAll("one-human-plus-eight-bots-per-isolated-channel", "one-human-plus-five-bots-per-isolated-channel");
  source = source.replaceAll("eight optimized server bots", "five optimized server bots");
  source = source.replaceAll("eight server bots", "five server bots");
  source = source.replaceAll("8 server bots", "5 server bots");

  return source;
}

const currentNodeOptions = String(process.env.NODE_OPTIONS || "");
if (!currentNodeOptions.includes("runtime-v20.js")) process.env.NODE_OPTIONS = `${currentNodeOptions} --require=${__filename}`.trim();

const inheritedLoader = Module._extensions[".js"];
Module._extensions[".js"] = function triadV20Loader(moduleToLoad, filename) {
  if (path.dirname(filename) === __dirname && path.basename(filename) === "server-v3.js") {
    moduleToLoad._compile(patchServerSource(fs.readFileSync(filename, "utf8")), filename);
    return;
  }
  if (path.dirname(filename) === __dirname && path.basename(filename) === "secure-gateway.js") {
    moduleToLoad._compile(patchGatewaySource(fs.readFileSync(filename, "utf8")), filename);
    return;
  }
  inheritedLoader(moduleToLoad, filename);
};

module.exports = { patchGatewaySource, patchServerSource };
