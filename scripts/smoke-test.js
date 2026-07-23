"use strict";

const fs = require("node:fs");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const studentHtml = fs.readFileSync("index.html", "utf8");
const studentBootstrap = fs.readFileSync("student-bootstrap-v17.js", "utf8");
const studentInput = fs.readFileSync("student-input-v18.js", "utf8");
const studentGameplay = fs.readFileSync("student-arena-v22.js", "utf8");
const studentScore = fs.readFileSync("student-score-resilience-v23.js", "utf8");
const questionUi = fs.readFileSync("question-ui-v19.js", "utf8");
const studentJs = fs.readFileSync("student-app-v16.js", "utf8");
const studentCss = fs.readFileSync("student-v16.css", "utf8");
const gameplayCss = fs.readFileSync("student-arena-v22.css", "utf8");
const scoreCss = fs.readFileSync("student-score-resilience-v23.css", "utf8");
const masterHtml = fs.readFileSync("master.html", "utf8");
const masterReport = fs.readFileSync("master-report-v18.js", "utf8");
const masterScore = fs.readFileSync("master-team-score-v23.js", "utf8");
const masterScoreCss = fs.readFileSync("master-team-score-v23.css", "utf8");
const masterScroll = fs.readFileSync("master-scroll-guard.js", "utf8");
const musicMode = fs.readFileSync("music-mode-ui.js", "utf8");
const teacherAuth = fs.readFileSync("teacher-auth.js", "utf8");
const gateway = fs.readFileSync("server/secure-gateway.js", "utf8");
const runtimeV12 = fs.readFileSync("server/runtime-v12.js", "utf8");
const runtimeV13 = fs.readFileSync("server/runtime-v13.js", "utf8");
const runtimeV14 = fs.readFileSync("server/runtime-v14.js", "utf8");
const runtimeV15 = fs.readFileSync("server/runtime-v15.js", "utf8");
const runtimeV16 = fs.readFileSync("server/runtime-v16.js", "utf8");
const server = fs.readFileSync("server/server-v3.js", "utf8");

for (const [name, source] of [
  ["student-bootstrap-v17.js", studentBootstrap],
  ["student-input-v18.js", studentInput],
  ["student-arena-v22.js", studentGameplay],
  ["student-score-resilience-v23.js", studentScore],
  ["question-ui-v19.js", questionUi],
  ["student-app-v16.js", studentJs],
  ["master-report-v18.js", masterReport],
  ["master-team-score-v23.js", masterScore],
  ["master-scroll-guard.js", masterScroll],
  ["music-mode-ui.js", musicMode],
  ["server/runtime-v13.js", runtimeV13],
  ["server/runtime-v14.js", runtimeV14],
  ["server/runtime-v15.js", runtimeV15],
  ["server/runtime-v16.js", runtimeV16]
]) new vm.Script(source, { filename: name });

function htmlIds(html) {
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
}

function referencedIds(js) {
  return new Set([...js.matchAll(/\$\("([A-Za-z0-9_-]+)"\)/g)].map((match) => match[1]));
}

