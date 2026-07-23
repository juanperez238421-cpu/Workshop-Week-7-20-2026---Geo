"use strict";

const fs = require("node:fs");
const assert = require("node:assert/strict");
const vm = require("node:vm");

for (const file of [
  "minimap-v10.js",
  "pickup-assets-v10.js",
  "question-bank-v10-ui.js",
  "server/runtime-v10.js",
  "server/runtime-v11.js",
  "server/runtime-v12.js"
]) {
  new vm.Script(fs.readFileSync(file, "utf8"), { filename: file });
}

const runtimeModule = require("../server/runtime-v10.js");
const patchedServer = runtimeModule.patchServerSource(fs.readFileSync("server/server-v3.js", "utf8"));
const patchedGateway = runtimeModule.patchGatewaySource(fs.readFileSync("server/secure-gateway.js", "utf8"));
new vm.Script(patchedServer, { filename: "server-v3.v10-patched.js" });
new vm.Script(patchedGateway, { filename: "secure-gateway.v10-patched.js" });

const minimap = fs.readFileSync("minimap-v10.js", "utf8");
const pickupAssets = fs.readFileSync("pickup-assets-v10.js", "utf8");
const questionUi = fs.readFileSync("question-bank-v10-ui.js", "utf8");
const indexHtml = fs.readFileSync("index.html", "utf8");
const masterHtml = fs.readFileSync("master.html", "utf8");
const musicMode = fs.readFileSync("music-mode-ui.js", "utf8");
const serverPackage = JSON.parse(fs.readFileSync("server/package.json", "utf8"));

assert.match(patchedServer, /width: 12800, height: 8000, gridWidth: 40, gridHeight: 25/);
assert.match(patchedServer, /x: 2200, y: 1750/);
assert.match(patchedServer, /orientation: orientations\[crypto\.randomInt/);
assert.match(patchedServer, /angleVertex/);
assert.match(patchedServer, /angleDegrees/);
assert.match(patchedServer, /mirror: crypto\.randomInt\(2\) === 1/);
assert.match(patchedServer, /const TICK_RATE = 50/);
assert.match(patchedServer, /PROJECTILE_RADIUS = 18/);

assert.match(minimap, /original\.replaceWith\(canvas\)/);
assert.match(minimap, /territoryDelta/);
assert.match(minimap, /bufferCtx/);
assert.match(minimap, /ctx\.drawImage\(buffer/);
assert.match(minimap, /WAITING FOR LIVE MAP/);
assert.doesNotMatch(minimap, /view\.territory = message\.territory \|\| \[\]/);

assert.match(pickupAssets, /assets\/pickups\/ammo\.svg/);
assert.match(pickupAssets, /assets\/pickups\/shield\.svg/);
assert.match(pickupAssets, /CanvasRenderingContext2D\.prototype\.fillText/);
assert.match(pickupAssets, /masterRealtimeCanvas/);

for (const asset of ["ammo", "shield", "speed", "rapid", "paint"]) {
  const svg = fs.readFileSync(`assets/pickups/${asset}.svg`, "utf8");
  assert.match(svg, /<svg/);
  assert.match(svg, /viewBox="0 0 64 64"/);
}

assert.match(questionUi, /right-bottom/);
assert.match(questionUi, /right-top/);
assert.match(questionUi, /left-bottom/);
assert.match(questionUi, /left-top/);
assert.match(questionUi, /drawAngle/);
assert.match(questionUi, /90 - degrees/);
assert.match(questionUi, /diagram\.mirror/);

assert.match(indexHtml, /question-bank-v10-ui\.js/);
assert.match(indexHtml, /persistent minimap|full-state recovery/i);
assert.match(masterHtml, /GAMEPLAY V12/);
assert.match(musicMode, /pickup-assets-v10\.js/);
assert.match(musicMode, /minimap-v10\.js/);
assert.equal(serverPackage.scripts.start, "node --require ./runtime-v12.js secure-gateway.js");

console.log("Gameplay v10 compatibility test passed under runtime v12: the large arena, persistent minimap, varied geometry and dedicated supply assets remain configured.");
