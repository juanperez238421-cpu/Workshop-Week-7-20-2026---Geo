"use strict";

const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const baseRuntime = require("./runtime-v14.js");

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Triad v15 patch could not find: ${label}`);
  return source.replace(search, replacement);
}

function replacePattern(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`Triad v15 patch could not find: ${label}`);
  return source.replace(pattern, replacement);
}

function patchGatewaySource(input) {
  let source = baseRuntime.patchGatewaySource(input);
  source = replaceRequired(
    source,
    'architecture: "secure-teacher-gateway-hitscan-combat-and-automatic-reporting-v18"',
    'architecture: "secure-teacher-gateway-fluid-projectile-gameplay-v20-and-reporting-v18"',
    "gateway gameplay architecture label"
  );
  return source;
}

function patchServerSource(input) {
  let source = baseRuntime.patchServerSource(input);

  source = replaceRequired(source, "const PLAYER_SPEED = 450;", "const PLAYER_SPEED = 620;", "faster responsive movement");
  source = replaceRequired(source, "const DASH_SPEED = 1320;", "const DASH_SPEED = 1900;", "stronger dash speed");
  source = replaceRequired(source, "const DASH_DURATION_MS = 180;", "const DASH_DURATION_MS = 210;", "longer dash impulse");
  source = replaceRequired(source, "const DASH_COOLDOWN_MS = 2600;", "const DASH_COOLDOWN_MS = 1800;", "shorter dash cooldown");
  source = replaceRequired(source, "const PROJECTILE_SPEED = 1550;", "const PROJECTILE_SPEED = 2850;", "fast visible bullets");
  source = replaceRequired(source, "const PROJECTILE_LIFETIME_MS = 5200;", "const PROJECTILE_LIFETIME_MS = 2350;", "bounded projectile range");
  source = replaceRequired(source, "const PROJECTILE_RADIUS = 18;", "const PROJECTILE_RADIUS = 14;", "visual projectile radius");

  source = replaceRequired(
    source,
    `const HITSCAN_RANGE = 3900;
const HITSCAN_RADIUS = 14;
const TRACER_LIFETIME_MS = 145;
const HITSCAN_COOLDOWN_MS = 220;
const RAPID_HITSCAN_COOLDOWN_MS = 125;
const GLOBAL_SCORE_VERSION = 1;`,
    `const PROJECTILE_HIT_PADDING = 8;
