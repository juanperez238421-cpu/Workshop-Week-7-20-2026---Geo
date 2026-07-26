"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const game = read("school-game/game-v49.js");
const main = read("school-game/main.js");
const html = read("school-game/index.html");
const styles = read("school-game/styles.css");
const packageJson = JSON.parse(read("package.json"));

assert.equal(packageJson.version, "49.0.0");
assert.equal(packageJson.main, "school-game/main.js");
assert.equal(packageJson.build.productName, "Geometry Tactical Consolidated Local");
assert.match(game, /GENERATED CONSOLIDATED RUNTIME · V49\.0\.0/);
assert.match(game, /state\.strikes >= 3/);
assert.match(game, /beginQuestionCheckpoint/);
assert.match(game, /function createQuestion/);
assert.match(game, /\["sin","cos","tan","ratio","angle"\]/);
assert.doesNotMatch(game, /blood|gore|dismember/i);
assert.match(game, /MAX_PLAYER_BULLETS = 2/);
assert.match(game, /MAX_ENEMY_BULLETS = 4/);
assert.match(game, /Pulse Pistol/);
assert.match(game, /Level 1 · Robledo Learning Lab/);
assert.match(game, /Level 2 · Library Research Grid/);
assert.doesNotMatch(game, /Robotics Workshop/);
assert.doesNotMatch(game, /Geometry Vault/);
assert.match(game, /Shared Robledo Operative/);
assert.match(game, /resetting the complete level/);
assert.match(game, /spawnMap\(state\.mapIndex\)/);
assert.match(game, /lastSeenX/);
assert.match(game, /travelTime/);
assert.match(game, /incomingThreat/);
assert.match(game, /separation < 72/);
assert.match(game, /defeatAge/);
assert.match(game, /DASH\/RELOAD · SHIFT\/R/);
assert.match(game, /neon-geometry-consolidated-two-room-v49/);
assert.match(game, /version:"49\.0\.0"/);
assert.match(game, /resultToCsv/);
assert.match(main, /Geometry Tactical Consolidated Local/);
assert.match(main, /consolidated-two-room-v49/);
assert.match(main, /LATEST_RESULT\.json/);
assert.match(main, /LATEST_RESULT\.csv/);
assert.match(main, /OPEN_RESULTS_FOLDER\.cmd/);
assert.match(html, /Register the three-person control team/);
assert.match(html, /2 COMPLETE LEVELS/);
assert.match(html, /ONE SHARED CHARACTER/);
assert.match(html, /game-v49\.js/);
assert.doesNotMatch(html, /ARMOR CATALOG/);
assert.match(html, /TRIGONOMETRY CHECKPOINT/);
assert.match(styles, /--canvas: #f4f7fb/);
assert.match(styles, /image-rendering: pixelated/);
assert.match(styles, /operative-card/);

for (const asset of ["characters", "enemies", "powers", "weapons", "tiles", "effects", "decor"]) {
  const target = path.join(root, "school-game", "assets", "pixel", `${asset}.png`);
  assert.ok(fs.existsSync(target), `${asset}.png was not decoded`);
  assert.ok(fs.statSync(target).size > 250, `${asset}.png is unexpectedly small`);
}

console.log("Consolidated v49 validation passed: two complete rooms, one shared operative, three-person controls, full-level defeat resets, limited projectiles, improved tactical AI, defeat animations, white visual system, trigonometry checkpoints and local JSON/CSV results are wired.");
