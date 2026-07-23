"use strict";

const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const baseRuntime = require("./runtime-v12.js");

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Triad v13 patch could not find: ${label}`);
  return source.replace(search, replacement);
}

function replacePattern(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`Triad v13 patch could not find: ${label}`);
  return source.replace(pattern, replacement);
}

function patchGatewaySource(input) {
  let source = baseRuntime.patchGatewaySource(input);
  source = replaceRequired(
    source,
    'architecture: "separate-student-teacher-pages-with-server-verified-pin"',
    'architecture: "secure-teacher-gateway-hitscan-combat-and-automatic-reporting-v18"',
    "gateway architecture label"
  );
  return source;
}

function patchServerSource(input) {
  let source = baseRuntime.patchServerSource(input);

  source = replaceRequired(
    source,
    'const crypto = require("node:crypto");\nconst http = require("node:http");',
    'const crypto = require("node:crypto");\nconst fs = require("node:fs");\nconst http = require("node:http");\nconst path = require("node:path");',
    "score-store imports"
  );

  source = replaceRequired(
    source,
    `const LONG_SHOT_BONUS_MAX = 18;`,
    `const LONG_SHOT_BONUS_MAX = 18;
const HITSCAN_RANGE = 3900;
const HITSCAN_RADIUS = 14;
const TRACER_LIFETIME_MS = 145;
const HITSCAN_COOLDOWN_MS = 220;
const RAPID_HITSCAN_COOLDOWN_MS = 125;
const GLOBAL_SCORE_VERSION = 1;
const GLOBAL_SCORE_FILE = String(process.env.GLOBAL_SCORE_FILE || path.join(__dirname, "global-score.json"));
const SCORE_FORMULA = Object.freeze({ territory: 1, elimination: 25, correctAnswer: 20, deathPenalty: 5, victoryBonus: 100 });`,
    "hitscan and score constants"
  );

  source = replaceRequired(
    source,
    'const names = values.map((value, index) => assertSafeName(value, `Student ${index + 1} name`, 2, 24));',
    'const names = values.map((value, index) => assertSafeName(value, `Student ${index + 1} name`, 2, 60));',
    "complete student names"
  );

  source = replaceRequired(
    source,
    `const rooms = new Map();`,
    `const rooms = new Map();
