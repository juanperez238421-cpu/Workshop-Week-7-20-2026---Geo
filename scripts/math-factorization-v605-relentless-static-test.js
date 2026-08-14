"use strict";

const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const game = read("school-game/v60/game.js");
const html = read("school-game/v60/index.html");
const main = read("school-game/v60/main.js");
const packageJson = JSON.parse(read("package.json"));
function assert(condition, message) { if (!condition) throw new Error(message); }

assert(packageJson.version === "60.5.0", "Package must be V60.5.0.");
assert(packageJson.name === "math-tactical-classroom-v60-factorization-relentless-boss", "Package identity is incorrect.");
assert(packageJson.build.productName === "Math Tactical Classroom V60.5 Relentless Boss Edition", "Product name is incorrect.");
assert(packageJson.scripts.prepare.includes("patch-v60-relentless-boss-v605.js"), "V60.5 boss patch is missing from prepare chain.");

assert(game.includes('const VERSION = "60.5.0";'), "Renderer version is incorrect.");
assert(game.includes('const EDITION = "math-factorization-relentless-boss-v605";'), "Renderer edition is incorrect.");
assert(game.includes("const FIXED_MATCH_SECONDS = 2700"), "45-minute mission regressed.");
assert(game.includes("const QUESTION_SECONDS = 90"), "90-second questions regressed.");
assert(game.includes("teacherModeAvailable: true"), "Teacher mode regressed.");
assert(game.includes('event.code === "F8"'), "Teacher room hotkey regressed.");

assert(game.includes("BOSS_DASHES_BY_PHASE = Object.freeze([3, 5, 7])"), "Boss must use 3/5/7 dash chains.");
assert(game.includes("BOSS_DASH_SPEED_BY_PHASE = Object.freeze([760, 940, 1120])"), "Phase-scaled dash speeds are missing.");
assert(game.includes("BOSS_DASH_TELEGRAPH_BY_PHASE = Object.freeze([0.34, 0.24, 0.16])"), "Phase-scaled dash telegraphs are missing.");
assert(game.includes("BOSS_FATIGUE_SECONDS_BY_PHASE = Object.freeze([2.25, 1.55, 0.95])"), "Fatigue counter windows are missing.");
assert(game.includes("BOSS_DASH_STEER_BY_PHASE = Object.freeze([0.0, 0.58, 1.15])"), "Adaptive dash steering is missing.");
assert(game.includes("function observeBossTarget"), "Observed player-velocity model is missing.");
assert(game.includes("function bossPredictedPoint"), "Predictive intercept model is missing.");
assert(game.includes("function startBossRushCycle"), "Relentless dash-cycle controller is missing.");
assert(game.includes("function enterBossFatigue"), "Boss fatigue state is missing.");
assert(game.includes("function fireBossDashPressure"), "Dash-linked projectile pressure is missing.");
assert(game.includes("WARDEN HUNT"), "Rush-cycle feedback is missing.");
assert(game.includes("WARDEN TIRED"), "Fatigue feedback is missing.");
assert(game.includes("bossImmediateEngage: true"), "Runtime must report immediate boss engagement.");
assert(game.includes("bossRelentlessRushCycles: true"), "Runtime must report relentless rush cycles.");
assert(game.includes("bossFatigueCounterWindow: true"), "Runtime must report fatigue counter windows.");
assert(game.includes("bossDynamicPatternCount: 6"), "Boss pressure-pattern count must be upgraded to six.");
assert(game.includes("bossRoomDeploymentGraceSeconds: 0"), "Boss room must have zero deployment grace.");
assert(game.includes("beginBossDash(boss, state.player, true)"), "Boss must open the room with an immediate dash.");
assert(game.includes('state.player.invulnerable = MAPS[state.levelIndex].bossRoom ? 0.22'), "Boss-room player grace must be only a brief collision buffer.");

assert(game.includes("BOSS_SHIELD_HITS_BY_PHASE = Object.freeze([4, 5, 6])"), "Hit-based shield regressed.");
assert(game.includes("bossRequiresThrownRoomWeapon: false"), "Boss must remain killable without a mandatory thrown weapon.");
assert(game.includes("roomWeaponPickupFunctional"), "Floor-weapon pickup runtime check regressed.");
assert(game.includes("BOSS_ROOM_PICKUP_RADIUS = 118"), "Boss-room weapon pickup radius regressed.");
assert(game.includes("AYUDA INICIAL") && game.includes("Empieza así:"), "Factorization help regressed.");
for (const type of ["common-factor", "grouping", "difference-squares", "perfect-square-trinomial", "general-trinomial"]) assert(game.includes(`\"${type}\"`), `Missing factorization case ${type}.`);
assert(game.includes("NORMAL_ENEMY_TWO_HIT_TYPES"), "Fast normal-enemy balance regressed.");
assert(game.includes('if (enemyType === "boss") return;'), "Boss must remain excluded from normal-enemy durability tuning.");

assert(html.includes("MATH TACTICAL · V60.5 · RELENTLESS BOSS"), "V60.5 branding is missing.");
assert(html.includes("Phase 1 chains 3 predictive dashes") && html.includes("Phase 2 chains 5") && html.includes("Phase 3 chains 7"), "Boss briefing does not explain the new phase escalation.");
assert(main.includes('const APP_VERSION = "60.5.0";'), "Main process version is incorrect.");
assert(main.includes('const EDITION = "math-factorization-relentless-boss-v605";'), "Main process edition is incorrect.");
assert(main.includes('app.setName("Math Tactical Classroom V60.5 Relentless Boss Edition")'), "Electron app name is incorrect.");
assert(main.includes('"protected-results-v60-factorization-relentless-boss"'), "V60.5 results directory is not isolated.");

console.log("Math Tactical V60.5 Relentless Boss static contracts passed: immediate boss engagement, 3/5/7 escalating predictive dash chains, adaptive steering, dash-linked projectile pressure, fatigue counter windows, killable shields, 45-minute mission, 90-second factorization questions, and teacher room access preserved.");
