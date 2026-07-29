"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const game = read("school-game/v60/game.js");
const html = read("school-game/v60/index.html");
const css = read("school-game/v60/styles.css");
const main = read("school-game/v60/main.js");
const preload = read("school-game/v60/preload.js");
const packageJson = JSON.parse(read("package.json"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(packageJson.version === "60.0.0", "Package version must be 60.0.0.");
assert(packageJson.main === "school-game/v60/main.js", "Package must launch the V60 runtime.");
assert(packageJson.build.win.target[0].target === "nsis", "V60 must build a full NSIS installer.");
assert(game.includes('const VERSION = "60.0.0";'), "Renderer version identity is missing.");
assert(game.includes('const EDITION = "classroom-thales-pause-v60";'), "Renderer edition identity is missing.");

assert(game.includes("const FIXED_MATCH_SECONDS = 1800"), "Mission duration must be 30 minutes.");
assert(game.includes("const MAX_PAUSES = 3"), "Maximum pause count must be three.");
assert(game.includes("const PAUSE_SECONDS = 30"), "Pause duration must be 30 seconds.");
assert(game.includes("function startPause"), "Controlled pause start logic is missing.");
assert(game.includes("function resumePause"), "Controlled pause resume logic is missing.");
assert(game.includes("state.missionDeadlineMs += usedMs"), "Mission clock does not freeze during pause.");
assert(game.includes('banner("Pause is available after the geometry checkpoint"'), "Pause must be blocked during geometry checkpoints.");
assert(html.includes('id="pauseRemaining"'), "Pause countdown is missing.");
assert(html.includes('id="pauseUses"'), "Pause-use counter is missing.");
assert(html.includes('id="pauseResumeButton"'), "Manual resume control is missing.");
assert(css.includes(".pause-countdown"), "Pause countdown styling is missing.");

assert(game.includes("segmentCallout"), "Thales segment callouts are missing.");
assert(game.includes('vertexLabel(A, "A"'), "Thales vertex labels are missing.");
assert(game.includes('vertexLabel(D, "D"'), "Inner Thales vertex labels are missing.");
assert(game.includes("DE is parallel to BC"), "Thales parallel-line explanation is missing.");
assert(game.includes("thalesCollisionFreeLabels: true"), "Thales label layout contract is missing.");
assert(game.includes("drawRightAngleMarker(D, A, E"), "The smaller Thales triangle must retain its 90-degree marker.");

assert(html.includes('id="gradeGroup"'), "The eighth-grade group selector is missing.");
for (const group of ["A", "B", "C"]) assert(html.includes(`value="${group}"`), `Group ${group} is missing.`);
assert(game.includes("isEditableTarget(event.target)"), "Editable login controls are not protected from gameplay key interception.");
assert(game.includes('group: state.gradeGroup'), "Group is not persisted in results.");
assert(game.includes('id: "unarmed"'), "Unarmed state is missing.");
assert(game.includes('player.weapon = createWeaponState("unarmed");'), "Thrown weapons do not leave the player hand.");
assert(game.includes("function performPlayerMelee"), "Player melee attack is missing.");
assert(game.includes('duelist: { label: "BATON DUELIST"'), "Baton duelist enemy is missing.");
assert(game.includes('enforcer: { label: "STAFF ENFORCER"'), "Staff enforcer enemy is missing.");

const tripleMatch = game.match(/const PYTHAGOREAN_TRIPLES = Object\.freeze\(\[([\s\S]*?)\]\);/);
assert(tripleMatch, "Procedural Pythagorean triple bank is missing.");
const tripleCount = (tripleMatch[1].match(/\[[^\]]+\]/g) || []).length;
assert(tripleCount >= 24, `Expected at least 24 right-triangle triples, found ${tripleCount}.`);
assert(game.includes("QUESTION_MEMORY_LIMIT = 96"), "Question no-repeat memory is missing.");
assert(game.includes("drawRightAngleMarker"), "Explicit 90-degree marker is missing.");
assert(!game.includes("acute triangle") && !game.includes("obtuse triangle"), "Non-right-triangle question wording was detected.");

assert(main.includes('createCipheriv("aes-256-gcm"'), "AES-256-GCM encryption is missing.");
assert(main.includes("scryptSync"), "PIN-derived key protection is missing.");
assert(main.includes("fs.renameSync(temporary, target)"), "Atomic vault replacement is missing.");
assert(main.includes("decryptLegacyV59Envelope"), "V59 encrypted-vault migration support is missing.");
assert(main.includes("pausePolicyRecorded"), "Pause policy is not tested in protected records.");
assert(!main.includes("LATEST_RESULT.json") && !main.includes("LATEST_RESULT.csv"), "Plaintext student result exports must not be written.");
for (const method of ["discoverAssets", "saveResult", "getProtectedResults", "markReady"]) {
  assert(preload.includes(method), `Preload API method ${method} is missing.`);
}

console.log(`Geometry Tactical Classroom V60 static contracts passed (${tripleCount} right-triangle triples, 30-minute mission, 3 × 30-second pauses).`);
