"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");
const runtime = require("../server/runtime-v11.js");

for (const file of ["network-v11.js", "network-v12.js", "master-flex-start-v11.js", "music-mode-ui.js", "server/runtime-v11.js", "server/runtime-v12.js", "server/runtime-v13.js"]) {
  new vm.Script(fs.readFileSync(file, "utf8"), { filename: file });
}

const serverSource = fs.readFileSync("server/server-v3.js", "utf8");
const gatewaySource = fs.readFileSync("server/secure-gateway.js", "utf8");
const patchedServer = runtime.patchServerSource(serverSource);
const patchedGateway = runtime.patchGatewaySource(gatewaySource);
new vm.Script(patchedServer, { filename: "server-v3.v11-patched.js" });
new vm.Script(patchedGateway, { filename: "secure-gateway.v11-patched.js" });

assert.match(patchedServer, /const TICK_RATE = 40/);
assert.match(patchedServer, /const STATE_RATE = 15/);
assert.match(patchedServer, /FULL_TERRITORY_EVERY = 30/);
assert.match(patchedServer, /STATIC_META_EVERY = 75/);
assert.match(patchedServer, /MAX_PROJECTILES = 180/);
assert.match(patchedServer, /MIN_PLAYERS_TO_START = 1/);
assert.match(patchedServer, /sendSocketFrame/);
assert.match(patchedServer, /_triadLatestStateIsFull/);
assert.match(patchedServer, /currentTerritory\[index\] !== this\.lastTerritorySent\[index\]/);
assert.match(patchedServer, /pending registration\(s\) must be approved or rejected/);
assert.match(patchedServer, /flexibleStart: true/);
assert.match(patchedServer, /this\.projectiles\.size >= MAX_PROJECTILES/);
assert.match(patchedServer, /const recipients = new Set/);
assert.match(patchedServer, /}, 15_000\);/);
assert.doesNotMatch(patchedServer, /player slot\(s\) missing/);
assert.doesNotMatch(patchedServer, /teams must be balanced 3–3–3/);

assert.match(patchedGateway, /forwardToBrowser/);
assert.match(patchedGateway, /latestStateIsFull/);
assert.match(patchedGateway, /setKeepAlive\(true, 15000\)/);
assert.match(patchedGateway, /connectionHeartbeat/);
assert.match(patchedGateway, /payload\.startsWith\('\{"type":"state"'\)/);
assert.match(patchedGateway, /client\.pendingEngineMessages\.length < 48/);

const networkV11 = fs.readFileSync("network-v11.js", "utf8");
assert.match(networkV11, /INPUT_MIN_INTERVAL_MS = 45/);
assert.match(networkV11, /STREAM_STALL_MS = 3600/);
assert.match(networkV11, /CLIENT_BACKPRESSURE_BYTES/);
assert.match(networkV11, /socket\.close\(4000, "Realtime stream stalled"\)/);
assert.match(networkV11, /APP_PING_INTERVAL_MS = 5000/);

const flex = fs.readFileSync("master-flex-start-v11.js", "utf8");
assert.match(flex, /1–9 PLAYERS/);
assert.match(flex, /START MATCH WITH/);
assert.match(flex, /FLEXIBLE START ENABLED/);

const music = fs.readFileSync("music-mode-ui.js", "utf8");
assert.match(music, /network-v12\.js/);
assert.match(music, /master-flex-start-v11\.js/);
const networkLoaderIndex = music.indexOf('loadScript("network-v12.js"');
const gameplayLoaderIndex = music.indexOf('loadScript("gameplay-v9.js"');
assert.ok(networkLoaderIndex >= 0 && gameplayLoaderIndex >= 0 && networkLoaderIndex < gameplayLoaderIndex);

const serverPackage = JSON.parse(fs.readFileSync("server/package.json", "utf8"));
assert.equal(serverPackage.scripts.start, "node --require ./runtime-v13.js secure-gateway.js");

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
  Map, Set, WeakMap, Date, Math, JSON, String, Number, Boolean, Array, Object, Int8Array, parseInt
};
context.globalThis = context;
vm.runInNewContext(`${patchedServer}\nglobalThis.__v11 = { Room };`, context, { filename: "server-v3.v11-runtime.js" });
const { Room } = context.__v11;
const room = new Room("ABC234");
const controller = { role: "controller", readyState: 1, bufferedAmount: 0, send(){} };
room.controller = { ws: controller, connected: true, token: "master" };
assert.ok(room.startBlockers().some((item) => /at least one approved player/.test(item)));

const studentSocket = { role: "player", readyState: 1, bufferedAmount: 0, send(){} };
const player = room.makePlayer({ token: "student", ws: studentSocket, pcLabel: "Test Player", students: ["Ana", "Luis", "Sara"] }, 0, false);
player.connected = true;
player.ready = true;
room.players.set(player.id, player);
assert.deepEqual(Array.from(room.startBlockers()), []);
assert.equal(room.canStart(), true);
room.start(controller);
assert.equal(room.phase, "countdown");

console.log("Gameplay v11 compatibility test passed under runtime v13: coalesced snapshots, cumulative territory recovery and flexible 1–9-player starts remain available.");
