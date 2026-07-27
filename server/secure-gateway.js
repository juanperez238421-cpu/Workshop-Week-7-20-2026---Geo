"use strict";

require("./runtime-v16.js");

const crypto = require("node:crypto");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { WebSocketServer, WebSocket } = require("ws");
const { LocalResultStore } = require("./local-result-store.js");

const DEFAULT_TEACHER_PASSWORD = "9109";
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const PROTECTED_TEACHER_MESSAGES = new Set([
  "create_control_room",
  "restore_control",
  "approve_registration",
  "reject_registration",
  "move_player",
  "remove_player",
  "set_registration_lock",
  "fill_with_bots",
  "remove_bots",
  "start_match",
  "end_match",
  "reset_room"
]);
const LOCAL_RESULT_TEACHER_MESSAGES = new Set([
  "list_local_results",
  "get_local_result",
  "delete_local_result"
]);

const PORT = Number(process.env.PORT || 8080);
const ENGINE_PORT = Number(process.env.ENGINE_PORT || PORT + 1);
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || "*").split(",").map((value) => value.trim()).filter(Boolean);
const EXPECTED_PASSWORD = String(process.env.TEACHER_PASSWORD || DEFAULT_TEACHER_PASSWORD).trim();
const LOCAL_RESULTS_DIR = String(process.env.LOCAL_RESULTS_DIR || path.join(__dirname, "local-results"));
const REPORT_INGEST_KEY = String(process.env.REPORT_INGEST_KEY || "").trim();
const teacherTokens = new Map();
const authenticatedTeacherClients = new Set();
const resultStore = new LocalResultStore({ directory: LOCAL_RESULTS_DIR, ingestKey: REPORT_INGEST_KEY });
let shuttingDown = false;
let engineProcess = null;

function originAllowed(origin) {
  return ALLOWED_ORIGINS.includes("*") || Boolean(origin && ALLOWED_ORIGINS.includes(origin));
}

function safeSend(ws, payload) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function passwordMatches(candidate, expected = EXPECTED_PASSWORD) {
  const supplied = Buffer.from(String(candidate || ""), "utf8");
  const required = Buffer.from(String(expected || ""), "utf8");
  return supplied.length === required.length && supplied.length > 0 && crypto.timingSafeEqual(supplied, required);
}

function issueTeacherToken() {
  const token = crypto.randomBytes(32).toString("base64url");
  teacherTokens.set(token, Date.now() + TOKEN_TTL_MS);
  return token;
}

function teacherTokenValid(token) {
  const key = String(token || "");
  const expiresAt = teacherTokens.get(key) || 0;
  if (!expiresAt || expiresAt <= Date.now()) {
    if (key) teacherTokens.delete(key);
    return false;
  }
  return true;
}

function protectedTeacherMessage(type) {
  return PROTECTED_TEACHER_MESSAGES.has(String(type || ""));
}

function broadcastLocalResult(summary) {
  if (!summary) return;
  for (const client of authenticatedTeacherClients) {
    safeSend(client, { type: "local_result_available", summary });
  }
}

async function handleLocalResultTeacherMessage(client, message) {
  if (!teacherTokenValid(message.teacherAuthToken)) {
    safeSend(client, { type: "error", message: "Teacher authentication required or expired." });
    return;
  }
  authenticatedTeacherClients.add(client);
  try {
    if (message.type === "list_local_results") {
      const results = await resultStore.listSummaries(message.limit);
      safeSend(client, { type: "local_results", results, ingestEnabled: resultStore.enabled });
      return;
    }
    if (message.type === "get_local_result") {
      const result = await resultStore.getResult(String(message.resultId || ""));
      safeSend(client, { type: "local_result_detail", result });
      return;
    }
    if (message.type === "delete_local_result") {
      await resultStore.deleteResult(String(message.resultId || ""));
      const results = await resultStore.listSummaries(message.limit);
      safeSend(client, { type: "local_result_deleted", resultId: String(message.resultId || ""), results });
    }
  } catch (error) {
    safeSend(client, { type: "error", message: error?.code === "ENOENT" ? "Local result not found." : (error?.message || "Local result command failed.") });
  }
}

function spawnEngine() {
  engineProcess = spawn(process.execPath, [path.join(__dirname, "server-v3.js")], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(ENGINE_PORT), ALLOWED_ORIGINS: "*" },
    stdio: ["ignore", "inherit", "inherit"]
  });
  engineProcess.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`Authoritative engine exited (${code ?? signal ?? "unknown"}); restarting.`);
    setTimeout(spawnEngine, 1000).unref();
  });
}

spawnEngine();

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-content-type-options", "nosniff");

  if (req.method === "POST" && requestUrl.pathname === "/api/local-results") {
    void resultStore.ingestHttp(req, res).then(broadcastLocalResult).catch((error) => {
      if (!res.headersSent) {
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: error?.message || "Result ingestion failed." }));
      }
    });
    return;
  }

  if (req.method === "GET" && (requestUrl.pathname === "/" || requestUrl.pathname === "/health")) {
    res.writeHead(200);
    res.end(JSON.stringify({
      service: "Triad Territory Rush secure gateway",
      status: "ok",
      protocol: 3,
      gatewayProtocol: 2,
      teacherAuthRequired: true,
      localResultIngestEnabled: resultStore.enabled,
      architecture: "separate-student-teacher-pages-with-server-verified-pin"
    }));
    return;
  }
  res.writeHead(404);
  res.end(JSON.stringify({ status: "not_found" }));
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 });

