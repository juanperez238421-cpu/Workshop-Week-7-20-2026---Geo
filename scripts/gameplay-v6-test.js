"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { patchGatewaySource, patchServerSource } = require(path.join(process.cwd(), "server", "runtime-v6.js"));

const rawServer = fs.readFileSync(path.join(process.cwd(), "server", "server-v3.js"), "utf8");
const rawGateway = fs.readFileSync(path.join(process.cwd(), "server", "secure-gateway.js"), "utf8");
const patchedServer = patchServerSource(rawServer);
const patchedGateway = patchGatewaySource(rawGateway);

new vm.Script(patchedServer, { filename: "server-v3.fluid-v6.js" });
new vm.Script(patchedGateway, { filename: "secure-gateway.fluid-v6.js" });
new vm.Script(fs.readFileSync(path.join(process.cwd(), "gameplay-v6.js"), "utf8"), { filename: "gameplay-v6.js" });
new vm.Script(fs.readFileSync(path.join(process.cwd(), "master-live-v6.js"), "utf8"), { filename: "master-live-v6.js" });

assert.match(patchedServer, /const TICK_RATE = 40;/);
assert.match(patchedServer, /const STATE_RATE = 15;/);
assert.match(patchedServer, /const MAX_LIVES = 3;/);
assert.match(patchedServer, /const MAX_AMMO = 5;/);
assert.match(patchedServer, /const MAX_PICKUPS = 14;/);
assert.match(patchedServer, /perMessageDeflate: \{ threshold: 768/);
assert.match(patchedServer, /socket\.setNoDelay\(true\)/);
assert.match(patchedServer, /STATE_BACKPRESSURE_BYTES = 192 \* 1024/);
assert.match(patchedServer, /ws\.bufferedAmount > STATE_BACKPRESSURE_BYTES/);
assert.match(patchedServer, /const serialized = JSON\.stringify\(payload\)/);
assert.match(patchedServer, /this\.pickups = new Map\(\)/);
assert.match(patchedServer, /spawnPickup\(forcedType = null\)/);
assert.match(patchedServer, /updatePickups\(now\)/);
assert.match(patchedServer, /pickup_collected/);
assert.match(patchedServer, /type: "life_lost"/);
assert.match(patchedServer, /victim\.lives = Math\.max\(0, victim\.lives - 1\)/);
assert.match(patchedServer, /if \(victim\.lives > 0\)/);
assert.match(patchedServer, /player\.lives = MAX_LIVES; player\.ammo = MAX_AMMO/);
assert.match(patchedServer, /if \(player\.ammo <= 0\) return/);
assert.match(patchedServer, /player\.ammo -= 1/);
assert.match(patchedServer, /sequence: \+\+this\.stateSequence/);
assert.match(patchedServer, /maxLives: MAX_LIVES, maxAmmo: MAX_AMMO/);
assert.match(patchedServer, /pickups: \[\.\.\.this\.pickups\.values\(\)\]/);
assert.match(patchedServer, /projectile\.vx/);
assert.match(patchedGateway, /perMessageDeflate: \{ threshold: 768/);
assert.match(patchedGateway, /client\.bufferedAmount > 192 \* 1024/);
assert.match(patchedGateway, /client\._socket\?\.setNoDelay\(true\)/);
assert.match(patchedGateway, /engineSocket\._socket\?\.setNoDelay\(true\)/);
assert.match(patchedGateway, /"set_player_ready"/);

const gameplay = fs.readFileSync(path.join(process.cwd(), "gameplay-v6.js"), "utf8");
assert.match(gameplay, /client-side prediction|predictedDashUntil/i);
assert.match(gameplay, /visualPlayers = new Map/);
assert.match(gameplay, /visualProjectiles = new Map/);
assert.match(gameplay, /resource-hud/);
assert.match(gameplay, /lifeDisplay/);
assert.match(gameplay, /ammoDisplay/);
assert.match(gameplay, /pickup_collected/);
assert.match(gameplay, /droppedSnapshots/);
assert.match(gameplay, /averageInterval/);
assert.match(gameplay, /event\.button === 2/);

console.log("Gameplay v6 test passed: 40 Hz simulation, 15 Hz compressed snapshots, backpressure control, three lives, five ammo charges, supply boxes, temporary powers and predicted rendering compile correctly.");
