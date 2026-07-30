"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const game = read("school-game/v61/game.js");
const html = read("school-game/v61/index.html");
const css = read("school-game/v61/styles.css");
const main = read("school-game/v61/main.js");
const preload = read("school-game/v61/preload.js");
const packageJson = JSON.parse(read("package.json"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(packageJson.version === "61.0.0", "Package version must be 61.0.0.");
assert(packageJson.main === "school-game/v61/main.js", "Package must launch the V61 runtime.");
assert(packageJson.build.win.target[0].target === "nsis", "V61 must build a full NSIS installer.");
assert(game.includes('const VERSION = "61.0.0";'), "Renderer version identity is missing.");
assert(game.includes('const EDITION = "classroom-triangle-line-separation-v61";'), "Renderer edition identity is missing.");
assert(html.includes("Classroom V61") && html.includes("GEOMETRY TACTICAL · V61"), "V61 interface identity is missing.");

assert(game.includes("const FIXED_MATCH_SECONDS = 1800"), "Mission duration must remain 30 minutes.");
assert(game.includes("const MAX_PAUSES = 3"), "Maximum pause count must remain three.");
assert(game.includes("const PAUSE_SECONDS = 30"), "Pause duration must remain 30 seconds.");
assert(game.includes("function startPause"), "Controlled pause start logic is missing.");
assert(game.includes("function resumePause"), "Controlled pause resume logic is missing.");
assert(game.includes("state.missionDeadlineMs += usedMs"), "Mission clock does not freeze during pause.");
assert(game.includes('banner("Pause is available after the geometry checkpoint"'), "Pause must be blocked during geometry checkpoints.");
assert(html.includes('id="pauseRemaining"') && html.includes('id="pauseUses"') && html.includes('id="pauseResumeButton"'), "Pause interface is incomplete.");

assert(game.includes("const reserveLabel ="), "Collision-aware label reservation is missing.");
assert(game.includes("const boxesOverlap ="), "Label collision detection is missing.");
assert(game.includes("const outwardFrame ="), "Orientation-aware outward routing is missing.");
assert(game.includes("const addSegmentCallout ="), "Thales segment callouts are missing.");
assert(game.includes('addVertexLabel(D, "D", innerCentroid, 82)'), "Inner vertex D is not separated from the triangle junction.");
assert(game.includes('addVertexLabel(E, "E", innerCentroid, 82)'), "Inner vertex E is not separated from the triangle junction.");
assert(game.includes("highlightedCoincidentSegment(A, D)"), "Coincident side AD is not visually distinguished.");
assert(game.includes("highlightedCoincidentSegment(A, E)"), "Coincident side AE is not visually distinguished.");
assert(game.includes("separatedParallelSegment(D, E)"), "Parallel segment DE does not have an independent visual separator.");
assert(game.includes("Leaders are routed outward and painted first"), "Leader underpainting contract is missing.");
assert(game.indexOf("for (const leader of leaders)") < game.indexOf("highlightedCoincidentSegment(A, D)"), "Leader lines must be painted before the triangle geometry.");
assert(game.includes("thalesOutwardLeaderRouting: true"), "Outward leader-routing runtime contract is missing.");
assert(game.includes("thalesLeaderUnderpaint: true"), "Leader underpaint runtime contract is missing.");
assert(game.includes("thalesCoincidentSideHighlight: true"), "Coincident-side highlight runtime contract is missing.");
assert(game.includes("thalesParallelSegmentHalo: true"), "Parallel-segment halo runtime contract is missing.");
assert(game.includes("thalesLineSeparationVersion: 61"), "V61 line-separation contract is missing.");
assert(game.includes("drawRightAngleMarker(D, A, E"), "The smaller Thales triangle must retain its 90-degree marker.");
assert(game.includes("DE is parallel to BC"), "Thales parallel-line explanation is missing.");

assert(html.includes('id="gradeGroup"'), "The eighth-grade group selector is missing.");
for (const group of ["A", "B", "C"]) assert(html.includes(`value="${group}"`), `Group ${group} is missing.`);
assert(game.includes("isEditableTarget(event.target)"), "Editable login controls are not protected from gameplay key interception.");
assert(game.includes('group: state.gradeGroup'), "Group is not persisted in results.");
assert(game.includes('reportSchema: 61'), "V61 report schema is missing.");
assert(game.includes('id: "unarmed"'), "Unarmed state is missing.");
assert(game.includes('player.weapon = createWeaponState("unarmed");'), "Thrown weapons do not leave the player hand.");
assert(game.includes("function performPlayerMelee"), "Player melee attack is missing.");

const tripleMatch = game.match(/const PYTHAGOREAN_TRIPLES = Object\.freeze\(\[([\s\S]*?)\]\);/);
assert(tripleMatch, "Procedural Pythagorean triple bank is missing.");
const tripleCount = (tripleMatch[1].match(/\[[^\]]+\]/g) || []).length;
assert(tripleCount >= 24, `Expected at least 24 right-triangle triples, found ${tripleCount}.`);
assert(game.includes("QUESTION_MEMORY_LIMIT = 96"), "Question no-repeat memory is missing.");
assert(!game.includes("acute triangle") && !game.includes("obtuse triangle"), "Non-right-triangle question wording was detected.");

assert(main.includes('createCipheriv("aes-256-gcm"'), "AES-256-GCM encryption is missing.");
assert(main.includes('format: "GT-V61-AES-256-GCM"'), "V61 encrypted-vault format is missing.");
assert(main.includes("decryptLegacyV60Envelope"), "V60 encrypted-vault migration support is missing.");
assert(main.includes("decryptLegacyV59Envelope"), "V59 encrypted-vault migration support is missing.");
assert(main.indexOf("legacyV60VaultPath") < main.indexOf("legacyV59VaultPath"), "V60 migration must be attempted before V59 migration.");
assert(main.includes("fs.renameSync(temporary, target)"), "Atomic vault replacement is missing.");
assert(main.includes("pausePolicyRecorded"), "Pause policy is not tested in protected records.");
assert(!main.includes("LATEST_RESULT.json") && !main.includes("LATEST_RESULT.csv"), "Plaintext student result exports must not be written.");
for (const method of ["discoverAssets", "saveResult", "getProtectedResults", "markReady"]) {
  assert(preload.includes(method), `Preload API method ${method} is missing.`);
}

console.log(`Geometry Tactical Classroom V61 static contracts passed (${tripleCount} right-triangle triples, collision-free Thales line separation, 30-minute mission, 3 × 30-second pauses).`);
