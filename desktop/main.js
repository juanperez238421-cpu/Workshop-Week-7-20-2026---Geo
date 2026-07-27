"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { app, BrowserWindow, dialog, ipcMain, powerSaveBlocker, safeStorage, shell } = require("electron");
const WebSocket = require("ws");

const APP_BUILD = "20260725-desktop-local27";
const DEFAULT_RESULTS_ENDPOINT = "https://triad-territory-rush-server.onrender.com/api/local-results";
const SETTINGS_FILE = "desktop-settings.json";
const DEVICE_FILE = "device-id.txt";
const DELIVERY_TIMEOUT_MS = 15000;
const OUTBOX_INTERVAL_MS = 30000;
const TEACHER_PASSWORD = "9109";

let mainWindow = null;
let gatewayProcess = null;
let controller = null;
let outboxTimer = null;
let displayBlockerId = null;
let appState = null;
let isQuitting = false;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function appDataPaths() {
  const root = app.getPath("userData");
  return {
    root,
    results: path.join(root, "results"),
    outbox: path.join(root, "outbox"),
    logs: path.join(root, "logs"),
    settings: path.join(root, SETTINGS_FILE),
    device: path.join(root, DEVICE_FILE)
  };
}

function ensureDirectories() {
  const paths = appDataPaths();
  for (const directory of [paths.root, paths.results, paths.outbox, paths.logs]) fs.mkdirSync(directory, { recursive: true });
  return paths;
}

function atomicWriteJson(target, value) {
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, target);
}

function readJson(target, fallback = null) {
  try { return JSON.parse(fs.readFileSync(target, "utf8")); } catch { return fallback; }
}

function portableConfigPath() {
  return path.join(path.dirname(process.execPath), "triad-local-config.json");
}

function readPortableConfig() {
  return readJson(portableConfigPath(), {}) || {};
}

function encryptSecret(value) {
  const text = String(value || "");
  if (!text) return "";
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows secure storage is unavailable; the delivery key was not saved.");
  return safeStorage.encryptString(text).toString("base64");
}

function decryptSecret(value) {
  if (!value) return "";
  try {
    if (!safeStorage.isEncryptionAvailable()) return "";
    return safeStorage.decryptString(Buffer.from(String(value), "base64"));
  } catch {
    return "";
  }
}

function loadSettings() {
  const paths = ensureDirectories();
  const saved = readJson(paths.settings, {}) || {};
  const portable = readPortableConfig();
  const endpoint = String(portable.resultsEndpoint || process.env.TRIAD_RESULTS_ENDPOINT || saved.resultsEndpoint || DEFAULT_RESULTS_ENDPOINT).trim();
  const reportKey = String(portable.reportKey || process.env.TRIAD_REPORT_KEY || decryptSecret(saved.reportKeyEncrypted) || "");
  const matchMinutes = clamp(Number(portable.matchMinutes || process.env.TRIAD_MATCH_MINUTES || saved.matchMinutes || 10), 5, 20);
  const deviceLabel = String(portable.deviceLabel || saved.deviceLabel || os.hostname()).trim().slice(0, 80);
  return {
    resultsEndpoint: endpoint,
    reportKey,
    matchMinutes,
    deviceLabel,
    portable: Boolean(Object.keys(portable).length)
  };
}

function saveSettings(input) {
  const paths = ensureDirectories();
  const current = loadSettings();
  const endpoint = String(input?.resultsEndpoint ?? current.resultsEndpoint).trim();
  if (endpoint) {
    const parsed = new URL(endpoint);
    const localHttp = parsed.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !localHttp) throw new Error("The result endpoint must use HTTPS, except localhost development endpoints.");
  }
  const matchMinutes = clamp(Number(input?.matchMinutes ?? current.matchMinutes), 5, 20);
  const deviceLabel = String(input?.deviceLabel ?? current.deviceLabel).trim().slice(0, 80) || os.hostname();
  let reportKey = current.reportKey;
  if (input?.clearReportKey === true) reportKey = "";
  else if (typeof input?.reportKey === "string" && input.reportKey.trim()) reportKey = input.reportKey.trim();
  const stored = {
    resultsEndpoint: endpoint,
    reportKeyEncrypted: reportKey ? encryptSecret(reportKey) : "",
    matchMinutes,
    deviceLabel,
    updatedAt: new Date().toISOString()
  };
  atomicWriteJson(paths.settings, stored);
  if (appState) appState.settings = loadSettings();
  return publicSettings();
}

