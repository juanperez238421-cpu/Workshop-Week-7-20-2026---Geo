"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const gameplay = fs.readFileSync(path.join(root, "student-arena-v22.js"), "utf8");
const css = fs.readFileSync(path.join(root, "student-arena-v22.css"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const config = fs.readFileSync(path.join(root, "config.js"), "utf8");
const runtime = fs.readFileSync(path.join(root, "server", "runtime-v15.js"), "utf8");
const serverPackage = JSON.parse(fs.readFileSync(path.join(root, "server", "package.json"), "utf8"));

new vm.Script(gameplay, { filename: "student-arena-v22.js" });

for (const marker of [
  "studentRecoveredArenaCanvasV22",
  "recoveredArenaV22Send",
  "message.angle = aim.angle",
  "REMOTE_INTERPOLATION_MS = 92",
  "MAX_REMOTE_EXTRAPOLATION_MS = 125",
  "playerHistories",
  "sampleRemotePose",
  "local-acceleration-prediction-and-remote-snapshot-interpolation",
  "4700 / state.cameraZoom",
  "drawCohesion",
  "drawOffscreenTeammates",
  "drawDashTrails",
  "spawnExplosion",
  "drawAim",
  "mouseShoot: false",
  "observe-existing-single-socket",
  "connectionConfigurationPreserved: true"
]) assert.ok(gameplay.includes(marker), `missing marker: ${marker}`);

for (const marker of [
  'canvas.addEventListener("pointerdown"',
  'canvas.addEventListener("pointermove"',
  'canvas.addEventListener("pointerup"',
  'canvas.addEventListener("contextmenu"',
  "event.button !== 2",
  "setPointerCapture(event.pointerId)",
  "releasePointerCapture(event.pointerId)"
]) assert.ok(gameplay.includes(marker), `missing aim marker: ${marker}`);

assert.doesNotMatch(gameplay, /new WebSocket\s*\(/);
assert.doesNotMatch(gameplay, /message\.shoot\s*=/);

for (const asset of ["ammo", "shield", "speed", "rapid", "paint"]) {
  assert.match(gameplay, new RegExp(`assets/pickups/${asset}\\.svg`));
  assert.match(fs.readFileSync(path.join(root, "assets", "pickups", `${asset}.svg`), "utf8"), /<svg/);
}

for (const marker of [
  "body.recovered-arena-v22-active #studentRecoveredArenaCanvasV22",
  "pointer-events: auto",
  "body.recovered-arena-v22-active .player-panel",
  "body.recovered-arena-v22-active .resource-hud-v15",
  ".three-student-role-panel-v22",
  ".pickup-legend-v22",
  "cursor: crosshair"
]) assert.ok(css.includes(marker), `missing CSS marker: ${marker}`);

assert.match(html, /student-arena-v22\.css\?v=20260723-recoveredarena22/);
assert.match(html, /student-arena-v22\.js\?v=20260723-recoveredarena22/);
assert.doesNotMatch(html, /student-master-view-v21\.js/);
assert.doesNotMatch(html, /student-gameplay-v20\.js/);
assert.ok(html.indexOf("student-input-v18.js") < html.indexOf("student-arena-v22.js"));
assert.ok(html.indexOf("student-arena-v22.js") < html.indexOf("student-app-v16.js"));
assert.match(html, /HOLD RIGHT CLICK on the arena to aim/);
assert.match(html, /SPACE fires|Spacebar remains the only shooting control/);
assert.match(html, /Connection architecture preserved/);
assert.match(config, /20260723-recoveredarena22/);

for (const marker of ["authoritative-swept-projectile-v20", "PROJECTILE_SPEED = 2850", "relative-motion swept projectile collision", "shotCooldownMs", "dashCooldownMs"]) {
  assert.ok(runtime.includes(marker), `server marker changed: ${marker}`);
}
assert.equal(serverPackage.scripts.start, "node --require ./runtime-v15.js secure-gateway.js");

console.log("Recovered Arena v22 validation passed.");
