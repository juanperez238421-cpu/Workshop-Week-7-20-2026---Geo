"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const gamePath = path.join(root, "school-game", "v60", "game.js");
const htmlPath = path.join(root, "school-game", "v60", "index.html");
const cssPath = path.join(root, "school-game", "v60", "styles.css");
const mainPath = path.join(root, "school-game", "v60", "main.js");
const preloadPath = path.join(root, "school-game", "v60", "preload.js");

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`V60.4 teacher patch could not find ${label}.`);
  return source.replace(before, after);
}

function replaceAllRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`V60.4 teacher patch could not find ${label}.`);
  return source.split(before).join(after);
}

for (const file of [gamePath, htmlPath, cssPath, mainPath, preloadPath]) {
  if (!fs.existsSync(file)) throw new Error(`V60.4 teacher patch input missing: ${file}`);
}

let game = fs.readFileSync(gamePath, "utf8");
game = replaceRequired(game, 'const VERSION = "60.3.0";', 'const VERSION = "60.4.0";', "renderer version");
game = replaceRequired(game, 'const EDITION = "math-factorization-boss-v61";', 'const EDITION = "math-factorization-teacher-v604";', "renderer edition");
game = replaceRequired(game,
  '  const FIXED_MATCH_SECONDS = 1800;\n  const MAX_PAUSES = 3;',
  '  const FIXED_MATCH_SECONDS = 2700;\n  const QUESTION_SECONDS = 90;\n  const MAX_PAUSES = 3;',
  "45-minute mission constant"
);
game = replaceRequired(game, '    questionRemaining: 60,', '    questionRemaining: QUESTION_SECONDS,', "question state duration");
game = replaceRequired(game, '    state.questionRemaining = 60;', '    state.questionRemaining = QUESTION_SECONDS;', "question start duration");
game = replaceRequired(game, '    state.questionDeadlineMs = Date.now() + 60000;', '    state.questionDeadlineMs = Date.now() + QUESTION_SECONDS * 1000;', "question deadline");
game = replaceRequired(game, '    ui.questionTimer.textContent = "60";', '    ui.questionTimer.textContent = String(QUESTION_SECONDS);', "question timer display");
game = replaceAllRequired(game, '      questionSeconds: 60,', '      questionSeconds: QUESTION_SECONDS,', "runtime question duration reports");
game = replaceAllRequired(game, '        questionSeconds: 60,', '        questionSeconds: QUESTION_SECONDS,', "bootstrap question duration report");
game = replaceRequired(game, '      missionRule: "30-minutes-or-clear-all-five-levels",', '      missionRule: "45-minutes-or-clear-all-five-levels",', "mission report rule");

game = replaceRequired(game,
  '    registrationResults: document.getElementById("registrationResultsButton"),\n    results: document.getElementById("resultsOverlay"),',
  '    registrationResults: document.getElementById("registrationResultsButton"),\n    teacherModeButton: document.getElementById("teacherModeButton"),\n    teacherModeOverlay: document.getElementById("teacherModeOverlay"),\n    teacherModePin: document.getElementById("teacherModePin"),\n    teacherModeUnlock: document.getElementById("teacherModeUnlockButton"),\n    teacherModeLocked: document.getElementById("teacherModeLockedPanel"),\n    teacherRoomPanel: document.getElementById("teacherRoomPanel"),\n    teacherModeFeedback: document.getElementById("teacherModeFeedback"),\n    teacherModeClose: document.getElementById("teacherModeCloseButton"),\n    teacherModeExit: document.getElementById("teacherModeExitButton"),\n    results: document.getElementById("resultsOverlay"),',
  "teacher UI references"
);

