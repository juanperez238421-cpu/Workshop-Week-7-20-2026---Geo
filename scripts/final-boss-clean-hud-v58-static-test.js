"use strict";

// Full V58 release gate: source, HUD, assessment fairness and final-boss interaction contracts.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const gamePath = path.join(root, "school-game", "v58", "game.js");
const htmlPath = path.join(root, "school-game", "v58", "index.html");
const cssPath = path.join(root, "school-game", "v58", "styles.css");
const mainPath = path.join(root, "school-game", "v58", "main.js");
const preloadPath = path.join(root, "school-game", "v58", "preload.js");
for (const file of [gamePath, htmlPath, cssPath, mainPath, preloadPath]) assert.ok(fs.existsSync(file), `Missing ${file}`);

const game = fs.readFileSync(gamePath, "utf8");
const html = fs.readFileSync(htmlPath, "utf8");
const css = fs.readFileSync(cssPath, "utf8");
const main = fs.readFileSync(mainPath, "utf8");
const preload = fs.readFileSync(preloadPath, "utf8");

assert.match(game, /const VERSION = "58\.0\.0"/);
assert.match(game, /const EDITION = "final-boss-clean-hud-v58"/);
assert.match(main, /const VERSION = "58\.0\.0"/);
assert.match(main, /const PRODUCT = "Geometry Tactical Final School V58"/);
assert.match(main, /app\.setName\("Geometry Tactical Clean Vision Local"\)/);
assert.match(main, /levels: 5/);
assert.match(game, /name: "LEVEL 5 · FINAL ARCHIVE WARDEN"/);
assert.match(game, /bossRoom: true/);
assert.match(game, /enemies: \[\[800,500,"boss"\]\]/);
assert.match(game, /roomWeapons:\s*\[/);
assert.match(game, /BOSS_PHASES = 3/);
assert.match(game, /BOSS SHIELD BLOCKS BULLETS/);
assert.match(game, /SHIELD BROKEN · CORE OPEN · FIRE NOW/);
assert.match(game, /keys\.has\("KeyE"\)/);
assert.match(game, /throwEquippedWeapon\(player\)/);
assert.match(game, /roomWeapon: true/);
assert.match(game, /roomWeapon: Boolean\(thrown\.roomWeapon\)/);
assert.match(game, /THE SHIELD REJECTED IT · THROW A ROOM WEAPON/);
assert.match(html, /FINAL BOSS · E IS THE KEY/);
assert.match(html, /id="interactionPrompt"/);
assert.match(html, /id="bossHud"/);
assert.match(html, /class="essential-hud"/);
assert.match(html, /class="hud-data-hidden"/);
assert.match(css, /V58 clean player view: essential information only/);
assert.match(css, /\.clean-hud-top/);
assert.match(css, /\.essential-hud/);
assert.match(css, /\.interaction-prompt/);
assert.match(css, /\.boss-hud/);

// The mission and question timers must be based on wall-clock deadlines, not capped render deltas.
assert.match(game, /missionDeadlineMs = state\.startedAt \+ state\.durationSeconds \* 1000/);
assert.match(game, /state\.remaining = Math\.max\(0, \(state\.missionDeadlineMs - Date\.now\(\)\) \/ 1000\)/);
assert.match(game, /questionDeadlineMs = Date\.now\(\) \+ 60000/);
assert.match(game, /state\.questionRemaining = Math\.max\(0, \(state\.questionDeadlineMs - Date\.now\(\)\) \/ 1000\)/);
assert.doesNotMatch(game, /state\.remaining\s*-=?=\s*dt/);

// Every retry advances to the next student before another question is loaded.
const retryBlock = game.match(/if \(outcome === "correct"\)[\s\S]*?function calculateScore/);
assert.ok(retryBlock, "Question outcome block was not found");
assert.ok((retryBlock[0].match(/state\.questionStudentIndex = \(state\.questionStudentIndex \+ 1\) % 3/g) || []).length >= 2,
  "Correct and retry branches must both advance the student rotation");

// V58 preload must expose only the isolated IPC bridge.
assert.match(preload, /v58:save-result/);
assert.match(preload, /v58:ready/);
assert.doesNotMatch(preload, /nodeIntegration/);

// Every ID referenced by getElementById must exist exactly once in the HTML.
const jsIds = [...game.matchAll(/getElementById\("([^"]+)"\)/g)].map((match) => match[1]);
for (const id of new Set(jsIds)) {
  const count = (html.match(new RegExp(`\\bid="${id}"`, "g")) || []).length;
  assert.equal(count, 1, `Expected HTML id ${id} exactly once, found ${count}`);
}

console.log("V58 static validation passed: clean HUD, five rooms, final boss, E-key weapon clue, fair rotation and wall-clock timing.");
