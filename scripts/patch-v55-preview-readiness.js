"use strict";

const fs = require("node:fs");
const path = require("node:path");

const gameTarget = path.resolve(__dirname, "..", "school-game", "v55", "game.js");
let gameSource = fs.readFileSync(gameTarget, "utf8");
const previewNeedle = `await window.schoolAPI?.markReady?.({
      phase: "question-layout-preview",
      preview,
      questionSeconds: 60,`;
const previewReplacement = `await window.schoolAPI?.markReady?.({
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
if (!gameSource.includes(previewNeedle)) throw new Error("V55 preview readiness insertion point was not found.");
gameSource = gameSource.replace(previewNeedle, previewReplacement);
fs.writeFileSync(gameTarget, gameSource, "utf8");

const mainTarget = path.resolve(__dirname, "..", "school-game", "v55", "main.js");
let mainSource = fs.readFileSync(mainTarget, "utf8");
const lockNeedle = `const singleInstance = app.requestSingleInstanceLock();`;
const lockReplacement = `const singleInstance = process.env.V55_ALLOW_SECOND_INSTANCE === "true" || (Boolean(process.env.PORTABLE_EXECUTABLE_FILE) && Boolean(process.env.V55_READY_FILE)) || app.requestSingleInstanceLock();`;
if (!mainSource.includes(lockNeedle)) throw new Error("V55 single-instance insertion point was not found.");
mainSource = mainSource.replace(lockNeedle, lockReplacement);
fs.writeFileSync(mainTarget, mainSource, "utf8");

console.log("Patched V55 complete preview readiness and isolated portable CI startup.");
