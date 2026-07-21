"use strict";

const crypto = require("node:crypto");
const http = require("node:http");
const express = require("express");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT || 8080);
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const MATCH_DURATION_MS = 5 * 60 * 1000;
const QUESTION_DURATION_MS = 20 * 1000;
const RECONNECT_GRACE_MS = 60 * 1000;
const ROOM_IDLE_TTL_MS = 30 * 60 * 1000;
const TICK_RATE = 20;
const STATE_RATE = 10;
const DT = 1 / TICK_RATE;
const ARENA = Object.freeze({ width: 1600, height: 1000, gridWidth: 40, gridHeight: 25 });
const CELL_W = ARENA.width / ARENA.gridWidth;
const CELL_H = ARENA.height / ARENA.gridHeight;
const MAX_PLAYERS = 9;
const PLAYERS_PER_TEAM = 3;
const PLAYER_RADIUS = 16;
const PLAYER_SPEED = 230;
const DASH_SPEED = 610;
const DASH_DURATION_MS = 180;
const DASH_COOLDOWN_MS = 3200;
const SHOT_COOLDOWN_MS = 380;
const PROJECTILE_SPEED = 760;
const PROJECTILE_LIFETIME_MS = 1400;
const TEAM_NAMES = ["Cyan Circuit", "Magenta Pulse", "Amber Forge"];

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));
app.get("/", (_req, res) => res.json({
  service: "Triad Territory Rush authoritative server",
  status: "ok",
  rooms: rooms.size,
  protocol: 1
}));
app.get("/health", (_req, res) => res.json({ status: "ok", uptimeSeconds: Math.floor(process.uptime()) }));

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
const rooms = new Map();

