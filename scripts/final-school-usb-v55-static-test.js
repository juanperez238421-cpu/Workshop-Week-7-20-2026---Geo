"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const game = read("school-game/v55/game.js");
const html = read("school-game/v55/index.html");
const css = read("school-game/v55/styles.css");
const main = read("school-game/v55/main.js");
const preload = read("school-game/v55/preload.js");
const pkg = JSON.parse(read("package.json"));

function expect(condition, message) {
  if (!condition) throw new Error(message);
}
function expectSvgRoom(relative) {
  const data = fs.readFileSync(path.join(root, relative), "utf8");
  expect(data.includes('<svg'), `${relative} is not an SVG.`);
  expect(data.includes('width="1600"') && data.includes('height="1000"'), `${relative} must declare 1600×1000.`);
  expect(data.includes('viewBox="0 0 1600 1000"'), `${relative} has an invalid viewBox.`);
}

expect(game.includes('const VERSION = "55.0.0"'), "V55 renderer version is missing.");
expect(game.includes('const EDITION = "final-school-four-rooms-v55"'), "V55 renderer edition is missing.");
expect(game.includes("const FIXED_DT = 1 / 120"), "The 120 Hz simulation was not preserved.");
expect(game.includes("const FIXED_MATCH_SECONDS = 1200"), "The 20-minute mission was not preserved.");
expect(game.includes("questionRemaining: 60"), "Question state does not start at 60 seconds.");
expect(game.includes("state.questionRemaining = 60"), "Question checkpoint does not reset to 60 seconds.");
expect(game.includes('ui.questionTimer.textContent = "60"'), "Question timer UI is not initialized to 60.");
expect(game.includes('"LEVEL 3 · SCIENCE FABRICATION GRID"'), "Level 3 is missing.");
expect(game.includes('"LEVEL 4 · ROBOTICS ARCHIVE CORE"'), "Level 4 is missing.");
expect(game.includes('banner("All four levels cleared · mission won"'), "Four-level victory flow is missing.");
expect(game.includes('missionCompletion: "time-or-all-four-levels"'), "Four-level mission contract is missing.");
expect(game.includes("newDifficultRooms: 2"), "Readiness does not report two new difficult rooms.");
expect(game.includes("questionCanvasSafeMargins: true"), "Safe question margins are not reported.");
expect(game.includes("responsiveQuestionLayout: true"), "Responsive question layout is not reported.");
expect(game.includes("openCiQuestionPreview"), "Packaged question layout preview is missing.");
expect(game.includes("questionLayoutFitsViewport"), "Question layout fit probe is missing.");
expect(game.includes("/\\.(png|webp|svg)$/i"), "SVG room discovery is missing from the renderer.");

expect(html.includes('width="1200" height="620"'), "The enlarged 1200×620 question canvas is missing.");
expect(html.includes('id="questionTimer">60<'), "The question screen does not show 60 seconds.");
expect(html.includes('class="question-body"'), "The two-column question body is missing.");
expect(html.includes('class="question-visual"'), "The question visual region is missing.");
expect(html.includes('class="question-task"'), "The question task region is missing.");
expect(!html.includes("<select"), "The registration screen exposes forbidden selectors.");
expect(html.includes("Content-Security-Policy"), "The offline content security policy is missing.");
expect(html.includes("connect-src 'self'"), "External network connections are not restricted by CSP.");

expect(css.includes("grid-template-columns: minmax(610px, 1.65fr) minmax(350px, .78fr)"), "Desktop question layout is not split into safe columns.");
expect(css.includes("overflow: hidden; display: grid"), "Question card clipping protection is missing.");
expect(css.includes("@media (max-height: 760px)"), "Low-height school PC layout is missing.");
expect(!css.includes("max-height: 48vh"), "The old clipped question canvas rule remains.");

expect(main.includes('const VERSION = "55.0.0"'), "Main process version is not V55.");
expect(main.includes("levels: 4"), "Packaged readiness does not report four levels.");
expect(main.includes("questionSeconds: 60"), "Packaged readiness does not report 60-second questions.");
expect(main.includes('app.setName("Geometry Tactical Clean Vision Local")'), "Existing encrypted vault path is not preserved during upgrade.");
expect(main.includes("devTools: false"), "Developer tools are not disabled.");
expect(main.includes('setWindowOpenHandler(() => ({ action: "deny" }))'), "Popup windows are not denied.");
expect(main.includes('setPermissionRequestHandler'), "Browser permissions are not denied.");
expect(main.includes('if (!String(url).startsWith("file:")) event.preventDefault()'), "External navigation is not blocked.");
expect(main.includes("safeStorage.isEncryptionAvailable()"), "Windows-protected result key storage is missing.");
expect(main.includes('crypto.createCipheriv("aes-256-gcm"'), "AES-256-GCM result encryption is missing.");
expect(main.includes("crypto.timingSafeEqual"), "PIN comparison is not timing-safe.");
expect(main.includes("V55_QUESTION_PREVIEW"), "Packaged question layout preview query is missing.");
expect(main.includes("/\\.(png|webp|svg|json)$/i"), "SVG room discovery is missing from the main process.");
expect(preload.includes('ipcRenderer.invoke("v55:save-result"'), "V55 result IPC is missing.");
expect(preload.includes('ipcRenderer.invoke("v55:get-protected-results"'), "V55 protected viewer IPC is missing.");

expect(pkg.version === "55.0.0", "Package version is not 55.0.0.");
expect(pkg.main === "school-game/v55/main.js", "Package main entry is incorrect.");
expect(pkg.build.appId === "co.jpanalyst.geometrytactical.cleanvision.local", "Upgrade-safe app ID changed.");
expect(pkg.build.win.requestedExecutionLevel === "asInvoker", "Installer is not configured as a non-admin per-user application.");
expect(pkg.build.nsis.perMachine === false, "Installer incorrectly requires machine-wide installation.");
expect(pkg.build.targets === undefined, "Unexpected build target property.");

for (const relative of [
  "school-game/assets/v2/zz_level_03_science_fabrication_grid.svg",
  "school-game/assets/v2/zz_level_04_robotics_archive_core.svg"
]) expectSvgRoom(relative);

console.log("Final School USB V55 static contract passed.");