function publicSettings() {
  const settings = appState?.settings || loadSettings();
  return {
    resultsEndpoint: settings.resultsEndpoint,
    matchMinutes: settings.matchMinutes,
    deviceLabel: settings.deviceLabel,
    hasReportKey: Boolean(settings.reportKey),
    portable: settings.portable,
    restartRequiredForMatchDuration: Boolean(appState && Number(settings.matchMinutes) !== Number(appState.matchMinutes))
  };
}

function getDeviceId() {
  const paths = ensureDirectories();
  try {
    const current = fs.readFileSync(paths.device, "utf8").trim();
    if (/^[A-Za-z0-9_-]{16,96}$/.test(current)) return current;
  } catch {}
  const created = crypto.randomBytes(18).toString("base64url");
  fs.writeFileSync(paths.device, created, { encoding: "utf8", mode: 0o600 });
  return created;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => port ? resolve(port) : reject(new Error("Unable to allocate a local port.")));
    });
  });
}

function serverDirectory() {
  return app.isPackaged ? path.join(process.resourcesPath, "server") : path.join(__dirname, "..", "server");
}

function localRuntimePath() {
  return path.join(app.getAppPath(), "desktop", "runtime-local.js");
}

function waitForHealth(port, timeoutMs = 20000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get({ hostname: "127.0.0.1", port, path: "/health", timeout: 1200 }, (response) => {
        response.resume();
        if (response.statusCode === 200) resolve();
        else retry();
      });
      request.on("timeout", () => request.destroy());
      request.on("error", retry);
    };
    const retry = () => {
      if (Date.now() - startedAt >= timeoutMs) reject(new Error("The local authoritative server did not start in time."));
      else setTimeout(attempt, 250);
    };
    attempt();
  });
}

function appendLog(line) {
  try {
    const target = path.join(ensureDirectories().logs, "desktop.log");
    fs.appendFileSync(target, `[${new Date().toISOString()}] ${String(line).trim()}\n`, "utf8");
  } catch {}
}

