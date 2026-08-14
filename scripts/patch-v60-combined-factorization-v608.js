"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const gamePath = path.join(root, "school-game", "v60", "game.js");
const htmlPath = path.join(root, "school-game", "v60", "index.html");
const cssPath = path.join(root, "school-game", "v60", "styles.css");
const mainPath = path.join(root, "school-game", "v60", "main.js");
function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`V60.8 combined-factorization patch could not find ${label}.`);
  return source.replace(before, after);
}
function replaceAllRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`V60.8 combined-factorization patch could not find ${label}.`);
  return source.split(before).join(after);
}

let game = fs.readFileSync(gamePath, "utf8");
game = replaceRequired(game, 'const VERSION = "60.7.1";', 'const VERSION = "60.8.0";', "renderer version");
game = replaceRequired(game, 'const EDITION = "math-factorization-mastery-verified-v6071";', 'const EDITION = "math-factorization-combined-cases-v608";', "renderer edition");
game = replaceRequired(game,
  'questionBankPolicy: "procedural-factorization-five-cases-math-verified-unique-options"',
  'questionBankPolicy: "procedural-combined-factorization-multi-case-strict-option-objects"',
  "question bank policy"
);
game = replaceRequired(game,
  'ui.questionFeedback.textContent = "Identifica el caso, factoriza completamente y elige la opción equivalente. Respuesta incorrecta o tiempo agotado descuenta 0.20.";',
  'ui.questionFeedback.textContent = "Identifica la combinación de casos, factoriza hasta el final y elige una sola opción. Cada opción tiene un ID interno único y se verifica algebraicamente antes de mostrarse.";',
  "question instructions"
);
game = replaceRequired(game,
`    state.currentQuestion.options.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = option;
      button.addEventListener("click", () => answerQuestion(option, button));
      ui.questionOptions.appendChild(button);
    });`,
`    state.currentQuestion.options.forEach((option, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.optionId = option.id;
      button.dataset.optionSignature = option.signature;
      const key = document.createElement("span");
      key.className = "choice-key";
      key.textContent = ["A", "B", "C", "D"][index] || String(index + 1);
      const text = document.createElement("span");
      text.className = "choice-text";
      text.textContent = option.text;
      button.append(key, text);
      button.addEventListener("click", () => answerQuestion(option.id, button));
      ui.questionOptions.appendChild(button);
    });
    const renderedOptionButtons = [...ui.questionOptions.children];
    const renderedOptionTexts = renderedOptionButtons.map((button) => button.querySelector(".choice-text")?.textContent || "");
    const renderedOptionIds = renderedOptionButtons.map((button) => button.dataset.optionId || "");
    if (renderedOptionButtons.length !== 4 || new Set(renderedOptionTexts.map(normalizedVisibleText)).size !== 4 || new Set(renderedOptionIds).size !== 4 || !renderedOptionIds.includes(state.currentQuestion.correctOptionId)) {
      throw new Error("V60.8 option integrity failure: four unique rendered choices with the correct option are required.");
    }`,
  "strict option rendering"
);
game = replaceRequired(game,
  '    const correct = selected === state.currentQuestion.correct;\n    const outcome = forcedOutcome || (correct ? "correct" : "wrong");',
  '    const selectedOption = selected == null ? null : state.currentQuestion.options.find((option) => option.id === selected) || null;\n    const correct = Boolean(selectedOption?.isCorrect && selectedOption.id === state.currentQuestion.correctOptionId);\n    const outcome = forcedOutcome || (correct ? "correct" : "wrong");',
  "ID-based answer evaluation"
);
game = replaceRequired(game,
  '      selected: selected == null ? "" : selected,',
  '      selected: selectedOption ? selectedOption.text : "",\n      selectedOptionId: selectedOption?.id || "",\n      selectedOptionSignature: selectedOption?.signature || "",',
  "answer history selection"
);
game = replaceRequired(game,
  '      questionCorrectOptionPresent: state.currentQuestion.options.includes(state.currentQuestion.correct),',
  '      questionCorrectOptionPresent: state.currentQuestion.options.some((option) => option.id === state.currentQuestion.correctOptionId && option.isCorrect === true),\n      questionCorrectOptionId: state.currentQuestion.correctOptionId,\n      questionRenderedOptionCount: ui.questionOptions.children.length,\n      questionRenderedOptionIds: [...ui.questionOptions.children].map((button) => button.dataset.optionId || ""),\n      questionRenderedOptionTexts: [...ui.questionOptions.children].map((button) => button.querySelector(".choice-text")?.textContent || ""),\n      questionRenderedUniqueOptionCount: new Set([...ui.questionOptions.children].map((button) => normalizedVisibleText(button.querySelector(".choice-text")?.textContent || ""))).size,\n      questionRenderedCorrectOptionPresent: [...ui.questionOptions.children].some((button) => button.dataset.optionId === state.currentQuestion.correctOptionId),',
  "preview option integrity fields"
);
game = replaceAllRequired(game,
  'mathVerifiedQuestionBank: true,\n      algebraicallyUniqueAnswerOptions: true,',
  'mathVerifiedQuestionBank: true,\n      algebraicallyUniqueAnswerOptions: true,\n      combinedFactorizationCentral: true,\n      strictOptionObjectIds: true,\n      runtimeOptionIntegrityGuard: true,',
  "combined-factorization readiness markers"
);
fs.writeFileSync(gamePath, game, "utf8");

