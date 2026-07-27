"use strict";

const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const game = read("school-game/v56/game.js");
const html = read("school-game/v56/index.html");
const css = read("school-game/v56/styles.css");
const main = read("school-game/v56/main.js");
const preload = read("school-game/v56/preload.js");
const expect = (condition, message) => { if (!condition) throw new Error(message); };

expect(game.includes('const VERSION = "56.0.0"'), "V56 renderer version missing.");
expect(game.includes('const EDITION = "persistent-timer-pythagoras-v56"'), "V56 edition missing.");
expect(game.includes("const FIXED_DT = 1 / 120"), "120 Hz fixed simulation missing.");
expect(game.includes("const FIXED_MATCH_SECONDS = 1200"), "20-minute mission missing.");
expect(game.includes("state.remaining -= dt"), "Mission timer is not decremented by simulation time.");
expect(game.indexOf("state.remaining -= dt") < game.indexOf("if (state.questionActive) { updateHud(); return; }"), "Mission timer stops during questions.");
expect(html.includes('id="questionMissionTime">20:00'), "Mission timer is not visible on question screen.");
expect(game.includes("ui.questionMissionTime.textContent = formatTime(state.remaining)"), "Question mission timer is not synchronized.");
expect(game.includes("state.remaining < missionRemainingBeforePreview - 0.75"), "Packaged preview does not verify the mission timer decreases during a question.");
expect(css.includes("#questionMissionTime"), "Question mission timer style missing.");

expect(game.includes('["sin-ratio", "cos-ratio", "thales", "pythagoras"]'), "Pythagoras is not in question rotation.");
expect(game.includes('type === "pythagoras"'), "Pythagoras question branch missing.");
expect(game.includes("a² + b² = c²"), "Pythagorean theorem formula missing.");
expect(game.includes('missing: "hypotenuse"') && game.includes('missing: "vertical"') && game.includes('missing: "horizontal"'), "Pythagoras does not ask for different missing sides.");
expect(game.includes('"Find the side marked x"'), "Pythagoras diagram does not ask for x.");
expect(!game.includes("The correct answer is"), "A correct-answer reveal remains.");
expect(game.includes("The correct numerical answer is not revealed"), "No-answer-reveal feedback contract missing.");
expect(!game.includes('`adjacent = ${adjacent}`'), "Adjacent role is still attached to a numeric side label.");
expect(!game.includes('`opposite = ${opposite}`'), "Opposite role is still attached to a numeric side label.");
expect(!game.includes('`hypotenuse = ${hypotenuse}`'), "Hypotenuse role is still attached to a numeric side label.");
expect(game.includes('"cos(θ) = adjacent / hypotenuse"'), "Cosine definition missing.");
expect(game.includes('"sin(θ) = opposite / hypotenuse"'), "Sine definition missing.");
expect(!game.includes('if (optionButton.textContent === state.currentQuestion.correct) optionButton.classList.add("correct")'), "Wrong answers still reveal the correct option.");

expect(game.includes("const ROOM_ONE_SCORE_CAP = 2.5"), "Room 1 score cap constant missing.");
expect(game.includes("state.levelsCleared >= 1"), "Room 1 completion is not evaluated.");
expect(game.includes("state.score > ROOM_ONE_SCORE_CAP"), "Room 1 cap does not preserve lower earned scores.");
expect(game.includes("state.score = roundScore(ROOM_ONE_SCORE_CAP)"), "Room 1 score cap is not applied.");
expect(game.includes('roomOneScoreCapRule: "min-earned-or-2.50-if-room-one-not-cleared"'), "Room 1 cap readiness contract missing.");
expect(game.includes("roomOneScoreCapApplied"), "Room 1 cap is not stored in results.");

expect(html.includes("Each problem allows 60 seconds while the 20-minute mission clock keeps running"), "Registration briefing does not explain continuous timing.");
expect(html.includes("THALES + PYTHAGORAS"), "Pythagoras is not included in the briefing.");
expect(html.includes("final score is capped at 2.50"), "Room 1 cap is not disclosed.");
expect(html.includes('id="questionTimer">60'), "Question timer is not 60 seconds.");

expect(main.includes('const VERSION = "56.0.0"'), "Main process version missing.");
expect(main.includes('const EDITION = "persistent-timer-pythagoras-v56"'), "Main process edition missing.");
expect(main.includes("missionTimerVisibleInQuestions: true"), "Packaged readiness does not report question mission timer.");
expect(main.includes("missionTimerRunsDuringQuestions: true"), "Packaged readiness does not report continuous mission timing.");
expect(main.includes("pythagorasQuestions: true"), "Packaged readiness does not report Pythagoras.");
expect(main.includes("answerRevealDisabled: true"), "Packaged readiness does not report answer reveal disabled.");
expect(main.includes("ratioSideRoleLabelsHidden: true"), "Packaged readiness does not report neutral side labels.");
expect(main.includes("roomOneScoreCap: 2.5"), "Packaged readiness does not report Room 1 cap.");
expect(preload.includes('ipcRenderer.invoke("v56:save-result"'), "V56 encrypted result bridge missing.");
expect(preload.includes('ipcRenderer.invoke("v56:get-protected-results"'), "V56 protected result viewer bridge missing.");
expect(main.includes('app.setName("Geometry Tactical Clean Vision Local")'), "Existing encrypted vault location is not preserved.");
expect(main.includes("safeStorage"), "Windows-protected vault key support missing.");
expect(main.includes("AES-256-GCM") || main.includes("aes-256-gcm"), "AES-256-GCM result encryption missing.");

console.log("Persistent Timer Pythagoras V56 static contract passed.");
