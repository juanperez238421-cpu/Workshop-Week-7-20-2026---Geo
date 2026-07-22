"use strict";

const crypto = require("node:crypto");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

const DEFAULT_TEACHER_PASSWORD = "9109";
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

function teacherPassword() {
  return String(process.env.TEACHER_PASSWORD || DEFAULT_TEACHER_PASSWORD).trim();
}

function isTeacherPasswordValid(candidate, expected = teacherPassword()) {
  const supplied = Buffer.from(String(candidate || ""), "utf8");
  const required = Buffer.from(String(expected || ""), "utf8");
  return supplied.length === required.length && supplied.length > 0 && crypto.timingSafeEqual(supplied, required);
}

function isProtectedTeacherMessage(type) {
  return PROTECTED_TEACHER_MESSAGES.has(String(type || ""));
}

function parseAllowedOrigins(raw) {
  return String(raw || "*").split(",").map((value) => value.trim()).filter(Boolean);
}

function originAllowed(origin, allowedOrigins) {
  return allowedOrigins.includes("*") || Boolean(origin && allowedOrigins.includes(origin));
}

function sendJson(ws, payload) {
  if (ws?.readyState === 1) ws.send(JSON.stringify(payload));
}

function startGateway() {
  const { WebSocketServer, WebSocket } = require("ws");
  const port = Number(process.env.PORT || 8080);
  const enginePort = Number(process.env.ENGINE_PORT || port + 1);
  const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS || "*");
  const expectedPassword = teacherPassword();
  let shuttingDown = false;
  let engine = null;

  function spawnEngine() {
    engine = spawn(process.execPath, [path.join(__dirname, "server-v3.js")], {
      cwd: __dirname,
      env: { ...process.env, PORT: String(enginePort), ALLOWED_ORIGINS: "*" },
      stdio: ["ignore", "inherit", "inherit"]
    });
    engine.on("exit", (code, signal) => {
      if (shuttingDown) return;
      console.error(`Game engine exited (${code ?? signal ?? "unknown"}); restarting.`);
      setTimeout(spawnEngine, 1000).unref();
    });
  }

  spawnEngine();

  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-content-type-options", "nosniff");
    if (req.url === "/" || req.url === "/health") {
      res.writeHead(200);
      res.end(JSON.stringify({
        service: "Triad Territory Rush secure gateway",
        status: "ok",
        protocol: 3,
        gatewayProtocol: 1,
        teacherAuthRequired: true,
        architecture: "separate-student-teacher-pages-with-server-side-pin"
      }));
      return;
    }
    res.writeHead(404);
    res.end(JSON.stringify({ status: "not_found" }));
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 });

  server.on("upgrade", (req, socket, head) => {
    if (!originAllowed(req.headers.origin, allowedOrigins)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", (client) => {
    client.teacherAuthenticated = false;
    client.teacherAuthFailures = 0;
    client.pendingEngineMessages = [];
    client.engineSocket = null;
    client.engineConnected = false;
    client.closedByGateway = false;

    function closePair(code = 1000, reason = "Connection closed") {
      if (client.closedByGateway) return;
      client.closedByGateway = true;
      try { client.engineSocket?.close(code, reason); } catch {}
      try { client.close(code, reason); } catch {}
    }

    function connectEngine(attempt = 0) {
      if (client.readyState !== WebSocket.OPEN || client.closedByGateway) return;
      const engineSocket = new WebSocket(`ws://127.0.0.1:${enginePort}`);
      let opened = false;
      client.engineSocket = engineSocket;

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
          if (message.type === "hello") {
            payload = JSON.stringify({ ...message, teacherAuthRequired: true, gatewayProtocol: 1 });
          }
        } catch {}
        client.send(payload);
      });

      engineSocket.on("error", () => {
        if (client.engineSocket !== engineSocket || opened || client.closedByGateway) return;
        if (attempt < 20) {
          setTimeout(() => connectEngine(attempt + 1), 250).unref();
          return;
        }
        sendJson(client, { type: "error", message: "The game engine is still starting. Reload in a few seconds." });
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
        sendJson(client, { type: "error", message: "Invalid JSON message." });
        return;
      }

      if (message.type === "authenticate_teacher") {
        if (isTeacherPasswordValid(message.password, expectedPassword)) {
          client.teacherAuthenticated = true;
          client.teacherAuthFailures = 0;
          sendJson(client, { type: "teacher_authenticated", gatewayProtocol: 1 });
          return;
        }
        client.teacherAuthenticated = false;
        client.teacherAuthFailures += 1;
        sendJson(client, { type: "teacher_auth_failed", message: "Incorrect teacher password." });
        if (client.teacherAuthFailures >= 5) closePair(1008, "Too many teacher authentication failures");
        return;
      }

      if (isProtectedTeacherMessage(message.type) && !client.teacherAuthenticated) {
        sendJson(client, { type: "error", message: "Teacher authentication required." });
        return;
      }

      const payload = raw.toString();
      if (client.engineConnected && client.engineSocket?.readyState === WebSocket.OPEN) client.engineSocket.send(payload);
      else client.pendingEngineMessages.push(payload);
    });

    client.on("close", () => {
      if (client.closedByGateway) return;
      client.closedByGateway = true;
      try { client.engineSocket?.close(1000, "Browser disconnected"); } catch {}
    });

    client.on("error", () => {});
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`Triad secure gateway listening on port ${port}; engine on ${enginePort}.`);
  });

  function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const client of wss.clients) {
      try { client.close(1001, "Server shutting down"); } catch {}
    }
    try { engine?.kill("SIGTERM"); } catch {}
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  return { server, wss, engine };
}

if (require.main === module) startGateway();

module.exports = {
  DEFAULT_TEACHER_PASSWORD,
  PROTECTED_TEACHER_MESSAGES,
  isTeacherPasswordValid,
  isProtectedTeacherMessage,
  originAllowed,
  parseAllowedOrigins,
  startGateway
};
