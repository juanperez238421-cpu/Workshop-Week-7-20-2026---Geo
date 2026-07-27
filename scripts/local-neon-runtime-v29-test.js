"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const runtime = require("../desktop/runtime-local.js");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "server", "server-v3.js"), "utf8");
const patched = runtime.patchServerSource(serverSource);

new vm.Script(patched, { filename: "server-v3.neon-local-v29.js" });

assert.match(patched, /const ARENA = Object\.freeze\(\{ width: 12800, height: 8000/);
assert.match(patched, /const MAX_LIVES = 3;/);
assert.match(patched, /victim\.lives = Math\.max\(0, victim\.lives - 1\);/);
assert.match(patched, /victim\.respawnAt = now \+ 460;/);
assert.match(patched, /victim\.respawnAt = now \+ 760;/);
assert.match(patched, /this\.assignQuestion\(victim, 180\);/);
assert.match(patched, /player\.respawnAt = now \+ 360;/);
assert.match(patched, /respawnInMs: 360/);
assert.match(patched, /questionStudentTurn/);
assert.match(patched, /one-hit-one-life-three-strikes-geometry-check/);
assert.match(patched, /const SOLO_BOT_THINK_INTERVAL_MS = 70;/);
assert.match(patched, /NEON_AI_DODGE_LOOKAHEAD_SECONDS/);
assert.match(patched, /targetVelocityX/);
assert.match(patched, /predictedX/);
assert.match(patched, /incomingThreat/);
assert.match(patched, /desktop-neon-one-hit-v29/);
assert.doesNotMatch(patched, /victim\.respawnAt = now \+ 1050;/);
assert.doesNotMatch(patched, /victim\.respawnAt = now \+ 2200;/);

console.log("Neon local runtime validation passed: original room geometry, one-hit life loss, three-strike geometry checkpoint, fast restart and predictive evasive AI are active.");