game = replaceRequired(game,
  '  function restartApplicationState() {',
  `  function closeTeacherModeMenu(shiftDeadlines = true) {
    if (state.teacherMenuOpen && shiftDeadlines && state.running && state.teacherMenuOpenedAtMs) {
      const elapsed = Math.max(0, Date.now() - state.teacherMenuOpenedAtMs);
      if (state.missionDeadlineMs) state.missionDeadlineMs += elapsed;
      if (state.questionActive && state.questionDeadlineMs) state.questionDeadlineMs += elapsed;
    }
    state.teacherMenuOpen = false;
    state.teacherMenuOpenedAtMs = 0;
    ui.teacherModeOverlay?.classList.remove("active");
  }

  function showTeacherRoomPanel() {
    ui.teacherModeLocked?.classList.add("hidden");
    ui.teacherRoomPanel?.classList.remove("hidden");
    ui.teacherModeExit?.classList.toggle("hidden", !state.teacherMode);
    if (ui.teacherModeFeedback) ui.teacherModeFeedback.textContent = state.teacherMode
      ? \`Modo docente activo · sala actual \${state.levelIndex + 1}/\${MAPS.length}. F8 abre este selector en cualquier momento.\`
      : "PIN correcto · selecciona la sala que quieres abrir.";
  }

  function openTeacherModeMenu() {
    if (state.questionActive && state.teacherMode) {
      clearInterval(questionTimer);
      state.questionActive = false;
      ui.question.classList.remove("active");
    }
    state.teacherMenuOpen = true;
    state.teacherMenuOpenedAtMs = Date.now();
    ui.teacherModeOverlay?.classList.add("active");
    if (state.teacherUnlocked) {
      showTeacherRoomPanel();
    } else {
      ui.teacherModeLocked?.classList.remove("hidden");
      ui.teacherRoomPanel?.classList.add("hidden");
      ui.teacherModeExit?.classList.add("hidden");
      if (ui.teacherModeFeedback) ui.teacherModeFeedback.textContent = "Ingresa el PIN docente de cuatro dígitos para habilitar acceso directo a las cinco salas.";
      if (ui.teacherModePin) { ui.teacherModePin.value = ""; setTimeout(() => ui.teacherModePin.focus(), 40); }
    }
  }

  async function unlockTeacherMode() {
    const pin = String(ui.teacherModePin?.value || "").replace(/\\D/g, "").slice(0, 4);
    if (pin.length !== 4) {
      if (ui.teacherModeFeedback) ui.teacherModeFeedback.textContent = "Ingresa el PIN docente de cuatro dígitos.";
      return;
    }
    if (ui.teacherModeUnlock) ui.teacherModeUnlock.disabled = true;
    try {
      const result = await window.schoolAPI?.verifyTeacherPin?.(pin);
      if (!result?.ok) {
        if (ui.teacherModeFeedback) ui.teacherModeFeedback.textContent = result?.error === "LOCKED"
          ? \`Demasiados intentos. Espera \${Math.ceil((result.retryAfterMs || 30000) / 1000)} s.\`
          : \`PIN incorrecto · \${result?.remainingAttempts ?? 0} intentos restantes.\`;
        ui.teacherModePin?.select();
        return;
      }
      state.teacherUnlocked = true;
      showTeacherRoomPanel();
    } catch (error) {
      console.error("Teacher mode PIN verification failed", error);
      if (ui.teacherModeFeedback) ui.teacherModeFeedback.textContent = "No fue posible validar el PIN docente.";
    } finally {
      if (ui.teacherModeUnlock) ui.teacherModeUnlock.disabled = false;
    }
  }

  function startTeacherRoom(roomIndex) {
    const targetRoom = clamp(Number(roomIndex) || 0, 0, MAPS.length - 1);
    clearInterval(autosaveTimer);
    clearInterval(questionTimer);
    ensureAudio()?.resume?.();
    state.teacherMode = true;
    state.teacherUnlocked = true;
    state.teacherMenuOpen = false;
    state.teacherMenuOpenedAtMs = 0;
    state.students = ["DOCENTE · MOVIMIENTO", "DOCENTE · PUNTERÍA", "DOCENTE · ACCIÓN"];
    state.gradeGroup = "DOCENTE";
    state.studentStats = state.students.map(() => ({ attempts: 0, correct: 0, wrong: 0, timeouts: 0, responseMs: 0, assignedStrikes: 0 }));
    state.questionHistory = [];
    state.questionKeys = [];
    state.resultId = "";
    state.savedPath = "Modo docente · la sesión de prueba no se guarda como calificación.";
    state.difficulty = FIXED_DIFFICULTY;
    state.durationSeconds = FIXED_MATCH_SECONDS;
    state.remaining = FIXED_MATCH_SECONDS;
    state.startedAt = Date.now();
    state.missionDeadlineMs = state.startedAt + FIXED_MATCH_SECONDS * 1000;
    state.levelIndex = targetRoom;
    state.wave = 1;
    state.levelsCleared = targetRoom;
    state.score = SCORE_MAX;
    state.roomOneScoreCapApplied = false;
    state.strikes = 0;
    state.deathCycles = 0;
    state.wrongAnswers = 0;
    state.timeouts = 0;
    state.deploymentGrace = 0;
    state.tags = 0;
    state.shots = 0;
    state.hits = 0;
    state.weaponPickups = 0;
    state.weaponThrows = 0;
    state.playerMeleeAttacks = 0;
    state.playerMeleeHits = 0;
    state.enemyMeleeAttacks = 0;
    state.bossShieldBreaks = 0;
    state.bossCoreHits = 0;
    state.bossHintsShown = 0;
    state.glassBreaks = 0;
    state.houndTags = 0;
    state.squadAlerts = 0;
    state.questionStudentIndex = 0;
    state.ended = false;
    state.questionActive = false;
    state.paused = false;
    state.pauseCount = 0;
    state.pauseStartedAtMs = 0;
    state.pauseEndsAtMs = 0;
    state.totalPausedMs = 0;
    state.running = true;
    ui.roleNames.forEach((element, index) => { element.textContent = state.students[index]; });
    ui.registration.classList.remove("active");
    ui.end.classList.remove("active");
    ui.question.classList.remove("active");
    ui.pause.classList.remove("active");
    ui.results.classList.remove("active");
    ui.teacherModeOverlay?.classList.remove("active");
    ui.hud.classList.remove("hidden");
    syncScoreDisplay();
    spawnLevel(targetRoom, true);
    banner(\`MODO DOCENTE · SALA \${targetRoom + 1}/\${MAPS.length} · F8 PARA CAMBIAR DE SALA\`, 3200);
  }

  function jumpTeacherRoom(roomIndex) {
    const targetRoom = clamp(Number(roomIndex) || 0, 0, MAPS.length - 1);
    if (!state.teacherMode || !state.running) { startTeacherRoom(targetRoom); return; }
    closeTeacherModeMenu(true);
    clearInterval(questionTimer);
    state.questionActive = false;
    state.paused = false;
    state.strikes = 0;
    state.wave = 1;
    state.levelsCleared = Math.max(state.levelsCleared, targetRoom);
    ui.question.classList.remove("active");
    ui.pause.classList.remove("active");
    spawnLevel(targetRoom, true);
    banner(\`MODO DOCENTE · SALA \${targetRoom + 1}/\${MAPS.length} · F8 PARA CAMBIAR\`, 2600);
  }

  function restartApplicationState() {`,
  "teacher mode controller"
);

