"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");
const target = path.join(repoRoot, "school-game", "v60");
const gamePath = path.join(target, "game.js");
const htmlPath = path.join(target, "index.html");
const mainPath = path.join(target, "main.js");
const blockPath = path.join(__dirname, "v60-factorization-question-block.txt");

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Factorization patch could not find ${label}.`);
  return source.replace(before, after);
}

for (const file of [gamePath, htmlPath, mainPath, blockPath]) {
  if (!fs.existsSync(file)) throw new Error(`Factorization patch input missing: ${file}`);
}

let game = fs.readFileSync(gamePath, "utf8");
const block = fs.readFileSync(blockPath, "utf8").trimEnd();
const questionStart = game.indexOf("  const PYTHAGOREAN_TRIPLES = Object.freeze([");
const questionEnd = game.indexOf("  function syncMissionClock()", questionStart);
if (questionStart < 0 || questionEnd < 0 || questionEnd <= questionStart) {
  throw new Error("Could not isolate the original trigonometry question engine.");
}
game = game.slice(0, questionStart) + block + "\n\n" + game.slice(questionEnd);

game = replaceRequired(game, 'const VERSION = "60.0.0";', 'const VERSION = "60.2.0";', "renderer version");
game = replaceRequired(game, 'const EDITION = "classroom-thales-pause-v60";', 'const EDITION = "math-factorization-workshop-v60";', "renderer edition");
game = replaceRequired(game, '`${state.students[studentIndex]} · geometry checkpoint`', '`${state.students[studentIndex]} · taller de factorización`', "checkpoint student label");
game = replaceRequired(game,
  '"Read the large diagram carefully. Wrong answer or timeout deducts 0.20 from the live score."',
  '"Identifica el caso, factoriza completamente y elige la opción equivalente. Respuesta incorrecta o tiempo agotado descuenta 0.20."',
  "question instructions"
);
game = replaceRequired(game,
  'questionBankPolicy: "procedural-right-triangles-no-repeat-until-memory-limit"',
  'questionBankPolicy: "procedural-factorization-five-cases-no-repeat-until-memory-limit"',
  "question bank policy"
);
game = replaceRequired(game, '<span>GEOMETRY CORRECT</span>', '<span>FACTORIZACIÓN CORRECTA</span>', "final summary label");
game = replaceRequired(game, 'banner("Pause is available after the geometry checkpoint", 1500);', 'banner("La pausa estará disponible después del checkpoint de factorización", 1500);', "pause checkpoint banner");
game = replaceRequired(game,
  '    if (preview === "thales") {\n      let guard = 0; while (state.currentQuestion.type !== "thales" && guard++ < 20) state.currentQuestion = createQuestion();\n    } else if (preview === "ratio") {\n      let guard = 0; while (!["sin-ratio", "cos-ratio"].includes(state.currentQuestion.type) && guard++ < 30) state.currentQuestion = createQuestion();\n    } else if (preview === "pythagoras") {\n      let guard = 0; while (state.currentQuestion.type !== "pythagoras" && guard++ < 30) state.currentQuestion = createQuestion();\n    }',
  '    const previewAliases = { thales: "common-factor", ratio: "difference-squares", pythagoras: "general-trinomial", common: "common-factor", squares: "difference-squares", perfect: "perfect-square-trinomial", general: "general-trinomial" };\n    const requestedType = previewAliases[preview] || preview;\n    if (FACTORIZATION_TYPES.includes(requestedType)) {\n      let guard = 0; while (state.currentQuestion.type !== requestedType && guard++ < 60) state.currentQuestion = createQuestion();\n    }',
  "CI factorization preview selector"
);
game = replaceRequired(game, '      pythagorasQuestions: true,', '      fiveFactorizationCases: true,\n      questionType: state.currentQuestion.type,', "preview factorization marker");
game = replaceRequired(game, '      ratioSideRoleLabelsHidden: true,', '      algebraicFactorizationCanvas: true,', "preview algebra canvas marker");
game = replaceRequired(game, '        questionTopics: ["sin-ratio", "cos-ratio", "thales-right-triangle", "pythagoras-right-triangle"],\n        rightTriangleCaseCount: PYTHAGOREAN_TRIPLES.length * QUESTION_SCALES.length,', '        questionTopics: [...FACTORIZATION_TYPES],\n        factorizationCaseCount: FACTORIZATION_TYPES.length,', "bootstrap factorization topics");
game = replaceRequired(game, '        pythagorasQuestions: true,', '        fiveFactorizationCases: true,', "bootstrap factorization marker");
game = replaceRequired(game, '        ratioSideRoleLabelsHidden: true,', '        algebraicFactorizationCanvas: true,', "bootstrap algebra canvas marker");
game = replaceRequired(game, '        thalesCollisionFreeLabels: true,\n        thalesVertexLabels: true,', '        factorizationCaseLabels: true,\n        factorizationRecognitionHints: true,', "factorization UI readiness flags");
game = replaceRequired(game, '        thalesRightTrianglesOnly: true,', '        factorizationFiveCasesOnly: true,', "factorization content readiness flag");
fs.writeFileSync(gamePath, game, "utf8");

let html = fs.readFileSync(htmlPath, "utf8");
html = replaceRequired(html, '<title>Geometry Tactical · Classroom V60 · Right Triangles</title>', '<title>Math Tactical · Classroom V60 · Taller de Factorización</title>', "document title");
html = replaceRequired(html, 'aria-label="Geometry Tactical cooperative game arena"', 'aria-label="Math Tactical cooperative factorization game arena"', "canvas aria label");
html = replaceRequired(html, '<span class="eyebrow">GEOMETRY TACTICAL · V60</span>', '<span class="eyebrow">MATH TACTICAL · V60.2</span>', "HUD brand");
html = replaceRequired(html, '<h1>Geometry Tactical<br><em>Ratio &amp; Thales</em></h1>', '<h1>Math Tactical<br><em>Taller de Factorización</em></h1>', "registration title");
html = replaceRequired(html,
  'Register the three students, review the shared controls, and begin. Mission settings are fixed: Level 1, Tactical mode, five progressive rooms, a thirty-minute duration with up to three 30-second pauses and a starting score of <strong>5.00</strong>. All names, answers and scores are encrypted locally and require the teacher PIN to review.',
  'Registra a los tres estudiantes y comienza el taller táctico. La misión conserva cinco salas, treinta minutos, hasta tres pausas de 30 segundos, combate rápido contra enemigos normales y un jefe final completo. Los checkpoints evalúan cinco casos de factorización y todos los nombres, respuestas y puntajes se guardan cifrados localmente.',
  "registration description"
);
html = replaceRequired(html,
  '<div><strong>RIGHT-TRIANGLE RATIOS</strong><span>Procedural right triangles vary their orientation, scale and values. A no-repeat memory prevents students from learning a fixed answer pattern.</span></div>\n          <div><strong>THALES + PYTHAGORAS</strong><span>Solve similar-right-triangle proportions and find a missing right-triangle side using <i>a² + b² = c²</i>.</span></div>',
  '<div><strong>CASOS 1–3</strong><span>Factor común, agrupación y diferencia de cuadrados. Los coeficientes y signos cambian proceduralmente y la memoria evita repetir ejercicios recientes.</span></div>\n          <div><strong>CASOS 4–5</strong><span>Trinomio cuadrado perfecto y trinomio general. Cada checkpoint exige identificar el patrón y elegir la factorización completa equivalente.</span></div>',
  "assessment topics"
);
html = replaceRequired(html, 'outside geometry checkpoints', 'fuera de los checkpoints de factorización', "pause assessment wording");
html = replaceRequired(html, '<button id="startButton" class="primary-button" type="button">START FIVE-ROOM MISSION</button>', '<button id="startButton" class="primary-button" type="button">START FIVE-ROOM MATH MISSION</button>', "start button");
html = replaceRequired(html, '<span class="eyebrow">THREE DEATHS · GEOMETRY CHECKPOINT</span>', '<span class="eyebrow">THREE DEATHS · FACTORIZATION WORKSHOP</span>', "checkpoint eyebrow");
html = replaceRequired(html, '<span class="task-label">READ · CALCULATE · CHOOSE</span>', '<span class="task-label">IDENTIFY · FACTOR · CHOOSE</span>', "task label");
fs.writeFileSync(htmlPath, html, "utf8");

let main = fs.readFileSync(mainPath, "utf8");
main = replaceRequired(main, 'const APP_VERSION = "60.0.0";', 'const APP_VERSION = "60.2.0";', "main version");
main = replaceRequired(main, 'const EDITION = "classroom-thales-pause-v60";', 'const EDITION = "math-factorization-workshop-v60";', "main edition");
main = replaceRequired(main, 'const TEACHER_PIN = String(process.env.V60_TEACHER_PIN || process.env.V59_TEACHER_PIN || "9109");', 'const TEACHER_PIN = String(process.env.MATH_V60_TEACHER_PIN || process.env.V60_TEACHER_PIN || "9109");', "teacher pin environment");
main = replaceRequired(main, 'app.setName("Geometry Tactical Classroom V60");', 'app.setName("Math Tactical Classroom V60 Factorization");', "application name");
main = replaceRequired(main, '"protected-results-v60"', '"protected-results-v60-factorization"', "isolated results directory");
main = replaceRequired(main, '"geometry-tactical-v60.vault.json"', '"math-tactical-v60-factorization.vault.json"', "isolated vault filename");
main = main.replaceAll('GT-V60-AES-256-GCM', 'MT-V60-AES-256-GCM');
main = main.replaceAll('GeometryTacticalV60|${APP_VERSION}|${EDITION}', 'MathTacticalV60|${APP_VERSION}|${EDITION}');
main = replaceRequired(main, '  const query = process.env.V60_BOSS_PROBE === "true" ? { "ci-room": "5" } : {};', '  const query = process.env.V60_BOSS_PROBE === "true" ? { "ci-room": "5" } : process.env.V60_QUESTION_PREVIEW ? { "ci-question": process.env.V60_QUESTION_PREVIEW } : {};', "runtime probe query");
fs.writeFileSync(mainPath, main, "utf8");

console.log("Applied Math Tactical V60.2 factorization workshop patch: five factorization cases, isolated vault, final boss preserved.");
