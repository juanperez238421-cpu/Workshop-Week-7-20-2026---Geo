"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const runtime = require("../server/runtime-v18.js");

const root = path.resolve(__dirname, "..");
const rawServer = fs.readFileSync(path.join(root, "server", "server-v3.js"), "utf8");
const rawGateway = fs.readFileSync(path.join(root, "server", "secure-gateway.js"), "utf8");
const patchedServer = runtime.patchServerSource(rawServer);
const patchedGateway = runtime.patchGatewaySource(rawGateway);

new vm.Script(patchedServer, { filename: "server-v3.solo-channels-v24.js" });
new vm.Script(patchedGateway, { filename: "secure-gateway.solo-channels-v24.js" });

for (const marker of [
  "class SoloClassroom",
  "const SOLO_CHANNEL_CAPACITY = 9;",
  "const SOLO_BOTS_PER_CHANNEL = 8;",
  "const SOLO_MASTER_STATE_INTERVAL_MS = 1000;",
  "const STATE_RATE = 10;",
  "const FULL_TERRITORY_EVERY = 20;",
  "const STATIC_META_EVERY = 50;",
  "one-master-code-nine-isolated-human-vs-bots-channels-v24",
  "one-human-plus-eight-bots-per-isolated-channel",
  "nine-isolated-human-vs-bots-channels",
  "this.channels = new Map()",
  "this.playerChannel = new Map()",
  "room.addBots(room._soloControllerSocket)",
  "botsInChannel: SOLO_BOTS_PER_CHANNEL",
  "snapshotHz: STATE_RATE",
  "startChannel(controllerWs, channelNumber)",
  "endChannel(controllerWs, channelNumber)",
  "resetChannel(controllerWs, channelNumber)",
  "case \"start_channel\"",
  "case \"end_channel\"",
  "case \"reset_channel\"",
  "masterStatePayload()",
  "aggregateOnly: true",
  "aggregateFinalPayload()",
  "complete-real-player-data-is-sent-only-to-the-authenticated-master",
  "networkModel: \"one-browser-one-channel-one-socket-master-aggregate-at-one-hz\""
]) assert.ok(patchedServer.includes(marker), `missing solo-channel server marker: ${marker}`);

for (const marker of [
  '"start_channel"',
  '"end_channel"',
  '"reset_channel"',
  "one-master-code-nine-isolated-human-vs-bots-channels-v24"
]) assert.ok(patchedGateway.includes(marker), `missing protected gateway marker: ${marker}`);

assert.doesNotMatch(patchedServer, /const STATE_RATE = 15;/);
assert.match(patchedServer, /const MATCH_DURATION_MS = 10 \* 60 \* 1000;/);
assert.match(patchedServer, /const RECONNECT_GRACE_MS = 10 \* 60 \* 1000;/);
assert.match(patchedServer, /const GROUP_SCORE_MIN = 2\.5;/);
assert.match(patchedServer, /const GROUP_SCORE_WRONG_PENALTY = 0\.25;/);
assert.match(patchedServer, /authoritative-swept-projectile-v20/);
for (const questionMarker of ["ratio_sin", "ratio_cos", "pythagoras", "thales_height", "Do not calculate a decimal value", "knownSides: 2"]) {
  assert.ok(patchedServer.includes(questionMarker), `focused geometry question marker missing: ${questionMarker}`);
}

const runtimeV18 = fs.readFileSync(path.join(root, "server", "runtime-v18.js"), "utf8");
assert.match(runtimeV18, /repairRuntimeV17/);
assert.match(runtimeV18, /runtime-v17-repaired-v18\.js/);
assert.match(runtimeV18, /runtime-v18\.js/);
new vm.Script(runtimeV18, { filename: "runtime-v18.js" });

const studentHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const masterHtml = fs.readFileSync(path.join(root, "master.html"), "utf8");
const masterDashboard = fs.readFileSync(path.join(root, "master-solo-channels-v24.js"), "utf8");
const masterDashboardCss = fs.readFileSync(path.join(root, "master-solo-channels-v24.css"), "utf8");
const masterReport = fs.readFileSync(path.join(root, "master-report-v18.js"), "utf8");
const teacherAuth = fs.readFileSync(path.join(root, "teacher-auth.js"), "utf8");
const musicMode = fs.readFileSync(path.join(root, "music-mode-ui.js"), "utf8");
const config = fs.readFileSync(path.join(root, "config.js"), "utf8");

for (const [filename, source] of [
  ["master-solo-channels-v24.js", masterDashboard],
  ["master-report-v18.js", masterReport],
  ["teacher-auth.js", teacherAuth],
  ["music-mode-ui.js", musicMode]
]) new vm.Script(source, { filename });

for (const marker of [
  "NINE ISOLATED GAMES",
  "Array.from({ length: 9 }",
  "START ALL READY CHANNELS",
  "start_channel",
  "end_channel",
  "reset_channel",
  "1 HUMAN +",
  "studentSnapshotHz: 10",
  "masterAggregateHz: 1",
  "opensAdditionalSocket: false"
]) assert.ok(masterDashboard.includes(marker), `missing Master dashboard marker: ${marker}`);
assert.doesNotMatch(masterDashboard, /new WebSocket\s*\(/, "the Master channel dashboard must reuse the authenticated Master socket");
assert.match(masterDashboardCss, /solo-channel-grid-v24/);
assert.match(masterDashboardCss, /grid-template-columns: repeat\(3/);
assert.match(masterDashboardCss, /solo-hidden-legacy-v24/);

for (const marker of [
  "SOLO CHANNELS V24",
  "one real PC vs eight server bots",
  "Private 10 Hz channel stream",
  "same six-character Master PIN",
  "one real player and eight optimized server bots",
  "Each channel can start, reconnect, finish and reset independently",
  "10 Hz optimized connection"
]) assert.match(studentHtml, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));

assert.match(masterHtml, /SOLO CHANNELS V24/);
assert.match(masterHtml, /one Master PIN/i);
assert.match(masterHtml, /master-solo-channels-v24\.css\?v=20260723-solo-nine-channels24/);
assert.match(masterHtml, /master-solo-channels-v24\.js\?v=20260723-solo-nine-channels24/);
assert.match(masterHtml, /id="clockLabel">10:00/);
assert.match(masterHtml, /END ALL ACTIVE CHANNELS/);
assert.match(masterHtml, /RESET COMPLETED CHANNELS/);

for (const marker of [
  "CHANNEL_STORAGE_KEY",
  "backupChannel(message)",
  'message?.type === "channel_ended"',
  "channel_number",
  "bots_faced",
  "perChannelImmediateBrowserBackup: true",
  "real-pc-channels.csv"
]) assert.ok(masterReport.includes(marker), `missing per-channel report marker: ${marker}`);

for (const command of ["start_channel", "end_channel", "reset_channel"]) assert.match(teacherAuth, new RegExp(`"${command}"`));
assert.match(musicMode, /master-solo-channels-v24\.js/);
assert.match(musicMode, /master-solo-channels-v24\.css/);
assert.match(config, /20260723-solo-nine-channels24/);

const serverPackage = JSON.parse(fs.readFileSync(path.join(root, "server", "package.json"), "utf8"));
assert.equal(serverPackage.scripts.start, "node --require ./runtime-v18.js secure-gateway.js");
assert.match(serverPackage.scripts.test, /runtime-v18\.js/);
assert.doesNotMatch(serverPackage.scripts.test, /node --check runtime-v17\.js/);

console.log("Solo Channels v24 validation passed: one shared Master PIN now routes up to nine real PCs into independent one-human-plus-eight-bot matches with low-bandwidth student streams and private per-channel reporting.");
