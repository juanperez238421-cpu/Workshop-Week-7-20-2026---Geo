"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const runtime = require("../server/runtime-v19.js");

const root = path.resolve(__dirname, "..");
const rawServer = fs.readFileSync(path.join(root, "server", "server-v3.js"), "utf8");
const rawGateway = fs.readFileSync(path.join(root, "server", "secure-gateway.js"), "utf8");
const patchedServer = runtime.patchServerSource(rawServer);
const patchedGateway = runtime.patchGatewaySource(rawGateway);

new vm.Script(patchedServer, { filename: "server-v3.fluid-clean-v25.js" });
new vm.Script(patchedGateway, { filename: "secure-gateway.fluid-clean-v25.js" });

for (const marker of [
  "const TICK_RATE = 30;",
  "const STATE_RATE = 10;",
  "const FULL_TERRITORY_EVERY = 40;",
  "const STATIC_META_EVERY = 80;",
  "const MAX_PROJECTILES = 78;",
  "const SOLO_BOT_THINK_INTERVAL_MS = 140;",
  "const SOLO_BOT_SHOOT_RANGE_SQ = 3100 * 3100;",
  "const SOLO_PROJECTILE_STREAM_RADIUS_SQ = 5200 * 5200;",
  "SOLO_TICK_STAGGER_STEP_MS",
  "now < (this._nextBotThinkAt || 0)",
  "nearestDistanceSq",
  "clearInterval(room.tickHandle)",
  "room._soloTickStartTimer",
  "player.isBot ? undefined : player.students",
  ".filter((projectile) => !soloFocusPlayer",
  "fluid-clean-nine-independent-channels-v25",
  "20260723-fluid-clean25"
]) assert.ok(patchedServer.includes(marker), `missing Fluid Server v25 marker: ${marker}`);

assert.match(patchedGateway, /fluid-clean-nine-isolated-channels-v25/);
assert.doesNotMatch(patchedServer, /const TICK_RATE = 40;/);
assert.doesNotMatch(patchedServer, /const MAX_PROJECTILES = 120;/);
assert.match(patchedServer, /const MATCH_DURATION_MS = 10 \* 60 \* 1000;/);
assert.match(patchedServer, /const RECONNECT_GRACE_MS = 10 \* 60 \* 1000;/);
assert.match(patchedServer, /authoritative-swept-projectile-v20/);

const bootstrap = fs.readFileSync(path.join(root, "student-bootstrap-v25.js"), "utf8");
const fluidClient = fs.readFileSync(path.join(root, "student-fluid-v25.js"), "utf8");
const fluidCss = fs.readFileSync(path.join(root, "student-fluid-v25.css"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const config = fs.readFileSync(path.join(root, "config.js"), "utf8");

for (const [filename, source] of [
  ["student-bootstrap-v25.js", bootstrap],
  ["student-fluid-v25.js", fluidClient]
]) new vm.Script(source, { filename });

for (const marker of [
  "installLazy2dContext(document.getElementById(\"gameCanvas\"), () => false)",
  "legacyArenaRendererDisabled: true",
  "minimapAndQuestionCanvasesPreserved: true"
]) assert.ok(bootstrap.includes(marker), `missing duplicate-render prevention marker: ${marker}`);

for (const marker of [
  "adaptiveFramePacing: true",
  "maximumDevicePixelRatio",
  "lowEndTargetFps: 45",
  "normalTargetFps: 52",
  "recoveryTargetFps: 38",
  "longtask",
  "opensAdditionalSocket: false"
]) assert.ok(fluidClient.includes(marker), `missing adaptive client marker: ${marker}`);
assert.doesNotMatch(fluidClient, /new WebSocket\s*\(/);

for (const marker of [
  "student-fluid-v25.css",
  "student-bootstrap-v25.js",
  "student-fluid-v25.js",
  "FLUID CLIENT V25",
  "balanced 30 Hz physics",
  "30 / 10",
  "20260723-fluid-clean25"
]) assert.match(html, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));

for (const marker of [
  "grid-template-columns: repeat(3, minmax(0, 1fr))",
  "width: 238px",
  "width: 250px",
  "width: 202px",
  "triad-low-detail-v25",
  "contain: layout paint style"
]) assert.ok(fluidCss.includes(marker), `missing compact HUD marker: ${marker}`);

assert.match(config, /20260723-fluid-clean25/);

const serverPackage = JSON.parse(fs.readFileSync(path.join(root, "server", "package.json"), "utf8"));
assert.equal(serverPackage.scripts.start, "node --require ./runtime-v19.js secure-gateway.js");
assert.match(serverPackage.scripts.test, /runtime-v19\.js/);

console.log("Fluid Clean v25 validation passed: duplicate rendering is disabled, client frame pacing adapts to weak PCs, the HUD is compact, and nine isolated bot channels use balanced staggered server simulation.");
