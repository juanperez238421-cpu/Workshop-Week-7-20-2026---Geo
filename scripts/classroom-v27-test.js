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
new vm.Script(patchedServer, { filename: "server-v3.classroom-v27.js" });
new vm.Script(patchedGateway, { filename: "secure-gateway.classroom-v27.js" });

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

const scheduledTimeouts = [];
const scheduledIntervals = [];
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
  process: { env: { GLOBAL_SCORE_FILE: "/tmp/triad-v27-score.json" }, uptime: () => 1, on() {}, exit() {} },
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
context.globalThis = context;
vm.runInNewContext(`${patchedServer}\nglobalThis.__classroomV27 = { SoloClassroom };`, context, { filename: "server-v3.classroom-v27-runtime.js" });

const classroom = new context.__classroomV27.SoloClassroom("ABC234");
const controller = makeSocket();
classroom.attachController(controller);

for (let pc = 1; pc <= 9; pc += 1) {
  const socket = makeSocket();
  const students = [1, 2, 3].map((student) => `PC${pc} Student${student}`);
  classroom.registerStudent(socket, { pcLabel: "AUTO", students, preferredTeam: (pc - 1) % 3 });
  const registration = [...classroom.pending.values()][0];
  assert.ok(registration, `PC ${pc} must enter the approval queue`);
  classroom.approveRegistration(controller, registration.id, (pc - 1) % 3);
}

const entries = classroom.realEntries();
assert.equal(entries.length, 9, "all nine classroom channels must be created");
assert.deepEqual(Array.from(classroom.channels.keys()), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
assert.equal(classroom.pending.size, 0);

let totalBots = 0;
for (const entry of entries) {
  const room = entry.channel.room;
  const bots = [...room.players.values()].filter((player) => player.isBot);
  totalBots += bots.length;
  assert.equal(room.players.size, 6, `Channel ${entry.channelNumber} must contain six combatants`);
  assert.equal(bots.length, 5, `Channel ${entry.channelNumber} must contain five bots`);
  assert.deepEqual(Array.from(room.teamCounts(false)), [2, 2, 2], `Channel ${entry.channelNumber} must be balanced 2-2-2`);
  assert.ok(room.tickHandle, `Channel ${entry.channelNumber} must retain its native tick`);
  assert.equal(entry.player.ready, true, `Channel ${entry.channelNumber} must be immediately startable`);
}
assert.equal(totalBots, 45, "nine channels must create exactly 45 bots");

const channel3 = entries.find((entry) => entry.channelNumber === 3);
assert.ok(channel3, "Channel 3 must exist");
assert.match(channel3.channel.room.code, /-C03$/, "Channel 3 must receive the C03 internal room code");

classroom.start(controller);
const countdowns = scheduledTimeouts.filter((handle) => handle.active && handle.milliseconds === 3000);
assert.equal(countdowns.length, 9, "all nine approved channels must receive a countdown");
countdowns.forEach((handle) => handle.callback());

for (const entry of entries) {
  const room = entry.channel.room;
  assert.equal(room.phase, "playing", `Channel ${entry.channelNumber} must enter play`);
  assert.equal(room.endsAt - room.startedAt, 10 * 60 * 1000, `Channel ${entry.channelNumber} must run for ten minutes`);
}

const room3 = channel3.channel.room;
const player3 = channel3.player;
const originalX = player3.x;
classroom.handleInput(player3.id, { dx: 1, dy: 0, angle: 0, shoot: false, dash: false });
room3.tick();
assert.ok(player3.x > originalX, "Channel 3 input must move the real player");
assert.equal(room3.statePayload(room3.startedAt + 1000).remainingMs, 599000, "Channel 3 timer must advance authoritatively");

const reconnectSocket = makeSocket();
classroom.reconnectStudent(reconnectSocket, player3.token);
assert.equal(player3.ws, reconnectSocket, "Channel 3 must restore the real student socket");
assert.equal(player3.connected, true, "Channel 3 must remain connected after recovery");

const enemyBot = [...room3.players.values()].find((candidate) => candidate.isBot && candidate.team !== player3.team);
assert.ok(enemyBot, "Channel 3 must contain an enemy bot");
for (let death = 0; death < 3; death += 1) {
  player3.invulnerableUntil = 0;
  room3.eliminate(player3, enemyBot);
  if (death < 2) room3.respawn(player3);
}
assert.deepEqual(Array.from(player3.studentStats, (row) => row.assignedDeaths), [1, 1, 1], "Channel 3 deaths must rotate across the three students");
const questionTimer = scheduledTimeouts.findLast((handle) => handle.active && handle.milliseconds === 280);
assert.ok(questionTimer, "Channel 3 final life must schedule a geometry question");
questionTimer.callback();
assert.ok(player3.currentQuestion, "Channel 3 must create the assigned question");
const question = player3.currentQuestion;
room3.handleAnswer(player3.id, { questionId: question.id, selectedIndex: question.answerIndex });
assert.equal(player3.studentStats[2].correct, 1, "the assigned Channel 3 student must receive the correct answer");
assert.equal(room3.report().individualStudents[2].answers.length, 1, "the private Channel 3 report must retain the answer history");

for (const [file, markers] of Object.entries({
  "student-clean-v27.js": ["essentialHudOnly: true", "minimapOnDemand: true", "conciseMessages: true"],
  "student-clean-v27.css": ["essential-player-hud-v27", "show-minimap-v27", "resource-card-v15:nth-child(4)"],
  "master-solo-channels-v27.js": ["DEFAULT_BOTS = 5", "START ALL APPROVED CHANNELS", "playerReadyRequired: false"],
  "index.html": ["student-clean-v27.css", "student-clean-v27.js", "20260727-clean-player27"],
  "master.html": ["master-solo-channels-v27.js", "20260727-clean-player27"]
})) {
  const source = read(file);
  for (const marker of markers) assert.ok(source.includes(marker), `${file} is missing ${marker}`);
}

assert.doesNotMatch(read("master.html"), /master-flex-start-v11\.js/);
assert.doesNotMatch(read("master.html"), /master-solo-channels-v24\.js/);
assert.doesNotMatch(read("music-mode-ui.js"), /master-flex-start-v11\.js/);

console.log("Clean Player v27 classroom validation passed: nine channels create 45 bots, Channel 3 starts, moves, advances time, reconnects, attributes student work, and the essential HUD replaces legacy Master conflicts.");