game = replaceRequired(game,
  '    state.totalPausedMs = 0;\n    state.player = null;',
  '    state.totalPausedMs = 0;\n    state.teacherMode = false;\n    state.teacherUnlocked = false;\n    state.teacherMenuOpen = false;\n    state.teacherMenuOpenedAtMs = 0;\n    ui.teacherModeOverlay?.classList.remove("active");\n    state.player = null;',
  "teacher reset state"
);
game = replaceRequired(game,
  '  async function saveProgress(reason = "autosave") {\n    if (!state.resultId || !window.schoolAPI?.saveResult) return;',
  '  async function saveProgress(reason = "autosave") {\n    if (state.teacherMode || !state.resultId || !window.schoolAPI?.saveResult) return;',
  "teacher-mode no-save rule"
);
game = replaceRequired(game,
  '    if (state.paused) { updatePauseOverlay(); updateHud(); return; }\n    syncMissionClock();',
  '    if (state.paused) { updatePauseOverlay(); updateHud(); return; }\n    if (state.teacherMenuOpen) { updateHud(); return; }\n    syncMissionClock();',
  "teacher menu simulation pause"
);
game = replaceRequired(game,
  '    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) event.preventDefault();\n    if ((event.code === "KeyP" || event.code === "Escape") && !event.repeat) { togglePause(); return; }',
  '    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) event.preventDefault();\n    if (event.code === "F8" && !event.repeat) { event.preventDefault(); openTeacherModeMenu(); return; }\n    if ((event.code === "KeyP" || event.code === "Escape") && !event.repeat) { togglePause(); return; }',
  "F8 teacher shortcut"
);
game = replaceRequired(game,
  '  ui.registrationResults.addEventListener("click", openProtectedResults);\n  ui.resultsUnlock.addEventListener("click", unlockProtectedResults);',
  '  ui.registrationResults.addEventListener("click", openProtectedResults);\n  ui.teacherModeButton?.addEventListener("click", openTeacherModeMenu);\n  ui.teacherModeUnlock?.addEventListener("click", unlockTeacherMode);\n  ui.teacherModePin?.addEventListener("keydown", (event) => { if (event.code === "Enter") unlockTeacherMode(); });\n  ui.teacherModeClose?.addEventListener("click", () => closeTeacherModeMenu(true));\n  ui.teacherModeExit?.addEventListener("click", restartApplicationState);\n  ui.teacherRoomPanel?.querySelectorAll("[data-teacher-room]").forEach((button) => button.addEventListener("click", () => jumpTeacherRoom(Number(button.dataset.teacherRoom) - 1)));\n  ui.resultsUnlock.addEventListener("click", unlockProtectedResults);',
  "teacher event listeners"
);

