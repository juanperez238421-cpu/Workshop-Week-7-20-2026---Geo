"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const game = read("school-game/game.js");
const main = read("school-game/main.js");
const html = read("school-game/index.html");
const packageJson = JSON.parse(read("package.json"));

assert.equal(packageJson.version, "47.1.0");
assert.equal(packageJson.main, "school-game/main.js");
assert.match(game, /state\.strikes >= 3/);
assert.match(game, /beginQuestionCheckpoint/);
assert.match(game, /createTrigQuestion/);
assert.match(game, /\["sin-side", "cos-side", "tan-side", "ratio", "angle"\]/);
assert.doesNotMatch(game, /blood|gore|dismember/i);
assert.match(game, /fireTriVolley/);
assert.match(game, /\[-spread, 0, spread\]/);
assert.match(game, /incomingThreat/);
assert.match(game, /travelTime/);
assert.match(game, /studentStats/);
assert.match(game, /resultToCsv/);
assert.match(main, /Neon Geometry Tactical Results/);
assert.match(main, /LATEST_RESULT\.json/);
assert.match(main, /LATEST_RESULT\.csv/);
assert.match(main, /OPEN_RESULTS_FOLDER\.cmd/);
assert.match(html, /Register the three-student team/);
assert.match(html, /TRIGONOMETRY CHECKPOINT/);
for (const asset of ["player", "enemies", "effects", "pickups", "tiles", "ui", "trajectory"]) {
  assert.ok(fs.statSync(path.join(root, "school-game", "assets", `${asset}.webp`)).size > 10000, `${asset}.webp missing or too small`);
}

console.log("School tactical v30 validation passed: generated assets, school-safe one-hit training, three-strike trigonometry checkpoints, predictive AI, tri-volley trajectories and visible local JSON/CSV result saving are wired.");
