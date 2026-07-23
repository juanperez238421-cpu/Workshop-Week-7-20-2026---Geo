"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const runtime = require("../server/runtime-v21.js");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const patchedServer = runtime.patchServerSource(read("server/server-v3.js"));
const patchedGateway = runtime.patchGatewaySource(read("server/secure-gateway.js"));
new vm.Script(patchedServer, { filename: "server-v3.stable-runtime-v21.js" });
new vm.Script(patchedGateway, { filename: "secure-gateway.stable-runtime-v21.js" });

for (const marker of [
  "const TICK_RATE = 30;",
  "const STATE_RATE = 10;",
  "const SOLO_BOTS_PER_CHANNEL = 5;",
  "const MAX_PROJECTILES = 54;",
  "const SOLO_BOT_THINK_INTERVAL_MS = 180;",
  "updateAmmoRegeneration(now)",
  "createIndividualStudentStats",
  "publicIndividualStudentStats",
  "assignedStudentIndex",
  "individualStudents",
  'case "request_full_state"',
  "stable-autostart-individual-channels-v26"
]) assert.ok(patchedServer.includes(marker), `missing v21 runtime marker: ${marker}`);
assert.doesNotMatch(patchedServer, /_soloTickStartTimer/);
assert.doesNotMatch(patchedServer, /clearInterval\(room\.tickHandle\)/);
assert.doesNotMatch(patchedServer, /real player is not ready/);
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
    close() {}, terminate() {}, ping() {}, on() {}
  };
}

const timeouts = [];
const intervals = [];
const fakeServer = { on() {}, listen(_port, _host, callback) { callback?.(); }, close(callback) { callback?.(); } };
const fakeApp = { disable() {}, use() {}, get() {} };
function fakeExpress() { return fakeApp; }
fakeExpress.json = () => () => {};
class FakeWss { constructor() { this.clients = new Set(); } on() {} handleUpgrade() {} }
class FakeWebSocket {}
FakeWebSocket.OPEN = 1;

const context = {
  require(name) {
    if (name === "node:crypto") return crypto;
    if (name === "node:fs") return fs;
    if (name === "node:http") return { createServer: () => fakeServer };
    if (name === "node:path") return path;
    if (name === "express") return fakeExpress;
    if (name === "ws") return { WebSocketServer: FakeWss, WebSocket: FakeWebSocket };
    throw new Error(`Unexpected runtime dependency: ${name}`);
  },
  console,
  process: { env: { GLOBAL_SCORE_FILE: "/tmp/triad-v21-test-score.json" }, uptime: () => 1, on() {}, exit() {} },
  setInterval(callback, milliseconds) {
    const handle = { callback, milliseconds, active: true, unref() {} };
    intervals.push(handle);
    return handle;
  },
  clearInterval(handle) { if (handle) handle.active = false; },
  setTimeout(callback, milliseconds) {
    const handle = { callback, milliseconds, active: true, unref() {} };
    timeouts.push(handle);
    return handle;
  },
  clearTimeout(handle) { if (handle) handle.active = false; },
  Map, Set, WeakMap, Date, Math, JSON, String, Number, Boolean, Array, Object, Int8Array, parseInt
};
context.globalThis = context;
vm.runInNewContext(`${patchedServer}\nglobalThis.__runtime = { SoloClassroom };`, context, { filename: "server-v3.v21-executable.js" });

const classroom = new context.__runtime.SoloClassroom("ABC234");
const controller = makeSocket();
const studentSocket = makeSocket();
classroom.attachController(controller);
classroom.registerStudent(studentSocket, { pcLabel: "AUTO", students: ["Ana Torres", "Luis Gómez", "Sara Ruiz"], preferredTeam: 0 });
const registration = [...classroom.pending.values()][0];
assert.ok(registration);
classroom.approveRegistration(controller, registration.id, 0);
const entry = classroom.realEntries()[0];
const room = entry.channel.room;
const player = entry.player;

assert.equal(player.ready, true);
assert.equal(room.players.size, 6);
assert.equal([...room.players.values()].filter((candidate) => candidate.isBot).length, 5);
assert.deepEqual(Array.from(room.teamCounts(false)), [2, 2, 2]);
assert.ok(room.tickHandle, "native Room interval must remain installed");
assert.equal(typeof room.updateAmmoRegeneration, "function", "tick dependency must exist");

classroom.start(controller);
const countdown = timeouts.findLast((handle) => handle.active && handle.milliseconds === 3000);
assert.ok(countdown);
countdown.callback();
assert.equal(room.phase, "playing");
assert.equal(room.endsAt - room.startedAt, 10 * 60 * 1000);

const startX = player.x;
classroom.handleInput(player.id, { dx: 1, dy: 0, angle: 0, shoot: false, dash: false });
room.tick();
assert.ok(player.x > startX, "real-player movement must advance inside authoritative tick");
assert.equal(room.statePayload(room.startedAt + 1000).remainingMs, 599000, "authoritative timer must advance");

const enemyBot = [...room.players.values()].find((candidate) => candidate.isBot && candidate.team !== player.team);
for (let index = 0; index < 3; index += 1) {
  player.invulnerableUntil = 0;
  room.eliminate(player, enemyBot);
  if (index < 2) room.respawn(player);
}
assert.deepEqual(Array.from(player.studentStats, (row) => row.assignedDeaths), [1, 1, 1]);
const questionDelay = timeouts.findLast((handle) => handle.active && handle.milliseconds === 280);
assert.ok(questionDelay);
questionDelay.callback();
assert.equal(player.currentQuestion.assignedStudentName, "Sara Ruiz");
const question = player.currentQuestion;
room.handleAnswer(player.id, { questionId: question.id, selectedIndex: question.answerIndex });
assert.equal(player.studentStats[2].correct, 1);
assert.equal(room.report().individualStudents[2].answers.length, 1);

const indexHtml = read("index.html");
assert.doesNotMatch(indexHtml, /id="readyButton"/);
assert.match(indexHtml, /student-stable-v26\.js/);
assert.match(indexHtml, /1 \+ 5/);
const masterHtml = read("master.html");
assert.match(masterHtml, /master-individual-v26\.js/);
assert.match(masterHtml, /WAITING FOR AN APPROVED CHANNEL/);
const serverPackage = JSON.parse(read("server/package.json"));
assert.equal(serverPackage.scripts.start, "node --require ./runtime-v21.js secure-gateway.js");

console.log("Stable runtime v21 executable validation passed: Master start launches a ten-minute match, movement advances, five bots remain balanced, ammo regeneration is callable, and student deaths and answers are attributed separately.");