const ids = htmlIds(studentHtml);
const missingStudentIds = [...referencedIds(studentJs)].filter((id) => !ids.has(id));
assert.deepEqual(missingStudentIds, [], `Student page missing IDs: ${missingStudentIds.join(", ")}`);
assert.equal([...studentHtml.matchAll(/\sid="([^"]+)"/g)].length, ids.size, "Student page must not contain duplicate IDs");

const scripts = [...studentHtml.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(scripts, [
  "student-bootstrap-v17.js?v=20260723-recoveredarena22",
  "student-input-v18.js?v=20260723-recoveredarena22",
  "student-arena-v22.js?v=20260723-recoveredarena22",
  "student-score-resilience-v23.js?v=20260723-private-score23",
  "config.js?v=20260723-recoveredarena22",
  "question-ui-v19.js?v=20260723-recoveredarena22",
  "student-app-v16.js?v=20260723-recoveredarena22"
]);

for (const removedLayer of [
  "renderer-bootstrap-v12.js",
  "student-registration-sync.js",
  "student-app-v15.js",
  "student-combat-v18.js",
  "student-gameplay-v20.js",
  "student-master-view-v21.js",
  "music-mode-ui.js",
  "gameplay-v9.js",
  "network-v12.js",
  "minimap-v10.js",
  "question-bank-v10-ui.js",
  "team-selection-v8.js"
]) assert.doesNotMatch(studentHtml, new RegExp(removedLayer.replaceAll(".", "\\.")), `${removedLayer} must not load on the v23 student page`);

assert.doesNotMatch(studentBootstrap, /HTMLCanvasElement\.prototype/);
assert.match(studentBootstrap, /canvas\.getContext = function lazyGetContext/);
assert.match(studentBootstrap, /registration-before-renderer/);
assert.match(studentBootstrap, /WRITABLE_INPUT_IDS/);
assert.match(studentInput, /event\.stopPropagation\(\)/);
assert.doesNotMatch(studentInput, /event\.preventDefault\(\)/);
assert.match(studentInput, /fullNamesWithSpaces: true/);

for (const marker of [
  "studentRecoveredArenaCanvasV22",
  "player-centered-recovered-arena",
  "observe-existing-single-socket",
  "connectionConfigurationPreserved: true",
  "local-acceleration-prediction-and-remote-snapshot-interpolation",
  "function syncPlayers",
  "function syncProjectiles",
  "function updateCamera",
  "function spawnExplosion",
  "message.angle = aim.angle",
  'canvas.addEventListener("pointerdown"',
  "mouseShoot: false"
]) assert.ok(studentGameplay.includes(marker), `missing v22 gameplay marker: ${marker}`);

assert.doesNotMatch(studentGameplay, /new WebSocket\s*\(/);
assert.doesNotMatch(studentGameplay, /message\.shoot\s*=/);
assert.match(gameplayCss, /body\.recovered-arena-v22-active #studentRecoveredArenaCanvasV22/);
assert.match(gameplayCss, /pointer-events: auto/);
assert.match(gameplayCss, /cursor: crosshair/);

for (const marker of [
  "student-score-resilience-v23",
  "teamScores",
  "YOUR GROUP SCORE",
  "request_state",
  "scheduleFallbackReload",
  "opensAdditionalSocket: false",
  "rank-base-5-4-3-minus-0.25-per-wrong-floor-2.5"
]) assert.ok(studentScore.includes(marker), `missing student score/recovery marker: ${marker}`);
assert.doesNotMatch(studentScore, /new WebSocket\s*\(/);
assert.match(scoreCss, /current-group-score-v23/);
assert.match(scoreCss, /team-grade-v23/);
assert.match(scoreCss, /student-private-report-disabled-v23/);

assert.doesNotMatch(studentJs, /WebSocket\.prototype/);
assert.doesNotMatch(studentJs, /HTMLCanvasElement\.prototype/);
assert.match(studentJs, /architecture: "input-first-single-socket"/);
assert.match(studentJs, /MAX_SOCKET_BUFFER = 64 \* 1024/);
assert.match(studentJs, /type: "reconnect_student"/);
assert.match(studentJs, /territoryDelta/);

assert.match(questionUi, /ALL THREE SIDES GIVEN · NO DECIMAL CALCULATION/);
assert.match(questionUi, /TWO SIDES GIVEN · PYTHAGOREAN THEOREM/);
assert.match(questionUi, /THALES' THEOREM · SIMILAR TRIANGLES/);
assert.match(questionUi, /sin = opposite \/ hypotenuse/);
assert.match(questionUi, /cos = adjacent \/ hypotenuse/);

assert.match(studentHtml, /RECOVERED ARENA V22/);
assert.match(studentHtml, /PRIVATE SCORE V23/);
assert.match(studentHtml, /10-minute match/);
assert.match(studentHtml, /2\.50 to 5\.00/);
assert.match(studentHtml, /each wrong geometry answer subtracts 0\.25/);
assert.match(studentHtml, /only to the authenticated Master page/);
assert.match(studentHtml, /student-private-report-disabled-v23/);
assert.match(studentHtml, /id="clockLabel">10:00/);
assert.match(studentHtml, /id="student1Input"[^>]*maxlength="60"/);
assert.match(studentHtml, /FOCUSED GEOMETRY RESPAWN CHALLENGE/);
assert.doesNotMatch(studentHtml, /href="(?:master|teacher)\.html"/);

assert.match(studentCss, /pointer-events: auto !important/);
assert.match(studentCss, /body\.lobby-active #gameCanvas/);

assert.match(masterHtml, /SERVER-VERIFIED MASTER PAGE/);
assert.match(masterHtml, /master-report-v18\.js/);
assert.ok(masterHtml.indexOf("master-report-v18.js") < masterHtml.indexOf("teacher-auth.js"));
assert.match(masterReport, /automaticDownload: true/);
assert.match(masterReport, /teacherOnlyPrivateData: true/);
assert.match(masterReport, /realPlayersCsv/);
assert.match(masterReport, /filter\(\(player\) => !player\.isBot\)/);
assert.match(masterReport, /triadGlobalScoreStoreV18/);
assert.match(masterScore, /MASTER-ONLY PLAYER DATA/);
assert.match(masterScore, /Group score|GROUP SCORE/i);
assert.match(masterScore, /groupScore/);
assert.match(masterScoreCss, /master-private-report-notice-v23/);
assert.match(musicMode, /master-team-score-v23\.js/);
assert.match(musicMode, /master-team-score-v23\.css/);
assert.match(musicMode, /\["05:00", "10:00"\]/);
assert.match(masterScroll, /clientBuild/);
assert.match(teacherAuth, /authenticate_teacher/);
assert.doesNotMatch(teacherAuth, /["']9109["']/);
assert.match(gateway, /DEFAULT_TEACHER_PASSWORD = "9109"/);
assert.match(gateway, /require\("\.\/runtime-v16\.js"\)/);

assert.match(server, /const PROTOCOL = 3/);
assert.match(server, /const MAX_PLAYERS = 9/);
assert.match(server, /const STUDENTS_PER_PC = 3/);
assert.match(runtimeV12, /AMMO_REGEN_INTERVAL_MS = 5 \* 1000/);
assert.match(runtimeV12, /sendFullStateTo/);
assert.match(runtimeV13, /questionsPresented/);
assert.match(runtimeV13, /teacherBrowserBackupRecommended/);
assert.match(runtimeV14, /focused sine-cosine, Pythagoras and Thales question bank/);
assert.match(runtimeV15, /PROJECTILE_SPEED = 2850/);
assert.match(runtimeV15, /relative-motion swept projectile collision/);
assert.match(runtimeV16, /MATCH_DURATION_MS = 10 \* 60 \* 1000/);
assert.match(runtimeV16, /RECONNECT_GRACE_MS = 10 \* 60 \* 1000/);
assert.match(runtimeV16, /GROUP_SCORE_MIN = 2\.5/);
assert.match(runtimeV16, /studentFinalPayload/);
assert.match(runtimeV16, /master-only private final report delivery/);
assert.match(runtimeV16, /15_000/);

console.log("Smoke test passed: ten-minute matches, master-only private player reporting, live 2.5–5 group scores and strengthened automatic recovery are active above Recovered Arena v22.");
