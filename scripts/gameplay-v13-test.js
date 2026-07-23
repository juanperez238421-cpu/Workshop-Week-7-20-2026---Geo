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
]) {
  assert.ok(patchedServer.includes(requiredText), `missing reporting-v18 compatibility marker: ${requiredText}`);
}
assert.ok(patchedGateway.includes("hitscan-combat-and-automatic-reporting-v18"), "gateway v18 compatibility marker missing");
assert.ok(patchedServer.includes("shootPressed && !player.shootHeld"), "v18 human semi-auto edge trigger missing");
assert.ok(patchedServer.includes("startX"), "v18 tracer start metadata missing");
assert.ok(patchedServer.includes("endX"), "v18 tracer end metadata missing");

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
const gameplayV20 = fs.readFileSync(path.join(root, "student-gameplay-v20.js"), "utf8");
const masterReport = fs.readFileSync(path.join(root, "master-report-v18.js"), "utf8");
const studentHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const masterHtml = fs.readFileSync(path.join(root, "master.html"), "utf8");

assert.ok(studentInput.includes("event.stopPropagation()"), "editable key isolation missing");
assert.ok(!studentInput.includes("event.preventDefault()"), "editable fields must not prevent spaces/default text entry");
assert.ok(gameplayV20.includes("gameplayCanvasV20"), "v20 gameplay canvas missing");
assert.ok(gameplayV20.includes("authoritative-swept-projectile-v20"), "v20 projectile model missing");
assert.ok(masterReport.includes("automaticDownload: true"), "automatic report export marker missing");
assert.ok(masterReport.includes("triadGlobalScoreStoreV18"), "teacher browser global score backup missing");
assert.ok(studentHtml.indexOf("student-input-v18.js") < studentHtml.indexOf("student-app-v16.js"), "input fix must load before main student app");
assert.ok(studentHtml.indexOf("student-gameplay-v20.js") < studentHtml.indexOf("student-app-v16.js"), "v20 gameplay observer must load before main student app");
assert.ok(masterHtml.indexOf("master-report-v18.js") < masterHtml.indexOf("teacher-auth.js"), "automatic report observer must load before teacher controls");

console.log("Reporting v18 compatibility validation passed beneath Gameplay v20.");
