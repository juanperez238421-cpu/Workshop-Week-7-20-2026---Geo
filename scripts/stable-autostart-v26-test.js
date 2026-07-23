"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const runtime = require("../server/runtime-v20.js");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

for (const file of [
  "student-stable-v26.js",
  "master-individual-v26.js",
  "server/runtime-v20.js"
]) new vm.Script(read(file), { filename: file });

const rawServer = read("server/server-v3.js");
const rawGateway = read("server/secure-gateway.js");
const patchedServer = runtime.patchServerSource(rawServer);
const patchedGateway = runtime.patchGatewaySource(rawGateway);
new vm.Script(patchedServer, { filename: "server-v3.stable-autostart-v26.js" });
new vm.Script(patchedGateway, { filename: "secure-gateway.stable-autostart-v26.js" });

for (const marker of [
  "const TICK_RATE = 30;",
  "const STATE_RATE = 10;",
  "const SOLO_BOTS_PER_CHANNEL = 5;",
  "const MAX_PROJECTILES = 54;",
  "const SOLO_BOT_THINK_INTERVAL_MS = 180;",
  "const targetTeamSize = 2;",
  "createIndividualStudentStats",
  "publicIndividualStudentStats",
  "player.ready = true",
  "individualStudents",
  "assignedStudentIndex",
  "assignedStudentName",
  'case "request_full_state"',
  "one-human-plus-five-bots-per-isolated-channel",
  "stable-autostart-individual-channels-v26"
]) assert.ok(patchedServer.includes(marker), `missing stable v26 server marker: ${marker}`);

assert.doesNotMatch(patchedServer, /_soloTickStartTimer/);
assert.doesNotMatch(patchedServer, /clearInterval\(room\.tickHandle\)/);
assert.doesNotMatch(patchedServer, /real player is not ready/);
assert.doesNotMatch(patchedServer, /SOLO_BOTS_PER_CHANNEL = 8/);
assert.match(patchedServer, /const room = new Room\(internalCode\);/);
assert.match(patchedServer, /this\.tickHandle = setInterval\(\(\) => this\.tick\(\), 1000 \/ TICK_RATE\);/);
assert.match(patchedServer, /this\.startedAt = Date\.now\(\); this\.endsAt = this\.startedAt \+ MATCH_DURATION_MS/);
assert.match(patchedServer, /const ready = this\.realEntries\(\)\.filter\(\(\{ channel, player \}\) => channel\.room\.phase === "lobby" && player\.connected\)/);
assert.match(patchedServer, /assignedDeaths = \(Number\(assigned\.assignedDeaths\) \|\| 0\) \+ 1/);
assert.match(patchedServer, /individual\.answers\.push\(answer\)/);
assert.match(patchedServer, /publicIndividualStudentStats\(player, true\)/);
assert.match(patchedGateway, /stable-autostart-individual-channels-v26/);

function makeSocket() {
  return {
    readyState: 1,
    bufferedAmount: 0,
    role: "unassigned",
    messages: [],
    send(payload, options, callback) {
      this.messages.push(typeof payload === "string" ? payload : String(payload));
      if (typeof options === "function") options();
      if (typeof callback === "function") callback();
    },
    close() {},
    terminate() {},
    ping() {},
    on() {}
  };
}

const scheduledTimeouts = [];
const scheduledIntervals = [];
const fakeServer = { on() {}, listen(_port, _host, callback) { callback?.(); }, close(callback) { callback?.(); } };
const fakeApp = { disable() {}, use() {}, get() {} };
function fakeExpress() { return fakeApp; }
fakeExpress.json = () => () => {};
class FakeWss {
  constructor() { this.clients = new Set(); }
  on() {}
  handleUpgrade() {}
}
class FakeWebSocket {}
FakeWebSocket.OPEN = 1;

