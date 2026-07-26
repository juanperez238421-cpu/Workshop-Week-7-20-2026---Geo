"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const runtime = require("../server/runtime-v22.js");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "server", "server-v3.js"), "utf8");
const patched = runtime.patchServerSource(source);
new vm.Script(patched, { filename: "server-v3.runtime-v22.js" });

assert.match(patched, /player\.questionStudentTurn = 0/);
assert.match(patched, /const assignedIndex = \(Number\(player\.questionStudentTurn\) \|\| 0\) % studentCount/);
assert.match(patched, /player\.questionStudentTurn = assignedIndex \+ 1/);
assert.doesNotMatch(patched, /Number\.isInteger\(player\.currentStudentIndex\) \? player\.currentStudentIndex/);
assert.match(patched, /fair-question-rotation-local-results-v27/);

console.log("Runtime v22 validation passed: geometry questions use a counter independent from the three-life death rotation.");
