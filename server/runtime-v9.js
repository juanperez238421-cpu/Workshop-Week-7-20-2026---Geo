"use strict";

const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const gameplayRuntime = require("./runtime-v8.js");

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Triad v9 patch could not find: ${label}`);
  return source.replace(search, replacement);
}

function replacePattern(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`Triad v9 patch could not find: ${label}`);
  return source.replace(pattern, replacement);
}

function patchGatewaySource(input) {
  let source = gameplayRuntime.patchGatewaySource(input);
  source = source.replace(
    'const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024, perMessageDeflate: { threshold: 768, concurrencyLimit: 6 } });',
    'const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024, perMessageDeflate: false });'
  );
  source = source.replaceAll('{ compress: payload.length >= 768 }', '{ compress: false }');
  return source;
}

function patchServerSource(input) {
  let source = gameplayRuntime.patchServerSource(input);

  source = replaceRequired(source, "const TICK_RATE = 40;", "const TICK_RATE = 50;", "50 Hz simulation");
  source = replaceRequired(source, "const STATE_RATE = 15;", "const STATE_RATE = 20;", "20 Hz snapshots");
  source = replaceRequired(source, "const PLAYER_RADIUS = 16;", "const PLAYER_RADIUS = 30;", "player hit radius");
  source = replaceRequired(source, "const PICKUP_RADIUS = 44;", "const PICKUP_RADIUS = 60;", "pickup hit radius");
  source = replaceRequired(
    source,
    "const STATE_BACKPRESSURE_BYTES = 192 * 1024;",
    `const STATE_BACKPRESSURE_BYTES = 128 * 1024;