const runtimeContext = {
  require(name) {
    if (name === "node:crypto") return crypto;
    if (name === "node:fs") return fs;
    if (name === "node:http") return { createServer: () => fakeServer };
    if (name === "node:path") return path;
    if (name === "express") return fakeExpress;
    if (name === "ws") return { WebSocketServer: FakeWss, WebSocket: FakeWebSocket };
    throw new Error(`Unexpected require in v26 runtime test: ${name}`);
  },
  console,
  process: {
    env: { GLOBAL_SCORE_FILE: "/tmp/triad-v26-test-score.json" },
    uptime: () => 1,
    on() {},
    exit() {}
  },
  setInterval(callback, milliseconds) {
    const handle = { callback, milliseconds, active: true, unref() {} };
    scheduledIntervals.push(handle);
    return handle;
  },
  clearInterval(handle) { if (handle) handle.active = false; },
  setTimeout(callback, milliseconds) {
    const handle = { callback, milliseconds, active: true, unref() {} };
    scheduledTimeouts.push(handle);
    return handle;
  },
  clearTimeout(handle) { if (handle) handle.active = false; },
  Map, Set, WeakMap, Date, Math, JSON, String, Number, Boolean, Array, Object, Int8Array, parseInt
};
runtimeContext.globalThis = runtimeContext;
vm.runInNewContext(`${patchedServer}\nglobalThis.__stableV26 = { Room, SoloClassroom };`, runtimeContext, { filename: "server-v3.stable-v26-runtime.js" });

const { SoloClassroom } = runtimeContext.__stableV26;
const classroom = new SoloClassroom("ABC234");
const controller = makeSocket();
classroom.attachController(controller);
const studentSocket = makeSocket();
classroom.registerStudent(studentSocket, { pcLabel: "AUTO", students: ["Ana Torres", "Luis Gómez", "Sara Ruiz"], preferredTeam: 0 });
const registration = [...classroom.pending.values()][0];
assert.ok(registration, "student registration must enter the Master approval queue");
classroom.approveRegistration(controller, registration.id, 0);

const entry = classroom.realEntries()[0];
assert.ok(entry, "approved PC must own one isolated channel");
const { room, player } = entry.channel;
assert.equal(player.ready, true, "approval must make the channel immediately startable");
assert.equal(room.players.size, 6, "one human plus five bots must create six combatants");
assert.equal([...room.players.values()].filter((candidate) => candidate.isBot).length, 5);
assert.deepEqual(Array.from(room.teamCounts(false)), [2, 2, 2], "five bots must balance the three teams 2-2-2");
assert.ok(room.tickHandle, "the child room must retain its native authoritative tick handle");

classroom.start(controller);
assert.equal(room.phase, "countdown");
const countdownTimer = scheduledTimeouts.findLast((handle) => handle.active && handle.milliseconds === 3000);
assert.ok(countdownTimer, "authoritative countdown completion must be scheduled");
countdownTimer.callback();
assert.equal(room.phase, "playing", "countdown completion must enter the playing phase");
assert.equal(room.endsAt - room.startedAt, 10 * 60 * 1000, "the authoritative ten-minute timer must start");

const startX = player.x;
classroom.handleInput(player.id, { dx: 1, dy: 0, angle: 0, shoot: false, dash: false });
room.tick();
assert.ok(player.x > startX, "authoritative input must move the real player after the Master starts");
const oneSecondState = room.statePayload(room.startedAt + 1000);
assert.equal(oneSecondState.remainingMs, 10 * 60 * 1000 - 1000, "state snapshots must advance the timer");

