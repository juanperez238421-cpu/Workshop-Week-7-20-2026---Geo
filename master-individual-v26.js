(() => {
  "use strict";

  const BUILD = "20260724-stable-autostart26";
  const STORAGE_KEY = "triadMasterIndividualStudentsV26";
  const observedSockets = new WeakSet();
  const nativeSend = WebSocket.prototype.send;
  const downloaded = new Set();
  let activeRoom = "";

  function parseJson(value) {
    if (typeof value !== "string") return null;
    try { return JSON.parse(value); } catch { return null; }
  }

  function readBackup() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
  }

  function writeBackup(value) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch {}
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function download(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  function normalizeRow(row, fallback = {}) {
    const attempts = Number(row?.attempts) || 0;
    return {
      roomCode: String(row?.roomCode || fallback.roomCode || activeRoom || ""),
      channelNumber: Number(row?.channelNumber ?? fallback.channelNumber) || 0,
      channelLabel: String(row?.channelLabel || fallback.channelLabel || ""),
      pcLabel: String(row?.pcLabel || fallback.pcLabel || ""),
      studentIndex: Number(row?.studentIndex) || 0,
      studentName: String(row?.studentName || ""),
      assignedDeaths: Number(row?.assignedDeaths) || 0,
      attempts,
      correct: Number(row?.correct) || 0,
      wrong: Number(row?.wrong) || 0,
      timeouts: Number(row?.timeouts) || 0,
      accuracy: row?.accuracy == null ? (attempts ? (Number(row?.correct) || 0) / attempts : null) : Number(row.accuracy),
      averageResponseMs: row?.averageResponseMs == null ? null : Number(row.averageResponseMs),
      team: Number(row?.team ?? fallback.team) || 0,
      teamName: String(row?.teamName || fallback.teamName || ""),
      groupScore: Number(row?.groupScore ?? fallback.groupScore) || 0,
      teamRank: Number(row?.teamRank ?? fallback.teamRank) || 0,
      sharedGroupKills: Number(row?.sharedGroupKills ?? fallback.kills) || 0,
      sharedGroupTerritory: Number(row?.sharedGroupTerritory ?? fallback.territory) || 0,
      sharedShotsFired: Number(row?.sharedShotsFired ?? fallback.shotsFired) || 0,
      sharedShotsHit: Number(row?.sharedShotsHit ?? fallback.shotsHit) || 0,
      answers: Array.isArray(row?.answers) ? row.answers : []
    };
  }

  function rowsFromReport(report, fallback = {}) {
    if (!report || typeof report !== "object") return [];
    const direct = Array.isArray(report.individualStudents) ? report.individualStudents : [];
    if (direct.length) return direct.map((row) => normalizeRow(row, { ...fallback, roomCode: report.roomCode || fallback.roomCode, channelNumber: report.channelNumber || fallback.channelNumber, channelLabel: report.channelLabel || fallback.channelLabel }));

    const rows = [];
    for (const player of Array.isArray(report.players) ? report.players : []) {
      if (player?.isBot) continue;
      for (const row of Array.isArray(player?.individualStudents) ? player.individualStudents : []) {
        rows.push(normalizeRow(row, {
          ...fallback,
          roomCode: report.roomCode || fallback.roomCode,
          channelNumber: report.channelNumber || fallback.channelNumber,
          channelLabel: report.channelLabel || fallback.channelLabel,
          pcLabel: player.pcLabel,
          team: player.team,
          teamName: player.teamName,
          groupScore: player.groupScore,
          teamRank: player.teamRank,
          kills: player.kills,
          territory: player.territory,
          shotsFired: player.shotsFired,
          shotsHit: player.shotsHit
        }));
      }
    }
    return rows;
  }

  function rowsFromPayload(message) {
    const rows = [];
    const report = message?.report || null;
    rows.push(...rowsFromReport(report));

    const channels = Array.isArray(message?.channels) ? message.channels : Array.isArray(report?.channels) ? report.channels : [];
    for (const channel of channels) {
      const channelReport = channel?.report || channel;
      rows.push(...rowsFromReport(channelReport, {
        roomCode: report?.roomCode || message?.roomCode,
        channelNumber: channel?.channelNumber,
        channelLabel: channel?.channelLabel,
        pcLabel: channel?.pcLabel
      }));
    }

    const unique = new Map();
    for (const row of rows) {
      const key = [row.roomCode, row.channelNumber, row.studentIndex, row.studentName].join("|");
      unique.set(key, row);
    }
    return [...unique.values()].sort((a, b) => a.channelNumber - b.channelNumber || a.studentIndex - b.studentIndex || a.studentName.localeCompare(b.studentName));
  }

  function backupRows(rows) {
    if (!rows.length) return;
    const backup = readBackup();
    for (const row of rows) {
      const room = row.roomCode || activeRoom || "unknown";
      backup[room] ||= {};
      backup[room][String(row.channelNumber || 0)] ||= {};
      backup[room][String(row.channelNumber || 0)][String(row.studentIndex)] = { ...row, backedUpAt: new Date().toISOString(), build: BUILD };
    }
    writeBackup(backup);
    updateStatus(rows.length);
  }

  function toCsv(rows) {
    const header = [
      "room_code", "channel_number", "channel_label", "pc_label", "student_number", "student_name",
      "assigned_deaths", "attempts", "correct", "wrong", "timeouts", "answer_accuracy",
      "average_response_ms", "team", "team_name", "group_score", "team_rank",
      "shared_group_kills", "shared_group_territory", "shared_shots_fired", "shared_shots_hit"
    ];
    const values = rows.map((row) => [
      row.roomCode, row.channelNumber, row.channelLabel, row.pcLabel, row.studentIndex + 1, row.studentName,
      row.assignedDeaths, row.attempts, row.correct, row.wrong, row.timeouts,
      row.accuracy == null ? "" : Math.round(row.accuracy * 10000) / 100,
      row.averageResponseMs ?? "", row.team + 1, row.teamName, row.groupScore, row.teamRank,
      row.sharedGroupKills, row.sharedGroupTerritory, row.sharedShotsFired, row.sharedShotsHit
    ]);
    return [header, ...values].map((row) => row.map(csvCell).join(",")).join("\n");
  }

  function updateStatus(count) {
    const status = document.getElementById("automaticReportStatus");
    if (!status) return;
    status.textContent = `${count} individual student record(s) backed up in this Master browser. Final CSV and JSON include assigned deaths and every attributed answer.`;
  }

  function exportRows(rows, message) {
    if (!rows.length) return;
    const room = rows[0]?.roomCode || message?.report?.roomCode || message?.roomCode || activeRoom || "room";
    const marker = `${room}:${message?.report?.endedAt || Date.now()}`;
    if (downloaded.has(marker)) return;
    downloaded.add(marker);
    const safeRoom = String(room).replace(/[^A-Z0-9_-]/gi, "-");
    download(toCsv(rows), `triad-${safeRoom}-individual-students.csv`, "text/csv;charset=utf-8");
    download(JSON.stringify({ build: BUILD, roomCode: room, generatedAt: new Date().toISOString(), students: rows }, null, 2), `triad-${safeRoom}-individual-students.json`, "application/json");
  }

  function handleMessage(message) {
    if (!message || typeof message !== "object") return;
    if (message.roomCode) activeRoom = String(message.roomCode);
    if (message.type === "controller_joined" && message.roomCode) activeRoom = String(message.roomCode);

    if (message.type === "channel_ended") {
      const rows = rowsFromPayload(message);
      backupRows(rows);
      return;
    }

    if (message.type === "match_ended") {
      const rows = rowsFromPayload(message);
      backupRows(rows);
      exportRows(rows, message);
    }
  }

  function observeSocket(socket) {
    if (!socket || observedSockets.has(socket)) return;
    observedSockets.add(socket);
    socket.addEventListener("message", (event) => handleMessage(parseJson(event.data)));
  }

  WebSocket.prototype.send = function masterIndividualV26Send(payload) {
    const message = typeof payload === "string" ? parseJson(payload) : null;
    if (message && ["authenticate_teacher", "create_control_room", "restore_control", "start_match", "start_channel"].includes(message.type)) observeSocket(this);
    if (message?.roomCode) activeRoom = String(message.roomCode);
    return nativeSend.call(this, payload);
  };

  window.__triadMasterIndividualV26 = Object.freeze({
    build: BUILD,
    storageKey: STORAGE_KEY,
    individualAnswerAttribution: true,
    assignedDeathAttribution: true,
    automaticCsvAndJson: true,
    opensAdditionalSocket: false
  });
})();
