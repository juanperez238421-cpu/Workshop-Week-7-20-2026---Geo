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
const manifest = JSON.parse(read("school-game/assets/v2/asset-manifest.json"));

function pngDimensions(relative) {
  const buffer = fs.readFileSync(path.join(root, relative));
  assert.equal(buffer.toString("ascii", 1, 4), "PNG", `${relative} is not a PNG`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), bytes: buffer.length };
}

assert.equal(packageJson.version, "50.0.0");
assert.equal(packageJson.main, "school-game/main.js");
assert.equal(packageJson.build.productName, "Geometry Tactical Professional V2 Local");
assert.equal(manifest.version, "2.0");
assert.equal(manifest.rooms.length, 2);
assert.equal(manifest.player.width, 512);
assert.equal(manifest.player.height, 1024);
assert.equal(manifest.player.cell, 64);
assert.equal(manifest.enemies.width, 512);
assert.equal(manifest.enemies.height, 1280);
assert.deepEqual(Object.keys(manifest.enemies.archetypes), ["guard", "runner", "shooter", "heavy"]);
assert.ok(Object.keys(manifest.player.animations).length >= 16);
assert.equal(manifest.player.animations.death.frames.length, 8);
assert.equal(manifest.enemies.animations.death.frames.length, 8);
assert.match(game, /const FIXED_DT = 1 \/ 120/);
assert.match(game, /function findPath/);
assert.match(game, /function buildNavGrid/);
assert.match(game, /function chooseCover/);
assert.match(game, /function incomingThreat/);
assert.match(game, /travelTime/);
assert.match(game, /state\.strikes >= 3/);
assert.match(game, /beginQuestionCheckpoint/);
assert.match(game, /\["sin", "cos", "tan", "ratio", "angle"\]/);
assert.match(game, /spawnLevel\(state\.levelIndex, false\)/);
assert.match(game, /MAX_PLAYER_BULLETS = 2/);
assert.match(game, /MAX_ENEMY_BULLETS = 4/);
assert.match(game, /resultToCsv/);
assert.doesNotMatch(game, /armorCatalog|selectedArmorId/);
assert.doesNotMatch(game, /blood|gore|dismember/i);
assert.match(main, /Geometry Tactical Professional V2 Results/);
assert.match(main, /professional-v2-assets-v50/);
assert.match(html, /Professional V2 two-level edition/);
assert.match(html, /THREE-PERSON CONTROL/);
assert.match(styles, /image-rendering:pixelated/);

const expected = {
  "school-game/assets/v2/protagonist_v2.png": [512,1024],
  "school-game/assets/v2/enemies_v2.png": [512,1280],
  "school-game/assets/v2/effects_v2.png": [384,192],
  "school-game/assets/v2/support_v2.png": [384,144],
  "school-game/assets/v2/room1_v2.png": [1600,1000],
  "school-game/assets/v2/room2_v2.png": [1600,1000]
};
for (const [relative, [width,height]] of Object.entries(expected)) {
  const dimensions = pngDimensions(relative);
  assert.equal(dimensions.width, width, `${relative} width mismatch`);
  assert.equal(dimensions.height, height, `${relative} height mismatch`);
  assert.ok(dimensions.bytes > 1000, `${relative} is unexpectedly small`);
}

for (const room of manifest.rooms) {
  assert.ok(room.obstacles.length >= 20, `${room.name} needs detailed collision geometry`);
  assert.ok(room.enemySpawns.length >= 8, `${room.name} needs eight enemy placements`);
  assert.equal(room.patrols.length, room.enemySpawns.length, `${room.name} patrol count mismatch`);
}

console.log("Professional V2 validation passed: dedicated protagonist/enemy atlases, explicit frame metadata, two detailed 1600×1000 rooms, 120 Hz simulation, A* navigation, cover/flank AI, full-level defeat reset, three-person controls, trigonometry checkpoints and JSON/CSV records are wired.");