const enemyBot = [...room.players.values()].find((candidate) => candidate.isBot && candidate.team !== player.team);
assert.ok(enemyBot);
for (let death = 0; death < 3; death += 1) {
  player.invulnerableUntil = 0;
  room.eliminate(player, enemyBot);
  if (death < 2) room.respawn(player);
}
assert.deepEqual(Array.from(player.studentStats, (row) => row.assignedDeaths), [1, 1, 1], "deaths must rotate across the three registered students");
const questionTimer = scheduledTimeouts.findLast((handle) => handle.active && handle.milliseconds === 280);
assert.ok(questionTimer, "final-life elimination must schedule the assigned geometry question");
questionTimer.callback();
assert.ok(player.currentQuestion, "the final-life question must be created");
assert.equal(player.currentQuestion.assignedStudentIndex, 2);
assert.equal(player.currentQuestion.assignedStudentName, "Sara Ruiz");
const assignedQuestion = player.currentQuestion;
room.handleAnswer(player.id, { questionId: assignedQuestion.id, selectedIndex: assignedQuestion.answerIndex });
assert.equal(player.studentStats[2].attempts, 1);
assert.equal(player.studentStats[2].correct, 1);
assert.equal(player.studentStats[2].answers[0].studentName, "Sara Ruiz");
const individualReport = room.report().individualStudents;
assert.equal(individualReport.length, 3);
assert.equal(individualReport[2].answers.length, 1, "the private final report must retain the student's complete answer history");

const student = read("student-stable-v26.js");
for (const marker of [
  "request_full_state",
  "continuousClientClock: true",
  "individualStudentTelemetry: true",
  "playerReadyRequired: false",
  "RECOVERING",
  "assignedStudentBadgeV26",
  "individualStudentRowsV26",
  "opensAdditionalSocket: false"
]) assert.ok(student.includes(marker), `missing student recovery marker: ${marker}`);
assert.doesNotMatch(student, /new WebSocket\s*\(/);
assert.match(student, /message\?\.type === "set_ready"/);

const masterIndividual = read("master-individual-v26.js");
for (const marker of [
  "triadMasterIndividualStudentsV26",
  "assigned_deaths",
  "student_name",
  "individual-students.csv",
  "individual-students.json",
  "assignedDeathAttribution: true",
  "individualAnswerAttribution: true",
  "opensAdditionalSocket: false"
]) assert.ok(masterIndividual.includes(marker), `missing Master individual record marker: ${marker}`);
assert.doesNotMatch(masterIndividual, /new WebSocket\s*\(/);

const indexHtml = read("index.html");
assert.match(indexHtml, /20260724-stable-autostart26/);
assert.match(indexHtml, /student-stable-v26\.css/);
assert.match(indexHtml, /student-stable-v26\.js/);
assert.match(indexHtml, /1 \+ 5/);
assert.match(indexHtml, /five optimized server bots/i);
assert.match(indexHtml, /no Ready button/i);
assert.doesNotMatch(indexHtml, /id="readyButton"/);
assert.doesNotMatch(indexHtml, /1 human \+ 8 bots/i);

const masterHtml = read("master.html");
assert.match(masterHtml, /STABLE AUTOSTART V26/);
assert.match(masterHtml, /master-individual-v26\.js/);
assert.match(masterHtml, /1 human \+ 5 bots/);
assert.match(masterHtml, /45 bots instead of the previous 72/);
assert.match(masterHtml, /WAITING FOR AN APPROVED CHANNEL/);
assert.doesNotMatch(masterHtml, /WAITING FOR A READY CHANNEL/);
assert.doesNotMatch(masterHtml, /each real PC receives 8 bots/);

const music = read("music-mode-ui.js");
assert.match(music, /20260724-stable-autostart26/);
assert.doesNotMatch(music, /loadScript\("master-ready-control\.js"/);
assert.match(music, /START ALL APPROVED CHANNELS/);

const config = read("config.js");
assert.match(config, /20260724-stable-autostart26/);

const serverPackage = JSON.parse(read("server/package.json"));
assert.equal(serverPackage.scripts.start, "node --require ./runtime-v20.js secure-gateway.js");
assert.match(serverPackage.scripts.test, /runtime-v20\.js/);

console.log("Stable Autostart v26 validation passed: native room ticks restore movement and timer authority, five balanced bots reduce load, Master starts approved channels directly, and each student's deaths and geometry answers are recorded separately.");
