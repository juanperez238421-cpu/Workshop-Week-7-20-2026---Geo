"use strict";

const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const basePatch = require("./runtime-patch.js");

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Triad v6 patch could not find: ${label}`);
  return source.replace(search, replacement);
}

function replacePattern(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`Triad v6 patch could not find: ${label}`);
  return source.replace(pattern, replacement);
}

function patchGatewaySource(input) {
  let source = basePatch.patchGatewaySource(input);

  source = replaceRequired(
    source,
    'const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 });',
    'const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024, perMessageDeflate: { threshold: 768, concurrencyLimit: 6 } });',
    "gateway compression"
  );
  source = replaceRequired(
    source,
    'wss.on("connection", (client) => {\n  client.authFailures = 0;',
    'wss.on("connection", (client) => {\n  try { client._socket?.setNoDelay(true); } catch {}\n  client.authFailures = 0;',
    "gateway no-delay"
  );
  source = replaceRequired(
    source,
    '      opened = true;\n      client.engineConnected = true;',
    '      opened = true;\n      try { engineSocket._socket?.setNoDelay(true); } catch {}\n      client.engineConnected = true;',
    "engine no-delay"
  );
  source = replacePattern(
    source,
    /    engineSocket\.on\("message", \(raw\) => \{[\s\S]*?\n    \}\);\n\n    engineSocket\.on\("error"/,
    `    engineSocket.on("message", (raw) => {
      if (client.engineSocket !== engineSocket || client.readyState !== WebSocket.OPEN) return;
      let payload = raw.toString();
      let messageType = "";
      try {
        const message = JSON.parse(payload);
        messageType = String(message.type || "");
        if (message.type === "hello") payload = JSON.stringify({ ...message, teacherAuthRequired: true, gatewayProtocol: 1 });
      } catch {}
      if (messageType === "state" && client.bufferedAmount > 192 * 1024) return;
      client.send(payload, { compress: payload.length >= 768 });
    });

    engineSocket.on("error"`,
    "gateway state backpressure"
  );
  return source;
}

function patchServerSource(input) {
  let source = basePatch.patchServerSource(input);

  source = replaceRequired(source, "const TICK_RATE = 30;", "const TICK_RATE = 40;", "40 Hz simulation");
  source = replaceRequired(source, "const STATE_RATE = 20;", "const STATE_RATE = 15;", "15 Hz snapshots");
  source = replaceRequired(source, "const PLAYER_SPEED = 430;", "const PLAYER_SPEED = 450;", "player speed");
  source = replaceRequired(source, "const DASH_SPEED = 1250;", "const DASH_SPEED = 1320;", "dash speed");
  source = replaceRequired(source, "const DASH_COOLDOWN_MS = 2700;", "const DASH_COOLDOWN_MS = 2600;", "dash cooldown");
  source = replaceRequired(source, "const PROJECTILE_SPEED = 1500;", "const PROJECTILE_SPEED = 1550;", "projectile speed");
  source = replaceRequired(
    source,
    "const PROJECTILE_LIFETIME_MS = 2600;\nconst COHESION_RADIUS = 760;\nconst VOLLEY_SPREAD_RADIANS = 0.082;",
    `const PROJECTILE_LIFETIME_MS = 2500;
const COHESION_RADIUS = 760;
const VOLLEY_SPREAD_RADIANS = 0.082;
const MAX_LIVES = 3;
const MAX_AMMO = 5;
const MAX_PICKUPS = 14;
const PICKUP_RADIUS = 44;
const PICKUP_SPAWN_INTERVAL_MS = 1650;
const STATE_BACKPRESSURE_BYTES = 192 * 1024;`,
    "resource constants"
  );

  source = replaceRequired(
    source,
    'const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 });',
    'const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024, perMessageDeflate: { threshold: 768, concurrencyLimit: 6 } });',
    "engine compression"
  );
  source = replaceRequired(
    source,
    '  if (!originAllowed(req.headers.origin)) { socket.write("HTTP/1.1 403 Forbidden\\r\\nConnection: close\\r\\n\\r\\n"); socket.destroy(); return; }\n  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));',
    '  if (!originAllowed(req.headers.origin)) { socket.write("HTTP/1.1 403 Forbidden\\r\\nConnection: close\\r\\n\\r\\n"); socket.destroy(); return; }\n  try { socket.setNoDelay(true); } catch {}\n  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));',
    "engine no-delay"
  );
  source = replaceRequired(
    source,
    'function safeSend(ws, payload) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload)); }',
    'function safeSend(ws, payload) { if (!ws || ws.readyState !== WebSocket.OPEN) return; if (payload?.type === "state" && ws.bufferedAmount > STATE_BACKPRESSURE_BYTES) return; const serialized = typeof payload === "string" ? payload : JSON.stringify(payload); ws.send(serialized, { compress: serialized.length >= 768 }); }',
    "safe send backpressure"
  );
  source = replacePattern(
    source,
    /  broadcast\(payload\) \{[^\n]+\}/,
    '  broadcast(payload) { const serialized = JSON.stringify(payload); const isState = payload?.type === "state"; for (const ws of this.allSockets()) { if (!ws || ws.readyState !== WebSocket.OPEN) continue; if (isState && ws.bufferedAmount > STATE_BACKPRESSURE_BYTES) continue; ws.send(serialized, { compress: serialized.length >= 768 }); } }',
    "single serialization"
  );

  source = replaceRequired(
    source,
    "this.pending = new Map(); this.players = new Map(); this.projectiles = new Map();",
    "this.pending = new Map(); this.players = new Map(); this.projectiles = new Map(); this.pickups = new Map();",
    "pickup storage"
  );
  source = replaceRequired(
    source,
    "this.createdAt = Date.now(); this.updatedAt = Date.now(); this.startedAt = null; this.endsAt = null; this.lastStateAt = 0; this.botSerial = 0;",
    "this.createdAt = Date.now(); this.updatedAt = Date.now(); this.startedAt = null; this.endsAt = null; this.lastStateAt = 0; this.botSerial = 0; this.nextPickupAt = 0; this.stateSequence = 0;",
    "room resource state"
  );
  source = replaceRequired(
    source,
    "alive: true, invulnerableUntil: 0, respawnAt: 0, kills: 0, deaths: 0, nextShotAt: 0,",
    "alive: true, invulnerableUntil: 0, respawnAt: 0, lives: MAX_LIVES, ammo: MAX_AMMO, maxAmmo: MAX_AMMO, speedUntil: 0, rapidUntil: 0, paintUntil: 0, shieldUntil: 0, activePower: \"\", kills: 0, deaths: 0, nextShotAt: 0,",
    "player resources"
  );

  source = replacePattern(
    source,
    /  start\(controllerWs\) \{[^\n]+\}/,
    `  start(controllerWs) {
    this.assertController(controllerWs);
    if (this.phase !== "lobby") throw new Error("The room is not in the lobby.");
    if (!this.canStart()) throw new Error("Cannot start: " + this.startBlockers().join("; ") + ".");
    this.phase = "countdown"; this.registrationLocked = true; this.territory.fill(-1); this.projectiles.clear(); this.pickups.clear(); this.nextPickupAt = Date.now() + 700;
    for (const team of [0, 1, 2]) {
      const members = [...this.players.values()].filter((player) => player.team === team);
      members.forEach((player, slot) => {
        const spawn = teamSpawn(team, slot);
        Object.assign(player, { x: spawn.x, y: spawn.y, angle: 0, alive: true, invulnerableUntil: Date.now() + 2500, respawnAt: 0, lives: MAX_LIVES, ammo: MAX_AMMO, maxAmmo: MAX_AMMO, speedUntil: 0, rapidUntil: 0, paintUntil: 0, shieldUntil: 0, activePower: "", kills: 0, deaths: 0, nextShotAt: 0, dashUntil: 0, nextDashAt: 0, currentQuestion: null, questionStats: emptyQuestionStats() });
        this.paintTerritory(player.x, player.y, team, 2);
      });
    }
    for (let index = 0; index < 8; index += 1) this.spawnPickup(index < 4 ? "ammo" : null);
    this.broadcast({ type: "countdown", seconds: 3 }); this.sendLobby();
    setTimeout(() => { if (this.phase !== "countdown") return; this.phase = "playing"; this.startedAt = Date.now(); this.endsAt = this.startedAt + MATCH_DURATION_MS; this.broadcastEvent("Match started. Three lives, five ammo charges and random supply boxes are active."); }, 3000);
  }`,
    "match start resources"
  );
  source = replacePattern(
    source,
    /  reset\(controllerWs\) \{[^\n]+\}/,
    `  reset(controllerWs) {
    this.assertController(controllerWs); if (this.phase !== "ended") throw new Error("Reset is available after the match ends.");
    this.phase = "lobby"; this.registrationLocked = false; this.startedAt = null; this.endsAt = null; this.territory.fill(-1); this.projectiles.clear(); this.pickups.clear(); this.nextPickupAt = 0;
    const slots = [0, 0, 0];
    for (const player of this.players.values()) {
      const spawn = teamSpawn(player.team, slots[player.team]++);
      Object.assign(player, { ready: player.isBot, x: spawn.x, y: spawn.y, angle: 0, alive: true, invulnerableUntil: 0, respawnAt: 0, lives: MAX_LIVES, ammo: MAX_AMMO, maxAmmo: MAX_AMMO, speedUntil: 0, rapidUntil: 0, paintUntil: 0, shieldUntil: 0, activePower: "", kills: 0, deaths: 0, nextShotAt: 0, dashUntil: 0, nextDashAt: 0, currentQuestion: null, questionStats: emptyQuestionStats() });
    }
    this.sendLobby(); this.broadcastEvent("Room reset. Real PC groups must mark ready for the next round.");
  }`,
    "room reset resources"
  );
  source = replacePattern(
    source,
    /  handleAnswer\(playerId, message\) \{[^\n]+\}/,
    `  handleAnswer(playerId, message) {
    if (this.phase !== "playing") return;
    const player = this.players.get(playerId); const question = player?.currentQuestion;
    if (!player || player.isBot || !question || question.id !== message.questionId) return;
    const now = Date.now(); const selectedIndex = Number(message.selectedIndex); const elapsedMs = clamp(now - question.createdAt, 0, QUESTION_DURATION_MS);
    const correct = selectedIndex === question.answerIndex && now <= question.expiresAt;
    this.recordAnswer(player, question, selectedIndex, correct ? "correct" : "wrong", elapsedMs);
    if (correct) {
      player.currentQuestion = null; player.lives = MAX_LIVES; player.ammo = MAX_AMMO; player.respawnAt = now + 700;
      safeSend(player.ws, { type: "answer_result", correct: true, respawnInMs: 700, lives: player.lives, ammo: player.ammo });
    } else {
      safeSend(player.ws, { type: "answer_result", correct: false, correctIndex: question.answerIndex }); this.assignQuestion(player, 500);
    }
  }`,
    "question resource reset"
  );

  source = replacePattern(
    source,
    /  updateBots\(now\) \{[\s\S]*?\n  \}\n  tick\(\)/,
    `  updateBots(now) {
    if (this.phase !== "playing") return;
    for (const bot of this.players.values()) {
      if (!bot.isBot || !bot.alive) continue;
      const teammates = [...this.players.values()].filter((candidate) => candidate.id !== bot.id && candidate.team === bot.team && candidate.alive && (candidate.isBot || candidate.connected));
      const enemies = [...this.players.values()].filter((candidate) => candidate.team !== bot.team && candidate.alive && (candidate.isBot || candidate.connected));
      const ammoBoxes = [...this.pickups.values()].filter((pickup) => pickup.type === "ammo");
      const nearestAmmo = ammoBoxes.sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y))[0];
      const nearestTeammate = teammates.sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y))[0];
      const target = enemies.sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y))[0];
      const regroup = this.volleySize(bot) < 2 && nearestTeammate;
      const seekAmmo = bot.ammo <= 1 && nearestAmmo;
      const centerBias = { x: ARENA.width / 2 + Math.sin(now / 2400 + bot.id.length) * 950, y: ARENA.height / 2 + Math.cos(now / 2700 + bot.id.length) * 720 };
      const goal = seekAmmo ? nearestAmmo : regroup ? nearestTeammate : target || centerBias;
      const moveAngle = Math.atan2(goal.y - bot.y, goal.x - bot.x);
      const aimAngle = target ? Math.atan2(target.y - bot.y, target.x - bot.x) : moveAngle;
      const strafe = seekAmmo || regroup ? 0 : Math.sin(now / 620 + bot.id.length) * 0.36;
      bot.input = { dx: Math.cos(moveAngle) - Math.sin(moveAngle) * strafe, dy: Math.sin(moveAngle) + Math.cos(moveAngle) * strafe, angle: aimAngle, shoot: Boolean(target && !seekAmmo && !regroup && bot.ammo > 0 && Math.hypot(target.x - bot.x, target.y - bot.y) < 2800), dash: now >= bot.ai.nextDashAt };
      if (bot.input.dash) bot.ai.nextDashAt = now + 2300 + crypto.randomInt(1900);
    }
  }
  tick()`,
    "resource-aware bots"
  );

  source = replacePattern(
    source,
    /  volleySize\(player\) \{[\s\S]*?\n  eliminate\(victim, killer\) \{[\s\S]*?\n  \}\n  respawn\(player\)/,
    `  spawnPickup(forcedType = null) {
    if (this.pickups.size >= MAX_PICKUPS) return null;
    const roll = crypto.randomInt(100);
    const type = forcedType || (roll < 44 ? "ammo" : roll < 61 ? "shield" : roll < 76 ? "speed" : roll < 89 ? "rapid" : "paint");
    const pickup = { id: id("box"), type, x: crypto.randomInt(240, ARENA.width - 239), y: crypto.randomInt(220, ARENA.height - 219), spawnedAt: Date.now(), expiresAt: Date.now() + 45000 };
    this.pickups.set(pickup.id, pickup); return pickup;
  }
  pickupLabel(type) { return ({ ammo: "AMMO +3", shield: "SHIELD", speed: "SPEED", rapid: "RAPID FIRE", paint: "PAINT BOOST" })[type] || "POWER"; }
  collectPickup(player, pickup, now) {
    if (pickup.type === "ammo") { if (player.ammo >= MAX_AMMO) return false; player.ammo = Math.min(MAX_AMMO, player.ammo + 3); }
    if (pickup.type === "shield") { player.shieldUntil = now + 6500; player.invulnerableUntil = Math.max(player.invulnerableUntil, player.shieldUntil); player.activePower = "shield"; }
    if (pickup.type === "speed") { player.speedUntil = now + 7500; player.activePower = "speed"; }
    if (pickup.type === "rapid") { player.rapidUntil = now + 6500; player.activePower = "rapid"; }
    if (pickup.type === "paint") { player.paintUntil = now + 7500; player.activePower = "paint"; }
    this.pickups.delete(pickup.id);
    safeSend(player.ws, { type: "pickup_collected", pickupType: pickup.type, label: this.pickupLabel(pickup.type), ammo: player.ammo, lives: player.lives });
    this.broadcastEvent(player.pcLabel + " collected " + this.pickupLabel(pickup.type) + ".");
    return true;
  }
  updatePickups(now) {
    if (now >= this.nextPickupAt && this.pickups.size < MAX_PICKUPS) { this.spawnPickup(); this.nextPickupAt = now + PICKUP_SPAWN_INTERVAL_MS + crypto.randomInt(700); }
    for (const [pickupId, pickup] of this.pickups) {
      if (now >= pickup.expiresAt) { this.pickups.delete(pickupId); continue; }
      for (const player of this.players.values()) {
        if (!player.alive || (!player.isBot && !player.connected)) continue;
        if (Math.hypot(player.x - pickup.x, player.y - pickup.y) <= PLAYER_RADIUS + PICKUP_RADIUS) { this.collectPickup(player, pickup, now); break; }
      }
    }
  }
  volleySize(player) {
    if (!player?.alive) return 1;
    return clamp([...this.players.values()].filter((candidate) => candidate.team === player.team && candidate.alive && (candidate.isBot || candidate.connected) && Math.hypot(candidate.x - player.x, candidate.y - player.y) <= COHESION_RADIUS).length, 1, PLAYERS_PER_TEAM);
  }
  fireVolley(player, now) {
    if (player.ammo <= 0) return;
    const size = this.volleySize(player);
    const offsets = size === 1 ? [0] : size === 2 ? [-VOLLEY_SPREAD_RADIANS * 0.55, VOLLEY_SPREAD_RADIANS * 0.55] : [-VOLLEY_SPREAD_RADIANS, 0, VOLLEY_SPREAD_RADIANS];
    player.ammo -= 1; player.nextShotAt = now + (now < player.rapidUntil ? 190 : SHOT_COOLDOWN_MS);
    for (const offset of offsets) {
      const angle = player.angle + offset; const projectileId = id("shot");
      this.projectiles.set(projectileId, { id: projectileId, ownerId: player.id, team: player.team, x: player.x + Math.cos(angle) * (PLAYER_RADIUS + 8), y: player.y + Math.sin(angle) * (PLAYER_RADIUS + 8), vx: Math.cos(angle) * PROJECTILE_SPEED, vy: Math.sin(angle) * PROJECTILE_SPEED, expiresAt: now + PROJECTILE_LIFETIME_MS, volleySize: size });
    }
  }
  combatIdentity(player) {
    if (!player) return "Arena"; const teamName = this.teamNames[player.team] || ("Team " + (player.team + 1));
    return player.isBot ? player.pcLabel + " (AI · " + teamName + ")" : player.pcLabel + " [" + player.students.join(" · ") + "] (" + teamName + ")";
  }
  eliminate(victim, killer) {
    const now = Date.now(); if (!victim.alive || now < victim.invulnerableUntil) return;
    victim.alive = false; victim.deaths += 1; victim.lives = Math.max(0, victim.lives - 1); victim.input = { dx: 0, dy: 0, angle: victim.angle, shoot: false, dash: false };
    victim.speedUntil = 0; victim.rapidUntil = 0; victim.paintUntil = 0; victim.shieldUntil = 0; victim.activePower = "";
    if (killer && killer.id !== victim.id) killer.kills += 1;
    const text = killer ? this.combatIdentity(killer) + " eliminated " + this.combatIdentity(victim) + "." : this.combatIdentity(victim) + " was eliminated.";
    this.broadcast({ type: "event", kind: "elimination", text: text + " " + victim.lives + " life" + (victim.lives === 1 ? "" : "s") + " remaining.", at: now, killer: killer ? { id: killer.id, pcLabel: killer.pcLabel, students: killer.isBot ? [] : killer.students, team: killer.team, teamName: this.teamNames[killer.team], isBot: killer.isBot } : null, victim: { id: victim.id, pcLabel: victim.pcLabel, students: victim.isBot ? [] : victim.students, team: victim.team, teamName: this.teamNames[victim.team], isBot: victim.isBot, lives: victim.lives } });
    if (victim.lives > 0) { victim.respawnAt = now + 1050; safeSend(victim.ws, { type: "life_lost", lives: victim.lives, respawnInMs: 1050 }); return; }
    if (victim.isBot) { victim.lives = MAX_LIVES; victim.ammo = MAX_AMMO; victim.respawnAt = now + 2200; return; }
    victim.respawnAt = 0; this.assignQuestion(victim, 280);
  }
  respawn(player)`,
    "lives ammo pickups and powers"
  );

  source = replacePattern(
    source,
    /  respawn\(player\) \{[^\n]+\}/,
    `  respawn(player) {
    const teammates = [...this.players.values()].filter((candidate) => candidate.team === player.team && candidate.id !== player.id && candidate.alive);
    const spawn = teamSpawn(player.team, crypto.randomInt(3));
    if (teammates.length) { const anchor = teammates[crypto.randomInt(teammates.length)]; spawn.x = clamp(anchor.x + crypto.randomInt(-180, 181), 60, ARENA.width - 60); spawn.y = clamp(anchor.y + crypto.randomInt(-180, 181), 60, ARENA.height - 60); }
    player.x = spawn.x; player.y = spawn.y; player.alive = true; player.respawnAt = 0; player.invulnerableUntil = Date.now() + 1600; player.ammo = Math.max(player.ammo, 2); this.paintTerritory(player.x, player.y, player.team, 1);
    safeSend(player.ws, { type: "respawned", lives: player.lives, ammo: player.ammo });
  }`,
    "resource respawn"
  );
  source = replacePattern(
    source,
    /  tick\(\) \{[^\n]+\}/,
    '  tick() { const now = Date.now(); if (this.phase === "playing") { if (now >= this.endsAt) { this.endMatch(); return; } this.updateBots(now); this.updatePlayers(now); this.updatePickups(now); this.updateProjectiles(now); this.updateQuestionsAndRespawns(now); } if (now - this.lastStateAt >= 1000 / STATE_RATE) { this.lastStateAt = now; if (this.phase !== "lobby" || this.controller?.connected) this.broadcastState(now); } if (!this.controller?.connected && this.players.size === 0 && this.pending.size === 0 && now - this.updatedAt > ROOM_IDLE_TTL_MS) this.destroy(); }',
    "optimized tick"
  );
  source = replacePattern(
    source,
    /  updatePlayers\(now\) \{[\s\S]*?\n  \}\n  updateProjectiles/,
    `  updatePlayers(now) {
    for (const player of this.players.values()) {
      if ((!player.isBot && !player.connected) || !player.alive || player.currentQuestion) continue;
      let { dx, dy } = player.input; const magnitude = Math.hypot(dx, dy); if (magnitude > 1) { dx /= magnitude; dy /= magnitude; }
      if (player.input.dash && now >= player.nextDashAt && magnitude > 0.05) { player.dashUntil = now + DASH_DURATION_MS; player.nextDashAt = now + DASH_COOLDOWN_MS; }
      const baseSpeed = now < player.speedUntil ? PLAYER_SPEED * 1.45 : PLAYER_SPEED; const speed = now < player.dashUntil ? DASH_SPEED : baseSpeed;
      player.x = clamp(player.x + dx * speed * DT, PLAYER_RADIUS, ARENA.width - PLAYER_RADIUS); player.y = clamp(player.y + dy * speed * DT, PLAYER_RADIUS, ARENA.height - PLAYER_RADIUS); player.angle = player.input.angle;
      const paintRadius = (now < player.paintUntil ? 1 : 0) + (now < player.dashUntil ? 2 : 1); this.paintTerritory(player.x, player.y, player.team, paintRadius);
      if (player.input.shoot && now >= player.nextShotAt && player.ammo > 0) this.fireVolley(player, now);
      const activeUntil = Math.max(player.shieldUntil, player.speedUntil, player.rapidUntil, player.paintUntil); if (activeUntil <= now) player.activePower = "";
    }
  }
  updateProjectiles`,
    "fluid resource movement"
  );

  source = replacePattern(
    source,
    /  statePayload\(now\) \{[^\n]+\}/,
    `  statePayload(now) {
    const territoryCounts = this.territoryCounts(); const playerTerritory = this.playerTerritoryCounts();
    return { type: "state", sequence: ++this.stateSequence, roomCode: this.code, phase: this.phase, serverNow: now, remainingMs: this.phase === "playing" ? Math.max(0, this.endsAt - now) : MATCH_DURATION_MS, arena: ARENA, cohesionRadius: COHESION_RADIUS, maxLives: MAX_LIVES, maxAmmo: MAX_AMMO, teamNames: this.teamNames, teamColors: this.teamColors, territory: Array.from(this.territory), territoryCounts,
      players: [...this.players.values()].map((player) => ({ id: player.id, name: player.pcLabel, pcLabel: player.pcLabel, students: player.students, team: player.team, isBot: player.isBot, connected: player.isBot || player.connected, ready: player.isBot || player.ready, x: Math.round(player.x * 10) / 10, y: Math.round(player.y * 10) / 10, angle: player.angle, alive: player.alive, invulnerable: now < player.invulnerableUntil, kills: player.kills, deaths: player.deaths, lives: player.lives, ammo: player.ammo, maxAmmo: MAX_AMMO, activePower: player.activePower, powerRemainingMs: Math.max(0, Math.max(player.shieldUntil, player.speedUntil, player.rapidUntil, player.paintUntil) - now), territory: playerTerritory.get(player.id) || 0, questions: player.questionStats.attempts, accuracy: player.questionStats.attempts ? player.questionStats.correct / player.questionStats.attempts : null, shotReadyAt: player.nextShotAt, dashReadyAt: player.nextDashAt, volleySize: this.volleySize(player) })),
      projectiles: [...this.projectiles.values()].map((projectile) => ({ id: projectile.id, team: projectile.team, x: Math.round(projectile.x), y: Math.round(projectile.y), vx: Math.round(projectile.vx), vy: Math.round(projectile.vy) })),
      pickups: [...this.pickups.values()].map((pickup) => ({ id: pickup.id, type: pickup.type, x: pickup.x, y: pickup.y })) };
  }`,
    "v6 state payload"
  );

  return source;
}

const currentNodeOptions = String(process.env.NODE_OPTIONS || "");
if (!currentNodeOptions.includes("runtime-v6.js")) process.env.NODE_OPTIONS = `${currentNodeOptions} --require=${__filename}`.trim();

const inheritedLoader = Module._extensions[".js"];
Module._extensions[".js"] = function triadV6Loader(module, filename) {
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
