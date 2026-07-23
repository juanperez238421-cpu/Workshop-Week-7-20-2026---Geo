"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const runtime = require("../server/runtime-v16.js");

const root = path.resolve(__dirname, "..");
const rawServer = fs.readFileSync(path.join(root, "server", "server-v3.js"), "utf8");
const rawGateway = fs.readFileSync(path.join(root, "server", "secure-gateway.js"), "utf8");
const patchedServer = runtime.patchServerSource(rawServer);
const patchedGateway = runtime.patchGatewaySource(rawGateway);

new vm.Script(patchedServer, { filename: "server-v3.private-score-v23.js" });
new vm.Script(patchedGateway, { filename: "secure-gateway.private-score-v23.js" });

for (const marker of [
  "const MATCH_DURATION_MS = 10 * 60 * 1000;",
  "const RECONNECT_GRACE_MS = 10 * 60 * 1000;",
  "const GROUP_SCORE_MIN = 2.5;",
  "const GROUP_SCORE_BASE_BY_RANK = Object.freeze([5, 4, 3]);",
  "const GROUP_SCORE_WRONG_PENALTY = 0.25;",
  "teamScoreSnapshot()",
  "studentFinalPayload(player = null)",
  "groupScoreFormula: GROUP_SCORE_FORMULA",
  "groupScore: teamScores[player.team]?.score",
  "wrongAnswerPenalty",
  "individual-player-and-answer-data-is-available-only-on-the-authenticated-master-page",
  "if (this.controller?.ws) safeSend(this.controller.ws, this.ensureFinalPayload());",
  "safeSend(player.ws, this.studentFinalPayload(player));",
  "ws.isAlive = true; handleMessage(ws, raw);",
  "}, 15_000);"
]) assert.ok(patchedServer.includes(marker), `missing v23 server marker: ${marker}`);

const studentPayloadStart = patchedServer.indexOf("  studentFinalPayload(player = null)");
const studentPayloadEnd = patchedServer.indexOf("  statePayload(now)", studentPayloadStart);
assert.ok(studentPayloadStart >= 0 && studentPayloadEnd > studentPayloadStart, "student final payload block missing");
const studentPayloadBlock = patchedServer.slice(studentPayloadStart, studentPayloadEnd);
assert.doesNotMatch(studentPayloadBlock, /players\s*:/, "student final payload must not expose player records");
assert.doesNotMatch(studentPayloadBlock, /students\s*:/, "student final payload must not expose student names");
assert.match(studentPayloadBlock, /teamScores/);
assert.match(studentPayloadBlock, /yourScore/);

const reportStart = patchedServer.indexOf("  report() {");
const reportEnd = patchedServer.indexOf("  ensureFinalPayload()", reportStart);
const privateReportBlock = patchedServer.slice(reportStart, reportEnd);
assert.match(privateReportBlock, /players:/, "master report must retain full player data");
assert.match(privateReportBlock, /answers/);
assert.match(privateReportBlock, /playerReport\.groupScore/);

const studentScript = fs.readFileSync(path.join(root, "student-score-resilience-v23.js"), "utf8");
const studentCss = fs.readFileSync(path.join(root, "student-score-resilience-v23.css"), "utf8");
const studentHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const masterReport = fs.readFileSync(path.join(root, "master-report-v18.js"), "utf8");
const masterScore = fs.readFileSync(path.join(root, "master-team-score-v23.js"), "utf8");
const musicMode = fs.readFileSync(path.join(root, "music-mode-ui.js"), "utf8");
const serverPackage = JSON.parse(fs.readFileSync(path.join(root, "server", "package.json"), "utf8"));

new vm.Script(studentScript, { filename: "student-score-resilience-v23.js" });
new vm.Script(masterReport, { filename: "master-report-v18.js" });
new vm.Script(masterScore, { filename: "master-team-score-v23.js" });

for (const marker of [
  "YOUR GROUP SCORE",
  "request_state",
  "scheduleFallbackReload",
  "10:00",
  "opensAdditionalSocket: false",
  "rank-base-5-4-3-minus-0.25-per-wrong-floor-2.5"
]) assert.ok(studentScript.includes(marker), `missing student score marker: ${marker}`);
assert.doesNotMatch(studentScript, /new WebSocket\s*\(/, "score/recovery layer must not open another socket");
assert.match(studentCss, /current-group-score-v23/);
assert.match(studentHtml, /student-private-report-disabled-v23/);
assert.match(studentHtml, /authenticated Master page/);
assert.match(studentHtml, /id="clockLabel">10:00/);

for (const marker of [
  "teacherOnlyPrivateData: true",
  "realPlayersCsv",
  "filter((player) => !player.isBot)",
  "automaticRealPlayerJsonAndCsv: true",
  "groupScore"
]) assert.ok(masterReport.includes(marker), `missing private master report marker: ${marker}`);
assert.match(masterScore, /MASTER-ONLY PLAYER DATA/);
assert.match(masterScore, /wrongAnswerPenalty/);
assert.match(musicMode, /master-team-score-v23\.js/);
assert.match(rawGateway, /require\("\.\/runtime-v16\.js"\)/);
assert.equal(serverPackage.scripts.start, "node --require ./runtime-v15.js secure-gateway.js");
assert.match(serverPackage.scripts.test, /runtime-v16\.js/);

console.log("Private Score v23 validation passed: ten-minute matches, real-time 2.5–5 scoring, master-only player data, automatic real-player exports and strengthened recovery are present.");