let html = fs.readFileSync(htmlPath, "utf8");
html = replaceRequired(html, "MATH TACTICAL · V60.7.1 · MASTERY BOSS · VERIFIED MATH", "MATH TACTICAL · V60.8 · COMBINED FACTORIZATION", "HUD brand");
html = replaceRequired(html,
  "Registra a los tres estudiantes y comienza el taller táctico. La misión conserva cinco salas, treinta minutos, hasta tres pausas de 30 segundos, combate rápido contra enemigos normales y un jefe final completo. Los checkpoints evalúan cinco casos de factorización y todos los nombres, respuestas y puntajes se guardan cifrados localmente.",
  "Registra a los tres estudiantes y comienza el taller táctico. La misión conserva cinco salas, 45 minutos, preguntas de 90 segundos, combate rápido y el jefe Mastery. El tema central de los checkpoints es la combinación de casos de factorización: cada ejercicio exige aplicar al menos dos etapas y llegar a la factorización completa. Las respuestas se validan algebraicamente antes de mostrarse.",
  "registration description"
);
html = replaceRequired(html,
  '<div><strong>CASOS 1–3</strong><span>Factor común, agrupación y diferencia de cuadrados. Los coeficientes y signos cambian proceduralmente y la memoria evita repetir ejercicios recientes.</span></div>\n          <div><strong>CASOS 4–5</strong><span>Trinomio cuadrado perfecto y trinomio general. Cada checkpoint exige identificar el patrón y elegir la factorización completa equivalente.</span></div>',
  '<div><strong>COMBINACIONES 1–3</strong><span>Factor común → diferencia de cuadrados; factor común → trinomio cuadrado perfecto; factor común → trinomio general.</span></div>\n          <div><strong>COMBINACIONES 4–5</strong><span>Agrupación → diferencia de cuadrados; factor común → agrupación. No se acepta una factorización intermedia: debes completar todos los casos aplicables.</span></div>',
  "assessment combinations"
);
html = replaceRequired(html, "THREE DEATHS · FACTORIZATION WORKSHOP", "THREE DEATHS · COMBINED FACTORIZATION CHECKPOINT", "checkpoint eyebrow");
html = replaceRequired(html, "IDENTIFY · FACTOR · CHOOSE", "IDENTIFY COMBO · FACTOR AGAIN · CHOOSE", "question task label");
fs.writeFileSync(htmlPath, html, "utf8");

let css = fs.readFileSync(cssPath, "utf8");
css += `\n/* V60.8 strict multiple-choice readability: four unique choices, explicit A-D keys. */\n.question-options button { display: grid; grid-template-columns: 32px minmax(0, 1fr); align-items: center; column-gap: 8px; text-align: left; overflow: visible; }\n.question-options .choice-key { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; background: #eaf1ff; color: #2457d6; font-size: 14px; font-weight: 950; }\n.question-options .choice-text { min-width: 0; overflow-wrap: anywhere; word-break: normal; line-height: 1.22; }\n.question-options button.correct .choice-key { background: #ccebdc; color: #0d5c3f; }\n.question-options button.wrong .choice-key { background: #f8d6d6; color: #912828; }\n@media (max-height: 760px) and (min-width: 1081px) { .question-options button { min-height: 58px; font-size: 15px; } }\n`;
fs.writeFileSync(cssPath, css, "utf8");

let main = fs.readFileSync(mainPath, "utf8");
main = replaceRequired(main, 'const APP_VERSION = "60.7.1";', 'const APP_VERSION = "60.8.0";', "main version");
main = replaceRequired(main, 'const EDITION = "math-factorization-mastery-verified-v6071";', 'const EDITION = "math-factorization-combined-cases-v608";', "main edition");
main = replaceRequired(main, 'app.setName("Math Tactical Classroom V60.7.1 Mastery Boss Verified Math");', 'app.setName("Math Tactical Classroom V60.8 Combined Factorization")', "application name");
main = replaceRequired(main, '"protected-results-v60-factorization-mastery-verified"', '"protected-results-v60-factorization-combined-v608"', "results directory");
main = replaceRequired(main, '"math-tactical-v60-factorization-mastery-verified.vault.json"', '"math-tactical-v60-factorization-combined-v608.vault.json"', "vault file");
fs.writeFileSync(mainPath, main, "utf8");
console.log("Applied Math Tactical V60.8 combined-factorization patch: multi-stage questions, strict option IDs, DOM integrity guard, and preserved Mastery boss.");
