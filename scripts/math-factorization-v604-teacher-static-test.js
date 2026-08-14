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
function assert(condition, message) { if (!condition) throw new Error(message); }

assert(packageJson.version === "60.4.0", "Teacher Edition package version must be 60.4.0.");
assert(packageJson.name === "math-tactical-classroom-v60-factorization-boss-teacher", "Teacher Edition package identity is incorrect.");
assert(packageJson.build.productName === "Math Tactical Classroom V60.4 Teacher Edition", "Teacher Edition product name is incorrect.");
assert(packageJson.build.appId === "co.jpanalyst.mathtactical.classroom.v60.factorization.boss.teacher", "Teacher Edition must use an isolated app id.");
assert(packageJson.scripts.prepare.includes("patch-v60-boss-v61.js") && packageJson.scripts.prepare.includes("patch-v60-teacher-mode-v604.js"), "Prepare chain must preserve V60.3 boss logic and then apply V60.4 teacher mode.");

assert(game.includes('const VERSION = "60.4.0";'), "Renderer version is incorrect.");
assert(game.includes('const EDITION = "math-factorization-teacher-v604";'), "Renderer edition is incorrect.");
assert(game.includes("const FIXED_MATCH_SECONDS = 2700"), "Mission duration must be 45 minutes.");
assert(game.includes("const QUESTION_SECONDS = 90"), "Question duration must be 90 seconds.");
assert(game.includes("state.questionRemaining = QUESTION_SECONDS"), "Question countdown must use the 90-second constant.");
assert(game.includes("state.questionDeadlineMs = Date.now() + QUESTION_SECONDS * 1000"), "Question deadline must use the 90-second constant.");
assert(game.includes('missionRule: "45-minutes-or-clear-all-five-levels"'), "Saved mission rule must report 45 minutes.");
assert(html.includes('id="timeValue">45:00<'), "HUD must start at 45:00.");
assert(html.includes('id="questionMissionTime">45:00<'), "Question overlay must display the 45-minute mission clock.");
assert(html.includes('id="questionTimer">90<'), "Question overlay must start at 90 seconds.");
assert(html.includes("Each problem allows 90 seconds while the 45-minute mission clock keeps running."), "Registration instructions must document the new timers.");

assert(html.includes('id="teacherModeButton"'), "Teacher Mode launch button is missing.");
assert(html.includes('id="teacherModeOverlay"'), "Teacher Mode overlay is missing.");
for (let room = 1; room <= 5; room++) assert(html.includes(`data-teacher-room="${room}"`), `Teacher room selector is missing Room ${room}.`);
assert(game.includes("function openTeacherModeMenu"), "Teacher Mode menu controller is missing.");
assert(game.includes("function unlockTeacherMode"), "Teacher Mode PIN unlock is missing.");
assert(game.includes("function startTeacherRoom"), "Teacher direct-room launch is missing.");
assert(game.includes("function jumpTeacherRoom"), "Teacher in-session room switching is missing.");
assert(game.includes('event.code === "F8"'), "F8 teacher room selector shortcut is missing.");
assert(game.includes("teacherSessionsExcludedFromGrades"), "Teacher sessions must be excluded from student grading.");
assert(game.includes("if (state.teacherMode || !state.resultId"), "Teacher Mode must not save grading reports.");
assert(game.includes("teacherModeAvailable: true"), "Runtime readiness must report Teacher Mode availability.");
assert(game.includes("teacherRoomCount: MAPS.length"), "Runtime readiness must report all five teacher-accessible rooms.");
assert(game.includes("teacherDirectRoomAccess: true"), "Runtime readiness must report direct room access.");
assert(game.includes("teacherModePinProtected: true"), "Runtime readiness must report PIN protection.");
assert(game.includes("teacher-room-probe"), "Installed runtime teacher-room probe is missing.");
assert(css.includes(".teacher-mode-overlay") && css.includes(".teacher-room-grid"), "Teacher Mode styling is missing.");

assert(preload.includes("verifyTeacherPin"), "Preload must expose teacher PIN verification.");
assert(main.includes("function verifyTeacherPin"), "Main process teacher PIN verification is missing.");
assert(main.includes("crypto.timingSafeEqual"), "Teacher PIN verification must use constant-time comparison.");
assert(main.includes('ipcMain.handle("school-game:verify-teacher-pin"'), "Teacher PIN IPC handler is missing.");
assert(main.includes('const APP_VERSION = "60.4.0";'), "Main process version is incorrect.");
assert(main.includes('const EDITION = "math-factorization-teacher-v604";'), "Main process edition is incorrect.");
assert(main.includes('app.setName("Math Tactical Classroom V60.4 Teacher Edition")'), "Electron application name is incorrect.");
assert(main.includes('"protected-results-v60-factorization-boss-teacher"'), "Teacher Edition results directory must be isolated.");
assert(main.includes('"math-tactical-v60-factorization-boss-teacher.vault.json"'), "Teacher Edition vault filename must be isolated.");
assert(main.includes("V60_TEACHER_PROBE"), "Main process teacher-room runtime probe routing is missing.");

assert(game.includes("const BOSS_PHASES = 3"), "Final boss must keep three phases.");
assert(game.includes("BOSS_SHIELD_HITS_BY_PHASE = Object.freeze([4, 5, 6])"), "Final boss hit-based shield regressed.");
assert(game.includes("function beginBossDash"), "Boss dash pattern regressed.");
assert(game.includes("function bossPredictiveAngle"), "Boss predictive AI regressed.");
assert(game.includes("WARDEN PATTERN · PREDICTIVE SWEEP"), "Boss phase-3 predictive sweep regressed.");
assert(game.includes("roomWeaponPickupFunctional"), "Boss-room floor weapon pickup runtime test regressed.");
assert(game.includes("BOSS_ROOM_PICKUP_RADIUS = 118"), "Boss-room pickup radius regressed.");
assert(game.includes("AYUDA INICIAL") && game.includes("Empieza así:"), "Factorization initial-step help regressed.");
for (const type of ["common-factor", "grouping", "difference-squares", "perfect-square-trinomial", "general-trinomial"]) assert(game.includes(`\"${type}\"`), `Missing factorization case ${type}.`);
assert(game.includes("NORMAL_ENEMY_TWO_HIT_TYPES"), "Fast 1–2 hit normal-enemy tuning regressed.");
assert(game.includes('if (enemyType === "boss") return;'), "Boss must remain excluded from normal-enemy durability tuning.");

console.log("Math Tactical V60.4 Teacher Edition static contracts passed: 90-second questions, 45-minute mission, PIN-protected Rooms 1–5 access, F8 room switching, no teacher-grade writes, V60.3 boss AI preserved, and factorization help preserved.");