function scoreKey(value) {
  return sanitizeText(value, "", 80).normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function loadGlobalScoreStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(GLOBAL_SCORE_FILE, "utf8"));
    if (parsed && parsed.version === GLOBAL_SCORE_VERSION && parsed.students && typeof parsed.students === "object") return parsed;
  } catch {}
  return { version: GLOBAL_SCORE_VERSION, updatedAt: null, students: {} };
}
let globalScoreStore = loadGlobalScoreStore();
function persistGlobalScoreStore() {
  globalScoreStore.updatedAt = new Date().toISOString();
  try {
    const temporary = GLOBAL_SCORE_FILE + ".tmp";
    fs.writeFileSync(temporary, JSON.stringify(globalScoreStore, null, 2), "utf8");
    fs.renameSync(temporary, GLOBAL_SCORE_FILE);
    return true;
  } catch {
    return false;
  }
}
function calculateMatchScore(player, won) {
  return Math.max(0, Math.round(
    (Number(player.territory) || 0) * SCORE_FORMULA.territory +
    (Number(player.kills) || 0) * SCORE_FORMULA.elimination +
    (Number(player.correct) || 0) * SCORE_FORMULA.correctAnswer -
    (Number(player.deaths) || 0) * SCORE_FORMULA.deathPenalty +
    (won ? SCORE_FORMULA.victoryBonus : 0)
  ));
}
function commitGlobalScores(report, winners) {
  const winningTeams = new Set(winners);
  const nowIso = new Date().toISOString();
  for (const player of report.players) {
    const won = winningTeams.has(player.team);
    player.won = won;
    player.matchScore = calculateMatchScore(player, won);
    if (player.isBot) continue;
    for (const studentName of player.students || []) {
      const key = scoreKey(studentName);
      if (!key) continue;
      const current = globalScoreStore.students[key] || {
        studentName,
        matches: 0,
        wins: 0,
        score: 0,
        territory: 0,
        eliminations: 0,
        deaths: 0,
        shotsFired: 0,
        shotsHit: 0,
        questionsPresented: 0,
        questionsAnswered: 0,
        correct: 0,
        wrong: 0,
        timeouts: 0,
        firstPlayedAt: nowIso,
        lastPlayedAt: nowIso
      };
      current.studentName = studentName;
      current.matches += 1;
      current.wins += won ? 1 : 0;
      current.score += player.matchScore;
      current.territory += Number(player.territory) || 0;
      current.eliminations += Number(player.kills) || 0;
      current.deaths += Number(player.deaths) || 0;
      current.shotsFired += Number(player.shotsFired) || 0;
      current.shotsHit += Number(player.shotsHit) || 0;
      current.questionsPresented += Number(player.questionsPresented) || 0;
      current.questionsAnswered += Number(player.questionsAnswered) || 0;
      current.correct += Number(player.correct) || 0;
      current.wrong += Number(player.wrong) || 0;
      current.timeouts += Number(player.timeouts) || 0;
      current.lastPlayedAt = nowIso;
      current.combatAccuracy = current.shotsFired ? current.shotsHit / current.shotsFired : null;
      current.questionAccuracy = current.questionsAnswered ? current.correct / current.questionsAnswered : null;
      globalScoreStore.students[key] = current;
    }
  }
  const persistedToServerFile = persistGlobalScoreStore();
  const entries = Object.values(globalScoreStore.students).sort((a, b) => b.score - a.score || b.wins - a.wins || a.studentName.localeCompare(b.studentName));
  return {
    version: GLOBAL_SCORE_VERSION,
    updatedAt: globalScoreStore.updatedAt,
    scoreFormula: SCORE_FORMULA,
    persistedToServerFile,
    teacherBrowserBackupRecommended: true,
    entries
  };
}
function buildMatchMetadata(report) {
  const answers = report.players.flatMap((player) => (player.answers || []).map((answer) => ({ ...answer, playerId: player.id, pcLabel: player.pcLabel, students: player.students })));
  const byType = {};
  for (const answer of answers) {
    const type = String(answer.type || "unknown");
    byType[type] ||= { presented: 0, answered: 0, correct: 0, wrong: 0, timeouts: 0, unansweredAtMatchEnd: 0 };
    byType[type].presented += 1;
    if (answer.outcome === "timeout") byType[type].timeouts += 1;
    else if (answer.outcome === "match_ended_unanswered") byType[type].unansweredAtMatchEnd += 1;
    else byType[type].answered += 1;
    if (answer.outcome === "correct") byType[type].correct += 1;
    if (answer.outcome === "wrong") byType[type].wrong += 1;
  }
  const questionsPresented = answers.length;
  const questionsAnswered = answers.filter((answer) => answer.outcome !== "timeout" && answer.outcome !== "match_ended_unanswered").length;
  const totalShots = report.players.reduce((sum, player) => sum + (Number(player.shotsFired) || 0), 0);
  const totalHits = report.players.reduce((sum, player) => sum + (Number(player.shotsHit) || 0), 0);
  return {
    build: "20260723-hitscan-reporting18",
    generatedAt: new Date().toISOString(),
    questionsPresented,
    questionsAnswered,
    unansweredOrTimedOut: questionsPresented - questionsAnswered,
    unansweredAtMatchEnd: answers.filter((answer) => answer.outcome === "match_ended_unanswered").length,
    timedOutAnswers: answers.filter((answer) => answer.outcome === "timeout").length,
    correctAnswers: answers.filter((answer) => answer.outcome === "correct").length,
    wrongAnswers: answers.filter((answer) => answer.outcome === "wrong").length,
    byQuestionType: byType,
    combat: {
      model: "authoritative-semi-auto-hitscan",
      shotsFired: totalShots,
      shotsHit: totalHits,
      accuracy: totalShots ? totalHits / totalShots : null,
      range: HITSCAN_RANGE,
      tracerLifetimeMs: TRACER_LIFETIME_MS
    },
    scoreFormula: SCORE_FORMULA
  };
}
const app = express();`,
    "global score store"
  );

  source = replaceRequired(
    source,
    `this.createdAt = Date.now(); this.updatedAt = Date.now(); this.startedAt = null; this.endsAt = null; this.lastStateAt = 0; this.botSerial = 0;`,
    `this.createdAt = Date.now(); this.updatedAt = Date.now(); this.startedAt = null; this.endsAt = null; this.lastStateAt = 0; this.botSerial = 0; this.matchId = null; this.finalPayloadCache = null;`,
    "room report cache"
  );

  if (!source.includes("kills: 0, deaths: 0, nextShotAt: 0,")) throw new Error("Triad v13 patch could not find: player combat counters");
  source = source.replaceAll(
    "kills: 0, deaths: 0, nextShotAt: 0,",
    "kills: 0, deaths: 0, shotsFired: 0, shotsHit: 0, lastShotAt: 0, shootHeld: false, nextShotAt: 0,"
  );

  source = replaceRequired(
    source,
    `this.phase = "countdown"; this.registrationLocked = true; this.territory.fill(-1);`,
    `this.phase = "countdown"; this.registrationLocked = true; this.matchId = id("match"); this.finalPayloadCache = null; this.territory.fill(-1);`,
    "match report identity"
  );
  source = replaceRequired(
    source,
    `this.phase = "lobby"; this.registrationLocked = false; this.startedAt = null; this.endsAt = null;`,
    `this.phase = "lobby"; this.registrationLocked = false; this.startedAt = null; this.endsAt = null; this.matchId = null; this.finalPayloadCache = null;`,
    "reset report cache"
  );

  source = replacePattern(
    source,
    /  fireVolley\(player, now\) \{[\s\S]*?\n  \}\n  combatIdentity/,
    `  fireVolley(player, now) {
    if (player.ammo <= 0 || this.projectiles.size >= MAX_PROJECTILES) return;
    const size = this.volleySize(player);
    const offsets = size === 1 ? [0] : size === 2 ? [-VOLLEY_SPREAD_RADIANS * 0.42, VOLLEY_SPREAD_RADIANS * 0.42] : [-VOLLEY_SPREAD_RADIANS * 0.72, 0, VOLLEY_SPREAD_RADIANS * 0.72];
    player.ammo -= 1;
    if (!Number.isFinite(player.nextAmmoRegenAt) || player.nextAmmoRegenAt <= now) player.nextAmmoRegenAt = now + AMMO_REGEN_INTERVAL_MS;
    player.nextShotAt = now + (now < player.rapidUntil ? RAPID_HITSCAN_COOLDOWN_MS : HITSCAN_COOLDOWN_MS);
    player.lastShotAt = now;
    const hitVictims = new Set();

    for (const offset of offsets) {
      const angle = player.angle + offset;
      const startX = player.x + Math.cos(angle) * (PLAYER_RADIUS + 10);
      const startY = player.y + Math.sin(angle) * (PLAYER_RADIUS + 10);
      let endDistance = HITSCAN_RANGE;
      let targetHit = null;

      for (const target of this.players.values()) {
        if (!target.alive || target.team === player.team || now < target.invulnerableUntil || hitVictims.has(target.id)) continue;
        if (!target.isBot && !target.connected) continue;
        const relativeX = target.x - startX;
        const relativeY = target.y - startY;
        const projection = relativeX * Math.cos(angle) + relativeY * Math.sin(angle);
        if (projection <= 0 || projection >= endDistance) continue;
        const perpendicularSq = relativeX * relativeX + relativeY * relativeY - projection * projection;
        const collisionRadius = PLAYER_RADIUS + HITSCAN_RADIUS;
        if (perpendicularSq <= collisionRadius * collisionRadius) {
          endDistance = projection;
          targetHit = target;
        }
      }

      const endX = startX + Math.cos(angle) * endDistance;
      const endY = startY + Math.sin(angle) * endDistance;
      const tracerId = id("trace");
      this.projectiles.set(tracerId, {
        id: tracerId,
        type: "tracer",
        ownerId: player.id,
        team: player.team,
        startX,
        startY,
        endX,
        endY,
        x: endX,
        y: endY,
        spawnedAt: now,
        expiresAt: now + TRACER_LIFETIME_MS,
        hit: Boolean(targetHit)
      });
      player.shotsFired += 1;
      if (targetHit) {
        player.shotsHit += 1;
        hitVictims.add(targetHit.id);
        this.eliminate(targetHit, player);
      }
    }
  }
  combatIdentity`,
    "Hotline-style hitscan volley"
  );

  source = replaceRequired(
    source,
    `if (player.input.shoot && now >= player.nextShotAt && player.ammo > 0) this.fireVolley(player, now);`,
    `const shootPressed = Boolean(player.input.shoot);
      const shootEdge = player.isBot ? shootPressed : shootPressed && !player.shootHeld;
      if (shootEdge && now >= player.nextShotAt && player.ammo > 0) this.fireVolley(player, now);
      player.shootHeld = shootPressed;`,
    "semi-automatic shot edge"
  );

  source = replacePattern(
    source,
    /  updateProjectiles\(now\) \{[\s\S]*?\n  \}\n  updateQuestionsAndRespawns/,
    `  updateProjectiles(now) {
    for (const [projectileId, projectile] of this.projectiles) {
      if (now >= projectile.expiresAt) this.projectiles.delete(projectileId);
    }
  }
  updateQuestionsAndRespawns`,
    "short-lived hitscan tracers"
  );

  source = replaceRequired(
    source,
    `accuracy: player.questionStats.attempts ? player.questionStats.correct / player.questionStats.attempts : null,`,
    `questionsPresented: player.questionStats.attempts,
        questionsAnswered: player.questionStats.correct + player.questionStats.wrong,
        questionAccuracy: player.questionStats.correct + player.questionStats.wrong ? player.questionStats.correct / (player.questionStats.correct + player.questionStats.wrong) : null,
        shotsFired: player.shotsFired,
        shotsHit: player.shotsHit,
        combatAccuracy: player.shotsFired ? player.shotsHit / player.shotsFired : null,
        accuracy: player.shotsFired ? player.shotsHit / player.shotsFired : null,
        lastShotAt: player.lastShotAt,`,
    "combat telemetry fields"
  );

  source = replaceRequired(
    source,
    `projectiles: [...this.projectiles.values()].map((projectile) => ({
        id: projectile.id,
        team: projectile.team,
        x: Math.round(projectile.x),
        y: Math.round(projectile.y),
        vx: Math.round(projectile.vx),
        vy: Math.round(projectile.vy),
        radius: PROJECTILE_RADIUS
      })),`,
    `projectiles: [...this.projectiles.values()].map((projectile) => ({
        id: projectile.id,
        type: projectile.type || "tracer",
        team: projectile.team,
        ownerId: projectile.ownerId,
        startX: Math.round(projectile.startX),
        startY: Math.round(projectile.startY),
        endX: Math.round(projectile.endX),
        endY: Math.round(projectile.endY),
        x: Math.round(projectile.x),
        y: Math.round(projectile.y),
        spawnedAt: projectile.spawnedAt,
        expiresAt: projectile.expiresAt,
        hit: Boolean(projectile.hit),
        radius: HITSCAN_RADIUS
      })),`,
    "tracer state payload"
  );

  source = replacePattern(
    source,
    /  report\(\) \{[^\n]+\}/,
    `  report() {
    const territoryCounts = this.territoryCounts();
    const playerTerritory = this.playerTerritoryCounts();
    const report = {
      matchId: this.matchId || id("match"),
      roomCode: this.code,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      matchDurationMs: this.startedAt ? Date.now() - this.startedAt : 0,
      configuredDurationMs: MATCH_DURATION_MS,
      winnerRule: "largest-territory",
      combatModel: "authoritative-semi-auto-hitscan",
      territoryCounts,
      teamNames: this.teamNames,
      teamColors: this.teamColors,
      teams: this.teamNames.map((name, team) => ({ name, color: this.teamColors[team], team, territory: territoryCounts[team] })),
      players: [...this.players.values()].map((player) => {
        const stats = player.questionStats;
        const answers = stats.history.slice();
        if (player.currentQuestion && !answers.some((answer) => answer.questionId === player.currentQuestion.id)) {
          const pending = player.currentQuestion;
          answers.push({
            questionId: pending.id,
            type: pending.type,
            prompt: pending.prompt,
            options: pending.options,
            selectedIndex: null,
            correctIndex: pending.answerIndex,
            outcome: "match_ended_unanswered",
            responseMs: clamp(Date.now() - pending.createdAt, 0, QUESTION_DURATION_MS),
            answeredAt: null
          });
        }
        const questionsAnswered = stats.correct + stats.wrong;
        const unansweredAtMatchEnd = answers.filter((answer) => answer.outcome === "match_ended_unanswered").length;
        return {
          id: player.id,
          pcLabel: player.pcLabel,
          name: player.pcLabel,
          students: player.students,
          isBot: player.isBot,
          team: player.team,
          teamName: this.teamNames[player.team],
          teamColor: this.teamColors[player.team],
          territory: playerTerritory.get(player.id) || 0,
          kills: player.kills,
          deaths: player.deaths,
          shotsFired: player.shotsFired,
          shotsHit: player.shotsHit,
          combatAccuracy: player.shotsFired ? player.shotsHit / player.shotsFired : null,
          attempts: stats.attempts,
          questionsPresented: answers.length,
          questionsAnswered,
          unansweredAtMatchEnd,
          correct: stats.correct,
          wrong: stats.wrong,
          timeouts: stats.timeouts,
          accuracy: questionsAnswered ? stats.correct / questionsAnswered : null,
          averageResponseMs: stats.attempts ? Math.round(stats.totalResponseMs / stats.attempts) : null,
          answers
        };
      })
    };
    report.metadata = buildMatchMetadata(report);
    return report;
  }`,
    "complete match metadata report"
  );

  source = replacePattern(
    source,
    /  finalPayload\(\) \{[^\n]+\}/,
    `  ensureFinalPayload() {
    if (this.finalPayloadCache) return this.finalPayloadCache;
    const report = this.report();
    const maxTerritory = Math.max(...report.territoryCounts);
    const winners = report.teams.filter((team) => team.territory === maxTerritory).map((team) => team.team);
    report.globalScore = commitGlobalScores(report, winners);
    this.finalPayloadCache = { type: "match_ended", winners, report };
    return this.finalPayloadCache;
  }
  finalPayload(includeGlobalScore = false) {
    const complete = this.ensureFinalPayload();
    if (includeGlobalScore) return complete;
    const { globalScore, ...studentReport } = complete.report;
    return { type: complete.type, winners: complete.winners, report: studentReport };
  }`,
    "cached final payload and private global score"
  );
  source = replacePattern(
    source,
    /  sendFinalTo\(ws\) \{[^\n]+\}/,
    `  sendFinalTo(ws) { safeSend(ws, this.finalPayload(ws?.role === "controller")); }`,
    "role-aware final report"
  );
  source = replacePattern(
    source,
    /  endMatch\(\) \{[^\n]+\}/,
    `  endMatch() {
    if (this.phase === "ended") return;
    this.phase = "ended";
    const studentPayload = this.finalPayload(false);
    for (const item of this.pending.values()) safeSend(item.ws, studentPayload);
    for (const player of this.players.values()) if (!player.isBot) safeSend(player.ws, studentPayload);
    if (this.controller?.ws) safeSend(this.controller.ws, this.finalPayload(true));
    this.sendLobby();
    this.updatedAt = Date.now();
  }`,
    "teacher-only global score delivery"
  );

  return source;
}

const currentNodeOptions = String(process.env.NODE_OPTIONS || "");
if (!currentNodeOptions.includes("runtime-v13.js")) process.env.NODE_OPTIONS = `${currentNodeOptions} --require=${__filename}`.trim();

const inheritedLoader = Module._extensions[".js"];
Module._extensions[".js"] = function triadV13Loader(module, filename) {
  if (path.dirname(filename) === __dirname && path.basename(filename) === "server-v3.js") {
    module._compile(patchServerSource(fs.readFileSync(filename, "utf8")), filename);
    return;
  }
  if (path.dirname(filename) === __dirname && path.basename(filename) === "secure-gateway.js") {
    module._compile(patchGatewaySource(fs.readFileSync(filename, "utf8")), filename);
    return;
  }
  inheritedLoader(module, filename);
};

module.exports = { patchGatewaySource, patchServerSource };