async function startLocalGateway() {
  const gatewayPort = await getFreePort();
  const enginePort = await getFreePort();
  const gatewayPath = path.join(serverDirectory(), "secure-gateway.js");
  if (!fs.existsSync(gatewayPath)) throw new Error(`Bundled server not found: ${gatewayPath}`);

  const settings = appState.settings;
  const nodeOptions = `${String(process.env.NODE_OPTIONS || "")} --require=${JSON.stringify(localRuntimePath())}`.trim();
  const child = spawn(process.execPath, [gatewayPath], {
    cwd: serverDirectory(),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_OPTIONS: nodeOptions,
      PORT: String(gatewayPort),
      ENGINE_PORT: String(enginePort),
      ALLOWED_ORIGINS: "*",
      TEACHER_PASSWORD,
      LOCAL_RESULTS_DIR: path.join(ensureDirectories().root, "gateway-results"),
      TRIAD_MATCH_MINUTES: String(settings.matchMinutes),
      TRIAD_LOCAL_STATE_RATE: "20"
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  gatewayProcess = child;
  child.stdout?.on("data", (chunk) => appendLog(`server: ${chunk}`));
  child.stderr?.on("data", (chunk) => appendLog(`server-error: ${chunk}`));
  child.on("exit", (code, signal) => {
    appendLog(`local gateway exited code=${code} signal=${signal}`);
    gatewayProcess = null;
    if (!isQuitting && mainWindow) {
      void dialog.showMessageBox(mainWindow, {
        type: "error",
        title: "Local game server stopped",
        message: "The local authoritative engine stopped unexpectedly.",
        detail: "The application will restart to create a clean local match.",
        buttons: ["Restart"]
      }).then(() => { app.relaunch(); app.exit(1); });
    }
  });

  await waitForHealth(gatewayPort);
  appState.gatewayPort = gatewayPort;
  appState.enginePort = enginePort;
  appState.serverUrl = `ws://127.0.0.1:${gatewayPort}`;
}

function emitDeliveryStatus(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("triad:delivery-status", payload);
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function individualRows(report) {
  const direct = Array.isArray(report?.individualStudents) ? report.individualStudents : [];
  if (direct.length) return direct;
  const real = (Array.isArray(report?.players) ? report.players : []).find((player) => !player?.isBot) || null;
  if (Array.isArray(real?.individualStudents) && real.individualStudents.length) return real.individualStudents;
  return (Array.isArray(real?.students) ? real.students : []).map((studentName, studentIndex) => ({
    studentIndex,
    studentName,
    assignedDeaths: 0,
    attempts: Number(real?.attempts) || 0,
    correct: Number(real?.correct) || 0,
    wrong: Number(real?.wrong) || 0,
    timeouts: Number(real?.timeouts) || 0,
    averageResponseMs: real?.averageResponseMs ?? null,
    accuracy: real?.accuracy ?? null
  }));
}

function reportCsv(report) {
  const real = (Array.isArray(report?.players) ? report.players : []).find((player) => !player?.isBot) || {};
  const header = [
    "room_code", "channel_number", "pc_label", "student_number", "student_name", "assigned_deaths",
    "attempts", "correct", "wrong", "timeouts", "accuracy_percent", "average_response_ms",
    "shared_kills", "shared_deaths", "shared_territory", "group_score", "team_rank"
  ];
  const rows = individualRows(report).map((row, index) => [
    report?.roomCode || "", report?.channelNumber || "", real?.pcLabel || "Local PC", Number(row?.studentIndex ?? index) + 1,
    row?.studentName || `Student ${index + 1}`, Number(row?.assignedDeaths) || 0, Number(row?.attempts) || 0,
    Number(row?.correct) || 0, Number(row?.wrong) || 0, Number(row?.timeouts) || 0,
    row?.accuracy == null ? "" : Math.round(Number(row.accuracy) * 10000) / 100,
    row?.averageResponseMs ?? "", Number(real?.kills) || 0, Number(real?.deaths) || 0,
    Number(real?.territory) || 0, Number(real?.groupScore) || "", Number(real?.teamRank) || ""
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function reportIdentity(report) {
  const real = (Array.isArray(report?.players) ? report.players : []).find((player) => !player?.isBot) || {};
  return crypto.createHash("sha256").update(JSON.stringify({
    deviceId: appState.deviceId,
    roomCode: report?.roomCode,
    channelNumber: report?.channelNumber,
    endedAt: report?.endedAt,
    students: real?.students
  })).digest("base64url").slice(0, 32);
}

function httpJsonRequest(endpoint, key, payload) {
  const url = new URL(endpoint);
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: "POST",
      timeout: DELIVERY_TIMEOUT_MS,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-length": body.length,
        "x-triad-report-key": key,
        "user-agent": `TriadTerritoryRushLocal/${app.getVersion()}`
      }
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch {}
        if (response.statusCode >= 200 && response.statusCode < 300) resolve(data || { ok: true });
        else reject(new Error(data?.error || `Delivery server returned HTTP ${response.statusCode}.`));
      });
    });
    request.on("timeout", () => request.destroy(new Error("Result delivery timed out.")));
    request.on("error", reject);
    request.end(body);
  });
}

async function deliverPayload(payload) {
  const settings = appState.settings;
  if (!settings.resultsEndpoint || !settings.reportKey) throw new Error("Teacher result delivery is not configured.");
  return httpJsonRequest(settings.resultsEndpoint, settings.reportKey, payload);
}

async function queuePayload(payload) {
  const target = path.join(ensureDirectories().outbox, `${payload.resultId}.json`);
  atomicWriteJson(target, payload);
}

async function sendOrQueue(payload) {
  try {
    const response = await deliverPayload(payload);
    try { fs.unlinkSync(path.join(ensureDirectories().outbox, `${payload.resultId}.json`)); } catch {}
    emitDeliveryStatus({ state: "sent", resultId: payload.resultId, message: "Result sent to the teacher inbox.", response });
    return { sent: true, response };
  } catch (error) {
    await queuePayload(payload);
    emitDeliveryStatus({ state: "queued", resultId: payload.resultId, message: `${error.message} Saved locally and queued for automatic retry.` });
    return { sent: false, error: error.message };
  }
}

async function flushOutbox() {
  const directory = ensureDirectories().outbox;
  const files = fs.readdirSync(directory).filter((name) => name.endsWith(".json")).slice(0, 25);
  let sent = 0;
  for (const name of files) {
    const target = path.join(directory, name);
    const payload = readJson(target, null);
    if (!payload?.resultId) { try { fs.unlinkSync(target); } catch {} continue; }
    try {
      await deliverPayload(payload);
      fs.unlinkSync(target);
      sent += 1;
      emitDeliveryStatus({ state: "sent", resultId: payload.resultId, message: "A queued result was delivered to the teacher inbox." });
    } catch (error) {
      emitDeliveryStatus({ state: "queued", resultId: payload.resultId, message: `Queued result is waiting: ${error.message}` });
      break;
    }
  }
  return { sent, remaining: fs.readdirSync(directory).filter((name) => name.endsWith(".json")).length };
}

