"use strict";

const fs = require("node:fs");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const studentHtml = fs.readFileSync("index.html", "utf8");
const studentBootstrap = fs.readFileSync("student-bootstrap-v17.js", "utf8");
const studentInput = fs.readFileSync("student-input-v18.js", "utf8");
const studentCombat = fs.readFileSync("student-combat-v18.js", "utf8");
const studentJs = fs.readFileSync("student-app-v16.js", "utf8");
const studentCss = fs.readFileSync("student-v16.css", "utf8");
const masterHtml = fs.readFileSync("master.html", "utf8");
const masterReport = fs.readFileSync("master-report-v18.js", "utf8");
const masterScroll = fs.readFileSync("master-scroll-guard.js", "utf8");
const teacherAuth = fs.readFileSync("teacher-auth.js", "utf8");
const gateway = fs.readFileSync("server/secure-gateway.js", "utf8");
const runtimeV12 = fs.readFileSync("server/runtime-v12.js", "utf8");
const runtimeV13 = fs.readFileSync("server/runtime-v13.js", "utf8");
const server = fs.readFileSync("server/server-v3.js", "utf8");

for (const [name, source] of [
  ["student-bootstrap-v17.js", studentBootstrap],
  ["student-input-v18.js", studentInput],
  ["student-combat-v18.js", studentCombat],
  ["student-app-v16.js", studentJs],
  ["master-report-v18.js", masterReport],
  ["master-scroll-guard.js", masterScroll],
  ["server/runtime-v13.js", runtimeV13]
]) new vm.Script(source, { filename: name });

function htmlIds(html) {
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
}

function referencedIds(js) {
  return new Set([...js.matchAll(/\$\("([A-Za-z0-9_-]+)"\)/g)].map((match) => match[1]));
}