server.on("upgrade", (req, socket, head) => {
  if (!originAllowed(req.headers.origin)) {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

function originAllowed(origin) {
  if (ALLOWED_ORIGINS.includes("*")) return true;
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

function id(prefix = "id") {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function roomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let code = "";
    for (let i = 0; i < 6; i += 1) code += alphabet[crypto.randomInt(alphabet.length)];
    if (!rooms.has(code)) return code;
  }
  throw new Error("Unable to allocate room code");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sanitizeName(value) {
  return String(value || "Student")
    .replace(/[<>\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18) || "Student";
}

function safeSend(ws, payload) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function teamSpawn(team, slot = 0) {
  const bases = [
    { x: 180, y: 180 },
    { x: ARENA.width - 180, y: 180 },
    { x: ARENA.width / 2, y: ARENA.height - 170 }
  ];
  const angle = (Math.PI * 2 * slot) / 3 + Math.random() * 0.4;
  return {
    x: clamp(bases[team].x + Math.cos(angle) * 70, 50, ARENA.width - 50),
    y: clamp(bases[team].y + Math.sin(angle) * 70, 50, ARENA.height - 50)
  };
}

function shuffled(values) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function numericOptions(correct, spread = 5, decimals = 1) {
  const values = new Set([Number(correct.toFixed(decimals))]);
  while (values.size < 4) {
    const direction = crypto.randomInt(2) ? 1 : -1;
    const delta = (crypto.randomInt(1, 5) * spread) / 4;
    values.add(Number(Math.max(0.1, correct + direction * delta).toFixed(decimals)));
  }
  const options = shuffled([...values]);
  return { options: options.map((value) => String(value)), answerIndex: options.indexOf(Number(correct.toFixed(decimals))) };
}

function createQuestion() {
  const type = ["sin", "cos", "tan", "pythagoras"][crypto.randomInt(4)];
  let prompt;
  let diagram;
  let correct;
  const units = "units";

  if (type === "pythagoras") {
    const triples = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25]];
    const [a, b, c] = triples[crypto.randomInt(triples.length)];
    const askHypotenuse = crypto.randomInt(2) === 0;
    if (askHypotenuse) {
      prompt = `A right triangle has legs ${a} and ${b}. What is its hypotenuse?`;
      correct = c;
      diagram = { type, adjacent: a, opposite: b, hypotenuse: "?", angle: null };
    } else {
      prompt = `A right triangle has hypotenuse ${c} and one leg ${a}. What is the other leg?`;
      correct = b;
      diagram = { type, adjacent: a, opposite: "?", hypotenuse: c, angle: null };
    }
  } else {
    const angles = [30, 35, 40, 45, 50, 60];
    const angle = angles[crypto.randomInt(angles.length)];
    const radians = (angle * Math.PI) / 180;
    if (type === "sin") {
      const hypotenuse = [10, 12, 15, 18, 20][crypto.randomInt(5)];
      correct = hypotenuse * Math.sin(radians);
      prompt = `In a right triangle, θ = ${angle}° and the hypotenuse is ${hypotenuse}. Find the opposite side using sin(θ).`;
      diagram = { type, angle, adjacent: null, opposite: "?", hypotenuse };
    } else if (type === "cos") {
      const hypotenuse = [10, 12, 15, 18, 20][crypto.randomInt(5)];
      correct = hypotenuse * Math.cos(radians);
      prompt = `In a right triangle, θ = ${angle}° and the hypotenuse is ${hypotenuse}. Find the adjacent side using cos(θ).`;
      diagram = { type, angle, adjacent: "?", opposite: null, hypotenuse };
    } else {
      const adjacent = [6, 8, 10, 12, 15][crypto.randomInt(5)];
      correct = adjacent * Math.tan(radians);
      prompt = `In a right triangle, θ = ${angle}° and the adjacent side is ${adjacent}. Find the opposite side using tan(θ).`;
      diagram = { type, angle, adjacent, opposite: "?", hypotenuse: null };
    }
  }

  const { options, answerIndex } = numericOptions(correct, Math.max(2, correct * 0.18), 1);
  return {
    id: id("q"),
    type,
    prompt,
    options: options.map((value) => `${value} ${units}`),
    answerIndex,
    diagram,
    createdAt: Date.now(),
    expiresAt: Date.now() + QUESTION_DURATION_MS
  };
}

class Room {
  constructor(code) {
    this.code = code;
    this.phase = "lobby";
    this.hostPlayerId = null;
    this.players = new Map();
    this.projectiles = new Map();
    this.territory = new Int8Array(ARENA.gridWidth * ARENA.gridHeight).fill(-1);
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
    this.startedAt = null;
    this.endsAt = null;
    this.lastStateAt = 0;
    this.tickHandle = setInterval(() => this.tick(), 1000 / TICK_RATE);
  }

  destroy() {
    clearInterval(this.tickHandle);
    rooms.delete(this.code);
  }

  teamCounts(connectedOnly = false) {
    const counts = [0, 0, 0];
    for (const player of this.players.values()) {
      if (!connectedOnly || player.connected) counts[player.team] += 1;
    }
    return counts;
  }

  connectedPlayers() {
    return [...this.players.values()].filter((player) => player.connected);
  }

  addPlayer(ws, message) {
    if (this.phase !== "lobby") throw new Error("This match has already started.");
    if (this.players.size >= MAX_PLAYERS) throw new Error("This room already has 9 players.");

    const requestedTeam = Number(message.team);
    if (![0, 1, 2].includes(requestedTeam)) throw new Error("Choose a valid team.");
    const counts = this.teamCounts(false);
    if (counts[requestedTeam] >= PLAYERS_PER_TEAM) throw new Error(`${TEAM_NAMES[requestedTeam]} already has 3 players.`);

    const playerId = id("p");
    const token = id("session");
    const spawn = teamSpawn(requestedTeam, counts[requestedTeam]);
    const player = {
      id: playerId,
      token,
      ws,
      name: sanitizeName(message.name),
      team: requestedTeam,
      connected: true,
      disconnectedAt: null,
      x: spawn.x,
      y: spawn.y,
      angle: 0,
      alive: true,
      invulnerableUntil: 0,
      respawnAt: 0,
      kills: 0,
      deaths: 0,
      nextShotAt: 0,
      dashUntil: 0,
      nextDashAt: 0,
      input: { dx: 0, dy: 0, angle: 0, shoot: false, dash: false },
      currentQuestion: null,
      questionStats: { attempts: 0, correct: 0, wrong: 0, timeouts: 0, totalResponseMs: 0, history: [] }
    };
    this.players.set(playerId, player);
    if (!this.hostPlayerId) this.hostPlayerId = playerId;
    ws.playerId = playerId;
    ws.roomCode = this.code;
    this.updatedAt = Date.now();
    safeSend(ws, {
      type: "joined",
      protocol: 1,
      roomCode: this.code,
      playerId,
      sessionToken: token,
      team: requestedTeam,
      host: playerId === this.hostPlayerId,
      arena: ARENA,
      matchDurationMs: MATCH_DURATION_MS
    });
    this.broadcastLobby();
  }

  reconnectPlayer(ws, message) {
    const token = String(message.sessionToken || "");
    const player = [...this.players.values()].find((candidate) => candidate.token === token);
    if (!player) throw new Error("The previous session could not be restored.");
    player.ws = ws;
    player.connected = true;
    player.disconnectedAt = null;
    ws.playerId = player.id;
    ws.roomCode = this.code;
    safeSend(ws, {
      type: "joined",
      protocol: 1,
      roomCode: this.code,
      playerId: player.id,
      sessionToken: player.token,
      team: player.team,
      host: player.id === this.hostPlayerId,
      arena: ARENA,
      matchDurationMs: MATCH_DURATION_MS,
      reconnected: true
    });
    if (player.currentQuestion) this.sendQuestion(player);
    if (this.phase === "lobby") this.broadcastLobby();
    this.broadcastEvent(`${player.name} reconnected.`);
  }

  removeConnection(playerId) {
    const player = this.players.get(playerId);
    if (!player) return;
    player.connected = false;
    player.ws = null;
    player.disconnectedAt = Date.now();
    player.input = { dx: 0, dy: 0, angle: player.angle, shoot: false, dash: false };
    this.updatedAt = Date.now();
    if (this.phase === "lobby") {
      setTimeout(() => {
        const current = this.players.get(playerId);
        if (!current || current.connected || this.phase !== "lobby") return;
        this.players.delete(playerId);
        if (this.hostPlayerId === playerId) this.hostPlayerId = this.connectedPlayers()[0]?.id || null;
        this.broadcastLobby();
      }, RECONNECT_GRACE_MS);
    }
    this.broadcastEvent(`${player.name} disconnected; reconnection is available for 60 seconds.`);
  }

  broadcast(payload) {
    for (const player of this.players.values()) safeSend(player.ws, payload);
  }

  broadcastEvent(text) {
    this.broadcast({ type: "event", text, at: Date.now() });
  }

  lobbySnapshot() {
    return {
      type: "lobby",
      roomCode: this.code,
      phase: this.phase,
      hostPlayerId: this.hostPlayerId,
      capacity: MAX_PLAYERS,
      teamCounts: this.teamCounts(true),
      players: [...this.players.values()].map((player) => ({
        id: player.id,
        name: player.name,
        team: player.team,
        connected: player.connected,
        host: player.id === this.hostPlayerId
      }))
    };
  }

  broadcastLobby() {
    this.broadcast(this.lobbySnapshot());
  }

  canStart() {
    const connected = this.connectedPlayers();
    const counts = this.teamCounts(true);
    return connected.length === MAX_PLAYERS && counts.every((count) => count === PLAYERS_PER_TEAM);
  }

  start(requestingPlayerId) {
    if (requestingPlayerId !== this.hostPlayerId) throw new Error("Only the room host can start the match.");
    if (!this.canStart()) throw new Error("The room needs exactly 9 connected players: 3 per team.");
    if (this.phase !== "lobby") throw new Error("The match is not in the lobby.");

    this.phase = "countdown";
    this.territory.fill(-1);
    this.projectiles.clear();
    for (const team of [0, 1, 2]) {
      const teamPlayers = [...this.players.values()].filter((player) => player.team === team);
      teamPlayers.forEach((player, slot) => {
        const spawn = teamSpawn(team, slot);
        Object.assign(player, {
          x: spawn.x,
          y: spawn.y,
          angle: 0,
          alive: true,
          invulnerableUntil: Date.now() + 2500,
          respawnAt: 0,
          kills: 0,
          deaths: 0,
          nextShotAt: 0,
          dashUntil: 0,
          nextDashAt: 0,
          currentQuestion: null,
          questionStats: { attempts: 0, correct: 0, wrong: 0, timeouts: 0, totalResponseMs: 0, history: [] }
        });
        this.paintTerritory(player.x, player.y, team, 2);
      });
    }
    this.broadcast({ type: "countdown", seconds: 3 });
    setTimeout(() => {
      if (this.phase !== "countdown") return;
      this.phase = "playing";
      this.startedAt = Date.now();
      this.endsAt = this.startedAt + MATCH_DURATION_MS;
      this.broadcastEvent("Match started. Largest territory after five minutes wins.");
    }, 3000);
  }

  handleInput(playerId, message) {
    if (this.phase !== "playing") return;
    const player = this.players.get(playerId);
    if (!player || !player.connected || !player.alive || player.currentQuestion) return;
    const dx = clamp(Number(message.dx) || 0, -1, 1);
    const dy = clamp(Number(message.dy) || 0, -1, 1);
    const angle = Number.isFinite(Number(message.angle)) ? Number(message.angle) : player.angle;
    player.input = { dx, dy, angle, shoot: Boolean(message.shoot), dash: Boolean(message.dash) };
  }

  handleAnswer(playerId, message) {
    if (this.phase !== "playing") return;
    const player = this.players.get(playerId);
    const question = player?.currentQuestion;
    if (!player || !question || question.id !== message.questionId) return;

    const now = Date.now();
    const selectedIndex = Number(message.selectedIndex);
    const elapsedMs = clamp(now - question.createdAt, 0, QUESTION_DURATION_MS);
    const correct = selectedIndex === question.answerIndex && now <= question.expiresAt;
    this.recordAnswer(player, question, selectedIndex, correct ? "correct" : "wrong", elapsedMs);

    if (correct) {
      player.currentQuestion = null;
      player.respawnAt = now + 900;
      safeSend(player.ws, { type: "answer_result", correct: true, respawnInMs: 900 });
    } else {
      safeSend(player.ws, { type: "answer_result", correct: false, correctIndex: question.answerIndex });
      this.assignQuestion(player, 650);
    }
  }

  recordAnswer(player, question, selectedIndex, outcome, elapsedMs) {
    const stats = player.questionStats;
    stats.attempts += 1;
    if (outcome === "correct") stats.correct += 1;
    if (outcome === "wrong") stats.wrong += 1;
    if (outcome === "timeout") stats.timeouts += 1;
    stats.totalResponseMs += elapsedMs;
    stats.history.push({
      questionId: question.id,
      type: question.type,
      prompt: question.prompt,
      options: question.options,
      selectedIndex,
      correctIndex: question.answerIndex,
      outcome,
      responseMs: elapsedMs,
      answeredAt: Date.now()
    });
  }

  assignQuestion(player, delayMs = 0) {
    player.currentQuestion = null;
    setTimeout(() => {
      if (this.phase !== "playing" || player.alive || player.respawnAt) return;
      player.currentQuestion = createQuestion();
      this.sendQuestion(player);
    }, delayMs);
  }

  sendQuestion(player) {
    const question = player.currentQuestion;
    if (!question) return;
    safeSend(player.ws, {
      type: "question",
      id: question.id,
      questionType: question.type,
      prompt: question.prompt,
      options: question.options,
      diagram: question.diagram,
      expiresAt: question.expiresAt
    });
  }

  eliminate(victim, killer) {
    if (!victim.alive || Date.now() < victim.invulnerableUntil) return;
    victim.alive = false;
    victim.deaths += 1;
    victim.respawnAt = 0;
    victim.input = { dx: 0, dy: 0, angle: victim.angle, shoot: false, dash: false };
    if (killer && killer.id !== victim.id) killer.kills += 1;
    this.broadcastEvent(`${victim.name} was eliminated${killer ? ` by ${killer.name}` : ""}. Trigonometry is required to respawn.`);
    this.assignQuestion(victim, 350);
  }

  respawn(player) {
    const teammates = [...this.players.values()].filter((candidate) => candidate.team === player.team && candidate.id !== player.id);
    const slot = crypto.randomInt(3);
    const spawn = teamSpawn(player.team, slot);
    if (teammates.length && crypto.randomInt(2)) {
      const anchor = teammates[crypto.randomInt(teammates.length)];
      spawn.x = clamp(anchor.x + crypto.randomInt(-90, 91), 40, ARENA.width - 40);
      spawn.y = clamp(anchor.y + crypto.randomInt(-90, 91), 40, ARENA.height - 40);
    }
    player.x = spawn.x;
    player.y = spawn.y;
    player.alive = true;
    player.respawnAt = 0;
    player.invulnerableUntil = Date.now() + 1800;
    this.paintTerritory(player.x, player.y, player.team, 1);
    safeSend(player.ws, { type: "respawned" });
  }

  paintTerritory(x, y, team, radius = 1) {
    const cx = Math.floor(x / CELL_W);
    const cy = Math.floor(y / CELL_H);
    for (let gy = cy - radius; gy <= cy + radius; gy += 1) {
      for (let gx = cx - radius; gx <= cx + radius; gx += 1) {
        if (gx < 0 || gx >= ARENA.gridWidth || gy < 0 || gy >= ARENA.gridHeight) continue;
        if ((gx - cx) ** 2 + (gy - cy) ** 2 > radius ** 2 + 0.6) continue;
        this.territory[gy * ARENA.gridWidth + gx] = team;
      }
    }
  }

  territoryCounts() {
    const counts = [0, 0, 0];
    for (const owner of this.territory) if (owner >= 0) counts[owner] += 1;
    return counts;
  }

  tick() {
    const now = Date.now();
    if (this.phase === "playing") {
      if (now >= this.endsAt) {
        this.endMatch();
        return;
      }
      this.updatePlayers(now);
      this.updateProjectiles(now);
      this.updateQuestionsAndRespawns(now);
    }

    if (now - this.lastStateAt >= 1000 / STATE_RATE) {
      this.lastStateAt = now;
      this.broadcastState(now);
    }

    if (this.players.size === 0 && now - this.updatedAt > ROOM_IDLE_TTL_MS) this.destroy();
  }

  updatePlayers(now) {
    for (const player of this.players.values()) {
      if (!player.connected || !player.alive || player.currentQuestion) continue;
      let { dx, dy } = player.input;
      const magnitude = Math.hypot(dx, dy);
      if (magnitude > 1) {
        dx /= magnitude;
        dy /= magnitude;
      }
      if (player.input.dash && now >= player.nextDashAt && magnitude > 0.05) {
        player.dashUntil = now + DASH_DURATION_MS;
        player.nextDashAt = now + DASH_COOLDOWN_MS;
      }
      const speed = now < player.dashUntil ? DASH_SPEED : PLAYER_SPEED;
      player.x = clamp(player.x + dx * speed * DT, PLAYER_RADIUS, ARENA.width - PLAYER_RADIUS);
      player.y = clamp(player.y + dy * speed * DT, PLAYER_RADIUS, ARENA.height - PLAYER_RADIUS);
      player.angle = player.input.angle;
      this.paintTerritory(player.x, player.y, player.team, now < player.dashUntil ? 2 : 1);

      if (player.input.shoot && now >= player.nextShotAt) {
        player.nextShotAt = now + SHOT_COOLDOWN_MS;
        const projectileId = id("shot");
        this.projectiles.set(projectileId, {
          id: projectileId,
          ownerId: player.id,
          team: player.team,
          x: player.x + Math.cos(player.angle) * (PLAYER_RADIUS + 6),
          y: player.y + Math.sin(player.angle) * (PLAYER_RADIUS + 6),
          vx: Math.cos(player.angle) * PROJECTILE_SPEED,
          vy: Math.sin(player.angle) * PROJECTILE_SPEED,
          expiresAt: now + PROJECTILE_LIFETIME_MS
        });
      }
    }
  }

  updateProjectiles(now) {
    for (const [projectileId, projectile] of this.projectiles) {
      projectile.x += projectile.vx * DT;
      projectile.y += projectile.vy * DT;
      if (now >= projectile.expiresAt || projectile.x < 0 || projectile.x > ARENA.width || projectile.y < 0 || projectile.y > ARENA.height) {
        this.projectiles.delete(projectileId);
        continue;
      }
      for (const target of this.players.values()) {
        if (!target.alive || target.team === projectile.team || now < target.invulnerableUntil) continue;
        if (Math.hypot(target.x - projectile.x, target.y - projectile.y) <= PLAYER_RADIUS + 7) {
          const killer = this.players.get(projectile.ownerId) || null;
          this.projectiles.delete(projectileId);
          this.eliminate(target, killer);
          break;
        }
      }
    }
  }

  updateQuestionsAndRespawns(now) {
    for (const player of this.players.values()) {
      if (player.connected && player.currentQuestion && now > player.currentQuestion.expiresAt) {
        const timedOut = player.currentQuestion;
        this.recordAnswer(player, timedOut, null, "timeout", QUESTION_DURATION_MS);
        safeSend(player.ws, { type: "answer_result", correct: false, timeout: true, correctIndex: timedOut.answerIndex });
        this.assignQuestion(player, 650);
      }
      if (!player.alive && player.respawnAt && now >= player.respawnAt) this.respawn(player);
    }
  }

  playerTerritoryCounts() {
    const counts = new Map([...this.players.keys()].map((playerId) => [playerId, 0]));
    const teamMembers = [0, 1, 2].map((team) => [...this.players.values()].filter((player) => player.team === team));
    const teamCounts = this.territoryCounts();
    teamMembers.forEach((members, team) => {
      if (!members.length) return;
      const share = Math.floor(teamCounts[team] / members.length);
      members.forEach((player) => counts.set(player.id, share));
    });
    return counts;
  }

  broadcastState(now) {
    const territoryCounts = this.territoryCounts();
    const playerTerritory = this.playerTerritoryCounts();
    this.broadcast({
      type: "state",
      phase: this.phase,
      serverNow: now,
      remainingMs: this.phase === "playing" ? Math.max(0, this.endsAt - now) : MATCH_DURATION_MS,
      arena: ARENA,
      territory: Array.from(this.territory),
      territoryCounts,
      players: [...this.players.values()].map((player) => ({
        id: player.id,
        name: player.name,
        team: player.team,
        connected: player.connected,
        x: Math.round(player.x * 10) / 10,
        y: Math.round(player.y * 10) / 10,
        angle: player.angle,
        alive: player.alive,
        invulnerable: now < player.invulnerableUntil,
        kills: player.kills,
        deaths: player.deaths,
        territory: playerTerritory.get(player.id) || 0,
        questions: player.questionStats.attempts,
        accuracy: player.questionStats.attempts ? player.questionStats.correct / player.questionStats.attempts : null,
        shotReadyAt: player.nextShotAt,
        dashReadyAt: player.nextDashAt
      })),
      projectiles: [...this.projectiles.values()].map((projectile) => ({
        id: projectile.id,
        team: projectile.team,
        x: Math.round(projectile.x),
        y: Math.round(projectile.y)
      }))
    });
  }

  report() {
    const territoryCounts = this.territoryCounts();
    const playerTerritory = this.playerTerritoryCounts();
    return {
      roomCode: this.code,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      matchDurationMs: MATCH_DURATION_MS,
      winnerRule: "largest-territory",
      territoryCounts,
      teams: TEAM_NAMES.map((name, team) => ({ name, team, territory: territoryCounts[team] })),
      players: [...this.players.values()].map((player) => {
        const stats = player.questionStats;
        return {
          id: player.id,
          name: player.name,
          team: player.team,
          teamName: TEAM_NAMES[player.team],
          territory: playerTerritory.get(player.id) || 0,
          kills: player.kills,
          deaths: player.deaths,
          attempts: stats.attempts,
          correct: stats.correct,
          wrong: stats.wrong,
          timeouts: stats.timeouts,
          accuracy: stats.attempts ? stats.correct / stats.attempts : null,
          averageResponseMs: stats.attempts ? Math.round(stats.totalResponseMs / stats.attempts) : null,
          answers: stats.history
        };
      })
    };
  }

  endMatch() {
    if (this.phase === "ended") return;
    this.phase = "ended";
    const report = this.report();
    const maxTerritory = Math.max(...report.territoryCounts);
    const winners = report.teams.filter((team) => team.territory === maxTerritory).map((team) => team.team);
    this.broadcast({ type: "match_ended", winners, report });
    this.updatedAt = Date.now();
  }
}

function handleMessage(ws, raw) {
  let message;
  try {
    message = JSON.parse(raw.toString());
  } catch {
    safeSend(ws, { type: "error", message: "Invalid JSON message." });
    return;
  }

  const now = Date.now();
  ws.messageTimes = (ws.messageTimes || []).filter((time) => now - time < 1000);
  ws.messageTimes.push(now);
  if (ws.messageTimes.length > 80) {
    ws.close(1008, "Rate limit exceeded");
    return;
  }

  try {
    switch (message.type) {
      case "create_room": {
        const code = roomCode();
        const room = new Room(code);
        rooms.set(code, room);
        room.addPlayer(ws, message);
        break;
      }
      case "join_room": {
        const code = String(message.roomCode || "").trim().toUpperCase();
        const room = rooms.get(code);
        if (!room) throw new Error("Room not found. Check the six-character code.");
        if (message.sessionToken) room.reconnectPlayer(ws, message);
        else room.addPlayer(ws, message);
        break;
      }
      case "reconnect": {
        const code = String(message.roomCode || "").trim().toUpperCase();
        const room = rooms.get(code);
        if (!room) throw new Error("Room no longer exists.");
        room.reconnectPlayer(ws, message);
        break;
      }
      case "start_match": {
        const room = rooms.get(ws.roomCode);
        if (!room) throw new Error("Room not found.");
        room.start(ws.playerId);
        break;
      }
      case "input": {
        const room = rooms.get(ws.roomCode);
        if (room) room.handleInput(ws.playerId, message);
        break;
      }
      case "answer": {
        const room = rooms.get(ws.roomCode);
        if (room) room.handleAnswer(ws.playerId, message);
        break;
      }
      case "ping":
        safeSend(ws, { type: "pong", clientTime: message.clientTime, serverTime: Date.now() });
        break;
      default:
        throw new Error("Unsupported message type.");
    }
  } catch (error) {
    safeSend(ws, { type: "error", message: error.message || "Request failed." });
  }
}

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
  ws.on("message", (raw) => handleMessage(ws, raw));
  ws.on("close", () => {
    const room = rooms.get(ws.roomCode);
    if (room && ws.playerId) room.removeConnection(ws.playerId);
  });
  ws.on("error", () => {});
  safeSend(ws, { type: "hello", protocol: 1, serverTime: Date.now() });
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Triad Territory Rush server listening on port ${PORT}`);
});

function shutdown() {
  clearInterval(heartbeat);
  for (const room of rooms.values()) room.destroy();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
