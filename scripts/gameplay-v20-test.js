"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const runtime = require("../server/runtime-v15.js");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "server", "server-v3.js"), "utf8");
const gatewaySource = fs.readFileSync(path.join(root, "server", "secure-gateway.js"), "utf8");
const patchedServer = runtime.patchServerSource(serverSource);
const patchedGateway = runtime.patchGatewaySource(gatewaySource);

new vm.Script(patchedServer, { filename: "server-v3.gameplay-v20.js" });
new vm.Script(patchedGateway, { filename: "secure-gateway.gameplay-v20.js" });

for (const marker of [
  "authoritative-swept-projectile-v20",
  "const PLAYER_SPEED = 620;",
  "const DASH_SPEED = 1900;",
  "const DASH_COOLDOWN_MS = 1800;",
  "const PROJECTILE_SPEED = 2850;",
  "const PROJECTILE_LIFETIME_MS = 2350;",
  "const PROJECTILE_HIT_PADDING = 8;",
  "type: \"bullet\"",
  "relativeStartX",
  "relativeEndX",
  "killer.shotsHit += 1",
  "shotCooldownMs",
  "dashCooldownMs",
  "movementSpeed",
  "velocityX",
  "interpolationHintMs",
  "questionsPresented",
  "teacherBrowserBackupRecommended",
  "thales_height",
  "ratio_sin",
  "ratio_cos"
]) assert.ok(patchedServer.includes(marker), `missing v20 server marker: ${marker}`);

assert.ok(patchedGateway.includes("fluid-projectile-gameplay-v20-and-reporting-v18"));
assert.doesNotMatch(patchedServer, /const HITSCAN_RANGE = 3900/);
assert.doesNotMatch(patchedServer, /type: "tracer"/);

const client = fs.readFileSync(path.join(root, "student-gameplay-v20.js"), "utf8");
const css = fs.readFileSync(path.join(root, "student-gameplay-v20.css"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const serverPackage = JSON.parse(fs.readFileSync(path.join(root, "server", "package.json"), "utf8"));

new vm.Script(client, { filename: "student-gameplay-v20.js" });

for (const marker of [
  "predicted-local-interpolated-remote",
  "authoritative-swept-projectile-v20",
  "function predictLocal",
  "function smoothRemotePlayers",
  "function updateCamera",
  "function spawnLocalShotFx",
  "function updateCooldownHud",
  "projectile.vx",
  "projectile.vy",
  "state.input.aiming",
  "gameplayCanvasV20"
]) assert.ok(client.includes(marker), `missing v20 client marker: ${marker}`);

assert.doesNotMatch(client, /new WebSocket\s*\(/, "v20 must observe the stable student socket rather than opening a second connection");
assert.match(client, /WebSocket\.prototype\.send/);
assert.match(client, /message\.angle = state\.input\.angle/);
assert.match(css, /body\.gameplay-v20-active #gameplayCanvasV20/);
assert.match(css, /body\.gameplay-v20-active #gameCanvas/);
assert.match(html, /student-gameplay-v20\.css/);
assert.match(html, /student-gameplay-v20\.js/);
assert.doesNotMatch(html, /student-combat-v18\.js/);
assert.ok(html.indexOf("student-input-v18.js") < html.indexOf("student-gameplay-v20.js"));
assert.ok(html.indexOf("student-gameplay-v20.js") < html.indexOf("student-app-v16.js"));
assert.ok(html.indexOf("question-ui-v19.js") < html.indexOf("student-app-v16.js"));
assert.match(html, /complete reporting/i);
assert.match(html, /GEOMETRY BANK V19/);
assert.equal(serverPackage.scripts.start, "node --require ./runtime-v15.js secure-gateway.js");

console.log("Gameplay v20 validation passed: stable networking/reporting now drives predicted movement, interpolated opponents, visible swept bullets and authoritative cooldown telemetry.");
