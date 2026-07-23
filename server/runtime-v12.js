"use strict";

const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const baseRuntime = require("./runtime-v11.js");

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Triad v12 patch could not find: ${label}`);
  return source.replace(search, replacement);
}

function replacePattern(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`Triad v12 patch could not find: ${label}`);
  return source.replace(pattern, replacement);
}

function patchGatewaySource(input) {
  return baseRuntime.patchGatewaySource(input);
}

function patchServerSource(input) {
  let source = baseRuntime.patchServerSource(input);

  source = replaceRequired(
    source,
    "const PROJECTILE_LIFETIME_MS = 2500;",
    "const PROJECTILE_LIFETIME_MS = 5200;",
    "long-range projectile lifetime"
  );
  source = replaceRequired(
    source,
    "const AMMO_REGEN_INTERVAL_MS = 10 * 1000;",
    "const AMMO_REGEN_INTERVAL_MS = 5 * 1000;",
    "five-second ammunition recovery"
  );
  source = replaceRequired(source, "const MAX_PROJECTILES = 180;", "const MAX_PROJECTILES = 120;", "bounded projectile stream");
  source = replaceRequired(
    source,
    "const MIN_PLAYERS_TO_START = 1;",
    `const MIN_PLAYERS_TO_START = 1;
const LONG_SHOT_BONUS_START = 1200;
const LONG_SHOT_BONUS_STEP = 350;
const LONG_SHOT_BONUS_MAX = 18;`,
    "long-shot hitbox constants"
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
        spawnedAt: now,
        distanceTraveled: 0,
        expiresAt: now + PROJECTILE_LIFETIME_MS,
        volleySize: size
      });
    }
  }
  combatIdentity`,
    "long-range projectile metadata"
  );

  source = replacePattern(
    source,
    /  updatePlayers\(now\) \{[\s\S]*?\n  \}\n  updateProjectiles/,
    `  updatePlayers(now) {
    for (const player of this.players.values()) {
      player.previousX = Number.isFinite(player.x) ? player.x : 0;
      player.previousY = Number.isFinite(player.y) ? player.y : 0;
      if ((!player.isBot && !player.connected) || !player.alive || player.currentQuestion) continue;
      let { dx, dy } = player.input;
      const magnitude = Math.hypot(dx, dy);
      if (magnitude > 1) { dx /= magnitude; dy /= magnitude; }
      if (player.input.dash && now >= player.nextDashAt && magnitude > 0.05) {
        player.dashUntil = now + DASH_DURATION_MS;
        player.nextDashAt = now + DASH_COOLDOWN_MS;
      }
      const baseSpeed = now < player.speedUntil ? PLAYER_SPEED * 1.45 : PLAYER_SPEED;
      const speed = now < player.dashUntil ? DASH_SPEED : baseSpeed;
      player.x = clamp(player.x + dx * speed * DT, PLAYER_RADIUS, ARENA.width - PLAYER_RADIUS);
      player.y = clamp(player.y + dy * speed * DT, PLAYER_RADIUS, ARENA.height - PLAYER_RADIUS);
      player.angle = player.input.angle;
      const paintRadius = (now < player.paintUntil ? 1 : 0) + (now < player.dashUntil ? 2 : 1);
      this.paintTerritory(player.x, player.y, player.team, paintRadius);
      if (player.input.shoot && now >= player.nextShotAt && player.ammo > 0) this.fireVolley(player, now);
      const activeUntil = Math.max(player.shieldUntil, player.speedUntil, player.rapidUntil, player.paintUntil);
      if (activeUntil <= now) player.activePower = "";
    }
  }
  updateProjectiles`,
    "moving-target history"
  );

  source = replacePattern(
    source,
    /  updateProjectiles\(now\) \{[\s\S]*?\n  \}\n  updateQuestionsAndRespawns/,
    `  updateProjectiles(now) {
    for (const [projectileId, projectile] of this.projectiles) {
      const startX = projectile.x;
      const startY = projectile.y;
      const endX = startX + projectile.vx * DT;
      const endY = startY + projectile.vy * DT;
      const segmentDistance = Math.hypot(endX - startX, endY - startY);
      projectile.x = endX;
      projectile.y = endY;
      projectile.distanceTraveled = (Number(projectile.distanceTraveled) || 0) + segmentDistance;

      if (now >= projectile.expiresAt || endX < -PROJECTILE_RADIUS || endX > ARENA.width + PROJECTILE_RADIUS || endY < -PROJECTILE_RADIUS || endY > ARENA.height + PROJECTILE_RADIUS) {
        this.projectiles.delete(projectileId);
        continue;
      }

      const longShotBonus = clamp(
        (projectile.distanceTraveled - LONG_SHOT_BONUS_START) / LONG_SHOT_BONUS_STEP,
        0,
        LONG_SHOT_BONUS_MAX
      );
      const collisionRadius = PLAYER_RADIUS + PROJECTILE_RADIUS + longShotBonus;

      for (const target of this.players.values()) {
        if (!target.alive || target.team === projectile.team || now < target.invulnerableUntil) continue;
        if (!target.isBot && !target.connected) continue;

        const targetStartX = Number.isFinite(target.previousX) ? target.previousX : target.x;
        const targetStartY = Number.isFinite(target.previousY) ? target.previousY : target.y;
        const relativeStartX = startX - targetStartX;
        const relativeStartY = startY - targetStartY;
        const relativeEndX = endX - target.x;
        const relativeEndY = endY - target.y;
        const relativeDeltaX = relativeEndX - relativeStartX;
        const relativeDeltaY = relativeEndY - relativeStartY;
        const relativeLengthSq = relativeDeltaX * relativeDeltaX + relativeDeltaY * relativeDeltaY;
        const closestT = relativeLengthSq > 0
          ? clamp(-(relativeStartX * relativeDeltaX + relativeStartY * relativeDeltaY) / relativeLengthSq, 0, 1)
          : 0;
        const closestRelativeX = relativeStartX + relativeDeltaX * closestT;
        const closestRelativeY = relativeStartY + relativeDeltaY * closestT;

        if (closestRelativeX * closestRelativeX + closestRelativeY * closestRelativeY <= collisionRadius * collisionRadius) {
          const killer = this.players.get(projectile.ownerId) || null;
          this.projectiles.delete(projectileId);
          this.eliminate(target, killer);
          break;
        }
      }
    }
  }
  updateQuestionsAndRespawns`,
    "relative-motion long-shot collision"
  );

  source = replaceRequired(
    source,
    "  broadcastState(now) {",
    `  sendFullStateTo(ws, now = Date.now()) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const payload = this.statePayload(now);
    payload.resync = true;
    payload.arena = ARENA;
    payload.cohesionRadius = COHESION_RADIUS;
    payload.maxLives = MAX_LIVES;
    payload.maxAmmo = MAX_AMMO;
    payload.hitboxes = { player: PLAYER_RADIUS, projectile: PROJECTILE_RADIUS, pickup: PICKUP_RADIUS };
    payload.teamNames = this.teamNames;
    payload.teamColors = this.teamColors;
    payload.territory = Array.from(this.territory);
    payload.territoryDelta = [];
    sendSocketFrame(ws, JSON.stringify(payload), true);
  }
  broadcastState(now) {`,
    "on-demand full state resynchronization"
  );

  source = replaceRequired(
    source,
    '  case "ping": safeSend(ws, { type: "pong", clientTime: message.clientTime, serverTime: Date.now() }); break;',
    '  case "request_state": rooms.get(ws.roomCode)?.sendFullStateTo(ws); break;\n  case "ping": safeSend(ws, { type: "pong", clientTime: message.clientTime, serverTime: Date.now() }); break;',
    "client state resync message"
  );

  source = replacePattern(
    source,
    /  disconnect\(ws\) \{[^\n]+\}/,
    `  disconnect(ws) {
    if (ws.role === "controller" && this.controller?.ws === ws) {
      this.controller.ws = null;
      this.controller.connected = false;
      this.controller.disconnectedAt = Date.now();
      this.sendLobby();
      this.broadcastEvent("Teacher controller disconnected. The room can be restored.");
      return;
    }
    if (ws.role === "pending" && ws.registrationId) {
      const pending = this.pending.get(ws.registrationId);
      if (!pending || pending.ws !== ws) return;
      pending.connected = false;
      pending.ws = null;
      setTimeout(() => {
        const current = this.pending.get(pending.id);
        if (current && !current.connected && this.phase === "lobby") {
          this.pending.delete(current.id);
          this.sendLobby();
        }
      }, RECONNECT_GRACE_MS);
      this.sendLobby();
      return;
    }
    if (ws.role === "player" && ws.playerId) {
      const player = this.players.get(ws.playerId);
      if (!player || player.isBot || player.ws !== ws) return;
      player.connected = false;
      player.ws = null;
      player.disconnectedAt = Date.now();
      if (this.phase === "lobby") player.ready = false;
      player.input = { dx: 0, dy: 0, angle: player.angle, shoot: false, dash: false };
      this.sendLobby();
      this.broadcastEvent(player.pcLabel + " disconnected; automatic session recovery is active.");
    }
  }`,
    "stale-socket disconnect guard"
  );

  return source;
}

const currentNodeOptions = String(process.env.NODE_OPTIONS || "");
if (!currentNodeOptions.includes("runtime-v12.js")) process.env.NODE_OPTIONS = `${currentNodeOptions} --require=${__filename}`.trim();

const inheritedLoader = Module._extensions[".js"];
Module._extensions[".js"] = function triadV12Loader(module, filename) {
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
