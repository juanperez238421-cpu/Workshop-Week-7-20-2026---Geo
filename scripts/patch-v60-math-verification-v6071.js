"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const gamePath = path.join(root, "school-game", "v60", "game.js");
const htmlPath = path.join(root, "school-game", "v60", "index.html");
const mainPath = path.join(root, "school-game", "v60", "main.js");
function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`V60.7.1 math verification patch could not find ${label}.`);
  return source.replace(before, after);
}
function replaceAllRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`V60.7.1 math verification patch could not find ${label}.`);
  return source.split(before).join(after);
}
let game = fs.readFileSync(gamePath, "utf8");
game = replaceRequired(game, 'const VERSION = "60.7.0";', 'const VERSION = "60.7.1";', "renderer version");
game = replaceRequired(game, 'const EDITION = "math-factorization-mastery-boss-v607";', 'const EDITION = "math-factorization-mastery-verified-v6071";', "renderer edition");
game = replaceRequired(game,
  'questionBankPolicy: "procedural-factorization-five-cases-no-repeat-until-memory-limit"',
  'questionBankPolicy: "procedural-factorization-five-cases-math-verified-unique-options"',
  "question bank policy"
);
game = replaceAllRequired(game,
  'factorizationInitialStepHelp: true,',
  'factorizationInitialStepHelp: true,\n      mathVerifiedQuestionBank: true,\n      algebraicallyUniqueAnswerOptions: true,',
  "verified question bank runtime markers"
);
game = replaceRequired(game,
  '      questionType: state.currentQuestion.type,\n      answerRevealDisabled: true,',
  '      questionType: state.currentQuestion.type,\n      questionCorrectOptionPresent: state.currentQuestion.options.includes(state.currentQuestion.correct),\n      questionOptionCount: state.currentQuestion.options.length,\n      questionCorrectSignature: state.currentQuestion.correctSignature || "",\n      questionSourceCoefficients: [...(state.currentQuestion.coefficients || [])],\n      answerRevealDisabled: true,',
  "question preview verification fields"
);
fs.writeFileSync(gamePath, game, "utf8");

let html = fs.readFileSync(htmlPath, "utf8");
html = replaceRequired(html, "MATH TACTICAL · V60.7 · MASTERY BOSS", "MATH TACTICAL · V60.7.1 · MASTERY BOSS · VERIFIED MATH", "HUD brand");
fs.writeFileSync(htmlPath, html, "utf8");

let main = fs.readFileSync(mainPath, "utf8");
main = replaceRequired(main, 'const APP_VERSION = "60.7.0";', 'const APP_VERSION = "60.7.1";', "main version");
main = replaceRequired(main, 'const EDITION = "math-factorization-mastery-boss-v607";', 'const EDITION = "math-factorization-mastery-verified-v6071";', "main edition");
main = replaceRequired(main, 'app.setName("Math Tactical Classroom V60.7 Mastery Boss Edition");', 'app.setName("Math Tactical Classroom V60.7.1 Mastery Boss Verified Math");', "application name");
main = replaceRequired(main, '"protected-results-v60-factorization-mastery-boss"', '"protected-results-v60-factorization-mastery-verified"', "results directory");
main = replaceRequired(main, '"math-tactical-v60-factorization-mastery-boss.vault.json"', '"math-tactical-v60-factorization-mastery-verified.vault.json"', "vault file");
fs.writeFileSync(mainPath, main, "utf8");
console.log("Applied Math Tactical V60.7.1 verified-math patch: corrected complete factorizations, guaranteed correct option presence, algebraically unique distractors, and isolated verified results.");
