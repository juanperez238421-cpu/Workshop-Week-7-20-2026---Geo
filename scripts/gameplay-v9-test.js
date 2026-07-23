"use strict";

const fs = require("node:fs");
const assert = require("node:assert/strict");
const vm = require("node:vm");

for (const file of [
  "gameplay-v9.js",
  "master-live-v9.js",
  "music-mode-ui.js",
  "server/runtime-v9.js",
  "server/runtime-v10.js",
  "server/runtime-v11.js",
  "server/runtime-v12.js",
  "server/runtime-v13.js",
  "server/runtime-v14.js",
  "server/runtime-v15.js"
]) {
  new vm.Script(fs.readFileSync(file, "utf8"), { filename: file });
}

const gameplay = fs.readFileSync("gameplay-v9.js", "utf8");
const master = fs.readFileSync("master-live-v9.js", "utf8");
const masterCss = fs.readFileSync("master-live-v9.css", "utf8");
const musicMode = fs.readFileSync("music-mode-ui.js", "utf8");
const runtime = fs.readFileSync("server/runtime-v9.js", "utf8");
const serverPackage = JSON.parse(fs.readFileSync("server/package.json", "utf8"));
const runtimeModule = require("../server/runtime-v9.js");
const patchedServer = runtimeModule.patchServerSource(fs.readFileSync("server/server-v3.js", "utf8"));
const patchedGateway = runtimeModule.patchGatewaySource(fs.readFileSync("server/secure-gateway.js", "utf8"));
new vm.Script(patchedServer, { filename: "server-v3.v9-patched.js" });
new vm.Script(patchedGateway, { filename: "secure-gateway.v9-patched.js" });

assert.match(gameplay, /gameplayV9Canvas/);
assert.match(gameplay, /const size = clamp\(hitRadius \* 1\.18, 14, 20\)/);
assert.doesNotMatch(gameplay, /mine \? 22 : 18/);
assert.match(gameplay, /ammoRegenRemainingMs/);
assert.match(gameplay, /territoryDelta/);
assert.match(gameplay, /predictedX = Number\(target\.x\) \+ Number\(target\.vx/);
assert.match(gameplay, /Space/);
assert.match(gameplay, /message\.shoot = spacePressed/);

assert.match(master, /masterRealtimeCanvas/);
assert.match(master, /#fbfcfe/);
assert.match(master, /territoryDelta/);
assert.match(master, /recent skip/);
assert.match(masterCss, /background: #e8eef6/);
assert.match(masterCss, /masterNetworkCard/);

assert.match(runtime, /const TICK_RATE = 50/);
assert.match(runtime, /const STATE_RATE = 20/);
assert.match(runtime, /const PLAYER_RADIUS = 30/);
assert.match(runtime, /const PROJECTILE_RADIUS = 18/);
assert.match(runtime, /const PICKUP_RADIUS = 60/);
assert.match(runtime, /AMMO_REGEN_INTERVAL_MS = 10 \* 1000/);
assert.match(runtime, /updateAmmoRegeneration/);
assert.match(runtime, /closestX/);
assert.match(runtime, /territoryDelta/);
assert.match(runtime, /perMessageDeflate: false/);
assert.match(runtime, /compress: false/);
assert.match(patchedServer, /const TICK_RATE = 50/);
assert.match(patchedServer, /const STATE_RATE = 20/);
assert.match(patchedServer, /updateAmmoRegeneration\(now\)/);
assert.match(patchedServer, /PROJECTILE_RADIUS = 18/);
assert.match(patchedServer, /territoryDelta/);
assert.match(patchedGateway, /perMessageDeflate: false/);

assert.match(musicMode, /gameplay-v9\.js/);
assert.match(musicMode, /master-live-v9\.js/);
assert.equal(serverPackage.scripts.start, "node --require ./runtime-v15.js secure-gateway.js");

console.log("Gameplay v9 compatibility test passed under runtime v15: the proven interpolation, delta territory and low-latency foundations remain available beneath Gameplay v20.");
