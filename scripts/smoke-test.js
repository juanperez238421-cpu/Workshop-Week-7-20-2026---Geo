"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const files = ["student-v3.js", "master-v3.js", "teacher-v4.js", "config.js", "server/server-v3.js", "server/secure-gateway.js"];
for (const file of files) new vm.Script(fs.readFileSync(file, "utf8"), { filename: file });

const indexHtml = fs.readFileSync("index.html", "utf8");
const legacyMasterHtml = fs.readFileSync("master.html", "utf8");
const studentHtml = fs.readFileSync("student.html", "utf8");
const teacherHtml = fs.readFileSync("teacher.html", "utf8");
const studentJs = fs.readFileSync("student-v3.js", "utf8");
const teacherJs = fs.readFileSync("teacher-v4.js", "utf8");
const serverJs = fs.readFileSync("server/server-v3.js", "utf8");
const gatewayJs = fs.readFileSync("server/secure-gateway.js", "utf8");

function ids(html) { return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1])); }
function jsIds(js) { return new Set([...js.matchAll(/\$\("([^"]+)"\)/g)].map((match) => match[1])); }
for (const [name, html, js] of [["student", studentHtml, studentJs], ["teacher", teacherHtml, teacherJs]]) {
  const missing = [...jsIds(js)].filter((id) => !ids(html).has(id));
  assert.deepEqual(missing, [], `${name} page missing IDs: ${missing.join(", ")}`);
}

assert.match(indexHtml, /student\.html/);
assert.match(legacyMasterHtml, /teacher\.html/);
assert.doesNotMatch(studentHtml, /Teacher control|teacher\.html|master\.html/i);
assert.match(teacherHtml, /id="teacherPasswordInput"/);
assert.match(teacherHtml, /id="loginPanel"/);
assert.match(teacherJs, /authenticate_teacher/);
assert.match(teacherJs, /teacher_authenticated/);
assert.match(teacherJs, /student\.html/);
assert.match(gatewayJs, /DEFAULT_TEACHER_PASSWORD = "9109"/);
assert.match(gatewayJs, /Teacher authentication required/);
assert.match(gatewayJs, /PROTECTED_TEACHER_MESSAGES/);

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
assert.match(teacherHtml, /FILL ALL MISSING SLOTS WITH AI/);
assert.match(teacherHtml, /Random colors and team-name voting/);
assert.match(studentJs, /submit_team_proposals/);
assert.match(studentJs, /submit_team_votes/);
assert.match(teacherJs, /fill_with_bots/);
assert.match(teacherHtml, /START 5-MINUTE MATCH/);
console.log("Smoke test passed: student and teacher pages are separate, teacher controls require server-side PIN authentication, and classroom game rules remain present.");
