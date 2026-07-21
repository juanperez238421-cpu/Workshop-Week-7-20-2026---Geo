"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const files = ["student-v2.js", "master.js", "config.js", "server/server-v2.js"];
for (const file of files) new vm.Script(fs.readFileSync(file, "utf8"), { filename: file });

const studentHtml = fs.readFileSync("index.html", "utf8");
const masterHtml = fs.readFileSync("master.html", "utf8");
const studentJs = fs.readFileSync("student-v2.js", "utf8");
const masterJs = fs.readFileSync("master.js", "utf8");
const serverJs = fs.readFileSync("server/server-v2.js", "utf8");

function ids(html) { return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])); }
function jsIds(js) { return new Set([...js.matchAll(/\$\("([^"]+)"\)/g)].map((m) => m[1])); }
for (const [name, html, js] of [["student", studentHtml, studentJs], ["master", masterHtml, masterJs]]) {
  const missing = [...jsIds(js)].filter((id) => !ids(html).has(id));
  assert.deepEqual(missing, [], `${name} page missing IDs: ${missing.join(", ")}`);
}

assert.match(serverJs, /create_control_room/);
assert.match(serverJs, /register_student/);
assert.match(serverJs, /approve_registration/);
assert.match(serverJs, /set_ready/);
assert.match(serverJs, /teacher-controller-plus-nine-students/);
assert.match(serverJs, /MATCH_DURATION_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/);
assert.match(serverJs, /winnerRule:\s*"largest-territory"/);
assert.match(masterHtml, /Teacher \/ master console/);
assert.match(studentHtml, /REGISTER AND WAIT FOR TEACHER/);
assert.match(studentJs, /reconnect_student/);
assert.match(masterHtml, /START 5-MINUTE MATCH/);
console.log("Smoke test passed: teacher control, student registration, approvals, ready gate, and multiplayer protocol are present.");