const ids = htmlIds(studentHtml);
const missingStudentIds = [...referencedIds(studentJs)].filter((id) => !ids.has(id));
assert.deepEqual(missingStudentIds, [], `Recovery student page missing IDs: ${missingStudentIds.join(", ")}`);
assert.equal([...studentHtml.matchAll(/\sid="([^"]+)"/g)].length, ids.size, "Student page must not contain duplicate IDs");

const scripts = [...studentHtml.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(scripts, [
  "student-bootstrap-v17.js?v=20260723-hitscanreport18",
  "student-input-v18.js?v=20260723-hitscanreport18",
  "student-combat-v18.js?v=20260723-hitscanreport18",
  "config.js?v=20260723-hitscanreport18",
  "student-app-v16.js?v=20260723-hitscanreport18"
]);

for (const removedLayer of [
  "renderer-bootstrap-v12.js",
  "student-v3.js",
  "student-registration-sync.js",
  "student-app-v15.js",
  "music-mode-ui.js",
  "gameplay-v9.js",
  "network-v12.js",
  "minimap-v10.js",
  "question-bank-v10-ui.js",
  "team-selection-v8.js"
]) {
  assert.doesNotMatch(studentHtml, new RegExp(removedLayer.replaceAll(".", "\\.")), `${removedLayer} must not load on the v18 student page`);
}

assert.doesNotMatch(studentBootstrap, /HTMLCanvasElement\.prototype/);
assert.match(studentBootstrap, /canvas\.getContext = function lazyGetContext/);
assert.match(studentBootstrap, /registration-before-renderer/);
assert.match(studentBootstrap, /perCanvasLazyContext: true/);
assert.match(studentBootstrap, /WRITABLE_INPUT_IDS/);
assert.match(studentBootstrap, /navigator\.serviceWorker\.getRegistrations/);
assert.match(studentBootstrap, /document\.body\?\.classList\.contains\("lobby-active"\)/);

assert.match(studentInput, /event\.stopPropagation\(\)/);
assert.doesNotMatch(studentInput, /event\.preventDefault\(\)/);
assert.match(studentInput, /fullNamesWithSpaces: true/);
assert.match(studentCombat, /combatFxCanvasV18/);
assert.match(studentCombat, /authoritative-semi-auto-hitscan/);
assert.match(studentCombat, /function ensureOverlay/);

assert.doesNotMatch(studentJs, /WebSocket\.prototype/);
assert.doesNotMatch(studentJs, /HTMLCanvasElement\.prototype/);
assert.doesNotMatch(studentJs, /window\.requestAnimationFrame\s*=/);
assert.doesNotMatch(studentJs, /MutationObserver/);
assert.doesNotMatch(studentJs, /type: "select_team"/);
assert.match(studentJs, /architecture: "input-first-single-socket"/);
assert.match(studentJs, /lobbyRenderer: "off"/);
assert.match(studentJs, /dpr: 1/);
assert.match(studentJs, /MAX_SOCKET_BUFFER = 64 \* 1024/);
assert.match(studentJs, /type: "register_student"/);
assert.match(studentJs, /type: "reconnect_student"/);
assert.match(studentJs, /type: "set_ready"/);
assert.match(studentJs, /type: "input"/);
assert.match(studentJs, /type: "answer"/);
assert.match(studentJs, /territoryDelta/);
assert.match(studentJs, /thales_height/);
assert.match(studentJs, /ratio_sin/);
assert.match(studentJs, /ratio_cos/);

assert.match(studentHtml, /COMBAT V18/);
assert.match(studentHtml, /Spaces, surnames, accents and paste shortcuts work normally/);
assert.match(studentHtml, /id="student1Input"[^>]*maxlength="60"[^>]*placeholder="Name and surname"/);
assert.match(studentHtml, /id="student2Input"[^>]*maxlength="60"[^>]*placeholder="Name and surname"/);
assert.match(studentHtml, /id="student3Input"[^>]*maxlength="60"[^>]*placeholder="Name and surname"/);
assert.doesNotMatch(studentHtml, /id="student[123]Input"[^>]*(?:disabled|readonly)/);
assert.match(studentHtml, /id="registerButton"/);
assert.match(studentHtml, /id="readyButton"/);
assert.doesNotMatch(studentHtml, /id="playerTeamChoice"/);
assert.match(studentHtml, /GEOMETRY RESPAWN CHALLENGE/);
assert.match(studentHtml, /<b>5 s<\/b><span>automatic ammo recovery<\/span>/);
assert.doesNotMatch(studentHtml, /href="(?:master|teacher)\.html"/);

assert.match(studentCss, /pointer-events: auto !important/);
assert.match(studentCss, /body\.lobby-active #gameCanvas/);
assert.match(studentCss, /backdrop-filter: none !important/);
assert.match(studentCss, /#registrationForm input:not\(\[readonly\]\)/);

assert.match(masterHtml, /SERVER-VERIFIED MASTER PAGE/);
assert.match(masterHtml, /master-report-v18\.js/);
assert.ok(masterHtml.indexOf("master-report-v18.js") < masterHtml.indexOf("teacher-auth.js"));
assert.match(masterReport, /automaticDownload: true/);
assert.match(masterReport, /triadGlobalScoreStoreV18/);
assert.match(masterScroll, /clientBuild/);
assert.match(masterScroll, /url\.searchParams\.set\("v", STUDENT_BUILD\)/);
assert.match(teacherAuth, /authenticate_teacher/);
assert.doesNotMatch(teacherAuth, /["']9109["']/);
assert.match(gateway, /DEFAULT_TEACHER_PASSWORD = "9109"/);

assert.match(server, /const PROTOCOL = 3/);
assert.match(server, /const MAX_PLAYERS = 9/);
assert.match(server, /const STUDENTS_PER_PC = 3/);
assert.doesNotMatch(server, /case "select_team"/);
assert.match(runtimeV12, /PROJECTILE_LIFETIME_MS = 5200/);
assert.match(runtimeV12, /AMMO_REGEN_INTERVAL_MS = 5 \* 1000/);
assert.match(runtimeV12, /sendFullStateTo/);
assert.match(runtimeV12, /player\.ws !== ws/);
assert.match(runtimeV13, /HITSCAN_RANGE = 3900/);
assert.match(runtimeV13, /questionsPresented/);
assert.match(runtimeV13, /teacherBrowserBackupRecommended/);

console.log("Smoke test passed: v18 preserves registration-first rendering, accepts complete names with spaces, loads authoritative hitscan visuals and enables automatic teacher-only metadata reporting.");