async function persistAndDeliverReport(report, source = "channel_ended") {
  if (!report || typeof report !== "object") return;
  const resultId = reportIdentity(report);
  if (appState.processedResults.has(resultId)) return;
  appState.processedResults.add(resultId);

  const payload = {
    schemaVersion: 1,
    resultId,
    submittedAt: Date.now(),
    appVersion: app.getVersion(),
    appBuild: APP_BUILD,
    deviceId: appState.deviceId,
    deviceLabel: appState.settings.deviceLabel,
    source,
    desktop: {
      localAuthoritativeServer: true,
      snapshotHz: 20,
      matchMinutes: appState.matchMinutes,
      platform: process.platform,
      release: os.release(),
      hostname: os.hostname()
    },
    report
  };
  const paths = ensureDirectories();
  atomicWriteJson(path.join(paths.results, `${resultId}.json`), payload);
  fs.writeFileSync(path.join(paths.results, `${resultId}.csv`), reportCsv(report), "utf8");
  emitDeliveryStatus({ state: "saved", resultId, message: "Result and questionnaire saved locally." });
  await sendOrQueue(payload);
}

class LocalTeacherController {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.token = "";
    this.roomCode = "";
    this.approving = new Set();
    this.starting = new Set();
    this.readyPromise = null;
  }

  send(message, protectedMessage = false) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    const payload = protectedMessage && this.token ? { ...message, teacherAuthToken: this.token } : message;
    this.socket.send(JSON.stringify(payload));
    return true;
  }

  connect() {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      const timer = setTimeout(() => reject(new Error("Local teacher controller connection timed out.")), 15000);
      socket.on("open", () => this.send({ type: "authenticate_teacher", password: TEACHER_PASSWORD }));
      socket.on("message", (raw) => {
        let message;
        try { message = JSON.parse(raw.toString()); } catch { return; }
        if (message.type === "teacher_authenticated") {
          this.token = String(message.teacherAuthToken || "");
          this.send({ type: "create_control_room" }, true);
          return;
        }
        if (message.type === "controller_joined") {
          this.roomCode = String(message.roomCode || "");
          clearTimeout(timer);
          resolve(this.roomCode);
          return;
        }
        this.handleMessage(message);
      });
      socket.on("error", (error) => reject(error));
      socket.on("close", () => {
        if (!isQuitting) appendLog("local teacher controller disconnected");
      });
    });
    return this.readyPromise;
  }

  handleMessage(message) {
    if (message.type === "lobby") {
      for (const pending of Array.isArray(message.pending) ? message.pending : []) {
        const id = String(pending.id || "");
        if (!id || this.approving.has(id)) continue;
        this.approving.add(id);
        this.send({ type: "approve_registration", registrationId: id, team: 0 }, true);
      }
      for (const channel of Array.isArray(message.channels) ? message.channels : []) {
        const number = Number(channel.channelNumber);
        if (!number || channel.phase !== "lobby" || !channel.connected || this.starting.has(number)) continue;
        this.starting.add(number);
        setTimeout(() => this.send({ type: "start_channel", channelNumber: number }, true), 650);
      }
      return;
    }
    if (message.type === "channel_created") {
      const number = Number(message.channelNumber);
      if (number && !this.starting.has(number)) {
        this.starting.add(number);
        setTimeout(() => this.send({ type: "start_channel", channelNumber: number }, true), 650);
      }
      return;
    }
    if (message.type === "channel_ended" && message.report) {
      void persistAndDeliverReport(message.report, "channel_ended");
      return;
    }
    if (message.type === "match_ended" && message.report) {
      const channels = Array.isArray(message.report.channels) ? message.report.channels : [];
      if (channels.length) channels.forEach((channel) => channel?.report && void persistAndDeliverReport(channel.report, "aggregate_match_ended"));
      else void persistAndDeliverReport(message.report, "match_ended");
      return;
    }
    if (message.type === "error") appendLog(`controller error: ${message.message || "unknown"}`);
  }

  close() {
    try { this.socket?.close(1000, "Desktop application closing"); } catch {}
  }
}

function splashHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{height:100%;margin:0;font-family:Segoe UI,Arial,sans-serif;background:#f4f7fb;color:#172033}body{display:grid;place-items:center}.card{width:min(620px,80vw);padding:42px;border:1px solid #d9e2ef;border-radius:24px;background:white;box-shadow:0 20px 60px rgba(27,49,84,.14);text-align:center}.mark{font-weight:900;letter-spacing:.14em;color:#1f5fbf}.pulse{width:52px;height:52px;margin:28px auto;border:6px solid #d9e2ef;border-top-color:#1f5fbf;border-radius:50%;animation:s 1s linear infinite}@keyframes s{to{transform:rotate(360deg)}}small{color:#667085}</style></head><body><div class="card"><div class="mark">TRIAD TERRITORY RUSH LOCAL</div><h1>Starting the authoritative game engine</h1><div class="pulse"></div><small>The match runs on this PC. Internet is used only to send the final result when configured.</small></div></body></html>`;
}

function createWindow() {
  const preload = path.join(app.getAppPath(), "desktop", "preload.js");
  const window = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    backgroundColor: "#f4f7fb",
    autoHideMenuBar: true,
    icon: path.join(app.getAppPath(), "desktop", "assets", "icon.png"),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  });
  window.setMenuBarVisibility(false);
  window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml())}`);
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => { mainWindow = null; });
  window.webContents.on("render-process-gone", (_event, details) => {
    appendLog(`renderer gone: ${JSON.stringify(details)}`);
    if (!isQuitting) { app.relaunch(); app.exit(1); }
  });
  return window;
}

async function loadGameWindow(roomCode) {
  const indexPath = path.join(app.getAppPath(), "index.html");
  await mainWindow.loadFile(indexPath, {
    query: {
      room: roomCode,
      server: appState.serverUrl,
      desktop: "1",
      build: APP_BUILD
    }
  });
}

function installIpc() {
  ipcMain.handle("triad:get-desktop-info", () => ({
    build: APP_BUILD,
    version: app.getVersion(),
    roomCode: controller?.roomCode || "",
    serverUrl: appState?.serverUrl || "",
    resultsFolder: appDataPaths().results,
    outboxCount: fs.readdirSync(ensureDirectories().outbox).filter((name) => name.endsWith(".json")).length,
    settings: publicSettings()
  }));
  ipcMain.handle("triad:get-settings", () => publicSettings());
  ipcMain.handle("triad:save-settings", (_event, input) => saveSettings(input));
  ipcMain.handle("triad:test-delivery", async () => {
    const payload = { test: true, schemaVersion: 1, resultId: `test-${crypto.randomBytes(8).toString("hex")}`, submittedAt: Date.now(), appVersion: app.getVersion(), deviceId: appState.deviceId, deviceLabel: appState.settings.deviceLabel };
    const response = await deliverPayload(payload);
    emitDeliveryStatus({ state: "sent", resultId: payload.resultId, message: "Teacher delivery connection verified." });
    return response;
  });
  ipcMain.handle("triad:retry-outbox", () => flushOutbox());
  ipcMain.handle("triad:open-results-folder", async () => shell.openPath(ensureDirectories().results));
  ipcMain.handle("triad:restart-app", () => { app.relaunch(); app.exit(0); });
}

async function startApplication() {
  appState = {
    settings: loadSettings(),
    matchMinutes: 10,
    deviceId: getDeviceId(),
    processedResults: new Set(),
    gatewayPort: 0,
    enginePort: 0,
    serverUrl: ""
  };
  appState.matchMinutes = appState.settings.matchMinutes;
  ensureDirectories();
  installIpc();
  mainWindow = createWindow();
  displayBlockerId = powerSaveBlocker.start("prevent-display-sleep");
  await startLocalGateway();
  controller = new LocalTeacherController(appState.serverUrl);
  const roomCode = await controller.connect();
  await loadGameWindow(roomCode);
  outboxTimer = setInterval(() => { void flushOutbox(); }, OUTBOX_INTERVAL_MS);
  outboxTimer.unref?.();
  setTimeout(() => { void flushOutbox(); }, 2500);
}

function cleanup() {
  isQuitting = true;
  if (outboxTimer) clearInterval(outboxTimer);
  controller?.close();
  if (gatewayProcess) {
    try { gatewayProcess.kill("SIGTERM"); } catch {}
    gatewayProcess = null;
  }
  if (displayBlockerId != null && powerSaveBlocker.isStarted(displayBlockerId)) powerSaveBlocker.stop(displayBlockerId);
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();
else {
  app.on("second-instance", () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });
  app.whenReady().then(startApplication).catch(async (error) => {
    appendLog(`startup failure: ${error?.stack || error}`);
    await dialog.showErrorBox("Triad Territory Rush could not start", error?.message || String(error));
    app.quit();
  });
  app.on("before-quit", cleanup);
  app.on("window-all-closed", () => app.quit());
}