game = replaceRequired(game,
  '  async function openCiQuestionPreview() {',
  `  async function openCiTeacherProbe() {
    const raw = new URLSearchParams(window.location.search).get("ci-teacher-room");
    if (!raw) return false;
    const room = clamp(Number(raw) || 1, 1, MAPS.length);
    state.teacherUnlocked = true;
    startTeacherRoom(room - 1);
    await new Promise((resolve) => setTimeout(resolve, 350));
    await window.schoolAPI?.markReady?.({
      phase: "teacher-room-probe",
      teacherMode: state.teacherMode === true,
      teacherModeAvailable: true,
      teacherRoomCount: MAPS.length,
      requestedRoom: room,
      currentRoom: state.levelIndex + 1,
      fixedMatchSeconds: FIXED_MATCH_SECONDS,
      questionSeconds: QUESTION_SECONDS,
      directRoomAccess: true,
      teacherSessionsExcludedFromGrades: state.resultId === ""
    });
    return true;
  }

  async function openCiQuestionPreview() {`,
  "teacher runtime probe"
);
game = replaceRequired(game,
  '    const bossProbeOpened = await openCiBossProbe();\n    if (bossProbeOpened) return;\n    const previewOpened = await openCiQuestionPreview();',
  '    const bossProbeOpened = await openCiBossProbe();\n    if (bossProbeOpened) return;\n    const teacherProbeOpened = await openCiTeacherProbe();\n    if (teacherProbeOpened) return;\n    const previewOpened = await openCiQuestionPreview();',
  "teacher probe bootstrap"
);
game = replaceRequired(game,
  '        floorRoomWeaponsPickable: true,\n        eKeyBossClue: true,',
  '        floorRoomWeaponsPickable: true,\n        teacherModeAvailable: true,\n        teacherRoomCount: MAPS.length,\n        teacherDirectRoomAccess: true,\n        teacherModePinProtected: true,\n        teacherModeHotkey: "F8",\n        eKeyBossClue: true,',
  "teacher readiness flags"
);
fs.writeFileSync(gamePath, game, "utf8");

