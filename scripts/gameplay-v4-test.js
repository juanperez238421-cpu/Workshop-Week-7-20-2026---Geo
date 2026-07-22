"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { patchServerSource } = require(path.join(process.cwd(), "server", "runtime-patch.js"));

const source = fs.readFileSync(path.join(process.cwd(), "server", "server-v3.js"), "utf8");
const patched = patchServerSource(source);
new vm.Script(patched, { filename: "server-v3.patched.js" });

assert.match(patched, /width: 6400, height: 4000, gridWidth: 40, gridHeight: 25/);
assert.match(patched, /const COHESION_RADIUS = 520/);
assert.match(patched, /volleySize\(player\)/);
assert.match(patched, /fireVolley\(player, now\)/);
assert.match(patched, /kind: "elimination"/);
assert.match(patched, /students\.join\(" · "\)/);
assert.match(patched, /cohesionRadius: COHESION_RADIUS/);
assert.match(patched, /volleySize: this\.volleySize\(player\)/);
assert.match(patched, /Math\.hypot\(candidate\.x - player\.x, candidate\.y - player\.y\) <= COHESION_RADIUS/);

console.log("Gameplay v4 test passed: large 40×25 arena, team cohesion volleys and detailed elimination announcements compile correctly.");
