"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const files = [
  "student-v3.js",
  "master-v3.js",
  "master-enhancements.js",
  "master-live-game.js",
  "master-scroll-guard.js",
  "teacher-auth.js",
  "music-mode-ui.js",
  "config.js",
  "server/runtime-patch.js",
  "server/server-v3.js",
  "server/secure-gateway.js"
];
for (const file of files) new vm.Script(fs.readFileSync(file, "utf8"), { filename: file });

const studentHtml = fs.readFileSync("index.html", "utf8");
const masterHtml = fs.readFileSync("master.html", "utf8");
const teacherAliasHtml = fs.readFileSync("teacher.html", "utf8");
const studentJs = fs.readFileSync("student-v3.js", "utf8");
const masterJs = fs.readFileSync("master-v3.js", "utf8");
const masterEnhancementsJs = fs.readFileSync("master-enhancements.js", "utf8");
const masterLiveGameJs = fs.readFileSync("master-live-game.js", "utf8");
const teacherAuthJs = fs.readFileSync("teacher-auth.js", "utf8");
const runtimePatchJs = fs.readFileSync("server/runtime-patch.js", "utf8");
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

assert.match(studentHtml, /Register one of the nine PC players/);
assert.match(studentHtml, /one arena player/);
assert.match(studentHtml, /Student 1 full name/);
assert.match(studentHtml, /Student 2 full name/);
assert.match(studentHtml, /Student 3 full name/);
assert.match(studentHtml, /9 PC players total/);
assert.match(studentHtml, /3 students per player/);
assert.match(studentHtml, /3 teams total/);
assert.match(studentHtml, /3 players per team/);
assert.match(studentHtml, /proposalPanel" class="ballot-panel hidden" hidden/);
assert.match(studentHtml, /votePanel" class="ballot-panel hidden" hidden/);
assert.doesNotMatch(studentHtml, /href="(?:master|teacher)\.html"/);
assert.doesNotMatch(studentHtml, />Preferred team</);
assert.match(studentHtml, /teamSelect" hidden/);

assert.match(masterHtml, /teacherAuthOverlay/);
assert.match(masterHtml, /teacherPassword/);
assert.match(masterHtml, /SERVER-VERIFIED MASTER PAGE/);
assert.match(masterHtml, /9 PC players total/);
assert.match(masterHtml, /3 PC players per team/);
assert.match(masterHtml, /exactly <strong>3 student names<\/strong>/);
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
assert.match(teacherAuthJs, /authenticate_teacher/);
assert.match(teacherAuthJs, /teacherAuthToken/);
assert.doesNotMatch(teacherAuthJs, /["']9109["']/);
assert.match(gatewayJs, /DEFAULT_TEACHER_PASSWORD = "9109"/);
assert.match(gatewayJs, /teacher_authenticated/);
assert.match(gatewayJs, /teacherAuthToken/);
assert.match(masterJs, /randomAvailableTeam/);
assert.match(masterJs, /APPROVE · RANDOM TEAM/);
assert.doesNotMatch(masterJs, /type:\s*"move_player"/);

console.log("Smoke test passed: secure teacher access, live authoritative arena, embedded master player station, editable player PIN, visible AI roster, prominent start control, 9-player 3×3 structure and automatic music team names are present.");