let html = fs.readFileSync(htmlPath, "utf8");
html = replaceAllRequired(html, 'MATH TACTICAL · V60.3 · BOSS EDITION', 'MATH TACTICAL · V60.4 · TEACHER EDITION', "V60.4 branding");
html = replaceRequired(html, '<strong id="timeValue">30:00</strong>', '<strong id="timeValue">45:00</strong>', "HUD mission time");
html = replaceRequired(html, '<div><span>TIME</span><strong>30 MIN</strong></div>', '<div><span>TIME</span><strong>45 MIN</strong></div>', "mission configuration time");
html = replaceRequired(html, 'Each problem allows 60 seconds while the 30-minute mission clock keeps running.', 'Each problem allows 90 seconds while the 45-minute mission clock keeps running.', "scoring timer description");
html = replaceRequired(html, '<strong id="questionMissionTime">30:00</strong>', '<strong id="questionMissionTime">45:00</strong>', "question mission clock");
html = replaceRequired(html, '<strong id="questionTimer">60</strong>', '<strong id="questionTimer">90</strong>', "question countdown");
html = replaceRequired(html,
  '<div class="registration-actions"><button id="startButton" class="primary-button" type="button">START FIVE-ROOM MATH MISSION</button><button id="registrationResultsButton" class="secondary-button teacher-button" type="button">TEACHER RESULTS</button></div>',
  '<div class="registration-actions"><button id="startButton" class="primary-button" type="button">START FIVE-ROOM MATH MISSION</button><button id="teacherModeButton" class="secondary-button teacher-mode-button" type="button">MODO DOCENTE · SALAS 1–5</button><button id="registrationResultsButton" class="secondary-button teacher-button" type="button">TEACHER RESULTS</button></div>',
  "teacher mode launch button"
);
const teacherOverlay = `

    <section id="teacherModeOverlay" class="overlay teacher-mode-overlay" aria-label="Modo docente y acceso directo a salas">
      <div class="teacher-mode-card">
        <div class="results-heading">
          <div><span class="eyebrow">MATH TACTICAL · CONTROL DOCENTE</span><h2>Acceso directo a salas</h2></div>
          <span class="vault-badge">PIN DOCENTE</span>
        </div>
        <p class="results-intro">Este modo es para demostración, práctica y revisión. Permite abrir cualquiera de las cinco salas sin alterar las calificaciones de los estudiantes. Durante una sesión docente, presiona <kbd>F8</kbd> para volver a este selector.</p>
        <div id="teacherModeLockedPanel" class="pin-panel">
          <label><span>Teacher PIN</span><input id="teacherModePin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="••••"></label>
          <button id="teacherModeUnlockButton" class="primary-button" type="button">DESBLOQUEAR MODO DOCENTE</button>
        </div>
        <div id="teacherRoomPanel" class="teacher-room-panel hidden">
          <div class="teacher-room-grid">
            <button type="button" data-teacher-room="1"><strong>SALA 1</strong><span>Inicio táctico</span></button>
            <button type="button" data-teacher-room="2"><strong>SALA 2</strong><span>Combate progresivo</span></button>
            <button type="button" data-teacher-room="3"><strong>SALA 3</strong><span>Vidrio y rutas</span></button>
            <button type="button" data-teacher-room="4"><strong>SALA 4</strong><span>Alta presión</span></button>
            <button type="button" data-teacher-room="5"><strong>SALA 5</strong><span>ARCHIVE WARDEN · Boss</span></button>
          </div>
          <p class="teacher-room-note">La sesión docente usa los mismos enemigos, armas, IA, jefe final y preguntas que el juego normal, pero no se guarda como nota.</p>
        </div>
        <p id="teacherModeFeedback" class="feedback results-feedback">Ingresa el PIN docente para continuar.</p>
        <div class="button-row results-buttons"><button id="teacherModeExitButton" class="secondary-button hidden" type="button">SALIR DEL MODO DOCENTE</button><button id="teacherModeCloseButton" class="primary-button" type="button">CERRAR</button></div>
      </div>
    </section>`;
html = replaceRequired(html, '\n\n    <section id="resultsOverlay"', `${teacherOverlay}\n\n    <section id="resultsOverlay"`, "teacher mode overlay");
fs.writeFileSync(htmlPath, html, "utf8");

let css = fs.readFileSync(cssPath, "utf8");
css += `

/* V60.4 teacher mode */
.registration-actions { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.teacher-mode-button { border-color: #8f7dba; background: #f5f0ff; color: #513a83; }
.teacher-mode-button:hover { border-color: #6f52aa; background: #eee5ff; }
.teacher-mode-overlay { z-index: 92; background: rgba(18, 25, 42, .82); backdrop-filter: blur(9px); }
.teacher-mode-card { width: min(920px, 96vw); max-height: 92vh; overflow: auto; border: 1px solid rgba(110,88,158,.45); border-radius: 24px; padding: 28px 30px; background: rgba(255,255,255,.995); box-shadow: 0 28px 80px rgba(15,23,42,.34); }
.teacher-room-panel { margin-top: 18px; }
.teacher-room-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
.teacher-room-grid button { min-height: 108px; border: 1px solid #b9c5d5; border-radius: 15px; padding: 14px 10px; background: #f8fafc; color: #172033; cursor: pointer; transition: transform .12s ease, border-color .12s ease, background .12s ease; }
.teacher-room-grid button:hover { transform: translateY(-2px); border-color: #6f52aa; background: #f3eeff; }
.teacher-room-grid button strong { display: block; font-size: 17px; letter-spacing: .04em; }
.teacher-room-grid button span { display: block; margin-top: 8px; color: #637087; font-size: 11px; font-weight: 800; line-height: 1.35; }
.teacher-room-note { margin: 14px 0 0; border-left: 4px solid #6f52aa; padding: 10px 12px; background: #f7f3ff; color: #4f4761; font-size: 12px; font-weight: 750; line-height: 1.45; }
@media (max-width: 980px) { .registration-actions { grid-template-columns: 1fr; } .teacher-room-grid { grid-template-columns: repeat(2, 1fr); } }
`;
fs.writeFileSync(cssPath, css, "utf8");

