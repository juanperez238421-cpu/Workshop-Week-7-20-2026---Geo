"use strict";

const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const game = read("school-game/v60/game.js");
const html = read("school-game/v60/index.html");
const main = read("school-game/v60/main.js");
const preload = read("school-game/v60/preload.js");
const packageJson = JSON.parse(read("package.json"));
function assert(condition, message) { if (!condition) throw new Error(message); }

assert(packageJson.version === "60.3.0", "Boss Edition package version must be 60.3.0.");
assert(packageJson.name === "math-tactical-classroom-v60-factorization-boss", "Boss Edition package identity is incorrect.");
assert(packageJson.build.productName === "Math Tactical Classroom V60.3 Boss Edition", "Boss Edition product name is incorrect.");
assert(packageJson.build.appId === "co.jpanalyst.mathtactical.classroom.v60.factorization.boss", "Boss Edition must use an isolated app id.");
assert(packageJson.scripts.prepare.includes("patch-v60-factorization-workshop.js") && packageJson.scripts.prepare.includes("patch-v60-boss-v61.js"), "Prepare chain must preserve factorization then apply the boss patch.");

assert(game.includes('const VERSION = "60.3.0";'), "Renderer version is incorrect.");
assert(game.includes('const EDITION = "math-factorization-boss-v61";'), "Renderer edition is incorrect.");
assert(game.includes("const BOSS_PHASES = 3"), "Boss must keep three health phases.");
assert(game.includes("BOSS_SHIELD_HITS_BY_PHASE = Object.freeze([4, 5, 6])"), "Hit-based shield values are missing.");
assert(game.includes("function damageBossShield"), "Hit-based boss shield function is missing.");
assert(game.includes("enemy.bossShieldHits = Math.max(0, enemy.bossShieldHits - damage)"), "Each shield hit must reduce shield strength.");
assert(game.includes("function damageBossCore"), "Boss core damage function is missing.");
assert(game.includes("SHIELD BROKEN · CORE OPEN"), "Boss shield break feedback is missing.");
assert(game.includes("bossRequiresThrownRoomWeapon: false"), "Boss must no longer be invulnerable until a thrown room weapon is used.");
assert(game.includes("bossShieldHitBased: true"), "Runtime must report hit-based shield behavior.");
assert(game.includes("bossShieldOneHitReduces"), "Installed runtime probe must verify one-hit shield reduction.");

assert(game.includes("function beginBossDash"), "Boss dash telegraph/charge pattern is missing.");
assert(game.includes("WARDEN DASH TELEGRAPH"), "Boss dash telegraph feedback is missing.");
assert(game.includes("function bossPredictiveAngle"), "Predictive player tracking is missing.");
assert(game.includes("WARDEN PATTERN · HEAVY FAN"), "Heavy fan pattern is missing.");
assert(game.includes("WARDEN PATTERN · PREDICTIVE TRIPLE"), "Predictive precision pattern is missing.");
assert(game.includes("WARDEN PATTERN · RADIAL RING"), "Radial pattern is missing.");
assert(game.includes("WARDEN PATTERN · PREDICTIVE SWEEP"), "Final-phase predictive sweep is missing.");
assert(game.includes("bossDynamicPatternCount: 4"), "Runtime must report four boss attack patterns.");
assert(game.includes("BOSS_DASH_COOLDOWN_BY_PHASE"), "Phase-scaled dash cooldowns are missing.");
assert(game.includes("BOSS_PREDICTION_SECONDS_BY_PHASE"), "Phase-scaled prediction is missing.");

assert(game.includes("BOSS_ROOM_PICKUP_RADIUS = 118"), "Expanded boss-room pickup radius is missing.");
assert(game.includes("function pickupWeaponDrop"), "Explicit floor-weapon pickup function is missing.");
assert(game.includes("roomWeaponPickupFunctional"), "Installed runtime must test a real room-weapon pickup.");
assert(game.includes("persistent: Boolean(item.roomWeapon)"), "Thrown room weapons must remain on the floor after landing.");
assert(game.includes("roomWeaponPower"), "Boss-room weapon power metadata is missing.");
assert(game.includes("FLOOR · E · x"), "Floor weapon interaction rendering is missing.");
assert(game.includes('[250,220,"carbine"]') && game.includes('[1350,780,"heavy"]'), "Expanded floor-weapon layout is missing.");

for (const type of ["common-factor", "grouping", "difference-squares", "perfect-square-trinomial", "general-trinomial"]) {
  assert(game.includes(`\"${type}\"`), `Missing factorization case ${type}.`);
}
assert(game.includes("AYUDA INICIAL"), "Visible initial-step help is missing from factorization questions.");
assert(game.includes("Empieza así:"), "Initial-step help wording is missing.");
assert(game.includes("factorizationInitialStepHelp: true"), "Runtime must report initial-step factorization help.");
assert(html.includes("FINAL BOSS · BREAK THE SHIELD"), "Updated boss briefing is missing.");
assert(html.includes("MATH TACTICAL · V60.3 · BOSS EDITION"), "Updated Boss Edition branding is missing.");

assert(game.includes("NORMAL_ENEMY_TWO_HIT_TYPES"), "Fast 1–2 hit normal-enemy tuning regressed.");
assert(game.includes('if (enemyType === "boss") return;'), "Boss must remain excluded from normal-enemy durability tuning.");
assert(main.includes('const APP_VERSION = "60.3.0";'), "Main process version is incorrect.");
assert(main.includes('const EDITION = "math-factorization-boss-v61";'), "Main process edition is incorrect.");
assert(main.includes('app.setName("Math Tactical Classroom V60.3 Boss Edition")'), "Electron application name is incorrect.");
assert(main.includes('"protected-results-v60-factorization-boss"'), "Boss Edition results directory must be isolated.");
assert(main.includes('"math-tactical-v60-factorization-boss.vault.json"'), "Boss Edition vault filename must be isolated.");
assert(main.includes('MT-V60-BOSS-AES-256-GCM'), "Boss Edition encrypted vault envelope is missing.");
for (const method of ["discoverAssets", "saveResult", "getProtectedResults", "markReady"]) assert(preload.includes(method), `Preload API ${method} is missing.`);

console.log("Math Tactical V60.3 Boss Edition static contracts passed: killable hit-based shield, three escalating phases, dash + prediction AI, four attack patterns, permanent pickable floor weapons, five factorization cases with initial-step help, and encrypted isolated results.");
