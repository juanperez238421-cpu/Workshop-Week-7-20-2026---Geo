"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const game = read("school-game/v53/game.js");
const html = read("school-game/v53/index.html");
const main = read("school-game/v53/main.js");
const preload = read("school-game/v53/preload.js");

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

expect(game.includes('const VERSION = "53.0.0"'), "V53 renderer version is missing.");
expect(game.includes('const EDITION = "right-thales-vision-hounds-v53"'), "V53 renderer edition is missing.");
expect(game.includes("const FIXED_DT = 1 / 120"), "The fixed 120 Hz simulation was not preserved.");
expect(game.includes("const FIXED_MATCH_SECONDS = 1200"), "The mission is not fixed at twenty minutes.");
expect(game.includes('missionCompletion: "time-or-both-levels"'), "The time-or-complete-level mission rule is missing.");
expect(game.includes('finishMatch("all-levels-cleared")'), "The game does not finish after both complete levels are cleared.");

expect(game.includes('thales-right-triangle'), "The right-triangle Thales readiness topic is missing.");
expect(game.includes("The right triangles ADE and ABC are similar"), "Thales prompts are not restricted to right triangles.");
expect(game.includes('qctx.strokeRect(B.x - 32, B.y - 32, 32, 32)'), "The outer right-angle marker is missing.");
expect(game.includes('qctx.strokeRect(D.x, D.y - 25, 25, 25)'), "The inner right-angle marker is missing.");
expect(!game.includes("In triangle ABC, DE is parallel to BC."), "The previous unrestricted Thales prompt remains active.");

expect(game.includes("function drawVisionCones()"), "Enemy detection cones are not rendered.");
expect(game.includes("function visionRayDistance"), "Vision cones are not clipped by room geometry.");
expect(game.includes("playerInsideEnemyVision"), "The visible cones are not connected to actual enemy detection.");
expect(game.includes("enemyVisionHalfAngle"), "Enemy archetypes do not have differentiated vision angles.");

expect(game.includes('hound: { label: "TACTICAL HOUND"'), "The hound archetype is missing.");
expect(game.includes("function updateHoundAI"), "The direct fast hound controller is missing.");
expect(game.includes('weaponId: "hound-melee"'), "Hounds are not melee-only attackers.");
expect(game.includes('if (enemy.typeId !== "hound")'), "Hounds incorrectly drop firearms.");
expect((game.match(/"hound"\]/g) || []).length >= 4, "Four authored hound placements were not found.");
expect(game.includes("function drawHound"), "The school-safe animated hound renderer is missing.");

expect(game.includes("function throwEquippedWeapon"), "Contextual weapon throwing is missing.");
expect(game.includes("function updateThrownWeapons"), "Thrown weapon physics are missing.");
expect(game.includes("THROW WEAPON ALONG AIM"), "The throw interaction is not visible to Student 3.");
expect(game.includes('else if (keys.has("KeyE") && !nearest)'), "E is not contextually split between pickup and throw.");
expect(game.includes("drawThrownWeapons(alpha)"), "Thrown weapons are not rendered.");

expect(game.includes('banner("Pause is disabled'), "P/Escape do not explain that pause is disabled.");
expect(game.includes('window.addEventListener("blur", () => { keys.clear(); });'), "Window blur still pauses gameplay.");
expect(!game.includes("if (!state.running || state.paused || state.questionActive"), "The simulation still stops for a manual pause state.");
expect(game.includes("if (state.questionActive) { updateHud(); return; }"), "The mission clock does not continue during checkpoints.");

expect(!html.includes("<select"), "The registration menu exposes forbidden selections.");
expect(html.includes("20 MIN"), "The registration menu does not show the twenty-minute rule.");
expect(html.includes("Pause is disabled"), "The pre-game controls do not explain the no-pause rule.");
expect(html.includes("pick up/throw"), "Student 3's contextual E control is not explained.");
expect(html.includes("similar right triangles"), "The assessment briefing does not restrict Thales to right triangles.");
expect(html.includes('id="pauseOverlay" class="overlay" aria-hidden="true"'), "The old pause interface is still exposed.");

expect(main.includes('const VERSION = "53.0.0"'), "The Electron main process version is not V53.");
expect(main.includes('const EDITION = "right-thales-vision-hounds-v53"'), "The Electron main process edition is incorrect.");
expect(main.includes("fixedMatchSeconds: 1200"), "Packaged readiness does not report twenty minutes.");
expect(main.includes("pauseAllowed: false"), "Packaged readiness does not report pause disabled.");
expect(main.includes("enemyVisionCones: true"), "Packaged readiness does not report vision cones.");
expect(main.includes("weaponThrowAlongAim: true"), "Packaged readiness does not report weapon throwing.");
expect(main.includes("houndEnemies: 4"), "Packaged readiness does not report all hounds.");
expect(main.includes("houndMeleeOnly: true"), "Packaged readiness does not report melee-only hounds.");
expect(main.includes("thalesRightTrianglesOnly: true"), "Packaged readiness does not report right-triangle-only Thales.");
expect(preload.includes('ipcRenderer.invoke("v53:save-result"'), "The V53 result IPC bridge is missing.");
expect(preload.includes('ipcRenderer.invoke("v53:ready"'), "The V53 readiness IPC bridge is missing.");

console.log("Right Thales Vision Hounds V53 static contract passed.");