let preload = fs.readFileSync(preloadPath, "utf8");
preload = replaceRequired(preload,
  '  getProtectedResults: (pin) => ipcRenderer.invoke("school-game:get-protected-results", String(pin || "")),\n  markReady:',
  '  getProtectedResults: (pin) => ipcRenderer.invoke("school-game:get-protected-results", String(pin || "")),\n  verifyTeacherPin: (pin) => ipcRenderer.invoke("school-game:verify-teacher-pin", String(pin || "")),\n  markReady:',
  "teacher PIN preload API"
);
fs.writeFileSync(preloadPath, preload, "utf8");

let main = fs.readFileSync(mainPath, "utf8");
main = replaceRequired(main, 'const APP_VERSION = "60.3.0";', 'const APP_VERSION = "60.4.0";', "main version");
main = replaceRequired(main, 'const EDITION = "math-factorization-boss-v61";', 'const EDITION = "math-factorization-teacher-v604";', "main edition");
main = replaceRequired(main, 'app.setName("Math Tactical Classroom V60.3 Boss Edition");', 'app.setName("Math Tactical Classroom V60.4 Teacher Edition");', "application name");
main = replaceRequired(main, '"protected-results-v60-factorization-boss"', '"protected-results-v60-factorization-boss-teacher"', "teacher-edition results directory");
main = replaceRequired(main, '"math-tactical-v60-factorization-boss.vault.json"', '"math-tactical-v60-factorization-boss-teacher.vault.json"', "teacher-edition vault filename");
main = replaceRequired(main,
  'function discoverAssets() {',
  `function verifyTeacherPin(pin) {
  const now = Date.now();
  if (now < pinLockedUntil) return { ok: false, error: "LOCKED", retryAfterMs: pinLockedUntil - now, remainingAttempts: 0 };
  const normalizedPin = String(pin || "").replace(/\\D/g, "").slice(0, 4);
  if (normalizedPin.length !== 4) return { ok: false, error: "INVALID_PIN", remainingAttempts: Math.max(0, MAX_FAILED_PIN_ATTEMPTS - failedPinAttempts) };
  const received = Buffer.from(normalizedPin, "utf8");
  const expected = Buffer.from(TEACHER_PIN, "utf8");
  const matches = received.length === expected.length && crypto.timingSafeEqual(received, expected);
  if (matches) {
    failedPinAttempts = 0;
    pinLockedUntil = 0;
    return { ok: true, role: "teacher", roomAccess: [1, 2, 3, 4, 5] };
  }
  failedPinAttempts += 1;
  if (failedPinAttempts >= MAX_FAILED_PIN_ATTEMPTS) {
    pinLockedUntil = now + PIN_LOCK_MS;
    failedPinAttempts = 0;
    return { ok: false, error: "LOCKED", retryAfterMs: PIN_LOCK_MS, remainingAttempts: 0 };
  }
  return { ok: false, error: "WRONG_PIN", remainingAttempts: MAX_FAILED_PIN_ATTEMPTS - failedPinAttempts };
}

function discoverAssets() {`,
  "teacher PIN verifier"
);
main = replaceRequired(main,
  '  const query = process.env.V60_BOSS_PROBE === "true" ? { "ci-room": "5" } : process.env.V60_QUESTION_PREVIEW ? { "ci-question": process.env.V60_QUESTION_PREVIEW } : {};',
  '  const query = process.env.V60_BOSS_PROBE === "true" ? { "ci-room": "5" } : process.env.V60_TEACHER_PROBE ? { "ci-teacher-room": String(process.env.V60_TEACHER_PROBE) } : process.env.V60_QUESTION_PREVIEW ? { "ci-question": process.env.V60_QUESTION_PREVIEW } : {};',
  "teacher CI query"
);
main = replaceRequired(main,
  'ipcMain.handle("school-game:get-protected-results", (_event, pin) => unlockProtectedResults(pin));\nipcMain.handle("school-game:mark-ready",',
  'ipcMain.handle("school-game:get-protected-results", (_event, pin) => unlockProtectedResults(pin));\nipcMain.handle("school-game:verify-teacher-pin", (_event, pin) => verifyTeacherPin(pin));\nipcMain.handle("school-game:mark-ready",',
  "teacher PIN IPC handler"
);
fs.writeFileSync(mainPath, main, "utf8");

console.log("Applied Math Tactical V60.4 Teacher Edition patch: 90-second questions, 45-minute mission, PIN-protected direct access to Rooms 1–5, and F8 room switching.");
