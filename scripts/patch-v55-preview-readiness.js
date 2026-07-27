"use strict";

const fs = require("node:fs");
const path = require("node:path");

const target = path.resolve(__dirname, "..", "school-game", "v55", "game.js");
let source = fs.readFileSync(target, "utf8");
const needle = `await window.schoolAPI?.markReady?.({
      phase: "question-layout-preview",
      preview,
      questionSeconds: 60,`;
const replacement = `await window.schoolAPI?.markReady?.({
      phase: "question-layout-preview",
      preview,
      fixedSimulationHz: 120,
      levels: MAPS.length,
      newDifficultRooms: 2,
      professionalV2LevelImages: optionalAssets.levelImages.length,
      professionalV2PlayerAtlas: Boolean(optionalAssets.playerAtlas),
      professionalV2EnemyAtlas: Boolean(optionalAssets.enemyAtlas),
      questionSeconds: 60,
      questionCanvasWidth: questionCanvas.width,
      questionCanvasHeight: questionCanvas.height,`;
if (!source.includes(needle)) throw new Error("V55 preview readiness insertion point was not found.");
source = source.replace(needle, replacement);
fs.writeFileSync(target, source, "utf8");
console.log("Patched V55 complete packaged question-preview readiness.");
