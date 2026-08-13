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

assert(packageJson.name === "math-tactical-classroom-v60-factorization", "Package identity must be the isolated Math Tactical edition.");
assert(packageJson.version === "60.2.0", "Math Tactical package version must be 60.2.0.");
assert(packageJson.main === "school-game/v60/main.js", "Package must launch the prepared V60 runtime.");
assert(packageJson.build.appId === "co.jpanalyst.mathtactical.classroom.v60.factorization", "Math Tactical must use a separate Windows app id.");
assert(packageJson.build.productName === "Math Tactical Classroom V60 Factorization", "Math Tactical product name is incorrect.");
assert(packageJson.build.win.target[0].target === "nsis", "Math Tactical must build a full NSIS installer.");

assert(game.includes('const VERSION = "60.2.0";'), "Renderer version identity is missing.");
assert(game.includes('const EDITION = "math-factorization-workshop-v60";'), "Renderer edition identity is missing.");
assert(game.includes("const FIXED_MATCH_SECONDS = 1800"), "Mission duration must remain 30 minutes.");
assert(game.includes("const MAX_PAUSES = 3"), "Maximum pause count must remain three.");
assert(game.includes("const PAUSE_SECONDS = 30"), "Pause duration must remain 30 seconds.");

const factorizationTypes = [
  "common-factor",
  "grouping",
  "difference-squares",
  "perfect-square-trinomial",
  "general-trinomial"
];
for (const type of factorizationTypes) assert(game.includes(`\"${type}\"`), `Missing factorization case: ${type}`);
for (const label of ["FACTOR COMÚN", "AGRUPACIÓN", "DIFERENCIA DE CUADRADOS", "TRINOMIO CUADRADO PERFECTO", "TRINOMIO GENERAL"]) {
  assert(game.includes(label), `Missing visible factorization label: ${label}`);
}
assert(game.includes("createCommonFactorQuestion"), "Common-factor generator is missing.");
assert(game.includes("createGroupingQuestion"), "Grouping generator is missing.");
assert(game.includes("createDifferenceSquaresQuestion"), "Difference-of-squares generator is missing.");
assert(game.includes("createPerfectSquareTrinomialQuestion"), "Perfect-square-trinomial generator is missing.");
assert(game.includes("createGeneralTrinomialQuestion"), "General-trinomial generator is missing.");
assert(game.includes('questionBankPolicy: "procedural-factorization-five-cases-no-repeat-until-memory-limit"'), "Factorization question-bank policy is missing.");
assert(game.includes("QUESTION_MEMORY_LIMIT = 96"), "Question no-repeat memory must remain active.");
assert(!game.includes("PYTHAGOREAN_TRIPLES"), "Legacy Pythagorean question constants must not remain in the Math Tactical runtime.");
assert(!game.includes("THALES_FACTORS"), "Legacy Thales question constants must not remain in the Math Tactical runtime.");
assert(html.includes("Taller de Factorización"), "Math Tactical registration title is missing.");
assert(html.includes("CASOS 1–3") && html.includes("CASOS 4–5"), "Opening screen does not explain all five factorization cases.");
assert(html.includes("FACTORIZATION WORKSHOP"), "Factorization checkpoint heading is missing.");
assert(html.includes("FINAL BOSS · E IS THE KEY"), "Final boss instructions must remain visible.");

assert(game.includes("NORMAL_ENEMY_TWO_HIT_TYPES"), "Normal-enemy 1–2 hit tuning is missing.");
assert(game.includes('new Set(["heavy", "enforcer", "warden", "breacher"])'), "Two-hit heavy enemy set is missing.");
assert(game.includes("NORMAL_ENEMY_SHIELD_KEYS"), "Normal-enemy shield suppression is missing.");
assert(game.includes('if (enemyType === "boss") return;'), "Final boss must remain excluded from normal-enemy tuning.");

assert(game.includes("const BOSS_LEVEL_INDEX = 4"), "Final boss level index is missing.");
assert(game.includes("const BOSS_PHASES = 3"), "Three-phase final boss is missing.");
assert(game.includes('boss: { label: "ARCHIVE WARDEN"'), "Archive Warden boss definition is missing.");
assert(game.includes('bossRoom: true'), "Room 5 must remain a boss room.");
assert(game.includes('enemies: [[800,500,"boss"]]'), "Room 5 boss spawn is missing.");
assert(game.includes("bossShieldActive"), "Final-boss shield mechanic must remain present.");
assert(game.includes("BOSS SHIELD BLOCKS BULLETS"), "Final-boss shield feedback is missing.");
assert(game.includes("bossRequiresThrownRoomWeapon: true"), "Final boss must still require a thrown room weapon.");
assert(game.includes("room5FinalBoss: true"), "Renderer readiness must report the Room 5 final boss.");

assert(main.includes('const APP_VERSION = "60.2.0";'), "Main-process version is incorrect.");
assert(main.includes('const EDITION = "math-factorization-workshop-v60";'), "Main-process edition is incorrect.");
assert(main.includes('app.setName("Math Tactical Classroom V60 Factorization")'), "Math Tactical must use a separate Electron application name.");
assert(main.includes('"protected-results-v60-factorization"'), "Math Tactical protected-results directory is not isolated.");
assert(main.includes('"math-tactical-v60-factorization.vault.json"'), "Math Tactical vault filename is not isolated.");
assert(main.includes('createCipheriv("aes-256-gcm"'), "AES-256-GCM encryption is missing.");
assert(main.includes("scryptSync"), "PIN-derived encryption key protection is missing.");
assert(main.includes('MT-V60-AES-256-GCM'), "Math Tactical vault envelope identity is missing.");
assert(main.includes('V60_QUESTION_PREVIEW'), "Factorization runtime preview probe is missing.");
assert(!main.includes("LATEST_RESULT.json") && !main.includes("LATEST_RESULT.csv"), "Plaintext student result exports must not be written.");
for (const method of ["discoverAssets", "saveResult", "getProtectedResults", "markReady"]) {
  assert(preload.includes(method), `Preload API method ${method} is missing.`);
}

assert(css.includes(".boss-hud"), "Boss HUD styling must remain available.");
assert(css.includes(".question-card"), "Question layout styling is missing.");

console.log("Math Tactical V60.2 static contracts passed: five factorization cases, 1–2 hit normal enemies, isolated encrypted results, five rooms and final boss preserved.");
