"use strict";
const fs = require("node:fs");
const path = require("node:path");
const gamePath = path.join(__dirname, "..", "school-game", "v60", "game.js");
function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`V60.8 preview fix could not find ${label}.`);
  return source.replace(before, after);
}
let game = fs.readFileSync(gamePath, "utf8");
game = replaceRequired(game,
  '    state.currentQuestion = createQuestion();\n    state.questionRemaining = QUESTION_SECONDS;',
  '    state.currentQuestion = state.ciQuestionOverride || createQuestion();\n    state.ciQuestionOverride = null;\n    state.questionRemaining = QUESTION_SECONDS;',
  "checkpoint question creation"
);
game = replaceRequired(game,
  '    state.questionActive = false;\n    const missionRemainingBeforePreview = state.remaining;\n    beginQuestionCheckpoint();',
  '    state.ciQuestionOverride = state.currentQuestion;\n    state.questionActive = false;\n    const missionRemainingBeforePreview = state.remaining;\n    beginQuestionCheckpoint();',
  "CI selected question preservation"
);
game = replaceRequired(game,
  'The correct numerical answer is not revealed.',
  'La respuesta correcta no se revela; revisa la ruta de solución.',
  "feedback wording"
);
fs.writeFileSync(gamePath, game, "utf8");
console.log("Applied V60.8 preview/runtime verification fix: requested combined type is preserved through checkpoint rendering.");
