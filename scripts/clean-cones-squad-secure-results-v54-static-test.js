"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const game = read("school-game/v54/game.js");
const html = read("school-game/v54/index.html");
const main = read("school-game/v54/main.js");
const preload = read("school-game/v54/preload.js");
const styles = read("school-game/v54/styles.css");

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

expect(game.includes('const VERSION = "54.0.0"'), "V54 renderer version missing.");
expect(game.includes('const EDITION = "clean-cones-squad-secure-results-v54"'), "V54 renderer edition missing.");
expect(game.includes("const FIXED_DT = 1 / 120"), "120 Hz simulation was not preserved.");
expect(game.includes("const FIXED_MATCH_SECONDS = 1200"), "20-minute mission was not preserved.");
expect(game.includes("const MAX_PLAYER_PROJECTILES = 6"), "Player projectile cap was not reduced.");
expect(game.includes("const MAX_ENEMY_PROJECTILES = 14"), "Enemy projectile cap was not reduced.");

const expectedAmmo = [
  ['mag: 6, reserve: 12', 'pistol'],
  ['mag: 9, reserve: 18', 'carbine'],
  ['mag: 3, reserve: 6', 'scatter'],
  ['mag: 3, reserve: 6', 'precision'],
  ['mag: 12, reserve: 24', 'smg'],
  ['mag: 6, reserve: 12', 'heavy']
];
for (const [fragment, weapon] of expectedAmmo) expect(game.includes(fragment), `${weapon} ammunition was not reduced.`);

expect(game.includes("function enemyVisionRange(enemy)"), "Unified vision range helper missing.");
expect(game.includes("function drawVisionCones()"), "Clean cone renderer missing.");
expect(game.includes('ctx.arc(enemy.x, enemy.y, range, left, right, false)'), "Vision cone is not a clear sector.");
expect(game.includes('ctx.fillText("SCAN"'), "Vision cone label missing.");
expect(game.includes("if (nowSeconds < state.blackboard.alertUntil) return"), "Cones do not disappear during squad alert.");
expect(!game.includes("const rays = 28"), "Old jagged multi-ray cone remains active.");

expect(game.includes("function broadcastSquadAlert(source, nowSeconds)"), "Squad alert broadcast missing.");
expect(game.includes("function applySquadOrder(enemy, source, nowSeconds)"), "Role-specific squad orders missing.");
expect(game.includes('enemy.squadOrder = "wide-flank"'), "Flanker squad decision missing.");
expect(game.includes('enemy.squadOrder = "overwatch"'), "Marksman squad decision missing.");
expect(game.includes('enemy.squadOrder = "close-advance"'), "Breacher squad decision missing.");
expect(game.includes('enemy.squadOrder = "anchor"'), "Heavy squad decision missing.");
expect(game.includes("const knownX = sees ? player.x : enemy.lastSeenX"), "AI does not use last-known location after losing vision.");
expect(game.includes("state.squadAlerts++"), "Squad alert telemetry missing.");
expect(game.includes("broadcastSquadAlert(enemy, nowSeconds)"), "Detected contact is not shared.");

expect(game.includes('resultProtection: "encrypted-local-vault"'), "Protected result metadata missing.");
expect(game.includes("historyEntry.scoreAfter = state.score"), "Question score-after record missing.");
expect(game.includes("questionHistory: state.questionHistory.map"), "Answers are not included in the saved report.");
expect(game.includes("openProtectedResults"), "Protected result viewer missing.");
expect(game.includes("getProtectedResults"), "Renderer does not request protected results.");

expect(main.includes('const VERSION = "54.0.0"'), "V54 main version missing.");
expect(main.includes('const PIN_HASH = "d8c4d37261d7aaa4bbafe4ccfe334e09fbe181c84de22e9a561dfe02b0958aa0"'), "Teacher PIN hash missing.");
expect(!main.includes('const PIN = "9109"'), "Teacher PIN is stored directly in source.");
expect(main.includes('crypto.createCipheriv("aes-256-gcm"'), "AES-256-GCM encryption missing.");
expect(main.includes("safeStorage.encryptString"), "OS-backed master-key protection missing.");
expect(main.includes('compiled-student-results.gtr'), "Encrypted consolidated student data missing.");
expect(main.includes("function protectedResults(pin)"), "Password-gated results function missing.");
expect(main.includes("crypto.timingSafeEqual"), "PIN comparison is not timing-safe.");
expect(main.includes("pinLockedUntil"), "Repeated-attempt lockout missing.");
expect(main.includes("No plaintext JSON or CSV containing student data"), "Plaintext data prohibition receipt missing.");
expect(main.includes("runPackagedVaultSelfTest"), "Packaged vault self-test missing.");
expect(!main.includes("LATEST_RESULT.json"), "Plaintext latest JSON is still written.");
expect(!main.includes("LATEST_RESULT.csv"), "Plaintext latest CSV is still written.");
expect(!main.includes("OPEN_RESULTS_FOLDER.cmd"), "Direct plaintext results folder shortcut remains.");

expect(preload.includes('ipcRenderer.invoke("v54:save-result"'), "V54 save IPC missing.");
expect(preload.includes('ipcRenderer.invoke("v54:get-protected-results"'), "Protected results IPC missing.");
expect(html.includes('id="resultsOverlay"'), "Protected results overlay missing.");
expect(html.includes('id="resultsPin" type="password"'), "Password input missing.");
expect(html.includes("AES-256-GCM"), "Encryption notice missing from UI.");
expect(html.includes("TEACHER RESULTS"), "Teacher results button missing.");
expect(styles.includes(".results-card"), "Protected results styling missing.");
expect(styles.includes(".results-table"), "Consolidated data table styling missing.");

console.log("Clean cones, squad AI and protected results V54 static contract passed.");
