"use strict";

const fs = require("node:fs");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const files = [
  "student-v3.js",
  "student-registration-sync.js",
  "gameplay-v5.js",
  "gameplay-v6.js",
  "gameplay-v8.js",
  "gameplay-v9.js",
  "minimap-v10.js",
  "pickup-assets-v10.js",
  "question-bank-v10-ui.js",
  "network-v11.js",
  "team-selection-v8.js",
  "master-v3.js",
  "master-enhancements.js",
  "master-live-game.js",
  "master-live-v6.js",
  "master-live-v9.js",
  "master-ready-control.js",
  "master-flex-start-v11.js",
  "master-scroll-guard.js",
  "teacher-auth.js",
  "music-mode-ui.js",
  "config.js",
  "server/runtime-patch.js",
  "server/runtime-v6.js",
  "server/runtime-v7.js",
  "server/runtime-v8.js",
  "server/runtime-v9.js",
  "server/runtime-v10.js",
  "server/runtime-v11.js",
  "server/server-v3.js",
  "server/secure-gateway.js"
];
for (const file of files) new vm.Script(fs.readFileSync(file, "utf8"), { filename: file });

const studentHtml = fs.readFileSync("index.html", "utf8");
const masterHtml = fs.readFileSync("master.html", "utf8");
const teacherAliasHtml = fs.readFileSync("teacher.html", "utf8");
const studentJs = fs.readFileSync("student-v3.js", "utf8");
const gameplayV8Js = fs.readFileSync("gameplay-v8.js", "utf8");
const gameplayV9Js = fs.readFileSync("gameplay-v9.js", "utf8");
const minimapV10Js = fs.readFileSync("minimap-v10.js", "utf8");
const pickupAssetsV10Js = fs.readFileSync("pickup-assets-v10.js", "utf8");
const questionV10Js = fs.readFileSync("question-bank-v10-ui.js", "utf8");
const networkV11Js = fs.readFileSync("network-v11.js", "utf8");
const flexV11Js = fs.readFileSync("master-flex-start-v11.js", "utf8");
const masterJs = fs.readFileSync("master-v3.js", "utf8");
const masterEnhancementsJs = fs.readFileSync("master-enhancements.js", "utf8");
const masterLiveGameJs = fs.readFileSync("master-live-game.js", "utf8");
const masterLiveV9Js = fs.readFileSync("master-live-v9.js", "utf8");
const teacherAuthJs = fs.readFileSync("teacher-auth.js", "utf8");
const runtimePatchJs = fs.readFileSync("server/runtime-patch.js", "utf8");
const runtimeV6Js = fs.readFileSync("server/runtime-v6.js", "utf8");
const runtimeV8Js = fs.readFileSync("server/runtime-v8.js", "utf8");
const runtimeV10Js = fs.readFileSync("server/runtime-v10.js", "utf8");
const runtimeV11Js = fs.readFileSync("server/runtime-v11.js", "utf8");
const serverJs = fs.readFileSync("server/server-v3.js", "utf8");
const gatewayJs = fs.readFileSync("server/secure-gateway.js", "utf8");

function ids(html) { return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1])); }
function jsIds(js) { return new Set([...js.matchAll(/\$\("([^"]+)"\)/g)].map((match) => match[1])); }
for (const [name, html, js] of [
  ["student", studentHtml, studentJs],
  ["master", masterHtml, masterJs],
  ["master-enhancements", masterHtml, masterEnhancementsJs],
  ["master-live-game", masterHtml, masterLiveGameJs],
  ["master-auth", masterHtml, teacherAuthJs]
]) {
  const missing = [...jsIds(js)].filter((id) => !ids(html).has(id));
  assert.deepEqual(missing, [], `${name} page missing IDs: ${missing.join(", ")}`);
}

assert.match(serverJs, /const PROTOCOL = 3/);
assert.match(serverJs, /const MAX_PLAYERS = 9/);
assert.match(serverJs, /const STUDENTS_PER_PC = 3/);
assert.match(serverJs, /winnerRule:\s*"largest-territory"/);

assert.match(runtimePatchJs, /MUSIC_TEAM_NAMES/);
assert.match(runtimePatchJs, /RANDOM_PC_TITLES/);
assert.match(runtimeV6Js, /MAX_LIVES = 3/);
assert.match(runtimeV6Js, /MAX_AMMO = 5/);
assert.match(runtimeV6Js, /MAX_PICKUPS = 14/);
assert.match(runtimeV8Js, /selectTeam\(playerId, value\)/);
assert.match(runtimeV8Js, /!killer\.isBot && !victim\.isBot/);
assert.match(runtimeV10Js, /width: 12800, height: 8000/);
assert.match(runtimeV10Js, /angleVertex/);
assert.match(runtimeV11Js, /MIN_PLAYERS_TO_START = 1/);
assert.match(runtimeV11Js, /forwardToBrowser/);
assert.match(runtimeV11Js, /sendSocketFrame/);
assert.match(runtimeV11Js, /MAX_PROJECTILES = 180/);
assert.match(runtimeV11Js, /FULL_TERRITORY_EVERY = 30/);

assert.match(studentHtml, /Register a classroom PC player/);
assert.match(studentHtml, /1–9 active players/);
assert.match(studentHtml, /full room is no longer required/i);
assert.match(studentHtml, /exactly three students/i);
assert.match(studentHtml, /3 lives/);
assert.match(studentHtml, /5 ammo charges/);
assert.match(studentHtml, /12,800 × 8,000/);
assert.match(studentHtml, /question-bank-v10-ui\.js/);
assert.doesNotMatch(studentHtml, /href="(?:master|teacher)\.html"/);

assert.match(gameplayV8Js, /AIMING WITH MOUSE/);
assert.match(gameplayV8Js, /message\.shoot = spacePressed/);
assert.match(gameplayV9Js, /territoryDelta/);
assert.match(minimapV10Js, /original\.replaceWith\(canvas\)/);
assert.match(minimapV10Js, /ctx\.drawImage\(buffer/);
assert.match(pickupAssetsV10Js, /assets\/pickups\/ammo\.svg/);
assert.match(questionV10Js, /DIFFERENT ANGLES AND ORIENTATIONS/);
assert.match(networkV11Js, /STREAM_STALL_MS = 3600/);
assert.match(networkV11Js, /INPUT_MIN_INTERVAL_MS = 45/);

assert.match(masterHtml, /SERVER-VERIFIED MASTER PAGE/);
assert.match(masterHtml, /1–9 active players/);
assert.match(masterHtml, /ADD AT LEAST ONE PLAYER/);
assert.match(masterHtml, /masterPlayerFrame/);
assert.match(masterHtml, /network-v11\.js/);
assert.match(masterHtml, /master-flex-start-v11\.js/);
assert.match(flexV11Js, /START MATCH WITH/);
assert.match(flexV11Js, /FLEXIBLE START ENABLED/);
assert.match(masterLiveV9Js, /masterRealtimeCanvas/);
assert.match(masterLiveGameJs, /JOIN AS PLAYER HERE|Teacher Player/);
assert.match(teacherAliasHtml, /master\.html/);
assert.match(teacherAuthJs, /authenticate_teacher/);
assert.doesNotMatch(teacherAuthJs, /["']9109["']/);
assert.match(gatewayJs, /DEFAULT_TEACHER_PASSWORD = "9109"/);

console.log("Smoke test passed: stable v11 networking, flexible 1–9-player starts, persistent minimap, geometry, supplies, secure teacher access and live supervision are present.");
