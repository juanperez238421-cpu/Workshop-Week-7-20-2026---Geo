"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const runtime = require("../server/runtime-v13.js");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "server", "server-v3.js"), "utf8");
const gatewaySource = fs.readFileSync(path.join(root, "server", "secure-gateway.js"), "utf8");
const patchedServer = runtime.patchServerSource(serverSource);
const patchedGateway = runtime.patchGatewaySource(gatewaySource);

for (const requiredText of [
  "authoritative-semi-auto-hitscan",
  "const HITSCAN_RANGE = 3900;",
  "questionsPresented",
  "questionsAnswered",
  "matchScore",
  "globalScore",
  "teacherBrowserBackupRecommended",
  "buildMatchMetadata"
]) assert.ok(patchedServer.includes(requiredText), `missing reporting-v18 compatibility marker: ${requiredText}`);

assert.ok(patchedGateway.includes("hitscan-combat-and-automatic-reporting-v18"));
assert.ok(patchedServer.includes("shootPressed && !player.shootHeld"));
assert.ok(patchedServer.includes("startX"));
assert.ok(patchedServer.includes("endX"));

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "triad-v13-"));
try {
  const serverFile = path.join(tempDir, "server-v3-patched.js");
  const gatewayFile = path.join(tempDir, "secure-gateway-patched.js");
  fs.writeFileSync(serverFile, patchedServer, "utf8");
  fs.writeFileSync(gatewayFile, patchedGateway, "utf8");
  childProcess.execFileSync(process.execPath, ["--check", serverFile], { stdio: "pipe" });
  childProcess.execFileSync(process.execPath, ["--check", gatewayFile], { stdio: "pipe" });
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

const studentInput = fs.readFileSync(path.join(root, "student-input-v18.js"), "utf8");
const gameplayV22 = fs.readFileSync(path.join(root, "student-arena-v22.js"), "utf8");
const masterReport = fs.readFileSync(path.join(root, "master-report-v18.js"), "utf8");
const studentHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const masterHtml = fs.readFileSync(path.join(root, "master.html"), "utf8");

assert.ok(studentInput.includes("event.stopPropagation()"));
assert.ok(!studentInput.includes("event.preventDefault()"));
assert.ok(gameplayV22.includes("studentRecoveredArenaCanvasV22"));
assert.ok(gameplayV22.includes("message.angle = aim.angle"));
assert.ok(gameplayV22.includes("observe-existing-single-socket"));
assert.ok(gameplayV22.includes("connectionConfigurationPreserved: true"));
assert.ok(masterReport.includes("automaticDownload: true"));
assert.ok(masterReport.includes("triadGlobalScoreStoreV18"));
assert.ok(studentHtml.indexOf("student-input-v18.js") < studentHtml.indexOf("student-app-v16.js"));
assert.ok(studentHtml.indexOf("student-arena-v22.js") < studentHtml.indexOf("student-app-v16.js"));
assert.ok(masterHtml.indexOf("master-report-v18.js") < masterHtml.indexOf("teacher-auth.js"));

console.log("Reporting v18 compatibility validation passed beneath Recovered Arena v22.");
