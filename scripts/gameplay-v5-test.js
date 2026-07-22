"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { patchGatewaySource, patchServerSource } = require(path.join(process.cwd(), "server", "runtime-patch.js"));

const serverSource = fs.readFileSync(path.join(process.cwd(), "server", "server-v3.js"), "utf8");
const gatewaySource = fs.readFileSync(path.join(process.cwd(), "server", "secure-gateway.js"), "utf8");
const patchedServer = patchServerSource(serverSource);
const patchedGateway = patchGatewaySource(gatewaySource);

new vm.Script(patchedServer, { filename: "server-v3.smooth-patched.js" });
new vm.Script(patchedGateway, { filename: "secure-gateway.smooth-patched.js" });
new vm.Script(fs.readFileSync(path.join(process.cwd(), "gameplay-v5.js"), "utf8"), { filename: "gameplay-v5.js" });
new vm.Script(fs.readFileSync(path.join(process.cwd(), "master-ready-control.js"), "utf8"), { filename: "master-ready-control.js" });

assert.match(patchedServer, /const TICK_RATE = 30/);
assert.match(patchedServer, /const STATE_RATE = 20/);
assert.match(patchedServer, /width: 9600, height: 6000, gridWidth: 40, gridHeight: 25/);
assert.match(patchedServer, /const COHESION_RADIUS = 760/);
assert.match(patchedServer, /allocateRandomPcLabel\(\)/);
assert.match(patchedServer, /const pcLabel = this\.allocateRandomPcLabel\(\)/);
assert.match(patchedServer, /setPlayerReady\(controllerWs, playerId, ready\)/);
assert.match(patchedServer, /case "set_player_ready"/);
assert.match(patchedServer, /fireVolley\(player, now\)/);
assert.match(patchedServer, /kind: "elimination"/);
assert.match(patchedServer, /cohesionRadius: COHESION_RADIUS/);
assert.match(patchedGateway, /"set_player_ready"/);

const gameplay = fs.readFileSync(path.join(process.cwd(), "gameplay-v5.js"), "utf8");
assert.match(gameplay, /event\.button === 2/);
assert.match(gameplay, /message\.shoot = spacePressed/);
assert.match(gameplay, /desiredWorldWidth = Math\.min\(3600/);
assert.match(gameplay, /visualPlayers = new Map/);
assert.match(gameplay, /message\.pcLabel = "AUTO"/);
assert.doesNotMatch(gameplay, /message\.shoot\s*=\s*mouse/);

const masterReady = fs.readFileSync(path.join(process.cwd(), "master-ready-control.js"), "utf8");
assert.match(masterReady, /type: "set_player_ready"/);
assert.match(masterReady, /MARK READY/);
assert.match(masterReady, /SET NOT READY/);

console.log("Gameplay v5 test passed: 9600×6000 arena, 30/20 Hz flow, smooth camera, right-click aim, Space-only shooting, random PC titles and teacher ready overrides compile correctly.");
