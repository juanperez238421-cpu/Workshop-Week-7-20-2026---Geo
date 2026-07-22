"use strict";
const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const realCrypto = require("node:crypto");

const sent = [];
class FakeWss { constructor(){ this.clients=[]; } on(){} handleUpgrade(){} }
class FakeWebSocket {}
FakeWebSocket.OPEN = 1;
const fakeServer = { on(){}, listen(){}, close(cb){ if(cb)cb(); } };
const fakeApp = { disable(){}, use(){}, get(){} };
function fakeExpress(){ return fakeApp; }
fakeExpress.json = () => () => {};
const fakeRequire = (name) => {
  if (name === "node:crypto") return realCrypto;
  if (name === "node:http") return { createServer: () => fakeServer };
  if (name === "express") return fakeExpress;
  if (name === "ws") return { WebSocketServer: FakeWss, WebSocket: FakeWebSocket };
  throw new Error(`unexpected require ${name}`);
};
const context = {
  require: fakeRequire,
  console,
  process: { env: {}, uptime: () => 1, on(){}, exit(){} },
  setInterval: () => 1,
  clearInterval(){},
  setTimeout: (fn) => { fn(); return 1; },
  Map, Set, Date, Math, JSON, String, Number, Boolean, Array, Object, Int8Array, parseInt,
};
context.globalThis = context;
let source = fs.readFileSync("server/server-v3.js", "utf8");
source += "\nglobalThis.__triadTest = { Room, containsBannedLanguage };";
vm.runInNewContext(source, context, { filename: "server-v3.js" });
const { Room, containsBannedLanguage } = context.__triadTest;
assert.equal(containsBannedLanguage("Mierda Team"), true);
assert.equal(containsBannedLanguage("m.i.e.r.d.a"), true);
assert.equal(containsBannedLanguage("f u c k"), true);
assert.equal(containsBannedLanguage("Geometry Masters"), false);
assert.equal(containsBannedLanguage("Computadora Team"), false);
assert.equal(containsBannedLanguage("Maricarmen"), false);
assert.equal(containsBannedLanguage("Dickson Geometry"), false);

function socket(){ return { readyState: 1, role: "", roomCode: "", send(payload){ sent.push(JSON.parse(payload)); }, close(){} }; }
const room = new Room("ABC234");
const controller = socket();
room.attachController(controller);
const studentWs = socket();
room.registerStudent(studentWs, { pcLabel: "Table 1", students: ["Ana", "Luis", "Sara"], preferredTeam: 0 });
const registration = [...room.pending.values()][0];
assert.equal(registration.students.length, 3);
room.approveRegistration(controller, registration.id, 0);
const human = [...room.players.values()].find((player) => !player.isBot);
room.addBots(controller);
assert.equal(room.players.size, 9);
assert.deepEqual(Array.from(room.teamCounts(false)), [3,3,3]);
room.submitTeamProposals(human.id, ["Vector Kings", "Angle Force", "Triangle Minds"]);
let status = room.teamNamingStatus(0);
assert.equal(status.proposalCount, 9);
const choices = status.candidates.slice(0,3).map((candidate) => candidate.key);
room.submitTeamVotes(human.id, choices);
assert.equal(room.teamNamesFinalized.every(Boolean), true);
room.setReady(human.id, true);
assert.equal(room.canStart(), true);
room.start(controller);
assert.equal(room.phase, "playing");
room.updateBots(Date.now());
assert.ok([...room.players.values()].filter((player) => player.isBot).every((bot) => Number.isFinite(bot.input.angle)));
console.log("Runtime test passed: 3-student registration, profanity filter, 9-slot simple-bot fill, voting finalization and start gate work.");
