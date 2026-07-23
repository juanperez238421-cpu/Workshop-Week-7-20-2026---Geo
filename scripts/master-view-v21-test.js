"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const student = fs.readFileSync(path.join(root, "student-master-view-v21.js"), "utf8");
const studentCss = fs.readFileSync(path.join(root, "student-master-view-v21.css"), "utf8");
const master = fs.readFileSync(path.join(root, "master-live-v9.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const config = fs.readFileSync(path.join(root, "config.js"), "utf8");

new vm.Script(student, { filename: "student-master-view-v21.js" });

for (const sharedVisualMarker of [
  'ctx.fillStyle = "#e8eef6"',
  'ctx.fillStyle = "#fbfcfe"',
  'rgba(state.teamColors[owner], 0.34)',
  'ctx.roundRect(-size, -size, size * 2, size * 2, 4)',
  'ctx.moveTo(size * 1.45, 0)',
  'ctx.lineTo(-size, size * 0.92)',
  'ctx.lineTo(-size * 0.72, 0)',
  'L${player.lives ?? 3} · A${player.ammo ?? 5}',
  'ctx.moveTo(screen.x - ux * radius * 4.2',
  'ctx.fillStyle = "#ffffff"'
]) assert.ok(student.includes(sharedVisualMarker), `missing Master View visual marker: ${sharedVisualMarker}`);

for (const masterReferenceMarker of [
  'ctx.fillStyle = "#e8eef6"',
  'ctx.fillStyle = "#fbfcfe"',
  'rgba(view.teamColors[owner], 0.34)',
  'ctx.roundRect(-size, -size, size * 2, size * 2, 4)',
  'ctx.moveTo(size * 1.45, 0)',
  'L${player.lives ?? 3} · A${player.ammo ?? 5}'
]) assert.ok(master.includes(masterReferenceMarker), `master reference unexpectedly changed: ${masterReferenceMarker}`);

for (const aimMarker of [
  'addEventListener("pointerdown"',
  'addEventListener("pointermove"',
  'addEventListener("pointerup"',
  'addEventListener("contextmenu"',
  'event.button !== 2',
  'canvas.setPointerCapture?.(event.pointerId)',
  'message.angle = aim.angle',
  'aim.initialized',
  'AIM DIRECTION LOCKED',
  'MOUSE AIM ACTIVE',
  'state.phase === "playing"'
]) assert.ok(student.includes(aimMarker), `missing reliable aim marker: ${aimMarker}`);

assert.match(student, /WebSocket\.prototype\.send = function masterViewV21Send/);
assert.match(student, /OBSERVED_SEND_TYPES/);
assert.doesNotMatch(student, /new WebSocket\s*\(/, "the visual layer must reuse the stable student socket");
assert.match(student, /function syncPlayers/);
assert.match(student, /function syncProjectiles/);
assert.match(student, /function updateTransform/);
assert.match(student, /function updateCooldownHud/);
assert.match(student, /function spawnPredictedShot/);
assert.match(student, /player-centered-master-view/);
assert.match(student, /visualReference: "master-live-v9"/);

assert.match(studentCss, /body\.master-view-v21-active #studentMasterViewCanvasV21/);
assert.match(studentCss, /pointer-events: auto/);
assert.match(studentCss, /cursor: crosshair/);
assert.match(studentCss, /master-view-aim-hud-v21/);

assert.match(html, /student-master-view-v21\.css\?v=20260723-masterviewaim21/);
assert.match(html, /student-master-view-v21\.js\?v=20260723-masterviewaim21/);
assert.doesNotMatch(html, /student-gameplay-v20\.js/);
assert.doesNotMatch(html, /student-gameplay-v20\.css/);
assert.ok(html.indexOf("student-input-v18.js") < html.indexOf("student-master-view-v21.js"));
assert.ok(html.indexOf("student-master-view-v21.js") < html.indexOf("student-app-v16.js"));
assert.match(html, /HOLD RIGHT CLICK and move mouse to aim/);
assert.match(html, /same clean visual language as the teacher's live Master View/);
assert.match(config, /20260723-masterviewaim21/);

console.log("Master View Gameplay v21 validation passed: the student uses the teacher live-panel visual language with reliable captured right-click mouse aiming and the existing single WebSocket.");
