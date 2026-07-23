"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const files = [
  "student-v3.js",
  "gameplay-v5.js",
  "gameplay-v6.js",
  "gameplay-v8.js",
  "gameplay-v9.js",
  "minimap-v10.js",
  "pickup-assets-v10.js",
  "question-bank-v10-ui.js",
  "team-selection-v8.js",
  "master-v3.js",
  "master-enhancements.js",
  "master-live-game.js",
  "master-live-v6.js",
  "master-live-v9.js",
  "master-ready-control.js",
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
  "server/server-v3.js",
  "server/secure-gateway.js"
];
for (const file of files) new vm.Script(fs.readFileSync(file, "utf8"), { filename: file });

const studentHtml = fs.readFileSync("index.html", "utf8");
const masterHtml = fs.readFileSync("master.html", "utf8");
const teacherAliasHtml = fs.readFileSync("teacher.html", "utf8");
const studentJs = fs.readFileSync("student-v3.js", "utf8");
const gameplayV6Js = fs.readFileSync("gameplay-v6.js", "utf8");
const gameplayV8Js = fs.readFileSync("gameplay-v8.js", "utf8");
const gameplayV9Js = fs.readFileSync("gameplay-v9.js", "utf8");
const minimapV10Js = fs.readFileSync("minimap-v10.js", "utf8");
const pickupAssetsV10Js = fs.readFileSync("pickup-assets-v10.js", "utf8");
const questionV10Js = fs.readFileSync("question-bank-v10-ui.js", "utf8");
const teamSelectionV8Js = fs.readFileSync("team-selection-v8.js", "utf8");
const masterJs = fs.readFileSync("master-v3.js", "utf8");
const masterEnhancementsJs = fs.readFileSync("master-enhancements.js", "utf8");
const masterLiveGameJs = fs.readFileSync("master-live-game.js", "utf8");
const masterLiveV6Js = fs.readFileSync("master-live-v6.js", "utf8");
const masterLiveV9Js = fs.readFileSync("master-live-v9.js", "utf8");
const teacherAuthJs = fs.readFileSync("teacher-auth.js", "utf8");
const runtimePatchJs = fs.readFileSync("server/runtime-patch.js", "utf8");
const runtimeV6Js = fs.readFileSync("server/runtime-v6.js", "utf8");
const runtimeV8Js = fs.readFileSync("server/runtime-v8.js", "utf8");
const runtimeV10Js = fs.readFileSync("server/runtime-v10.js", "utf8");
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
assert.match(serverJs, /const PLAYERS_PER_TEAM = 3/);
assert.match(serverJs, /const STUDENTS_PER_PC = 3/);
assert.match(serverJs, /parseStudentNames/);
assert.match(serverJs, /this\.players\.set\(player\.id, player\)/);
assert.match(serverJs, /teamCounts/);
assert.match(serverJs, /winnerRule:\s*"largest-territory"/);
assert.match(serverJs, /projectiles:/);
assert.match(serverJs, /territory:\s*Array\.from/);

assert.match(runtimePatchJs, /MUSIC_TEAM_NAMES/);
assert.match(runtimePatchJs, /Paint It Black/);
assert.match(runtimePatchJs, /Comfortably Numb/);
assert.match(runtimePatchJs, /Feel Good Inc\./);
assert.match(runtimePatchJs, /randomMusicTeamNames/);
assert.match(runtimePatchJs, /proposalsSubmitted: true, votesSubmitted: true/);
assert.match(runtimePatchJs, /changeRoomCode/);
assert.match(runtimePatchJs, /newRoomCode/);
assert.match(runtimePatchJs, /before any player registers/);

assert.match(runtimeV6Js, /MAX_LIVES = 3/);
assert.match(runtimeV6Js, /MAX_AMMO = 5/);
assert.match(runtimeV6Js, /MAX_PICKUPS = 14/);
assert.match(runtimeV6Js, /spawnPickup/);
assert.match(runtimeV6Js, /pickup_collected/);
assert.match(runtimeV6Js, /life_lost/);
assert.match(runtimeV6Js, /STATE_BACKPRESSURE_BYTES/);
assert.match(runtimeV6Js, /perMessageDeflate/);

assert.match(runtimeV8Js, /selectTeam\(playerId, value\)/);
assert.match(runtimeV8Js, /humanVersusHuman/);
assert.match(runtimeV8Js, /!killer\.isBot && !victim\.isBot/);
assert.match(runtimeV8Js, /case "select_team"/);
assert.match(runtimeV10Js, /width: 12800, height: 8000/);
assert.match(runtimeV10Js, /angleVertex/);
assert.match(runtimeV10Js, /angleDegrees/);

