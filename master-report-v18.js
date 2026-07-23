(() => {
  "use strict";

  const BUILD = "20260723-auto-report18";
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

  function downloadJson(value, filename) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
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
    if (!report?.globalScore) return;
    const storeResult = mergeMatch(readStore(), report, message.winners || []);
    const matchId = storeResult.matchId;
    if (exportedMatches.has(matchId)) return;
    exportedMatches.add(matchId);

    const payload = {
      exportVersion: 1,
      build: BUILD,
      exportedAt: new Date().toISOString(),
      automaticDownload: true,
      match: report,
      questionMetadata: report.metadata,
      serverGlobalScore: report.globalScore,
      browserGlobalScore: browserScoreSnapshot(storeResult.store)
    };
    const filename = `triad-${safeFilename(report.roomCode)}-${safeFilename(matchId)}-complete-metadata.json`;
    setTimeout(() => {
      try {
        downloadJson(payload, filename);
        updateReportNotice(`Complete metadata downloaded automatically as ${filename}. A cumulative backup was also saved in this teacher browser.`);
      } catch {
        updateReportNotice("The match metadata was saved in this teacher browser. Use DOWNLOAD JSON if the browser blocked the automatic file download.");
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
    getBrowserGlobalScore: () => browserScoreSnapshot(readStore())
  });
})();
