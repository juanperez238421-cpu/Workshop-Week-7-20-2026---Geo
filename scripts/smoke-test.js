"use strict";

const fs = require("node:fs");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const studentHtml = fs.readFileSync("index.html", "utf8");
const studentJs = fs.readFileSync("student-app-v15.js", "utf8");
const studentCss = fs.readFileSync("student-v15.css", "utf8");
const masterHtml = fs.readFileSync("master.html", "utf8");
const masterScroll = fs.readFileSync("master-scroll-guard.js", "utf8");
const teacherAuth = fs.readFileSync("teacher-auth.js", "utf8");
const gateway = fs.readFileSync("server/secure-gateway.js", "utf8");
const runtimeV12 = fs.readFileSync("server/runtime-v12.js", "utf8");
const server = fs.readFileSync("server/server-v3.js", "utf8");

new vm.Script(studentJs, { filename: "student-app-v15.js" });
new vm.Script(masterScroll, { filename: "master-scroll-guard.js" });

function htmlIds(html) {
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
}

function referencedIds(js) {
  return new Set([...js.matchAll(/\$\("([A-Za-z0-9_-]+)"\)/g)].map((match) => match[1]));
}

const missingStudentIds = [...referencedIds(studentJs)].filter((id) => !htmlIds(studentHtml).has(id));
assert.deepEqual(missingStudentIds, [], `Stable student page missing IDs: ${missingStudentIds.join(", ")}`);

const scriptSources = [...studentHtml.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
assert.equal(scriptSources.length, 2, `Student page must load exactly two scripts, found ${scriptSources.length}`);
assert.match(scriptSources[0], /^config\.js\?v=20260723-studentstable15$/);
assert.match(scriptSources[1], /^student-app-v15\.js\?v=20260723-studentstable15$/);

for (const removedLayer of [
  "renderer-bootstrap-v12.js",
  "student-v3.js",
  "student-registration-sync.js",
  "music-mode-ui.js",
  "gameplay-v9.js",
  "network-v12.js",
  "minimap-v10.js",
  "question-bank-v10-ui.js",
  "team-selection-v8.js"
]) {
  assert.doesNotMatch(studentHtml, new RegExp(removedLayer.replaceAll(".", "\\.")), `${removedLayer} must not be loaded by the stable student page`);
}

assert.doesNotMatch(studentJs, /WebSocket\.prototype/);
assert.doesNotMatch(studentJs, /HTMLCanvasElement\.prototype/);
assert.doesNotMatch(studentJs, /window\.requestAnimationFrame\s*=/);
assert.doesNotMatch(studentJs, /MutationObserver/);
assert.doesNotMatch(studentJs, /appendChild\(script\)|createElement\("script"\)/);
assert.match(studentJs, /single-socket-single-render-loop/);
assert.match(studentJs, /2_500_000/);
assert.match(studentJs, /LOBBY_FRAME_INTERVAL_MS = 200/);
assert.match(studentJs, /GAME_FRAME_INTERVAL_MS = 33/);
assert.match(studentJs, /MAX_SOCKET_BUFFER = 64 \* 1024/);
assert.match(studentJs, /territoryDelta/);
assert.match(studentJs, /type: "select_team"/);
assert.match(studentJs, /type: "set_ready"/);
assert.match(studentJs, /type: "register_student"/);
assert.match(studentJs, /type: "reconnect_student"/);
assert.match(studentJs, /type: "ping"/);
assert.match(studentJs, /thales_height/);
assert.match(studentJs, /ratio_sin/);
assert.match(studentJs, /ratio_cos/);
assert.match(studentJs, /unknown side/i);

assert.match(studentHtml, /STABLE CLIENT V15/);
assert.match(studentHtml, /one WebSocket · one renderer · bounded memory/i);
assert.match(studentHtml, /exactly three students/i);
assert.match(studentHtml, /id="playerTeamChoice"/);
assert.match(studentHtml, /id="readyButton"/);
assert.match(studentHtml, /GEOMETRY RESPAWN CHALLENGE/);
assert.match(studentHtml, /<b>5 s<\/b><span>automatic ammo recovery<\/span>/);
assert.doesNotMatch(studentHtml, /href="(?:master|teacher)\.html"/);
assert.match(studentCss, /max-height: calc\(100dvh - 32px\)/);
assert.match(studentCss, /resource-hud-v15/);

assert.match(masterHtml, /SERVER-VERIFIED MASTER PAGE/);
assert.match(masterScroll, /clientBuild/);
assert.match(masterScroll, /url\.searchParams\.set\("v", STUDENT_BUILD\)/);
assert.match(teacherAuth, /authenticate_teacher/);
assert.doesNotMatch(teacherAuth, /["']9109["']/);
assert.match(gateway, /DEFAULT_TEACHER_PASSWORD = "9109"/);

assert.match(server, /const PROTOCOL = 3/);
assert.match(server, /const MAX_PLAYERS = 9/);
assert.match(server, /const STUDENTS_PER_PC = 3/);
assert.match(runtimeV12, /PROJECTILE_LIFETIME_MS = 5200/);
assert.match(runtimeV12, /AMMO_REGEN_INTERVAL_MS = 5 \* 1000/);
assert.match(runtimeV12, /sendFullStateTo/);
assert.match(runtimeV12, /player\.ws !== ws/);

console.log("Smoke test passed: Student Stable v15 uses one socket, one bounded renderer, direct registration/team/ready controls, integrated geometry questions, secure teacher separation and the authoritative Gameplay v12 server.");
