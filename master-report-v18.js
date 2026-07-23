(() => {
  "use strict";

  const BUILD = "20260723-private-report23";
  const STORAGE_KEY = "triadGlobalScoreStoreV18";
  const observedSockets = new WeakSet();
  const exportedMatches = new Set();
  const nativeAddEventListener = WebSocket.prototype.addEventListener;

  function parse(data) {
    if (typeof data !== "string") return null;
    try { return JSON.parse(data); } catch { return null; }
  }

  function readStore() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (value?.version === 1 && value.matches && value.students) return value;
    } catch {}
    return { version: 1, updatedAt: null, matches: {}, students: {} };
  }

  function keyForStudent(name) {
    return String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function mergeMatch(store, report, winners) {
    const matchId = String(report.matchId || `${report.roomCode || "room"}-${report.endedAt || Date.now()}`);
    if (store.matches[matchId]) return { store, matchId, added: false };
    const winningTeams = new Set(Array.isArray(winners) ? winners : []);
    const compactPlayers = [];

    for (const player of report.players || []) {
      compactPlayers.push({
        pcLabel: player.pcLabel,
        students: player.students,
        team: player.team,
        teamName: player.teamName,
        isBot: player.isBot,
        won: Boolean(player.won ?? winningTeams.has(player.team)),
        groupScore: Number(player.groupScore) || 2.5,
        teamRank: Number(player.teamRank) || 3,
        wrongAnswerPenalty: Number(player.wrongAnswerPenalty) || 0,
        matchScore: Number(player.matchScore) || 0,
        territory: Number(player.territory) || 0,
        kills: Number(player.kills) || 0,
        deaths: Number(player.deaths) || 0,
        shotsFired: Number(player.shotsFired) || 0,
        shotsHit: Number(player.shotsHit) || 0,
        questionsPresented: Number(player.questionsPresented ?? player.attempts) || 0,
        questionsAnswered: Number(player.questionsAnswered ?? ((player.correct || 0) + (player.wrong || 0))) || 0,
        correct: Number(player.correct) || 0,
        wrong: Number(player.wrong) || 0,
        timeouts: Number(player.timeouts) || 0
      });
      if (player.isBot) continue;
      for (const studentName of player.students || []) {
        const key = keyForStudent(studentName);
        if (!key) continue;
        const current = store.students[key] || {
          studentName,
          matches: 0,
          wins: 0,
          score: 0,
          groupScoreTotal: 0,
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
          firstPlayedAt: report.endedAt || Date.now(),
          lastPlayedAt: report.endedAt || Date.now()
        };
        const won = Boolean(player.won ?? winningTeams.has(player.team));
        current.studentName = studentName;
        current.matches += 1;
        current.wins += won ? 1 : 0;
        current.score += Number(player.matchScore) || 0;
        current.groupScoreTotal = Number(current.groupScoreTotal || 0) + (Number(player.groupScore) || 2.5);
        current.averageGroupScore = current.matches ? current.groupScoreTotal / current.matches : null;
        current.territory += Number(player.territory) || 0;
        current.eliminations += Number(player.kills) || 0;
        current.deaths += Number(player.deaths) || 0;
        current.shotsFired += Number(player.shotsFired) || 0;
        current.shotsHit += Number(player.shotsHit) || 0;
        current.questionsPresented += Number(player.questionsPresented ?? player.attempts) || 0;
        current.questionsAnswered += Number(player.questionsAnswered ?? ((player.correct || 0) + (player.wrong || 0))) || 0;
        current.correct += Number(player.correct) || 0;
        current.wrong += Number(player.wrong) || 0;
        current.timeouts += Number(player.timeouts) || 0;
        current.combatAccuracy = current.shotsFired ? current.shotsHit / current.shotsFired : null;
        current.questionAccuracy = current.questionsAnswered ? current.correct / current.questionsAnswered : null;
        current.lastPlayedAt = report.endedAt || Date.now();
        store.students[key] = current;
      }
    }

    store.matches[matchId] = {
      matchId,
      roomCode: report.roomCode,
      startedAt: report.startedAt,
      endedAt: report.endedAt,
      winners,
      teamScores: report.teamScores,
      metadata: report.metadata,
      players: compactPlayers
    };
    store.updatedAt = new Date().toISOString();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch {}
    return { store, matchId, added: true };
  }

  function browserScoreSnapshot(store) {
    return {
      version: store.version,
      updatedAt: store.updatedAt,
      totalMatches: Object.keys(store.matches).length,
      entries: Object.values(store.students).sort((a, b) => b.score - a.score || b.wins - a.wins || a.studentName.localeCompare(b.studentName)),
      matches: store.matches
    };
  }

  function safeFilename(value) {
    return String(value || "report").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "report";
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function realPlayersCsv(report) {
    const realPlayers = (report.players || []).filter((player) => !player.isBot);
    const rows = [[
      "room_code", "match_id", "pc_player", "students", "team", "team_rank", "group_score_1_to_5", "wrong_answer_penalty",
      "territory", "kills", "deaths", "shots_fired", "shots_hit", "combat_accuracy", "questions_presented", "questions_answered",
      "correct", "wrong", "timeouts", "question_accuracy", "average_response_ms"
    ]];
    for (const player of realPlayers) {
      rows.push([
        report.roomCode, report.matchId, player.pcLabel, (player.students || []).join(" | "), player.teamName, player.teamRank,
        player.groupScore, player.wrongAnswerPenalty, player.territory, player.kills, player.deaths, player.shotsFired, player.shotsHit,
        player.combatAccuracy ?? "", player.questionsPresented, player.questionsAnswered, player.correct, player.wrong, player.timeouts,
        player.accuracy ?? "", player.averageResponseMs ?? ""
      ]);
    }
    rows.push([]);
    rows.push(["pc_player", "students", "question_type", "prompt", "selected_option", "correct_option", "outcome", "response_ms", "answered_at"]);
    for (const player of realPlayers) {
      for (const answer of player.answers || []) {
        rows.push([
          player.pcLabel,
          (player.students || []).join(" | "),
          answer.type,
          answer.prompt,
          answer.selectedIndex == null ? "" : answer.options?.[answer.selectedIndex],
          answer.correctIndex == null ? "" : answer.options?.[answer.correctIndex],
          answer.outcome,
          answer.responseMs,
          answer.answeredAt ?? ""
        ]);
      }
    }
    return rows.map((row) => row.map(csvCell).join(",")).join("\n");
  }

  function download(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function updateReportNotice(text) {
    const paragraph = document.getElementById("automaticReportStatus");
    if (paragraph) paragraph.textContent = text;
    const setupStatus = document.getElementById("setupStatus");
    if (setupStatus) {
      setupStatus.textContent = text;
      setupStatus.style.borderLeftColor = "#067647";
    }
  }

  function exportMatch(message) {
    const report = message?.report;
    if (!report?.globalScore || !Array.isArray(report.players)) return;
    const storeResult = mergeMatch(readStore(), report, message.winners || []);
    const matchId = storeResult.matchId;
    if (exportedMatches.has(matchId)) return;
    exportedMatches.add(matchId);

    const realPlayers = report.players.filter((player) => !player.isBot);
    const payload = {
      exportVersion: 2,
      build: BUILD,
      exportedAt: new Date().toISOString(),
      automaticDownload: true,
      teacherOnlyPrivateData: true,
      match: report,
      teamScores: report.teamScores,
      realPlayers,
      questionMetadata: report.metadata,
      serverGlobalScore: report.globalScore,
      browserGlobalScore: browserScoreSnapshot(storeResult.store)
    };

    const stem = `triad-${safeFilename(report.roomCode)}-${safeFilename(matchId)}`;
    const jsonFilename = `${stem}-teacher-private-complete.json`;
    const csvFilename = `${stem}-real-players.csv`;
    setTimeout(() => {
      try {
        download(JSON.stringify(payload, null, 2), jsonFilename, "application/json;charset=utf-8");
        updateReportNotice(`Private teacher report downloaded automatically as ${jsonFilename}. Preparing the real-player CSV…`);
        setTimeout(() => {
          try {
            download(realPlayersCsv(report), csvFilename, "text/csv;charset=utf-8");
            updateReportNotice(`${realPlayers.length} real player record(s) downloaded automatically in JSON and CSV. A cumulative backup was also saved in this teacher browser.`);
          } catch {
            updateReportNotice(`The complete private JSON was downloaded and the browser backup was saved. Use DOWNLOAD CSV if the browser blocked the second automatic file.`);
          }
        }, 900);
      } catch {
        updateReportNotice("The private match data was saved in this teacher browser. Use DOWNLOAD JSON if the browser blocked automatic download.");
      }
    }, 700);
  }

  function observe(socket) {
    if (!socket || observedSockets.has(socket)) return;
    observedSockets.add(socket);
    nativeAddEventListener.call(socket, "message", (event) => {
      const message = parse(event.data);
      if (message?.type === "match_ended") exportMatch(message);
    });
  }

  WebSocket.prototype.addEventListener = function triadReportObserver(type, listener, options) {
    if (type === "message") observe(this);
    return nativeAddEventListener.call(this, type, listener, options);
  };

  window.__triadMasterReportV18 = Object.freeze({
    build: BUILD,
    storageKey: STORAGE_KEY,
    privateTeacherReports: true,
    automaticRealPlayerJsonAndCsv: true,
    getBrowserGlobalScore: () => browserScoreSnapshot(readStore())
  });
})();
