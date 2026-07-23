(() => {
  "use strict";

  const BUILD = "20260723-master-score23";
  const observedSockets = new WeakSet();
  const inheritedSend = WebSocket.prototype.send;
  const inheritedAddEventListener = WebSocket.prototype.addEventListener;
  let latestState = null;
  let latestReport = null;

  function parse(value) {
    if (typeof value !== "string") return null;
    try { return JSON.parse(value); } catch { return null; }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  }

  function percent(value) {
    return value == null ? "—" : `${Math.round(Number(value) * 100)}%`;
  }

  function scoreText(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `${number.toFixed(2)} / 5` : "—";
  }

  function ensurePrivacyNotice() {
    const reportPanel = document.getElementById("reportPanel");
    if (!reportPanel || document.getElementById("masterPrivateReportNoticeV23")) return;
    const notice = document.createElement("div");
    notice.id = "masterPrivateReportNoticeV23";
    notice.className = "master-private-report-notice-v23";
    notice.innerHTML = `<strong>MASTER-ONLY PLAYER DATA</strong><span>Student devices receive only team ranking and group score. This authenticated page receives names, individual statistics and complete answer history, then automatically downloads the real-player JSON and CSV.</span>`;
    reportPanel.prepend(notice);
  }

  function ensureFormulaPanel() {
    const controlPanel = document.getElementById("controlPanel");
    if (!controlPanel || document.getElementById("masterScoreFormulaV23")) return;
    const target = document.getElementById("masterLiveGamePanel") || controlPanel.firstElementChild;
    const panel = document.createElement("section");
    panel.id = "masterScoreFormulaV23";
    panel.className = "master-card master-score-formula-v23";
    panel.innerHTML = `
      <div><span>LIVE GROUP SCORE</span><strong>2.50–5.00</strong></div>
      <p><b>1st:</b> 5.00 · <b>2nd:</b> 4.00 · <b>3rd:</b> 3.00 · each wrong geometry answer: <b>−0.25</b> · minimum: <b>2.50</b>.</p>
      <small>Ranking priority: territory → eliminations → correct answers → fewer wrong answers.</small>
    `;
    target?.insertAdjacentElement("afterend", panel);
  }

  function decorateLiveTeams(message) {
    const scores = Array.isArray(message?.teamScores) ? message.teamScores : [];
    const cards = [...document.querySelectorAll("#liveTeams .live-team")];
    cards.forEach((card, index) => {
      const score = scores.find((entry) => Number(entry.team) === index);
      if (!score) return;
      card.dataset.rank = String(score.rank);
      let grade = card.querySelector(".master-live-grade-v23");
      if (!grade) {
        grade = document.createElement("div");
        grade.className = "master-live-grade-v23";
        card.appendChild(grade);
      }
      grade.innerHTML = `<span>RANK #${Number(score.rank)}</span><strong>${scoreText(score.score)}</strong><small>Base ${Number(score.baseScore).toFixed(1)} · wrong penalty −${Number(score.wrongPenalty || 0).toFixed(2)}</small>`;
    });
  }

  function renderFinalReport(report) {
    if (!report || !Array.isArray(report.players)) return;
    ensurePrivacyNotice();
    const scores = [...(report.teamScores || [])].sort((a, b) => Number(a.rank) - Number(b.rank));
    const ranking = document.getElementById("finalRanking");
    if (ranking && scores.length) {
      const total = Number(report.territoryCounts?.reduce((sum, value) => sum + Number(value || 0), 0)) || 1000;
      ranking.innerHTML = scores.map((team) => `
        <article class="rank-card master-score-rank-card-v23" style="--team-color:${escapeHtml(team.color)}" data-rank="${Number(team.rank)}">
          <span>#${Number(team.rank)} ${escapeHtml(team.name)}</span>
          <strong>${scoreText(team.score)}</strong>
          <small>${((Number(team.territory) || 0) / total * 100).toFixed(1)}% territory · ${Number(team.eliminations) || 0} eliminations</small>
          <em>Base ${Number(team.baseScore).toFixed(1)} · ${Number(team.wrong) || 0} wrong · penalty −${Number(team.wrongPenalty || 0).toFixed(2)}</em>
        </article>
      `).join("");
    }

    const table = document.querySelector("#reportPanel table");
    const head = table?.querySelector("thead tr");
    const body = document.getElementById("reportTableBody");
    if (head) {
      head.innerHTML = "<th>PC player</th><th>Three students</th><th>Team</th><th>Type</th><th>Rank</th><th>Group score</th><th>Wrong penalty</th><th>Territory</th><th>Kills</th><th>Deaths</th><th>Attempts</th><th>Correct</th><th>Wrong</th><th>Timeouts</th><th>Question accuracy</th><th>Combat accuracy</th>";
    }
    if (body) {
      body.innerHTML = [...report.players]
        .sort((a, b) => Number(a.teamRank) - Number(b.teamRank) || Number(a.team) - Number(b.team) || String(a.pcLabel).localeCompare(String(b.pcLabel)))
        .map((player) => `<tr class="${player.isBot ? "master-bot-row-v23" : "master-real-row-v23"}">
          <td>${escapeHtml(player.pcLabel)}</td>
          <td>${escapeHtml((player.students || []).join(" · "))}</td>
          <td>${escapeHtml(player.teamName)}</td>
          <td>${player.isBot ? "AI" : "REAL"}</td>
          <td>#${Number(player.teamRank) || 3}</td>
          <td><strong>${scoreText(player.groupScore)}</strong></td>
          <td>−${Number(player.wrongAnswerPenalty || 0).toFixed(2)}</td>
          <td>${Number(player.territory) || 0}</td>
          <td>${Number(player.kills) || 0}</td>
          <td>${Number(player.deaths) || 0}</td>
          <td>${Number(player.attempts) || 0}</td>
          <td>${Number(player.correct) || 0}</td>
          <td>${Number(player.wrong) || 0}</td>
          <td>${Number(player.timeouts) || 0}</td>
          <td>${percent(player.accuracy)}</td>
          <td>${percent(player.combatAccuracy)}</td>
        </tr>`).join("");
    }
  }

  function handleMessage(message) {
    if (!message || typeof message !== "object") return;
    if (message.type === "controller_joined") {
      const clock = document.getElementById("clockLabel");
      if (clock) clock.textContent = "10:00";
      ensureFormulaPanel();
      return;
    }
    if (message.type === "state") {
      latestState = message;
      queueMicrotask(() => decorateLiveTeams(message));
      return;
    }
    if (message.type === "match_ended" && message.report?.globalScore) {
      latestReport = message.report;
      queueMicrotask(() => renderFinalReport(message.report));
    }
  }

  function observe(socket) {
    if (!socket || observedSockets.has(socket)) return;
    observedSockets.add(socket);
    inheritedAddEventListener.call(socket, "message", (event) => handleMessage(parse(event.data)));
  }

  WebSocket.prototype.addEventListener = function triadMasterScoreV23AddEventListener(type, listener, options) {
    if (type === "message") observe(this);
    return inheritedAddEventListener.call(this, type, listener, options);
  };

  WebSocket.prototype.send = function triadMasterScoreV23Send(payload) {
    observe(this);
    return inheritedSend.call(this, payload);
  };

  const clock = document.getElementById("clockLabel");
  if (clock) clock.textContent = "10:00";
  ensureFormulaPanel();
  ensurePrivacyNotice();

  window.__triadMasterScoreV23 = Object.freeze({
    build: BUILD,
    scoring: "rank-base-5-4-3-minus-0.25-per-wrong-floor-2.5",
    privatePlayerReport: true,
    latestState: () => latestState,
    latestReport: () => latestReport
  });
})();
