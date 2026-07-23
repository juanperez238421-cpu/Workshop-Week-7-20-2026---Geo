"use strict";

const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const baseRuntime = require("./runtime-v15.js");

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Triad v16 patch could not find: ${label}`);
  return source.replace(search, replacement);
}

function replacePattern(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`Triad v16 patch could not find: ${label}`);
  return source.replace(pattern, replacement);
}

function patchGatewaySource(input) {
  return baseRuntime.patchGatewaySource(input);
}

function patchServerSource(input) {
  let source = baseRuntime.patchServerSource(input);

  source = replaceRequired(
    source,
    "const MATCH_DURATION_MS = 5 * 60 * 1000;",
    "const MATCH_DURATION_MS = 10 * 60 * 1000;",
    "ten-minute match duration"
  );
  source = replaceRequired(
    source,
    "const RECONNECT_GRACE_MS = 60 * 1000;",
    "const RECONNECT_GRACE_MS = 10 * 60 * 1000;",
    "ten-minute reconnect grace"
  );
  source = replaceRequired(
    source,
    "const GLOBAL_SCORE_VERSION = 1;",
    `const GLOBAL_SCORE_VERSION = 1;
const GROUP_SCORE_MIN = 2.5;
const GROUP_SCORE_BASE_BY_RANK = Object.freeze([5, 4, 3]);
const GROUP_SCORE_WRONG_PENALTY = 0.25;
const GROUP_SCORE_FORMULA = Object.freeze({
  firstPlaceBase: 5,
  secondPlaceBase: 4,
  thirdPlaceBase: 3,
  wrongAnswerPenalty: GROUP_SCORE_WRONG_PENALTY,
  minimum: GROUP_SCORE_MIN,
  ranking: ["territory", "eliminations", "correct_answers", "fewer_wrong_answers", "team_slot"]
});`,
    "group score constants"
  );

  source = source.replaceAll(
    "Match started. Largest territory after five minutes wins.",
    "Match started. Ten minutes of territory, teamwork and geometry determine the live ranking."
  );

  source = replaceRequired(
    source,
    `  statePayload(now) {`,
    `  teamScoreSnapshot() {
    const territoryCounts = this.territoryCounts();
    const teams = [0, 1, 2].map((team) => {
      const members = [...this.players.values()].filter((player) => player.team === team);
      const realMembers = members.filter((player) => !player.isBot);
      return {
        team,
        name: this.teamNames[team],
        color: this.teamColors[team],
        territory: Number(territoryCounts[team]) || 0,
        eliminations: members.reduce((sum, player) => sum + (Number(player.kills) || 0), 0),
        correct: realMembers.reduce((sum, player) => sum + (Number(player.questionStats?.correct) || 0), 0),
        wrong: realMembers.reduce((sum, player) => sum + (Number(player.questionStats?.wrong) || 0), 0),
        timeouts: realMembers.reduce((sum, player) => sum + (Number(player.questionStats?.timeouts) || 0), 0),
        realPlayers: realMembers.length,
        totalPlayers: members.length
      };
    });
    const ranked = [...teams].sort((a, b) =>
      b.territory - a.territory ||
      b.eliminations - a.eliminations ||
      b.correct - a.correct ||
      a.wrong - b.wrong ||
      a.team - b.team
    );
    ranked.forEach((entry, index) => {
      entry.rank = index + 1;
      entry.baseScore = GROUP_SCORE_BASE_BY_RANK[index] ?? GROUP_SCORE_MIN;
      entry.wrongPenalty = Math.round(entry.wrong * GROUP_SCORE_WRONG_PENALTY * 100) / 100;
      entry.score = Math.round(Math.max(GROUP_SCORE_MIN, entry.baseScore - entry.wrongPenalty) * 100) / 100;
    });
    return teams.map((entry) => ranked.find((rankedEntry) => rankedEntry.team === entry.team));
  }
  studentFinalPayload(player = null) {
    const complete = this.ensureFinalPayload();
    const teamScores = [...(complete.report.teamScores || [])].sort((a, b) => a.rank - b.rank);
    const own = player ? teamScores.find((entry) => entry.team === player.team) || null : null;
    return {
      type: "match_ended",
      winners: complete.winners,
      teamScores,
      yourTeam: player ? player.team : null,
      yourScore: own?.score ?? null,
      report: {
        roomCode: complete.report.roomCode,
        startedAt: complete.report.startedAt,
        endedAt: complete.report.endedAt,
        configuredDurationMs: complete.report.configuredDurationMs,
        winnerRule: complete.report.winnerRule,
        teamNames: complete.report.teamNames,
        teamColors: complete.report.teamColors,
        territoryCounts: complete.report.territoryCounts,
        teamScores,
        teams: teamScores.map((entry) => ({
          team: entry.team,
          name: entry.name,
          color: entry.color,
          territory: entry.territory,
          eliminations: entry.eliminations,
          rank: entry.rank,
          score: entry.score,
          baseScore: entry.baseScore,
          wrong: entry.wrong,
          wrongPenalty: entry.wrongPenalty
        })),
        privacy: "individual-player-and-answer-data-is-available-only-on-the-authenticated-master-page"
      }
    };
  }
  statePayload(now) {`,
    "authoritative live group score methods"
  );

  source = replaceRequired(
    source,
    `    const playerTerritory = this.playerTerritoryCounts();
    const sequence = ++this.stateSequence;`,
    `    const playerTerritory = this.playerTerritoryCounts();
    const teamScores = this.teamScoreSnapshot();
    const sequence = ++this.stateSequence;`,
    "state group score calculation"
  );
  source = replaceRequired(
    source,
    `      territoryCounts,
      players:`,
    `      territoryCounts,
      teamScores,
      groupScoreFormula: GROUP_SCORE_FORMULA,
      players:`,
    "state group score payload"
  );
  source = replaceRequired(
    source,
    `        rapidFire: now < player.rapidUntil,
        volleySize: this.volleySize(player)`,
    `        rapidFire: now < player.rapidUntil,
        groupScore: teamScores[player.team]?.score ?? GROUP_SCORE_MIN,
        teamRank: teamScores[player.team]?.rank ?? 3,
        wrongAnswerPenalty: teamScores[player.team]?.wrongPenalty ?? 0,
        volleySize: this.volleySize(player)`,
    "player live group score telemetry"
  );

  source = replaceRequired(
    source,
    `    report.metadata = buildMatchMetadata(report);
    return report;`,
    `    report.teamScores = this.teamScoreSnapshot();
    report.groupScoreFormula = GROUP_SCORE_FORMULA;
    for (const playerReport of report.players) {
      const teamScore = report.teamScores.find((entry) => entry.team === playerReport.team);
      playerReport.groupScore = teamScore?.score ?? GROUP_SCORE_MIN;
      playerReport.teamRank = teamScore?.rank ?? 3;
      playerReport.wrongAnswerPenalty = teamScore?.wrongPenalty ?? 0;
    }
    report.winnerRule = "territory-then-eliminations-then-correct-answers-then-fewer-wrong-answers";
    report.metadata = buildMatchMetadata(report);
    report.metadata.groupScoreFormula = GROUP_SCORE_FORMULA;
    report.metadata.teamScores = report.teamScores;
    return report;`,
    "private report group scores"
  );

  source = replacePattern(
    source,
    /  ensureFinalPayload\(\) \{[\s\S]*?\n  \}\n  finalPayload\(includeGlobalScore = false\) \{[\s\S]*?\n  \}\n  sendFinalTo\(ws\) \{[^\n]+\}\n  endMatch\(\) \{[\s\S]*?\n  \}\n  disconnect/,
    `  ensureFinalPayload() {
    if (this.finalPayloadCache) return this.finalPayloadCache;
    const report = this.report();
    const teamScores = report.teamScores || this.teamScoreSnapshot();
    const bestRank = Math.min(...teamScores.map((entry) => entry.rank));
    const winners = teamScores.filter((entry) => entry.rank === bestRank).map((entry) => entry.team);
    report.globalScore = commitGlobalScores(report, winners);
    this.finalPayloadCache = { type: "match_ended", winners, teamScores, report };
    return this.finalPayloadCache;
  }
  finalPayload(includePrivateReport = false) {
    return includePrivateReport ? this.ensureFinalPayload() : this.studentFinalPayload(null);
  }
  sendFinalTo(ws) {
    if (!ws) return;
    if (ws.role === "controller") {
      safeSend(ws, this.ensureFinalPayload());
      return;
    }
    const player = ws.role === "player" ? this.players.get(ws.playerId) || null : null;
    safeSend(ws, this.studentFinalPayload(player));
  }
  endMatch() {
    if (this.phase === "ended") return;
    this.phase = "ended";
    this.ensureFinalPayload();
    for (const item of this.pending.values()) safeSend(item.ws, this.studentFinalPayload(null));
    for (const player of this.players.values()) if (!player.isBot) safeSend(player.ws, this.studentFinalPayload(player));
    if (this.controller?.ws) safeSend(this.controller.ws, this.ensureFinalPayload());
    this.sendLobby();
    this.updatedAt = Date.now();
  }
  disconnect`,
    "master-only private final report delivery"
  );

  source = replaceRequired(
    source,
    `this.sendJoined(player, true); if (player.currentQuestion) this.sendQuestion(player); this.sendLobby(); this.broadcastEvent(\`${"${player.pcLabel}"} reconnected.\`); }`,
    `this.sendJoined(player, true); if (player.currentQuestion) this.sendQuestion(player); this.sendLobby(); this.broadcastEvent(\`${"${player.pcLabel}"} reconnected.\`); if (this.phase === "ended") this.sendFinalTo(ws); }`,
    "post-match reconnect summary"
  );

  source = replaceRequired(
    source,
    `ws.on("message", (raw) => handleMessage(ws, raw));`,
    `ws.on("message", (raw) => { ws.isAlive = true; handleMessage(ws, raw); });`,
    "message activity heartbeat"
  );
  source = replacePattern(
    source,
    /const heartbeat = setInterval\(\(\) => \{[\s\S]*?for \(const ws of wss\.clients\)[\s\S]*?ws\.ping\(\);[\s\S]*?\},\s*[0-9_]+\);/,
    `const heartbeat = setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 15_000);`,
    "faster connection heartbeat"
  );

  return source;
}

const currentNodeOptions = String(process.env.NODE_OPTIONS || "");
if (!currentNodeOptions.includes("runtime-v16.js")) process.env.NODE_OPTIONS = `${currentNodeOptions} --require=${__filename}`.trim();

const inheritedLoader = Module._extensions[".js"];
Module._extensions[".js"] = function triadV16Loader(module, filename) {
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