const PROJECTILE_RADIUS = 18;
const AMMO_REGEN_INTERVAL_MS = 10 * 1000;
const FULL_TERRITORY_EVERY = 10;`,
    "v9 hitbox and regeneration constants"
  );

  source = source.replace(
    'const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024, perMessageDeflate: { threshold: 768, concurrencyLimit: 6 } });',
    'const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024, perMessageDeflate: false });'
  );
  source = source.replaceAll('{ compress: serialized.length >= 768 }', '{ compress: false }');

  source = replaceRequired(
    source,
    "this.nextPickupAt = 0; this.stateSequence = 0;",
    "this.nextPickupAt = 0; this.stateSequence = 0; this.lastTerritorySent = null;",
    "territory delta state"
  );

  source = source.replaceAll(
    'lives: MAX_LIVES, ammo: MAX_AMMO, maxAmmo: MAX_AMMO, speedUntil:',
    'lives: MAX_LIVES, ammo: MAX_AMMO, maxAmmo: MAX_AMMO, nextAmmoRegenAt: Date.now() + AMMO_REGEN_INTERVAL_MS, speedUntil:'
  );

  source = source.replace(
    "player.currentQuestion = null; player.lives = MAX_LIVES; player.ammo = MAX_AMMO; player.respawnAt = now + 700;",
    "player.currentQuestion = null; player.lives = MAX_LIVES; player.ammo = MAX_AMMO; player.nextAmmoRegenAt = now + AMMO_REGEN_INTERVAL_MS; player.respawnAt = now + 700;"
  );

  source = source.replace(
    'if (pickup.type === "ammo") { if (player.ammo >= MAX_AMMO) return false; player.ammo = Math.min(MAX_AMMO, player.ammo + 3); }',
    'if (pickup.type === "ammo") { if (player.ammo >= MAX_AMMO) return false; player.ammo = Math.min(MAX_AMMO, player.ammo + 3); player.nextAmmoRegenAt = now + AMMO_REGEN_INTERVAL_MS; }'
  );

  source = source.replace(
    "player.ammo -= 1; player.nextShotAt = now + (now < player.rapidUntil ? 190 : SHOT_COOLDOWN_MS);",
    "player.ammo -= 1; if (!Number.isFinite(player.nextAmmoRegenAt) || player.nextAmmoRegenAt <= now) player.nextAmmoRegenAt = now + AMMO_REGEN_INTERVAL_MS; player.nextShotAt = now + (now < player.rapidUntil ? 190 : SHOT_COOLDOWN_MS);"
  );

  source = source.replace(
    "player.x = spawn.x; player.y = spawn.y; player.alive = true; player.respawnAt = 0; player.invulnerableUntil = Date.now() + 1600; player.ammo = Math.max(player.ammo, 2); this.paintTerritory(player.x, player.y, player.team, 1);",
    "player.x = spawn.x; player.y = spawn.y; player.alive = true; player.respawnAt = 0; player.invulnerableUntil = Date.now() + 1600; player.ammo = Math.max(player.ammo, 2); player.nextAmmoRegenAt = Date.now() + AMMO_REGEN_INTERVAL_MS; this.paintTerritory(player.x, player.y, player.team, 1);"
  );

  source = replacePattern(
    source,
    /  tick\(\) \{[^\n]+\}/,
    `  updateAmmoRegeneration(now) {
    for (const player of this.players.values()) {
      if (!player.alive || player.currentQuestion) continue;
      if (player.ammo >= MAX_AMMO) {
        player.ammo = MAX_AMMO;
        player.nextAmmoRegenAt = now + AMMO_REGEN_INTERVAL_MS;
        continue;
      }
      if (!Number.isFinite(player.nextAmmoRegenAt)) player.nextAmmoRegenAt = now + AMMO_REGEN_INTERVAL_MS;
      if (now < player.nextAmmoRegenAt) continue;
      const recovered = 1 + Math.floor((now - player.nextAmmoRegenAt) / AMMO_REGEN_INTERVAL_MS);
      player.ammo = Math.min(MAX_AMMO, player.ammo + recovered);
      player.nextAmmoRegenAt += recovered * AMMO_REGEN_INTERVAL_MS;
      if (!player.isBot) safeSend(player.ws, { type: "ammo_regenerated", ammo: player.ammo, maxAmmo: MAX_AMMO, nextInMs: player.ammo >= MAX_AMMO ? 0 : Math.max(0, player.nextAmmoRegenAt - now) });
    }
  }
  tick() { const now = Date.now(); if (this.phase === "playing") { if (now >= this.endsAt) { this.endMatch(); return; } this.updateBots(now); this.updatePlayers(now); this.updateAmmoRegeneration(now); this.updatePickups(now); this.updateProjectiles(now); this.updateQuestionsAndRespawns(now); } if (now - this.lastStateAt >= 1000 / STATE_RATE) { this.lastStateAt = now; if (this.phase !== "lobby" || this.controller?.connected) this.broadcastState(now); } if (!this.controller?.connected && this.players.size === 0 && this.pending.size === 0 && now - this.updatedAt > ROOM_IDLE_TTL_MS) this.destroy(); }`,
    "ammo regeneration tick"
  );

  source = replacePattern(
    source,
    /  updateProjectiles\(now\) \{[^\n]+\}/,
    `  updateProjectiles(now) {
    for (const [projectileId, projectile] of this.projectiles) {
      const startX = projectile.x;
      const startY = projectile.y;
      const endX = startX + projectile.vx * DT;
      const endY = startY + projectile.vy * DT;
      projectile.x = endX;
      projectile.y = endY;
      if (now >= projectile.expiresAt || endX < -PROJECTILE_RADIUS || endX > ARENA.width + PROJECTILE_RADIUS || endY < -PROJECTILE_RADIUS || endY > ARENA.height + PROJECTILE_RADIUS) {
        this.projectiles.delete(projectileId);
        continue;
      }
      const segmentX = endX - startX;
      const segmentY = endY - startY;
      const segmentLengthSq = segmentX * segmentX + segmentY * segmentY || 1;
      for (const target of this.players.values()) {
        if (!target.alive || target.team === projectile.team || now < target.invulnerableUntil) continue;
        const toTargetX = target.x - startX;
        const toTargetY = target.y - startY;
        const projection = clamp((toTargetX * segmentX + toTargetY * segmentY) / segmentLengthSq, 0, 1);
        const closestX = startX + segmentX * projection;
        const closestY = startY + segmentY * projection;
        const radius = PLAYER_RADIUS + PROJECTILE_RADIUS;
        if ((target.x - closestX) ** 2 + (target.y - closestY) ** 2 <= radius ** 2) {
          const killer = this.players.get(projectile.ownerId) || null;
          this.projectiles.delete(projectileId);
          this.eliminate(target, killer);
          break;
        }
      }
    }
  }`,
    "swept projectile collision"
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
    let territory;
    let territoryDelta;
    if (sendFullTerritory) {
      territory = currentTerritory;
      territoryDelta = [];
    } else {
      territoryDelta = [];
      for (let index = 0; index < currentTerritory.length; index += 1) {
        if (currentTerritory[index] !== this.lastTerritorySent[index]) territoryDelta.push(index, currentTerritory[index]);
      }
    }
    this.lastTerritorySent = currentTerritory;
    return {
      type: "state",
      sequence,
      roomCode: this.code,
      phase: this.phase,
      serverNow: now,
      remainingMs: this.phase === "playing" ? Math.max(0, this.endsAt - now) : MATCH_DURATION_MS,
      arena: ARENA,
      cohesionRadius: COHESION_RADIUS,
      maxLives: MAX_LIVES,
      maxAmmo: MAX_AMMO,
      hitboxes: { player: PLAYER_RADIUS, projectile: PROJECTILE_RADIUS, pickup: PICKUP_RADIUS },
      teamNames: this.teamNames,
      teamColors: this.teamColors,
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
    "delta state payload"
  );

  return source;
}

const currentNodeOptions = String(process.env.NODE_OPTIONS || "");
if (!currentNodeOptions.includes("runtime-v9.js")) process.env.NODE_OPTIONS = `${currentNodeOptions} --require=${__filename}`.trim();

const inheritedLoader = Module._extensions[".js"];
Module._extensions[".js"] = function triadV9Loader(module, filename) {
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
