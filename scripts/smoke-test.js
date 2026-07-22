"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const files = ["student-v3.js", "master-v3.js", "teacher-auth.js", "config.js", "server/server-v3.js"];
for (const file of files) new vm.Script(fs.readFileSync(file, "utf8"), { filename: file });

const studentHtml = fs.readFileSync("index.html", "utf8");
const masterHtml = fs.readFileSync("master.html", "utf8");
const teacherAliasHtml = fs.readFileSync("teacher.html", "utf8");
const studentJs = fs.readFileSync("student-v3.js", "utf8");
const masterJs = fs.readFileSync("master-v3.js", "utf8");
const teacherAuthJs = fs.readFileSync("teacher-auth.js", "utf8");
const serverJs = fs.readFileSync("server/server-v3.js", "utf8");

function ids(html) { return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1])); }
function jsIds(js) { return new Set([...js.matchAll(/\$\("([^"]+)"\)/g)].map((match) => match[1])); }
for (const [name, html, js] of [["student", studentHtml, studentJs], ["master", masterHtml, masterJs], ["master-auth", masterHtml, teacherAuthJs]]) {
  const missing = [...jsIds(js)].filter((id) => !ids(html).has(id));
  assert.deepEqual(missing, [], `${name} page missing IDs: ${missing.join(", ")}`);
}

assert.match(serverJs, /const PROTOCOL = 3/);
assert.match(serverJs, /parseStudentNames/);
assert.match(serverJs, /Register exactly three students/);
assert.match(serverJs, /BANNED_WORDS/);
assert.match(serverJs, /submitTeamProposals/);
assert.match(serverJs, /submitTeamVotes/);
assert.match(serverJs, /teamNamesFinalized/);
assert.match(serverJs, /randomTeamColors/);
assert.match(serverJs, /addBots/);
assert.match(serverJs, /removeBots/);
assert.match(serverJs, /updateBots/);
assert.match(serverJs, /MATCH_DURATION_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/);
assert.match(serverJs, /winnerRule:\s*"largest-territory"/);
assert.match(studentHtml, /Student 1 full name/);
assert.match(studentHtml, /Student 2 full name/);
assert.match(studentHtml, /Student 3 full name/);
assert.match(studentHtml, /SUBMIT 3 SUGGESTIONS/);
assert.match(studentHtml, /SUBMIT 3 VOTES/);
assert.doesNotMatch(studentHtml, /href="(?:master|teacher)\.html"/);
assert.doesNotMatch(studentHtml, />Preferred team</);
assert.match(studentHtml, /teamSelect" hidden/);
assert.match(studentHtml, /RANDOMLY ASSIGNED TEAM/);
assert.match(masterHtml, /teacherAuthOverlay/);
assert.match(masterHtml, /teacherPassword/);
assert.match(masterHtml, /FILL ALL MISSING SLOTS WITH AI/);
assert.match(masterHtml, /Random team assignment, colors and voting/);
assert.doesNotMatch(masterHtml, /href="index\.html"/);
assert.match(teacherAliasHtml, /master\.html/);
assert.match(teacherAuthJs, /PASSWORD_SHA256/);
assert.doesNotMatch(teacherAuthJs, /["']9109["']/);
assert.match(studentJs, /submit_team_proposals/);
assert.match(studentJs, /submit_team_votes/);
assert.match(masterJs, /randomAvailableTeam/);
assert.match(masterJs, /APPROVE · RANDOM TEAM/);
assert.doesNotMatch(masterJs, /move_player/);
assert.match(masterJs, /fill_with_bots/);
assert.match(masterHtml, /START 5-MINUTE MATCH/);
console.log("Smoke test passed: master.html is password-gated, student access is disconnected, team preference is hidden, random team assignment is active, and gameplay contracts remain present.");
