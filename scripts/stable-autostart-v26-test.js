"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const runtime = require("../server/runtime-v20.js");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

for (const file of [
  "student-stable-v26.js",
  "master-individual-v26.js",
  "server/runtime-v20.js"
]) new vm.Script(read(file), { filename: file });

const rawServer = read("server/server-v3.js");
const rawGateway = read("server/secure-gateway.js");
const patchedServer = runtime.patchServerSource(rawServer);
const patchedGateway = runtime.patchGatewaySource(rawGateway);
new vm.Script(patchedServer, { filename: "server-v3.stable-autostart-v26.js" });
new vm.Script(patchedGateway, { filename: "secure-gateway.stable-autostart-v26.js" });

for (const marker of [
  "const TICK_RATE = 30;",
  "const STATE_RATE = 10;",
  "const SOLO_BOTS_PER_CHANNEL = 5;",
  "const MAX_PROJECTILES = 54;",
  "const SOLO_BOT_THINK_INTERVAL_MS = 180;",
  "const targetTeamSize = 2;",
  "createIndividualStudentStats",
  "publicIndividualStudentStats",
  "player.ready = true",
  "individualStudents",
  "assignedStudentIndex",
  "assignedStudentName",
  'case "request_full_state"',
  "one-human-plus-five-bots-per-isolated-channel",
  "stable-autostart-individual-channels-v26"
]) assert.ok(patchedServer.includes(marker), `missing stable v26 server marker: ${marker}`);

assert.doesNotMatch(patchedServer, /_soloTickStartTimer/);
assert.doesNotMatch(patchedServer, /clearInterval\(room\.tickHandle\)/);
assert.doesNotMatch(patchedServer, /real player is not ready/);
assert.doesNotMatch(patchedServer, /SOLO_BOTS_PER_CHANNEL = 8/);
assert.match(patchedServer, /const room = new Room\(internalCode\);/);
assert.match(patchedServer, /this\.tickHandle = setInterval\(\(\) => this\.tick\(\), 1000 \/ TICK_RATE\);/);
assert.match(patchedServer, /this\.startedAt = Date\.now\(\); this\.endsAt = this\.startedAt \+ MATCH_DURATION_MS/);
assert.match(patchedServer, /const ready = this\.realEntries\(\)\.filter\(\(\{ channel, player \}\) => channel\.room\.phase === "lobby" && player\.connected\)/);
assert.match(patchedServer, /assignedDeaths = \(Number\(assigned\.assignedDeaths\) \|\| 0\) \+ 1/);
assert.match(patchedServer, /individual\.answers\.push\(answer\)/);
assert.match(patchedServer, /publicIndividualStudentStats\(player, true\)/);
assert.match(patchedGateway, /stable-autostart-individual-channels-v26/);

const student = read("student-stable-v26.js");
for (const marker of [
  "request_full_state",
  "continuousClientClock: true",
  "individualStudentTelemetry: true",
  "playerReadyRequired: false",
  "RECOVERING",
  "assignedStudentBadgeV26",
  "individualStudentRowsV26",
  "opensAdditionalSocket: false"
]) assert.ok(student.includes(marker), `missing student recovery marker: ${marker}`);
assert.doesNotMatch(student, /new WebSocket\s*\(/);
assert.match(student, /message\?\.type === "set_ready"/);

const masterIndividual = read("master-individual-v26.js");
for (const marker of [
  "triadMasterIndividualStudentsV26",
  "assigned_deaths",
  "student_name",
  "individual-students.csv",
  "individual-students.json",
  "assignedDeathAttribution: true",
  "individualAnswerAttribution: true",
  "opensAdditionalSocket: false"
]) assert.ok(masterIndividual.includes(marker), `missing Master individual record marker: ${marker}`);
assert.doesNotMatch(masterIndividual, /new WebSocket\s*\(/);

const indexHtml = read("index.html");
assert.match(indexHtml, /20260724-stable-autostart26/);
assert.match(indexHtml, /student-stable-v26\.css/);
assert.match(indexHtml, /student-stable-v26\.js/);
assert.match(indexHtml, /1 \+ 5/);
assert.match(indexHtml, /five optimized server bots/i);
assert.match(indexHtml, /no Ready button/i);
assert.doesNotMatch(indexHtml, /id="readyButton"/);
assert.doesNotMatch(indexHtml, /1 human \+ 8 bots/i);

const masterHtml = read("master.html");
assert.match(masterHtml, /STABLE AUTOSTART V26/);
assert.match(masterHtml, /master-individual-v26\.js/);
assert.match(masterHtml, /1 human \+ 5 bots/);
assert.match(masterHtml, /45 bots instead of the previous 72/);
assert.match(masterHtml, /WAITING FOR AN APPROVED CHANNEL/);
assert.doesNotMatch(masterHtml, /WAITING FOR A READY CHANNEL/);
assert.doesNotMatch(masterHtml, /each real PC receives 8 bots/);

const music = read("music-mode-ui.js");
assert.match(music, /20260724-stable-autostart26/);
assert.doesNotMatch(music, /loadScript\("master-ready-control\.js"/);
assert.match(music, /START ALL APPROVED CHANNELS/);

const config = read("config.js");
assert.match(config, /20260724-stable-autostart26/);

const serverPackage = JSON.parse(read("server/package.json"));
assert.equal(serverPackage.scripts.start, "node --require ./runtime-v20.js secure-gateway.js");
assert.match(serverPackage.scripts.test, /runtime-v20\.js/);

console.log("Stable Autostart v26 validation passed: native room ticks restore movement and timer authority, five balanced bots reduce load, Master starts approved channels directly, and each student's deaths and geometry answers are recorded separately.");
