"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const game = read("school-game/v60/game.js");
const html = read("school-game/v60/index.html");
const main = read("school-game/v60/main.js");
const block = read("scripts/v60-factorization-question-block.txt");
const pkg = JSON.parse(read("package.json"));
function assert(ok, msg) { if (!ok) throw new Error(msg); }

assert(pkg.version === "60.7.1", "Package must be V60.7.1.");
assert(pkg.name === "math-tactical-classroom-v60-factorization-mastery-verified", "Package identity is incorrect.");
assert(pkg.build.productName === "Math Tactical Classroom V60.7.1 Mastery Boss Verified Math", "Product name is incorrect.");
assert(pkg.scripts.prepare.includes("patch-v60-mastery-boss-v607.js") && pkg.scripts.prepare.includes("patch-v60-math-verification-v6071.js"), "Prepare chain must preserve V60.7 boss and then apply V60.7.1 math verification.");

assert(game.includes('const VERSION = "60.7.1";') && game.includes('const EDITION = "math-factorization-mastery-verified-v6071";'), "Renderer identity is incorrect.");
assert(game.includes("const FIXED_MATCH_SECONDS = 2700") && game.includes("const QUESTION_SECONDS = 90"), "45-minute / 90-second timers regressed.");
assert(game.includes("mathVerifiedQuestionBank: true") && game.includes("algebraicallyUniqueAnswerOptions: true"), "Verified-math runtime markers are missing.");
assert(game.includes("questionCorrectOptionPresent: state.currentQuestion.options.includes(state.currentQuestion.correct)"), "Runtime must verify the marked answer is actually visible.");
assert(game.includes('questionBankPolicy: "procedural-factorization-five-cases-math-verified-unique-options"'), "Verified question bank policy is missing.");

assert(block.includes("function gcdInt") && block.includes("function coprime"), "Primitive-factor validation helpers are missing.");
assert(block.includes("function polynomialSignature") && block.includes("function pairSignature"), "Algebraic equivalence signatures are missing.");
assert(block.includes("function makeVerifiedOptions"), "Verified option builder is missing.");
assert(!block.includes("return shuffled(unique).slice(0, 4)"), "Legacy option slicing can omit the correct answer and must not return.");
assert(block.includes("entries = [optionEntry(correctText, correctSignature)]"), "Correct option must be inserted before distractors.");
assert(block.includes("seenSignature.has(candidate.signature)"), "Algebraically equivalent distractors must be rejected.");
assert(block.includes("while (!coprime(a, b))"), "Complete factorization must enforce primitive factors in direct cases.");
assert(block.includes("!coprime(a, b) || !coprime(c, d)"), "Grouping/general trinomial factors must be primitive.");

assert(game.includes("BOSS_SHIELD_HITS_BY_PHASE = Object.freeze([6, 8, 10])"), "Mastery boss shield balance regressed.");
assert(game.includes("BOSS_CORE_HITS_BY_PHASE = Object.freeze([3, 4, 5])"), "Mastery core armor regressed.");
assert(game.includes("BOSS_DASHES_BY_PHASE = Object.freeze([4, 6, 8])"), "Mastery dash chains regressed.");
assert(game.includes("BOSS_DODGE_IFRAMES_SECONDS = 0.18") && game.includes("BOSS_MASTERY_TARGET_DEATHS = 30"), "Mastery dodge/death target regressed.");
assert(game.includes("bossVariableDashCadence: true") && game.includes("bossCommittedDashNoHoming: true"), "Mastery boss cadence/commit contract regressed.");
assert(game.includes("teacherModeAvailable: true") && game.includes('event.code === "F8"'), "Teacher mode regressed.");
assert(game.includes("AYUDA INICIAL") && game.includes("Empieza así:"), "Factorization help regressed.");
for (const type of ["common-factor","grouping","difference-squares","perfect-square-trinomial","general-trinomial"]) assert(game.includes(`\"${type}\"`), `Missing factorization case ${type}.`);
assert(html.includes("MATH TACTICAL · V60.7.1 · MASTERY BOSS · VERIFIED MATH"), "Verified-math HUD branding is missing.");
assert(main.includes('const APP_VERSION = "60.7.1";') && main.includes('const EDITION = "math-factorization-mastery-verified-v6071";'), "Main-process identity is incorrect.");
assert(main.includes('app.setName("Math Tactical Classroom V60.7.1 Mastery Boss Verified Math")'), "Application name is incorrect.");
assert(main.includes('"protected-results-v60-factorization-mastery-verified"'), "Corrected results must be isolated from legacy mathematically flawed records.");
console.log("Math Tactical V60.7.1 static contracts passed: mathematically verified factorization bank, correct option always visible, algebraically unique distractors, complete primitive factorizations, V60.7 mastery boss preserved.");
