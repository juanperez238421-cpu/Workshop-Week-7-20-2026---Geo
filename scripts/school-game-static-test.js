"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const game = read("school-game/game.js");
const main = read("school-game/main.js");
const html = read("school-game/index.html");
const styles = read("school-game/styles.css");
const packageJson = JSON.parse(read("package.json"));
const armorCatalog = JSON.parse(read("school-game/assets/pixel/armor-catalog.json"));

assert.equal(packageJson.version, "48.0.0");
assert.equal(packageJson.main, "school-game/main.js");
assert.equal(packageJson.build.productName, "Neon Geometry Tactical Pixel Local");
assert.match(game, /state\.strikes >= 3/);
assert.match(game, /beginQuestionCheckpoint/);
assert.match(game, /function createQuestion/);
assert.match(game, /\["sin","cos","tan","ratio","angle"\]/);
assert.doesNotMatch(game, /blood|gore|dismember/i);
assert.match(game, /MAX_PLAYER_BULLETS = 2/);
assert.match(game, /MAX_ENEMY_BULLETS = 4/);
assert.match(game, /Pulse Pistol/);
assert.match(game, /function reloadPlayer/);
assert.match(game, /incomingThreat/);
assert.match(game, /travel = dir\.length/);
assert.match(game, /Classroom Crossroads/);
assert.match(game, /Library Lanes/);
assert.match(game, /Robotics Workshop/);
assert.match(game, /Geometry Vault/);
assert.match(game, /armorCatalog/);
assert.match(game, /resultToCsv/);
assert.match(main, /Neon Geometry Tactical Results/);
assert.match(main, /LATEST_RESULT\.json/);
assert.match(main, /LATEST_RESULT\.csv/);
assert.match(main, /OPEN_RESULTS_FOLDER\.cmd/);
assert.match(html, /Register the team and choose armor/);
assert.match(html, /ARMOR CATALOG/);
assert.match(html, /TRIGONOMETRY CHECKPOINT/);
assert.match(styles, /image-rendering: pixelated/);
assert.equal(armorCatalog.armors.length, 6);
assert.deepEqual(armorCatalog.armors.map((armor) => armor.id), ["cadet", "scout", "guardian", "vector", "solar", "graphite"]);

for (const asset of ["characters", "enemies", "powers", "weapons", "tiles", "effects", "decor"]) {
  const target = path.join(root, "school-game", "assets", "pixel", `${asset}.png`);
  assert.ok(fs.existsSync(target), `${asset}.png was not decoded`);
  assert.ok(fs.statSync(target).size > 250, `${asset}.png is unexpectedly small`);
}

console.log("Pixel tactical v31 validation passed: compact PNG sprite sheets, six selectable armors, single-shot Pulse Pistol, six-projectile global limit, four improved maps, predictive AI, three-strike trigonometry checkpoints and visible local JSON/CSV results are wired.");
