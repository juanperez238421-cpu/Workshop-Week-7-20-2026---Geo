"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const vm = require("node:vm");
const runtime = require("../server/runtime-v12.js");

for (const file of [
  "renderer-bootstrap-v12.js",
  "network-v12.js",
  "gameplay-v12-ui.js",
  "music-mode-ui.js",
  "server/runtime-v12.js",
  "server/runtime-v13.js",
  "server/runtime-v14.js",
  "server/runtime-v15.js"
]) new vm.Script(fs.readFileSync(file, "utf8"), { filename: file });

const rawServer = fs.readFileSync("server/server-v3.js", "utf8");
const rawGateway = fs.readFileSync("server/secure-gateway.js", "utf8");
const patchedServer = runtime.patchServerSource(rawServer);
const patchedGateway = runtime.patchGatewaySource(rawGateway);
new vm.Script(patchedServer, { filename: "server-v3.v12-patched.js" });
new vm.Script(patchedGateway, { filename: "secure-gateway.v12-patched.js" });

assert.match(patchedServer, /PROJECTILE_LIFETIME_MS = 5200/);
assert.match(patchedServer, /AMMO_REGEN_INTERVAL_MS = 5 \* 1000/);
assert.match(patchedServer, /MAX_PROJECTILES = 120/);
assert.match(patchedServer, /LONG_SHOT_BONUS_START = 1200/);
assert.match(patchedServer, /LONG_SHOT_BONUS_MAX = 18/);
assert.match(patchedServer, /distanceTraveled/);
assert.match(patchedServer, /previousX/);
assert.match(patchedServer, /relativeStartX/);
assert.match(patchedServer, /relativeEndX/);
assert.match(patchedServer, /collisionRadius/);
assert.match(patchedServer, /sendFullStateTo/);
assert.match(patchedServer, /case "request_state"/);
assert.match(patchedServer, /player\.ws !== ws/);
assert.match(patchedServer, /pending\.ws !== ws/);

const network = fs.readFileSync("network-v12.js", "utf8");
assert.match(network, /SOFT_STREAM_STALL_MS = 2800/);
assert.match(network, /HARD_STREAM_STALL_MS = 12000/);
assert.match(network, /MAX_RESYNC_ATTEMPTS = 3/);
assert.match(network, /type: "request_state"/);
assert.match(network, /Soft|soft|requesting a full state/);
assert.match(network, /Realtime stream recovery exhausted/);

const bootstrap = fs.readFileSync("renderer-bootstrap-v12.js", "utf8");
assert.match(bootstrap, /legacyRendererSuppressed/);
assert.match(bootstrap, /this\.id === "gameCanvas"/);

const music = fs.readFileSync("music-mode-ui.js", "utf8");
assert.match(music, /network-v12\.js/);
assert.doesNotMatch(music, /loadScript\("network-v11\.js"/);
assert.doesNotMatch(music, /gameplay-v12-ui\.js/);

const indexHtml = fs.readFileSync("index.html", "utf8");
const masterHtml = fs.readFileSync("master.html", "utf8");
assert.match(indexHtml, /student-bootstrap-v17\.js/);
assert.match(indexHtml, /5 s|5-second|5 seconds/);
assert.match(indexHtml, /Recovered Arena v22/i);
assert.match(indexHtml, /student-arena-v22\.js/);
assert.match(indexHtml, /question-ui-v19\.js/);
assert.doesNotMatch(indexHtml, /student-master-view-v21\.js/);
assert.match(masterHtml, /REPORTING V18/);
assert.match(masterHtml, /network-v12\.js/);
assert.match(masterHtml, /1 charge every 5 seconds/);

const serverPackage = JSON.parse(fs.readFileSync("server/package.json", "utf8"));
assert.equal(serverPackage.scripts.start, "node --require ./runtime-v15.js secure-gateway.js");

const fakeServer = { on(){}, listen(){}, close(callback){ if (callback) callback(); } };
const fakeApp = { disable(){}, use(){}, get(){} };
function fakeExpress(){ return fakeApp; }
fakeExpress.json = () => () => {};
class FakeWss { constructor(){ this.clients = []; } on(){} handleUpgrade(){} }
class FakeWebSocket {}
FakeWebSocket.OPEN = 1;

const context = {
  require(name) {
    if (name === "node:crypto") return crypto;
    if (name === "node:http") return { createServer: () => fakeServer };
    if (name === "express") return fakeExpress;
    if (name === "ws") return { WebSocketServer: FakeWss, WebSocket: FakeWebSocket };
    throw new Error(`Unexpected require: ${name}`);
  },
  console,
  process: { env: {}, uptime: () => 1, on(){}, exit(){} },
  setInterval: () => 1,
  clearInterval(){},
  setTimeout: () => 1,
  Map, Set, WeakMap, Date, Math, JSON, String, Number, Boolean, Array, Object, Int8Array, Uint8ClampedArray, parseInt
};
context.globalThis = context;
vm.runInNewContext(`${patchedServer}\nglobalThis.__v12 = { Room };`, context, { filename: "server-v3.v12-runtime.js" });
const { Room } = context.__v12;
const room = new Room("ABC234");

const sent = [];
const currentSocket = {
  role: "player",
  playerId: "",
  readyState: 1,
  bufferedAmount: 0,
  send(payload, _options, callback) { sent.push(JSON.parse(payload)); if (callback) callback(); }
};
const oldSocket = { role: "player", playerId: "", readyState: 1, bufferedAmount: 0, send(){} };
const player = room.makePlayer({ token: "student", ws: currentSocket, pcLabel: "Test Player", students: ["Ana", "Luis", "Sara"] }, 0, false);
currentSocket.playerId = player.id;
oldSocket.playerId = player.id;
player.connected = true;
player.ready = true;
room.players.set(player.id, player);
room.disconnect(oldSocket);
assert.equal(player.connected, true, "a stale socket close must not disconnect the restored player socket");
assert.equal(player.ws, currentSocket);

room.sendFullStateTo(currentSocket, Date.now());
assert.ok(sent.some((message) => message.type === "state" && message.resync === true && Array.isArray(message.territory)));

console.log("Gameplay v12 compatibility test passed under runtime v15: five-second ammo recovery, full-state resync and stale-socket protection remain active beneath Recovered Arena v22.");
