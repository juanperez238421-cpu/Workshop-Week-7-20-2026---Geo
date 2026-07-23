"use strict";

const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const baseRuntime = require("./runtime-v10.js");

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Triad v11 patch could not find: ${label}`);
  return source.replace(search, replacement);
}

function replacePattern(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`Triad v11 patch could not find: ${label}`);
  return source.replace(pattern, replacement);
}

function patchGatewaySource(input) {
  let source = baseRuntime.patchGatewaySource(input);

  source = replaceRequired(
    source,
    'wss.on("connection", (client) => {\n  try { client._socket?.setNoDelay(true); } catch {}\n  client.authFailures = 0;',
    `wss.on("connection", (client) => {
  try { client._socket?.setNoDelay(true); client._socket?.setKeepAlive(true, 15000); } catch {}
  client.isAlive = true;
  client.stateFrameSending = false;
  client.latestStateFrame = null;
  client.latestStateIsFull = false;
  client.on("pong", () => { client.isAlive = true; });
  client.authFailures = 0;`,
    "gateway connection health state"
  );

  source = replaceRequired(
    source,
    "  function connectEngine(attempt = 0) {",
    `  function forwardToBrowser(payload, isState = false) {
    if (client.readyState !== WebSocket.OPEN || client.closedByGateway) return;
    const text = typeof payload === "string" ? payload : payload.toString();
    const isFullState = isState && text.includes('"territory":[');
    if (isState && (client.stateFrameSending || client.bufferedAmount > 64 * 1024)) {
      if (client.latestStateIsFull && !isFullState) return;
      client.latestStateFrame = text;
      client.latestStateIsFull = isFullState;
      return;
    }
    if (!isState) {
      try { client.send(text, { binary: false, compress: false }); } catch {}
      return;
    }
    client.stateFrameSending = true;
    try {
      client.send(text, { binary: false, compress: false }, () => {
        client.stateFrameSending = false;
        const latest = client.latestStateFrame;
        const latestIsFull = client.latestStateIsFull;
        client.latestStateFrame = null;
        client.latestStateIsFull = false;
        if (latest && client.readyState === WebSocket.OPEN) {
          if (client.bufferedAmount > 96 * 1024) {
            client.latestStateFrame = latest;
            client.latestStateIsFull = latestIsFull;
            return;
          }
          setTimeout(() => forwardToBrowser(latest, true), 0);
        }
      });
    } catch {
      client.stateFrameSending = false;
    }
  }

  function connectEngine(attempt = 0) {`,
    "gateway latest-state coalescer"
  );

  source = replaceRequired(
    source,
    "      opened = true;\n      try { engineSocket._socket?.setNoDelay(true); } catch {}\n      client.engineConnected = true;",
    "      opened = true;\n      try { engineSocket._socket?.setNoDelay(true); engineSocket._socket?.setKeepAlive(true, 15000); } catch {}\n      client.engineConnected = true;",
    "engine socket keepalive"
  );

  source = replacePattern(
    source,
    /    engineSocket\.on\("message", \(raw\) => \{[\s\S]*?\n    \}\);\n\n    engineSocket\.on\("error"/,
    `    engineSocket.on("message", (raw) => {
      if (client.engineSocket !== engineSocket || client.readyState !== WebSocket.OPEN) return;
      let payload = raw.toString();
      const isState = payload.startsWith('{"type":"state"');
      if (payload.startsWith('{"type":"hello"')) {
        try { payload = JSON.stringify({ ...JSON.parse(payload), teacherAuthRequired: true, gatewayProtocol: 2 }); } catch {}
      }
      forwardToBrowser(payload, isState);
    });

    engineSocket.on("error"`,
    "gateway zero-parse state forwarding"
  );

  source = replacePattern(
    source,
    /  client\.on\("message", \(raw\) => \{[\s\S]*?\n  \}\);\n\n  client\.on\("close"/,
    `  client.on("message", (raw) => {
    const payload = raw.toString();
    const type = payload.match(/"type"\\s*:\\s*"([^"]+)"/)?.[1] || "";

    if (type === "authenticate_teacher") {
      let message;
      try { message = JSON.parse(payload); } catch { safeSend(client, { type: "error", message: "Invalid JSON message." }); return; }
      if (passwordMatches(message.password)) {
        client.authFailures = 0;
        const teacherAuthToken = issueTeacherToken();
        safeSend(client, { type: "teacher_authenticated", teacherAuthToken, expiresAt: Date.now() + TOKEN_TTL_MS });
      } else {
        client.authFailures += 1;
        safeSend(client, { type: "teacher_auth_failed", message: "Incorrect teacher password." });
        if (client.authFailures >= 5) closePair(1008, "Too many teacher authentication failures");
      }
      return;
    }

    let outgoing = payload;
    if (protectedTeacherMessage(type)) {
      let message;
      try { message = JSON.parse(payload); } catch { safeSend(client, { type: "error", message: "Invalid JSON message." }); return; }
      if (!teacherTokenValid(message.teacherAuthToken)) {
        safeSend(client, { type: "error", message: "Teacher authentication required or expired." });
        return;
      }
      delete message.teacherAuthToken;
      outgoing = JSON.stringify(message);
    }

    if (client.engineConnected && client.engineSocket?.readyState === WebSocket.OPEN) {
      try { client.engineSocket.send(outgoing, { compress: false }); } catch {}
    } else if (client.pendingEngineMessages.length < 48) {
      client.pendingEngineMessages.push(outgoing);
    }
  });

  client.on("close"`,
    "gateway fast-path input forwarding"
  );

  source = replaceRequired(
    source,
    "const tokenCleanup = setInterval(() => {",
    `const connectionHeartbeat = setInterval(() => {
  for (const client of wss.clients) {
    if (!client.isAlive) { try { client.terminate(); } catch {} continue; }
    client.isAlive = false;
    try { client.ping(); } catch {}
  }
}, 15_000);
connectionHeartbeat.unref();

const tokenCleanup = setInterval(() => {`,
    "gateway heartbeat"
  );

  source = replaceRequired(
    source,
    "  clearInterval(tokenCleanup);",
    "  clearInterval(tokenCleanup);\n  clearInterval(connectionHeartbeat);",
    "gateway heartbeat shutdown"
  );

  return source;
}

function patchServerSource(input) {
  let source = baseRuntime.patchServerSource(input);

  source = replaceRequired(source, "const TICK_RATE = 50;", "const TICK_RATE = 40;", "stable 40 Hz simulation");
  source = replaceRequired(source, "const STATE_RATE = 20;", "const STATE_RATE = 15;", "stable 15 Hz snapshot stream");
  source = replaceRequired(source, "const STATE_BACKPRESSURE_BYTES = 128 * 1024;", "const STATE_BACKPRESSURE_BYTES = 96 * 1024;", "lower state backpressure threshold");
  source = replaceRequired(
    source,
    "const FULL_TERRITORY_EVERY = 10;",
    `const FULL_TERRITORY_EVERY = 30;
const STATIC_META_EVERY = 75;
const MAX_PROJECTILES = 180;
const MIN_PLAYERS_TO_START = 1;`,
    "v11 stability constants"
  );

  source = replaceRequired(
    source,
    'function safeSend(ws, payload) { if (!ws || ws.readyState !== WebSocket.OPEN) return; if (payload?.type === "state" && ws.bufferedAmount > STATE_BACKPRESSURE_BYTES) return; const serialized = typeof payload === "string" ? payload : JSON.stringify(payload); ws.send(serialized, { compress: false }); }',
    `function sendSocketFrame(ws, serialized, isState = false) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const text = typeof serialized === "string" ? serialized : JSON.stringify(serialized);
  const isFullState = isState && text.includes('"territory":[');
  if (isState && (ws._triadStateSending || ws.bufferedAmount > STATE_BACKPRESSURE_BYTES)) {
    if (ws._triadLatestStateIsFull && !isFullState) return;
    ws._triadLatestState = text;
    ws._triadLatestStateIsFull = isFullState;
    return;
  }
  if (!isState) {
    try { ws.send(text, { compress: false }); } catch {}
    return;
  }
  ws._triadStateSending = true;
  try {
    ws.send(text, { compress: false }, () => {
      ws._triadStateSending = false;
      const latest = ws._triadLatestState;
      const latestIsFull = ws._triadLatestStateIsFull;
      ws._triadLatestState = null;
      ws._triadLatestStateIsFull = false;
      if (latest && ws.readyState === WebSocket.OPEN) {
        if (ws.bufferedAmount > STATE_BACKPRESSURE_BYTES * 1.5) {
          ws._triadLatestState = latest;
          ws._triadLatestStateIsFull = latestIsFull;
          return;
        }
        setTimeout(() => sendSocketFrame(ws, latest, true), 0);
      }
    });
  } catch {
    ws._triadStateSending = false;
  }
}
function safeSend(ws, payload) {
  const serialized = typeof payload === "string" ? payload : JSON.stringify(payload);
  sendSocketFrame(ws, serialized, payload?.type === "state");
}`,
    "engine state coalescer"
  );

  source = replacePattern(
    source,
    /  broadcast\(payload\) \{[^\n]+\}/,
    '  broadcast(payload) { const serialized = JSON.stringify(payload); const isState = payload?.type === "state"; for (const ws of this.allSockets()) sendSocketFrame(ws, serialized, isState); }',
    "coalesced room broadcast"
  );

  source = replacePattern(
    source,
    /  startBlockers\(\) \{[^\n]+\}/,
    `  startBlockers() {
    const blockers = [];
    if (this.players.size < MIN_PLAYERS_TO_START) blockers.push("at least one approved player is required");
    const realPlayers = [...this.players.values()].filter((player) => !player.isBot);
    const disconnected = realPlayers.filter((player) => !player.connected).length;
    const notReady = realPlayers.filter((player) => !player.ready).length;
    if (disconnected) blockers.push(disconnected + " real PC group(s) offline");
    if (notReady) blockers.push(notReady + " real PC group(s) not ready");
    if (this.pending.size) blockers.push(this.pending.size + " pending registration(s) must be approved or rejected");
    if (!this.controller?.connected) blockers.push("teacher controller offline");
    return blockers;
  }`,
    "flexible one-to-nine player start"
  );

  source = replaceRequired(
    source,
    "capacity: MAX_PLAYERS, studentsPerPc: STUDENTS_PER_PC,",
    "capacity: MAX_PLAYERS, minPlayersToStart: MIN_PLAYERS_TO_START, flexibleStart: true, studentsPerPc: STUDENTS_PER_PC,",
    "flexible lobby metadata"
  );

  source = replacePattern(
    source,
    /  fireVolley\(player, now\) \{[\s\S]*?\n  \}\n  combatIdentity/,
    `  fireVolley(player, now) {
    if (player.ammo <= 0 || this.projectiles.size >= MAX_PROJECTILES) return;
    const size = this.volleySize(player);
    const offsets = size === 1 ? [0] : size === 2 ? [-VOLLEY_SPREAD_RADIANS * 0.55, VOLLEY_SPREAD_RADIANS * 0.55] : [-VOLLEY_SPREAD_RADIANS, 0, VOLLEY_SPREAD_RADIANS];
    const available = Math.max(0, MAX_PROJECTILES - this.projectiles.size);
    const activeOffsets = offsets.slice(0, available);
    if (!activeOffsets.length) return;
    player.ammo -= 1;
    if (!Number.isFinite(player.nextAmmoRegenAt) || player.nextAmmoRegenAt <= now) player.nextAmmoRegenAt = now + AMMO_REGEN_INTERVAL_MS;
    player.nextShotAt = now + (now < player.rapidUntil ? 190 : SHOT_COOLDOWN_MS);
    for (const offset of activeOffsets) {
      const angle = player.angle + offset;
      const projectileId = id("shot");
      this.projectiles.set(projectileId, {
        id: projectileId,
        ownerId: player.id,
        team: player.team,
        x: player.x + Math.cos(angle) * (PLAYER_RADIUS + 8),
        y: player.y + Math.sin(angle) * (PLAYER_RADIUS + 8),
        vx: Math.cos(angle) * PROJECTILE_SPEED,
        vy: Math.sin(angle) * PROJECTILE_SPEED,
        expiresAt: now + PROJECTILE_LIFETIME_MS,
        volleySize: size
      });
    }
  }
  combatIdentity`,
    "bounded projectile population"
  );

  source = replacePattern(
    source,
    /  statePayload\(now\) \{[\s\S]*?\n  \}\n  broadcastState/,
    `  statePayload(now) {
    const territoryCounts = this.territoryCounts();
    const playerTerritory = this.playerTerritoryCounts();
    const sequence = ++this.stateSequence;
    const currentTerritory = Array.from(this.territory);
    const sendFullTerritory = !this.lastTerritorySent || sequence % FULL_TERRITORY_EVERY === 0;
    const includeStatic = sequence === 1 || sequence % STATIC_META_EVERY === 0;
    let territory;
    let territoryDelta;
    if (sendFullTerritory) {
      territory = currentTerritory;
      territoryDelta = [];
      this.lastTerritorySent = currentTerritory;
    } else {
      territoryDelta = [];
      for (let index = 0; index < currentTerritory.length; index += 1) {
        if (currentTerritory[index] !== this.lastTerritorySent[index]) territoryDelta.push(index, currentTerritory[index]);
      }
    }
    return {
      type: "state",
      sequence,
      roomCode: this.code,
      phase: this.phase,
      serverNow: now,
      remainingMs: this.phase === "playing" ? Math.max(0, this.endsAt - now) : MATCH_DURATION_MS,
      arena: includeStatic ? ARENA : undefined,
      cohesionRadius: includeStatic ? COHESION_RADIUS : undefined,
      maxLives: includeStatic ? MAX_LIVES : undefined,
      maxAmmo: includeStatic ? MAX_AMMO : undefined,
      hitboxes: includeStatic ? { player: PLAYER_RADIUS, projectile: PROJECTILE_RADIUS, pickup: PICKUP_RADIUS } : undefined,
      teamNames: includeStatic ? this.teamNames : undefined,
      teamColors: includeStatic ? this.teamColors : undefined,
      territory,
      territoryDelta,
      territoryCounts,
      players: [...this.players.values()].map((player) => ({
        id: player.id,
        name: player.pcLabel,
        pcLabel: player.pcLabel,
        students: player.students,
        team: player.team,
        isBot: player.isBot,
        connected: player.isBot || player.connected,
        ready: player.isBot || player.ready,
        x: Math.round(player.x * 10) / 10,
        y: Math.round(player.y * 10) / 10,
        angle: player.angle,
        alive: player.alive,
        invulnerable: now < player.invulnerableUntil,
        kills: player.kills,
        deaths: player.deaths,
        lives: player.lives,
        ammo: player.ammo,
        maxAmmo: MAX_AMMO,
        ammoRegenRemainingMs: player.ammo >= MAX_AMMO ? 0 : Math.max(0, (player.nextAmmoRegenAt || now + AMMO_REGEN_INTERVAL_MS) - now),
        activePower: player.activePower,
        powerRemainingMs: Math.max(0, Math.max(player.shieldUntil, player.speedUntil, player.rapidUntil, player.paintUntil) - now),
        territory: playerTerritory.get(player.id) || 0,
        questions: player.questionStats.attempts,
        accuracy: player.questionStats.attempts ? player.questionStats.correct / player.questionStats.attempts : null,
        shotReadyAt: player.nextShotAt,
        dashReadyAt: player.nextDashAt,
        volleySize: this.volleySize(player)
      })),
      projectiles: [...this.projectiles.values()].map((projectile) => ({
        id: projectile.id,
        team: projectile.team,
        x: Math.round(projectile.x),
        y: Math.round(projectile.y),
        vx: Math.round(projectile.vx),
        vy: Math.round(projectile.vy),
        radius: PROJECTILE_RADIUS
      })),
      pickups: [...this.pickups.values()].map((pickup) => ({ id: pickup.id, type: pickup.type, x: pickup.x, y: pickup.y, radius: PICKUP_RADIUS }))
    };
  }
  broadcastState`,
    "cumulative delta snapshot payload"
  );

  source = replaceRequired(
    source,
    "  broadcastState(now) { this.broadcast(this.statePayload(now)); }",
    `  broadcastState(now) {
    const payload = this.statePayload(now);
    const serialized = JSON.stringify(payload);
    const recipients = new Set();
    if (this.controller?.connected && this.controller.ws) recipients.add(this.controller.ws);
    for (const player of this.players.values()) if (!player.isBot && player.connected && player.ws) recipients.add(player.ws);
    for (const ws of recipients) sendSocketFrame(ws, serialized, true);
  }`,
    "active-recipient state stream"
  );

  source = replaceRequired(
    source,
    'wss.on("connection", (ws) => { ws.isAlive = true; ws.role = "unassigned";',
    'wss.on("connection", (ws) => { try { ws._socket?.setNoDelay(true); ws._socket?.setKeepAlive(true, 15000); } catch {} ws.isAlive = true; ws.role = "unassigned";',
    "engine socket keepalive"
  );
  source = replaceRequired(source, "}, 30_000);", "}, 15_000);", "engine heartbeat interval");

  return source;
}

const currentNodeOptions = String(process.env.NODE_OPTIONS || "");
if (!currentNodeOptions.includes("runtime-v11.js")) process.env.NODE_OPTIONS = `${currentNodeOptions} --require=${__filename}`.trim();

const inheritedLoader = Module._extensions[".js"];
Module._extensions[".js"] = function triadV11Loader(module, filename) {
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
