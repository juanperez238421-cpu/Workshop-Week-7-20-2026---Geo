(() => {
  "use strict";

  if (typeof WebSocket === "undefined") return;

  const BUILD = "20260725-local-results27";
  const nativeSend = WebSocket.prototype.send;
  const observed = new WeakSet();
  let activeSocket = null;
  let results = [];
  let ingestEnabled = false;
  let selectedDetail = null;

  function parse(value) {
    if (typeof value !== "string") return null;
    try { return JSON.parse(value); } catch { return null; }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[character]));
  }

  function formatDate(value) {
    const date = new Date(Number(value) || value || 0);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
  }

  function percentage(value) {
    return value == null ? "—" : `${Math.round(Number(value) * 100)}%`;
  }

  function csvCell(value) {
    let text = String(value ?? "");
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
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

  function ensureSection() {
    let section = document.getElementById("masterLocalResultsV27");
    if (section) return section;
    const controlPanel = document.getElementById("controlPanel");
    if (!controlPanel) return null;
    section = document.createElement("section");
    section.id = "masterLocalResultsV27";
    section.className = "master-card master-local-results-v27";
    section.innerHTML = `
      <div class="section-heading">
        <div>
          <p class="eyebrow">LOCAL WINDOWS EXE · AUTOMATIC RESULT INBOX</p>
          <h2>Local game results</h2>
          <p>Each Windows app saves its report locally first and sends score, individual questionnaire attempts and response times here as soon as internet is available.</p>
        </div>
        <div class="button-row">
          <button id="localResultsRefreshV27" class="secondary-button" type="button">REFRESH</button>
          <button id="localResultsCsvV27" class="secondary-button" type="button">DOWNLOAD SUMMARY CSV</button>
        </div>
      </div>
      <div class="local-results-summary-v27">
        <div><span>RECEIVED</span><strong id="localResultsCountV27">0</strong></div>
        <div><span>INGEST</span><strong id="localResultsIngestV27">CHECKING</strong></div>
        <div><span>LATEST</span><strong id="localResultsLatestV27">—</strong></div>
      </div>
      <div id="localResultsStatusV27" class="notice">Create or restore the Master room to connect this inbox.</div>
      <div id="localResultsListV27" class="local-results-list-v27"><div class="empty-state">No local EXE results loaded.</div></div>
      <dialog id="localResultDialogV27" class="local-result-dialog-v27">
        <form method="dialog" class="local-result-dialog-card-v27">
          <div class="section-heading"><div><p class="eyebrow">PRIVATE RESULT DETAIL</p><h2 id="localResultDialogTitleV27">Local result</h2></div><button class="secondary-button" value="close">CLOSE</button></div>
          <div id="localResultDialogBodyV27"></div>
          <div class="button-row"><button id="localResultDownloadJsonV27" class="primary-button" type="button">DOWNLOAD COMPLETE JSON</button></div>
        </form>
      </dialog>`;
    const inbox = document.getElementById("registrationInbox");
    if (inbox?.nextSibling) controlPanel.insertBefore(section, inbox.nextSibling);
    else controlPanel.prepend(section);
    section.querySelector("#localResultsRefreshV27")?.addEventListener("click", requestList);
    section.querySelector("#localResultsCsvV27")?.addEventListener("click", downloadSummaryCsv);
    section.querySelector("#localResultDownloadJsonV27")?.addEventListener("click", () => {
      if (!selectedDetail) return;
      const id = String(selectedDetail.resultId || "local-result").replace(/[^A-Za-z0-9_-]/g, "-");
      download(JSON.stringify(selectedDetail, null, 2), `triad-${id}.json`, "application/json");
    });
    return section;
  }

  function setStatus(text, error = false) {
    ensureSection();
    const target = document.getElementById("localResultsStatusV27");
    if (!target) return;
    target.textContent = text;
    target.style.borderLeftColor = error ? "#b42318" : "#067647";
  }

  function send(message) {
    if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
      setStatus("Master WebSocket is not connected. Create or restore the room first.", true);
      return false;
    }
    try {
      activeSocket.send(JSON.stringify(message));
      return true;
    } catch {
      setStatus("The local result command could not be sent.", true);
      return false;
    }
  }

  function requestList() {
    if (send({ type: "list_local_results", limit: 300 })) setStatus("Refreshing local EXE results…");
  }

  function resultCard(row) {
    const names = Array.isArray(row.students) && row.students.length ? row.students.join(" · ") : "Student names unavailable";
    const score = row.score == null ? "—" : `${Number(row.score).toFixed(2)} / 5`;
    return `<article class="local-result-card-v27" data-result-id="${escapeHtml(row.resultId)}">
      <header><div><span>${escapeHtml(row.deviceLabel || row.pcLabel || "LOCAL PC")}</span><strong>${escapeHtml(names)}</strong></div><time>${escapeHtml(formatDate(row.receivedAt))}</time></header>
      <div class="local-result-metrics-v27">
        <div><span>SCORE</span><b>${score}</b></div>
        <div><span>ACCURACY</span><b>${percentage(row.accuracy)}</b></div>
        <div><span>CORRECT</span><b>${Number(row.correct) || 0}</b></div>
        <div><span>WRONG</span><b>${Number(row.wrong) || 0}</b></div>
        <div><span>TIMEOUTS</span><b>${Number(row.timeouts) || 0}</b></div>
        <div><span>KILLS</span><b>${Number(row.kills) || 0}</b></div>
        <div><span>DEATHS</span><b>${Number(row.deaths) || 0}</b></div>
        <div><span>TERRITORY</span><b>${Number(row.territory) || 0}</b></div>
      </div>
      <footer><span>Room ${escapeHtml(row.roomCode || "—")} · Channel ${Number(row.channelNumber) || 1}</span><div><button class="secondary-button local-result-view-v27" type="button">VIEW</button><button class="danger-button local-result-delete-v27" type="button">DELETE</button></div></footer>
    </article>`;
  }

  function render() {
    ensureSection();
    const list = document.getElementById("localResultsListV27");
    if (!list) return;
    list.innerHTML = results.length ? results.map(resultCard).join("") : '<div class="empty-state">No local Windows results have reached this server yet.</div>';
    const count = document.getElementById("localResultsCountV27");
    const ingest = document.getElementById("localResultsIngestV27");
    const latest = document.getElementById("localResultsLatestV27");
    if (count) count.textContent = String(results.length);
    if (ingest) ingest.textContent = ingestEnabled ? "ENABLED" : "NOT CONFIGURED";
    if (latest) latest.textContent = results.length ? formatDate(results[0].receivedAt) : "—";
    list.querySelectorAll(".local-result-card-v27").forEach((card) => {
      const resultId = card.dataset.resultId;
      card.querySelector(".local-result-view-v27")?.addEventListener("click", () => send({ type: "get_local_result", resultId }));
      card.querySelector(".local-result-delete-v27")?.addEventListener("click", () => {
        if (confirm("Delete this received local result from the server inbox? The original PC may still retain its local copy.")) send({ type: "delete_local_result", resultId });
      });
    });
  }

  function downloadSummaryCsv() {
    const header = ["received_at", "device_label", "pc_label", "students", "score", "accuracy_percent", "attempts", "correct", "wrong", "timeouts", "kills", "deaths", "territory", "room_code", "channel_number", "result_id"];
    const rows = results.map((row) => [
      new Date(Number(row.receivedAt) || 0).toISOString(), row.deviceLabel, row.pcLabel,
      Array.isArray(row.students) ? row.students.join(" | ") : "", row.score ?? "",
      row.accuracy == null ? "" : Math.round(Number(row.accuracy) * 10000) / 100,
      row.attempts, row.correct, row.wrong, row.timeouts, row.kills, row.deaths, row.territory,
      row.roomCode, row.channelNumber, row.resultId
    ]);
    download([header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n"), `triad-local-results-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8");
  }

  function showDetail(result) {
    selectedDetail = result;
    const report = result?.report || {};
    const real = (Array.isArray(report.players) ? report.players : []).find((player) => !player?.isBot) || {};
    const students = Array.isArray(report.individualStudents) ? report.individualStudents : (Array.isArray(real.individualStudents) ? real.individualStudents : []);
    const title = document.getElementById("localResultDialogTitleV27");
    const body = document.getElementById("localResultDialogBodyV27");
    if (title) title.textContent = `${result.deviceLabel || real.pcLabel || "Local PC"} · ${formatDate(result.receivedAt)}`;
    if (body) body.innerHTML = `
      <div class="local-result-detail-grid-v27">
        <div><span>ROOM</span><strong>${escapeHtml(report.roomCode || "—")}</strong></div>
        <div><span>PC</span><strong>${escapeHtml(real.pcLabel || result.deviceLabel || "Local PC")}</strong></div>
        <div><span>KILLS</span><strong>${Number(real.kills) || 0}</strong></div>
        <div><span>DEATHS</span><strong>${Number(real.deaths) || 0}</strong></div>
        <div><span>TERRITORY</span><strong>${Number(real.territory) || 0}</strong></div>
        <div><span>APP</span><strong>${escapeHtml(result.appVersion || result.appBuild || "—")}</strong></div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Student</th><th>Assigned deaths</th><th>Attempts</th><th>Correct</th><th>Wrong</th><th>Timeouts</th><th>Accuracy</th><th>Avg. response</th></tr></thead><tbody>${students.map((row, index) => `<tr><td>${escapeHtml(row.studentName || `Student ${index + 1}`)}</td><td>${Number(row.assignedDeaths) || 0}</td><td>${Number(row.attempts) || 0}</td><td>${Number(row.correct) || 0}</td><td>${Number(row.wrong) || 0}</td><td>${Number(row.timeouts) || 0}</td><td>${percentage(row.accuracy)}</td><td>${row.averageResponseMs == null ? "—" : `${Math.round(Number(row.averageResponseMs))} ms`}</td></tr>`).join("")}</tbody></table></div>`;
    const dialog = document.getElementById("localResultDialogV27");
    if (typeof dialog?.showModal === "function") dialog.showModal();
  }

  function handleMessage(message) {
    if (!message || typeof message !== "object") return;
    if (message.type === "controller_joined") {
      setTimeout(requestList, 350);
      return;
    }
    if (message.type === "local_results") {
      results = Array.isArray(message.results) ? message.results : [];
      ingestEnabled = Boolean(message.ingestEnabled);
      render();
      setStatus(ingestEnabled
        ? `${results.length} local result(s) loaded. New reports appear here automatically.`
        : "Result inbox is visible, but REPORT_INGEST_KEY is not configured on the server.", !ingestEnabled);
      return;
    }
    if (message.type === "local_result_available" && message.summary) {
      const id = String(message.summary.resultId || "");
      results = [message.summary, ...results.filter((row) => String(row.resultId) !== id)].sort((a, b) => Number(b.receivedAt) - Number(a.receivedAt));
      render();
      setStatus(`New local result received from ${message.summary.deviceLabel || message.summary.pcLabel || "a classroom PC"}.`);
      return;
    }
    if (message.type === "local_result_detail" && message.result) {
      showDetail(message.result);
      return;
    }
    if (message.type === "local_result_deleted") {
      results = Array.isArray(message.results) ? message.results : results.filter((row) => String(row.resultId) !== String(message.resultId));
      render();
      setStatus("Local result deleted from the server inbox.");
    }
  }

  function observe(socket) {
    if (!socket || observed.has(socket)) return;
    observed.add(socket);
    activeSocket = socket;
    socket.addEventListener("message", (event) => handleMessage(parse(event.data)));
    socket.addEventListener("open", () => { activeSocket = socket; });
    socket.addEventListener("close", () => { if (activeSocket === socket) activeSocket = null; });
  }

  WebSocket.prototype.send = function localResultMasterSend(payload) {
    observe(this);
    return nativeSend.call(this, payload);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensureSection, { once: true });
  else ensureSection();

  window.__triadMasterLocalResultsV27 = Object.freeze({ build: BUILD, requestList });
})();