server.on("upgrade", (req, socket, head) => {
  if (!originAllowed(req.headers.origin)) {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
});

wss.on("connection", (client) => {
  client.authFailures = 0;
  client.pendingEngineMessages = [];
  client.engineSocket = null;
  client.engineConnected = false;
  client.closedByGateway = false;

  function closePair(code = 1000, reason = "Connection closed") {
    if (client.closedByGateway) return;
    client.closedByGateway = true;
    authenticatedTeacherClients.delete(client);
    try { client.engineSocket?.close(code, reason); } catch {}
    try { client.close(code, reason); } catch {}
  }

  function connectEngine(attempt = 0) {
    if (client.readyState !== WebSocket.OPEN || client.closedByGateway) return;
    const engineSocket = new WebSocket(`ws://127.0.0.1:${ENGINE_PORT}`);
    client.engineSocket = engineSocket;
    let opened = false;

    engineSocket.on("open", () => {
      if (client.engineSocket !== engineSocket || client.closedByGateway) {
        try { engineSocket.close(1000, "Superseded engine connection"); } catch {}
        return;
      }
      opened = true;
      client.engineConnected = true;
      const queued = client.pendingEngineMessages.splice(0);
      queued.forEach((payload) => engineSocket.send(payload));
    });

    engineSocket.on("message", (raw) => {
      if (client.engineSocket !== engineSocket || client.readyState !== WebSocket.OPEN) return;
      let payload = raw.toString();
      try {
        const message = JSON.parse(payload);
        if (message.type === "hello") payload = JSON.stringify({ ...message, teacherAuthRequired: true, gatewayProtocol: 2, localResultIngestEnabled: resultStore.enabled });
      } catch {}
      client.send(payload);
    });

    engineSocket.on("error", () => {
      if (client.engineSocket !== engineSocket || opened || client.closedByGateway) return;
      if (attempt < 24) {
        setTimeout(() => connectEngine(attempt + 1), 250).unref();
        return;
      }
      safeSend(client, { type: "error", message: "The authoritative game engine is still starting. Retry in a few seconds." });
      closePair(1013, "Game engine unavailable");
    });

    engineSocket.on("close", () => {
      if (client.closedByGateway || client.engineSocket !== engineSocket) return;
      if (opened) closePair(1012, "Game engine restarted");
    });
  }

  connectEngine();

  client.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      safeSend(client, { type: "error", message: "Invalid JSON message." });
      return;
    }

    if (message.type === "authenticate_teacher") {
      if (passwordMatches(message.password)) {
        client.authFailures = 0;
        const teacherAuthToken = issueTeacherToken();
        authenticatedTeacherClients.add(client);
        safeSend(client, { type: "teacher_authenticated", teacherAuthToken, expiresAt: Date.now() + TOKEN_TTL_MS });
      } else {
        client.authFailures += 1;
        safeSend(client, { type: "teacher_auth_failed", message: "Incorrect teacher password." });
        if (client.authFailures >= 5) closePair(1008, "Too many teacher authentication failures");
      }
      return;
    }

    if (LOCAL_RESULT_TEACHER_MESSAGES.has(String(message.type || ""))) {
      void handleLocalResultTeacherMessage(client, message);
      return;
    }

    if (protectedTeacherMessage(message.type)) {
      if (!teacherTokenValid(message.teacherAuthToken)) {
        safeSend(client, { type: "error", message: "Teacher authentication required or expired." });
        return;
      }
      authenticatedTeacherClients.add(client);
      delete message.teacherAuthToken;
    }

    const payload = JSON.stringify(message);
    if (client.engineConnected && client.engineSocket?.readyState === WebSocket.OPEN) client.engineSocket.send(payload);
    else client.pendingEngineMessages.push(payload);
  });

  client.on("close", () => {
    authenticatedTeacherClients.delete(client);
    if (client.closedByGateway) return;
    client.closedByGateway = true;
    try { client.engineSocket?.close(1000, "Browser disconnected"); } catch {}
  });

  client.on("error", () => {});
});

const tokenCleanup = setInterval(() => {
  const now = Date.now();
  for (const [token, expiresAt] of teacherTokens) if (expiresAt <= now) teacherTokens.delete(token);
}, 15 * 60 * 1000);
tokenCleanup.unref();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Triad secure gateway listening on port ${PORT}; authoritative engine on ${ENGINE_PORT}; local result ingest ${resultStore.enabled ? "enabled" : "disabled"}.`);
});

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(tokenCleanup);
  for (const client of wss.clients) {
    try { client.close(1001, "Server shutting down"); } catch {}
  }
  try { engineProcess?.kill("SIGTERM"); } catch {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