const PROJECTILE_COOLDOWN_MS = 250;
const RAPID_PROJECTILE_COOLDOWN_MS = 115;
const CLIENT_INTERPOLATION_HINT_MS = 80;
const LONG_SHOT_PADDING_START = 1800;
const LONG_SHOT_PADDING_STEP = 520;
const LONG_SHOT_PADDING_MAX = 10;
const GLOBAL_SCORE_VERSION = 1;`,
    "projectile gameplay constants"
  );

  source = source.replaceAll("authoritative-semi-auto-hitscan", "authoritative-swept-projectile-v20");
  source = source.replaceAll("20260723-hitscan-reporting18", "20260723-fluid-projectile20");

  source = replaceRequired(
    source,
    `      range: HITSCAN_RANGE,
      tracerLifetimeMs: TRACER_LIFETIME_MS`,
    `      projectileSpeed: PROJECTILE_SPEED,
      projectileLifetimeMs: PROJECTILE_LIFETIME_MS,
      projectileRadius: PROJECTILE_RADIUS,
      hitPadding: PROJECTILE_HIT_PADDING,
      simulationHz: TICK_RATE,
      snapshotHz: STATE_RATE,
      interpolationHintMs: CLIENT_INTERPOLATION_HINT_MS`,
    "projectile metadata"
  );

  source = replacePattern(
    source,
    /  fireVolley\(player, now\) \{[\s\S]*?\n  \}\n  combatIdentity/,
    `  fireVolley(player, now) {
    if (player.ammo <= 0 || this.projectiles.size >= MAX_PROJECTILES) return;
    const size = this.volleySize(player);
    const offsets = size === 1
      ? [0]
      : size === 2
        ? [-VOLLEY_SPREAD_RADIANS * 0.46, VOLLEY_SPREAD_RADIANS * 0.46]
        : [-VOLLEY_SPREAD_RADIANS * 0.82, 0, VOLLEY_SPREAD_RADIANS * 0.82];
    const available = Math.max(0, MAX_PROJECTILES - this.projectiles.size);
    const activeOffsets = offsets.slice(0, available);
    if (!activeOffsets.length) return;

    player.ammo -= 1;
    if (!Number.isFinite(player.nextAmmoRegenAt) || player.nextAmmoRegenAt <= now) player.nextAmmoRegenAt = now + AMMO_REGEN_INTERVAL_MS;
    player.nextShotAt = now + (now < player.rapidUntil ? RAPID_PROJECTILE_COOLDOWN_MS : PROJECTILE_COOLDOWN_MS);
    player.lastShotAt = now;

    for (const offset of activeOffsets) {
      const angle = player.angle + offset;
      const startX = player.x + Math.cos(angle) * (PLAYER_RADIUS + 14);
      const startY = player.y + Math.sin(angle) * (PLAYER_RADIUS + 14);
      const projectileId = id("shot");
      this.projectiles.set(projectileId, {
        id: projectileId,
        type: "bullet",
        ownerId: player.id,
        team: player.team,
        x: startX,
        y: startY,
        previousX: startX,
        previousY: startY,
        vx: Math.cos(angle) * PROJECTILE_SPEED,
        vy: Math.sin(angle) * PROJECTILE_SPEED,
        spawnedAt: now,
        expiresAt: now + PROJECTILE_LIFETIME_MS,
        distanceTraveled: 0,
        radius: PROJECTILE_RADIUS,
        volleySize: size
      });
      player.shotsFired += 1;
    }
  }
  combatIdentity`,
    "fast authoritative projectile volley"
  );

  source = replaceRequired(
    source,
    `const shootPressed = Boolean(player.input.shoot);
      const shootEdge = player.isBot ? shootPressed : shootPressed && !player.shootHeld;
      if (shootEdge && now >= player.nextShotAt && player.ammo > 0) this.fireVolley(player, now);
      player.shootHeld = shootPressed;`,
    `const shootPressed = Boolean(player.input.shoot);
      const automaticFire = player.isBot || now < player.rapidUntil;
      const shootEdge = automaticFire ? shootPressed : shootPressed && !player.shootHeld;
      if (shootEdge && now >= player.nextShotAt && player.ammo > 0) this.fireVolley(player, now);
      player.shootHeld = shootPressed;`,
    "rapid-fire hold and normal semi-auto edge"
  );

  source = replacePattern(
    source,
    /  updateProjectiles\(now\) \{[\s\S]*?\n  \}\n  updateQuestionsAndRespawns/,
    `  updateProjectiles(now) {
    for (const [projectileId, projectile] of this.projectiles) {
      const startX = Number(projectile.x) || 0;
      const startY = Number(projectile.y) || 0;
      const endX = startX + projectile.vx * DT;
      const endY = startY + projectile.vy * DT;
      const segmentDistance = Math.hypot(endX - startX, endY - startY);

      projectile.previousX = startX;
      projectile.previousY = startY;
      projectile.x = endX;
      projectile.y = endY;
      projectile.distanceTraveled = (Number(projectile.distanceTraveled) || 0) + segmentDistance;

      if (
        now >= projectile.expiresAt ||
        endX < -PROJECTILE_RADIUS || endX > ARENA.width + PROJECTILE_RADIUS ||
        endY < -PROJECTILE_RADIUS || endY > ARENA.height + PROJECTILE_RADIUS
      ) {
        this.projectiles.delete(projectileId);
        continue;
      }

      const longShotPadding = clamp(
        (projectile.distanceTraveled - LONG_SHOT_PADDING_START) / LONG_SHOT_PADDING_STEP,
        0,
        LONG_SHOT_PADDING_MAX
      );
      const collisionRadius = PLAYER_RADIUS + PROJECTILE_RADIUS + PROJECTILE_HIT_PADDING + longShotPadding;

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
          if (killer) killer.shotsHit += 1;
          this.eliminate(target, killer);
          break;
        }
      }
    }
  }
  updateQuestionsAndRespawns`,
    "relative-motion swept projectile collision"
  );

  source = replaceRequired(
    source,
    `projectiles: [...this.projectiles.values()].map((projectile) => ({
        id: projectile.id,
        type: projectile.type || "tracer",
        team: projectile.team,
        ownerId: projectile.ownerId,
        startX: Math.round(projectile.startX),
        startY: Math.round(projectile.startY),
        endX: Math.round(projectile.endX),
        endY: Math.round(projectile.endY),
        x: Math.round(projectile.x),
        y: Math.round(projectile.y),
        spawnedAt: projectile.spawnedAt,
        expiresAt: projectile.expiresAt,
        hit: Boolean(projectile.hit),
        radius: HITSCAN_RADIUS
      })),`,
    `projectiles: [...this.projectiles.values()].map((projectile) => ({
        id: projectile.id,
        type: projectile.type || "bullet",
        team: projectile.team,
        ownerId: projectile.ownerId,
        x: Math.round(projectile.x * 10) / 10,
        y: Math.round(projectile.y * 10) / 10,
        previousX: Math.round((projectile.previousX ?? projectile.x) * 10) / 10,
        previousY: Math.round((projectile.previousY ?? projectile.y) * 10) / 10,
        vx: Math.round(projectile.vx),
        vy: Math.round(projectile.vy),
        spawnedAt: projectile.spawnedAt,
        expiresAt: projectile.expiresAt,
        distanceTraveled: Math.round(projectile.distanceTraveled || 0),
        volleySize: projectile.volleySize || 1,
        radius: PROJECTILE_RADIUS
      })),`,
    "projectile state payload"
  );

  source = replaceRequired(
    source,
    `lastShotAt: player.lastShotAt,
        shotReadyAt: player.nextShotAt,
        dashReadyAt: player.nextDashAt,
        volleySize: this.volleySize(player)`,
    `lastShotAt: player.lastShotAt,
        shotReadyAt: player.nextShotAt,
        shotCooldownMs: now < player.rapidUntil ? RAPID_PROJECTILE_COOLDOWN_MS : PROJECTILE_COOLDOWN_MS,
        dashReadyAt: player.nextDashAt,
        dashCooldownMs: DASH_COOLDOWN_MS,
        dashDurationMs: DASH_DURATION_MS,
        dashUntil: player.dashUntil,
        movementSpeed: PLAYER_SPEED,
        dashSpeed: DASH_SPEED,
        velocityX: Math.round(((player.x - (Number.isFinite(player.previousX) ? player.previousX : player.x)) / DT) * 10) / 10,
        velocityY: Math.round(((player.y - (Number.isFinite(player.previousY) ? player.previousY : player.y)) / DT) * 10) / 10,
        interpolationHintMs: CLIENT_INTERPOLATION_HINT_MS,
        rapidFire: now < player.rapidUntil,
        volleySize: this.volleySize(player)`,
    "movement and cooldown telemetry"
  );

  return source;
}

const currentNodeOptions = String(process.env.NODE_OPTIONS || "");
if (!currentNodeOptions.includes("runtime-v15.js")) process.env.NODE_OPTIONS = `${currentNodeOptions} --require=${__filename}`.trim();

const inheritedLoader = Module._extensions[".js"];
Module._extensions[".js"] = function triadV15Loader(module, filename) {
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
