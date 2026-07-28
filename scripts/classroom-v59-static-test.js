"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const game = read("school-game/v59/game.js");
const html = read("school-game/v59/index.html");
const css = read("school-game/v59/styles.css");
const main = read("school-game/v59/main.js");
const preload = read("school-game/v59/preload.js");
const packageJson = JSON.parse(read("package.json"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(packageJson.version === "59.0.0", "Package version must be 59.0.0.");
assert(packageJson.main === "school-game/v59/main.js", "Package must launch the V59 runtime.");
assert(game.includes('const VERSION = "59.0.0";'), "Renderer version identity is missing.");
assert(game.includes('const EDITION = "classroom-login-melee-question-bank-v59";'), "Renderer edition identity is missing.");

assert(html.includes('id="gradeGroup"'), "The eighth-grade group selector is missing.");
for (const group of ["A", "B", "C"]) assert(html.includes(`value="${group}"`), `Group ${group} is missing.`);
assert(game.includes("isEditableTarget(event.target)"), "Editable login controls are not protected from gameplay key interception.");
assert(game.indexOf("if (isEditableTarget(event.target)) return;") < game.indexOf('event.preventDefault();'), "Editable-target guard must run before preventDefault.");
assert(game.includes('group: state.gradeGroup'), "Group is not persisted in results.");
assert(game.includes('classLabel: `8°${state.gradeGroup}`'), "Class label is not persisted.");

assert(game.includes('id: "unarmed"'), "Unarmed state is missing.");
assert(game.includes('player.weapon = createWeaponState("unarmed");'), "Thrown weapons do not leave the player hand.");
assert(!game.includes("emergency pistol active"), "The infinite emergency-pistol throw behavior remains.");
assert(game.includes("function performPlayerMelee"), "Player melee attack is missing.");
assert(game.includes('keys.has("KeyQ")'), "Dedicated melee key Q is missing.");
assert(game.includes('duelist: { label: "BATON DUELIST"'), "Baton duelist enemy is missing.");
assert(game.includes('enforcer: { label: "STAFF ENFORCER"'), "Staff enforcer enemy is missing.");
assert(game.includes("function updateMeleeEnemyAI"), "Humanoid melee AI is missing.");

const tripleMatch = game.match(/const PYTHAGOREAN_TRIPLES = Object\.freeze\(\[([\s\S]*?)\]\);/);
assert(tripleMatch, "Procedural Pythagorean triple bank is missing.");
const tripleCount = (tripleMatch[1].match(/\[[^\]]+\]/g) || []).length;
assert(tripleCount >= 24, `Expected at least 24 right-triangle triples, found ${tripleCount}.`);
assert(game.includes("QUESTION_MEMORY_LIMIT = 96"), "Question no-repeat memory is missing.");
assert(game.includes("rememberQuestion(candidate)"), "Generated questions are not checked against repeat memory.");
assert(game.includes("questionTriangleLayout"), "Right-triangle orientation variants are missing.");
assert(game.includes("drawRightAngleMarker"), "Explicit 90-degree marker is missing.");
assert(game.includes("Both nested figures are right triangles"), "Thales questions do not preserve right-triangle wording.");
assert(!game.includes("acute triangle") && !game.includes("obtuse triangle"), "Non-right-triangle question wording was detected.");

assert(main.includes('createCipheriv("aes-256-gcm"'), "AES-256-GCM encryption is missing.");
assert(main.includes("scryptSync"), "PIN-derived key protection is missing.");
assert(main.includes("fs.renameSync(temporary, target)"), "Atomic vault replacement is missing.");
assert(main.includes("MAX_FAILED_PIN_ATTEMPTS"), "PIN attempt throttling is missing.");
assert(main.includes("!raw.includes(sample.students[0])"), "Encrypted-at-rest self-test is missing.");
assert(!main.includes("LATEST_RESULT.json") && !main.includes("LATEST_RESULT.csv"), "Plaintext student result exports must not be written.");
for (const method of ["discoverAssets", "saveResult", "getProtectedResults", "markReady"]) {
  assert(preload.includes(method), `Preload API method ${method} is missing.`);
}
assert(css.includes(".form-grid select"), "Group selector styling is missing.");

console.log(`Geometry Tactical Classroom V59 static contracts passed (${tripleCount} right-triangle triples).`);