assert.match(studentHtml, /Register one of the nine PC players/);
assert.match(studentHtml, /one arena player/);
assert.match(studentHtml, /Student 1 full name/);
assert.match(studentHtml, /Student 2 full name/);
assert.match(studentHtml, /Student 3 full name/);
assert.match(studentHtml, /9 PC players/);
assert.match(studentHtml, /exactly three students/i);
assert.match(studentHtml, /3 teams/);
assert.match(studentHtml, /3 lives/);
assert.match(studentHtml, /5 ammo charges/);
assert.match(studentHtml, /supply boxes|supply assets|explosion effects|swept bullet hitboxes|automatic ammo recovery|ammunition charge every 10 seconds/i);
assert.match(studentHtml, /players per team|PC players total/i);
assert.match(studentHtml, /select any team name|choose one of the available team names/i);
assert.match(studentHtml, /12,800 × 8,000/);
assert.match(studentHtml, /proposalPanel" class="ballot-panel hidden" hidden/);
assert.match(studentHtml, /votePanel" class="ballot-panel hidden" hidden/);
assert.doesNotMatch(studentHtml, /href="(?:master|teacher)\.html"/);
assert.doesNotMatch(studentHtml, />Preferred team</);
assert.match(studentHtml, /teamSelect" hidden/);

assert.match(gameplayV6Js, /resource-hud/);
assert.match(gameplayV6Js, /lifeDisplay/);
assert.match(gameplayV6Js, /ammoDisplay/);
assert.match(gameplayV6Js, /pickupLegend/);
assert.match(gameplayV6Js, /predictedDashUntil/);
assert.match(gameplayV6Js, /droppedSnapshots/);

assert.match(gameplayV8Js, /AIMING WITH MOUSE/);
assert.match(gameplayV8Js, /message\.shoot = spacePressed/);
assert.match(gameplayV8Js, /spawnExplosion/);
assert.match(gameplayV8Js, /globalCompositeOperation = "lighter"/);
assert.match(gameplayV8Js, /pickupLegend/);
assert.match(gameplayV9Js, /territoryDelta/);
assert.match(minimapV10Js, /original\.replaceWith\(canvas\)/);
assert.match(minimapV10Js, /ctx\.drawImage\(buffer/);
assert.match(pickupAssetsV10Js, /assets\/pickups\/ammo\.svg/);
assert.match(questionV10Js, /DIFFERENT ANGLES AND ORIENTATIONS/);
assert.match(teamSelectionV8Js, /Choose an available team name/);
assert.match(teamSelectionV8Js, /type: "select_team"/);

assert.match(masterHtml, /teacherAuthOverlay/);
assert.match(masterHtml, /teacherPassword/);
assert.match(masterHtml, /SERVER-VERIFIED MASTER PAGE/);
assert.match(masterHtml, /9 PC players/);
assert.match(masterHtml, /3 players per team/);
assert.match(masterHtml, /3 student names per player|exactly three student names/i);
assert.match(masterHtml, /3 lives/);
assert.match(masterHtml, /5 ammo charges/);
assert.match(masterHtml, /supply boxes|supply assets|bullet, shield, speed/i);
assert.match(masterHtml, /12,800 × 8,000/);
assert.match(masterHtml, /teamVotingList" hidden/);
assert.match(masterHtml, /newRoomCodeInput/);
assert.match(masterHtml, /changeRoomCodeButton/);
assert.match(masterHtml, /Player list — real and AI/);
assert.match(masterHtml, /ADD AI BOTS TO FILL MISSING SLOTS/);
assert.match(masterHtml, /START 5-MINUTE MATCH/);
assert.match(masterHtml, /Live arena and master player station/);
assert.match(masterHtml, /masterGameCanvas/);
assert.match(masterHtml, /masterPlayerFrame/);
assert.match(masterHtml, /JOIN AS PLAYER HERE/);
assert.match(masterHtml, /FULLSCREEN LIVE ARENA/);
assert.match(masterHtml, /master-live-game\.css/);
assert.match(masterHtml, /master-live-game\.js/);
assert.doesNotMatch(masterHtml, /Teams and voting/);
assert.doesNotMatch(masterHtml, /STUDENT ENTRY LINK/);
assert.doesNotMatch(masterHtml, /href="index\.html"/);
assert.match(teacherAliasHtml, /master\.html/);

assert.match(masterEnhancementsJs, /__triadTeacherControlSocket/);
assert.match(masterEnhancementsJs, /set_registration_lock/);
assert.match(masterEnhancementsJs, /AI PLAYER/);
assert.match(masterEnhancementsJs, /playerListSummary/);
assert.match(masterLiveGameJs, /masterLiveFeedSend/);
assert.match(masterLiveGameJs, /type === "state"/);
assert.match(masterLiveGameJs, /territoryCounts/);
assert.match(masterLiveGameJs, /JOIN AS PLAYER HERE|Teacher Player/);
assert.match(masterLiveGameJs, /iframe|masterPlayerFrame/);
assert.match(masterLiveV6Js, /masterSupplyCanvas/);
assert.match(masterLiveV6Js, /masterNetworkQuality/);
assert.match(masterLiveV6Js, /view\.pickups/);
assert.match(masterLiveV9Js, /masterRealtimeCanvas/);
assert.match(teacherAuthJs, /authenticate_teacher/);
assert.match(teacherAuthJs, /teacherAuthToken/);
assert.doesNotMatch(teacherAuthJs, /["']9109["']/);
assert.match(gatewayJs, /DEFAULT_TEACHER_PASSWORD = "9109"/);
assert.match(gatewayJs, /teacher_authenticated/);
assert.match(gatewayJs, /teacherAuthToken/);
assert.match(masterJs, /randomAvailableTeam/);
assert.match(masterJs, /APPROVE · RANDOM TEAM/);
assert.doesNotMatch(masterJs, /type:\s*"move_player"/);

console.log("Smoke test passed: larger map, stable minimap, varied geometry, dedicated supply assets, secure teacher access and multiplayer gameplay are present.");
