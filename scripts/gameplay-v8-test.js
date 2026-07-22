"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { patchGatewaySource, patchServerSource } = require(path.join(process.cwd(), "server", "runtime-v8.js"));

const serverSource = fs.readFileSync(path.join(process.cwd(), "server", "server-v3.js"), "utf8");
const gatewaySource = fs.readFileSync(path.join(process.cwd(), "server", "secure-gateway.js"), "utf8");
const patchedServer = patchServerSource(serverSource);
const patchedGateway = patchGatewaySource(gatewaySource);

new vm.Script(patchedServer, { filename: "server-v3.v8-patched.js" });
new vm.Script(patchedGateway, { filename: "secure-gateway.v8-patched.js" });
new vm.Script(fs.readFileSync(path.join(process.cwd(), "gameplay-v8.js"), "utf8"), { filename: "gameplay-v8.js" });
new vm.Script(fs.readFileSync(path.join(process.cwd(), "team-selection-v8.js"), "utf8"), { filename: "team-selection-v8.js" });

assert.match(patchedServer, /selectTeam\(playerId, value\)/);
assert.match(patchedServer, /case "select_team"/);
assert.match(patchedServer, /Cancel Ready before changing teams/);
assert.match(patchedServer, /targetMembers\.find\(\(candidate\) => candidate\.isBot\)/);
assert.match(patchedServer, /humanVersusHuman/);
assert.match(patchedServer, /!killer\.isBot && !victim\.isBot/);
assert.match(patchedServer, /kind: "elimination"/);
assert.match(patchedServer, /safeSend\(victim\.ws, \{ type: "life_lost"/);

const gameplay = fs.readFileSync(path.join(process.cwd(), "gameplay-v8.js"), "utf8");
assert.match(gameplay, /message\.shoot = spacePressed/);
assert.match(gameplay, /event\.button === 2/);
assert.match(gameplay, /AIMING WITH MOUSE/);
assert.match(gameplay, /release right click to lock/);
assert.match(gameplay, /spawnExplosion\(player\)/);
assert.match(gameplay, /globalCompositeOperation = "lighter"/);
assert.match(gameplay, /stopImmediatePropagation/);
assert.doesNotMatch(gameplay, /message\.shoot\s*=\s*Boolean\(message\.shoot\)/);

const teamSelection = fs.readFileSync(path.join(process.cwd(), "team-selection-v8.js"), "utf8");
assert.match(teamSelection, /Choose an available team name/);
assert.match(teamSelection, /type: "select_team"/);
assert.match(teamSelection, /count >= 3/);
assert.match(teamSelection, /Cancel Ready before changing teams/);

console.log("Gameplay v8 test passed: right-click mouse aiming, Space-only shooting, explosion animation, human-only kill announcements and capacity-aware player team selection compile correctly.");
