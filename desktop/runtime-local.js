"use strict";

const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const baseRuntime = require("../server/runtime-v22.js");

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Triad local runtime could not find: ${label}`);
  return source.replace(search, replacement);
}

function replaceAllRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Triad local runtime could not find: ${label}`);
  return source.replaceAll(search, replacement);
}

function replacePattern(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`Triad local runtime could not find: ${label}`);
  return source.replace(pattern, replacement);
}

function patchGatewaySource(input) {
  let source = baseRuntime.patchGatewaySource(input);
  source = source.replaceAll("fair-question-rotation-local-results-v27", "desktop-neon-one-hit-v29");
  source = source.replaceAll("desktop-local-authoritative-v27", "desktop-neon-one-hit-v29");
  return source;
}

function patchServerSource(input) {
  let source = baseRuntime.patchServerSource(input);

  source = replaceRequired(
    source,
    "const MATCH_DURATION_MS = 10 * 60 * 1000;",
    "const MATCH_DURATION_MS = Math.max(1, Math.min(30, Number(process.env.TRIAD_MATCH_MINUTES || 10))) * 60 * 1000;",
    "configurable local match duration"
  );
  source = replaceRequired(
    source,
    "const STATE_RATE = 10;",
    "const STATE_RATE = Math.max(10, Math.min(30, Number(process.env.TRIAD_LOCAL_STATE_RATE || 20)));",
    "low-latency local snapshot rate"
  );
  source = replaceRequired(
    source,
    "const FULL_TERRITORY_EVERY = 40;",
    "const FULL_TERRITORY_EVERY = Math.max(40, STATE_RATE * 4);",
    "four-second local full-territory recovery"
  );
  source = replaceRequired(
    source,
    "const STATIC_META_EVERY = 80;",
    "const STATIC_META_EVERY = Math.max(80, STATE_RATE * 8);",
    "eight-second local metadata refresh"
  );

  source = replaceRequired(
    source,
    "const SOLO_BOT_THINK_INTERVAL_MS = 180;\nconst SOLO_BOT_SHOOT_RANGE_SQ = 2700 * 2700;",
    `const SOLO_BOT_THINK_INTERVAL_MS = 70;
const SOLO_BOT_SHOOT_RANGE_SQ = 4400 * 4400;
const NEON_AI_RETREAT_RANGE = 680;
const NEON_AI_PREFERRED_RANGE = 1550;
const NEON_AI_DODGE_LOOKAHEAD_SECONDS = 0.42;
const NEON_AI_DODGE_MISS_RADIUS = 170;
const NEON_AI_AIM_TOLERANCE = 0.14;
const NEON_AI_MAX_LEAD_SECONDS = 0.62;`,
    "strong local AI constants"
  );

  source = replacePattern(
    source,
    /  updateBots\(now\) \{[\s\S]*?\n  \}\n  updateAmmoRegeneration/,
    `  updateBots(now) {
    if (this.phase !== "playing" || now < (this._nextBotThinkAt || 0)) return;
    this._nextBotThinkAt = now + SOLO_BOT_THINK_INTERVAL_MS;

    const alivePlayers = [...this.players.values()].filter((player) => player.alive && (player.isBot || player.connected));
    const activeProjectiles = [...this.projectiles.values()];
    const ammoPickups = [...this.pickups.values()].filter((pickup) => pickup.type === "ammo");

    for (const bot of alivePlayers) {
      if (!bot.isBot || bot.currentQuestion) continue;

      let target = null;
      let targetDistanceSq = Number.POSITIVE_INFINITY;
      for (const candidate of alivePlayers) {
        if (candidate.id === bot.id || candidate.team === bot.team) continue;
        const dx = candidate.x - bot.x;
        const dy = candidate.y - bot.y;
        const distanceSq = dx * dx + dy * dy;
        const priority = distanceSq * (candidate.isBot ? 1 : 0.72);
        if (priority < targetDistanceSq) {
          targetDistanceSq = priority;
          target = candidate;
        }
      }

      let incomingThreat = null;
      let threatMissSq = Number.POSITIVE_INFINITY;
      for (const projectile of activeProjectiles) {
        if (projectile.team === bot.team) continue;
        const vx = Number(projectile.vx) || 0;
        const vy = Number(projectile.vy) || 0;
        const speedSq = vx * vx + vy * vy;
        if (speedSq < 1) continue;
        const relativeX = bot.x - Number(projectile.x || 0);
        const relativeY = bot.y - Number(projectile.y || 0);
        const intercept = clamp((relativeX * vx + relativeY * vy) / speedSq, 0, NEON_AI_DODGE_LOOKAHEAD_SECONDS);
        const missX = Number(projectile.x || 0) + vx * intercept - bot.x;
        const missY = Number(projectile.y || 0) + vy * intercept - bot.y;
        const missSq = missX * missX + missY * missY;
        if (intercept > 0.03 && missSq < NEON_AI_DODGE_MISS_RADIUS * NEON_AI_DODGE_MISS_RADIUS && missSq < threatMissSq) {
          incomingThreat = projectile;
          threatMissSq = missSq;
        }
      }

      const targetDx = target ? target.x - bot.x : 0;
      const targetDy = target ? target.y - bot.y : 0;
      const actualDistanceSq = target ? targetDx * targetDx + targetDy * targetDy : Number.POSITIVE_INFINITY;
      const distance = target ? Math.sqrt(actualDistanceSq) : Number.POSITIVE_INFINITY;
      const targetVelocityX = target ? (Number(target.x) - (Number.isFinite(target.previousX) ? Number(target.previousX) : Number(target.x))) / DT : 0;
      const targetVelocityY = target ? (Number(target.y) - (Number.isFinite(target.previousY) ? Number(target.previousY) : Number(target.y))) / DT : 0;
      const leadSeconds = target ? clamp(distance / Math.max(1, PROJECTILE_SPEED), 0, NEON_AI_MAX_LEAD_SECONDS) : 0;
      const predictedX = target ? target.x + targetVelocityX * leadSeconds : ARENA.width / 2;
      const predictedY = target ? target.y + targetVelocityY * leadSeconds : ARENA.height / 2;
      const baseAim = Math.atan2(predictedY - bot.y, predictedX - bot.x);
      const aimError = Math.sin(now / 410 + bot.id.length * 1.73) * 0.018;
      const aimAngle = baseAim + aimError;

      let moveX = 0;
      let moveY = 0;
      let shouldDash = false;

      if (incomingThreat) {
        const threatVx = Number(incomingThreat.vx) || 1;
        const threatVy = Number(incomingThreat.vy) || 0;
        const threatSpeed = Math.hypot(threatVx, threatVy) || 1;
        const direction = bot.id.charCodeAt(bot.id.length - 1) % 2 === 0 ? 1 : -1;
        moveX = (-threatVy / threatSpeed) * direction;
        moveY = (threatVx / threatSpeed) * direction;
        shouldDash = true;
      } else if (bot.ammo <= 0 && ammoPickups.length) {
        const pickup = [...ammoPickups].sort((a, b) =>
          Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y)
        )[0];
        const angle = Math.atan2(pickup.y - bot.y, pickup.x - bot.x);
        moveX = Math.cos(angle);
        moveY = Math.sin(angle);
      } else if (target) {
        const approachX = targetDx / Math.max(1, distance);
        const approachY = targetDy / Math.max(1, distance);
        const strafeDirection = bot.id.charCodeAt(Math.max(0, bot.id.length - 2)) % 2 === 0 ? 1 : -1;
        const strafeX = -approachY * strafeDirection;
        const strafeY = approachX * strafeDirection;
        const orbitWave = 0.62 + Math.sin(now / 540 + bot.id.length) * 0.18;

        if (distance < NEON_AI_RETREAT_RANGE) {
          moveX = -approachX + strafeX * 0.52;
          moveY = -approachY + strafeY * 0.52;
          shouldDash = true;
        } else if (distance > NEON_AI_PREFERRED_RANGE) {
          moveX = approachX + strafeX * 0.28;
          moveY = approachY + strafeY * 0.28;
        } else {
          moveX = strafeX * orbitWave + approachX * 0.12;
          moveY = strafeY * orbitWave + approachY * 0.12;
        }
      } else {
        const centerAngle = Math.atan2(ARENA.height / 2 - bot.y, ARENA.width / 2 - bot.x);
        moveX = Math.cos(centerAngle);
        moveY = Math.sin(centerAngle);
      }

      const movementMagnitude = Math.hypot(moveX, moveY) || 1;
      moveX /= movementMagnitude;
      moveY /= movementMagnitude;
      const currentAimError = target ? Math.abs(Math.atan2(Math.sin(aimAngle - Math.atan2(targetDy, targetDx)), Math.cos(aimAngle - Math.atan2(targetDy, targetDx)))) : Math.PI;
      const canShoot = Boolean(target && actualDistanceSq <= SOLO_BOT_SHOOT_RANGE_SQ && currentAimError <= NEON_AI_AIM_TOLERANCE && bot.ammo > 0);
      const dashReady = now >= Number(bot.ai?.nextDashAt || 0);
      const dash = dashReady && (shouldDash || (target && distance < 980 && Math.sin(now / 260 + bot.id.length) > 0.55));

      bot.input = { dx: moveX, dy: moveY, angle: aimAngle, shoot: canShoot, dash };
      if (dash && bot.ai) bot.ai.nextDashAt = now + 1650 + crypto.randomInt(900);
    }
  }
  updateAmmoRegeneration`,
    "predictive tactical bot controller"
  );

  source = replaceAllRequired(source, "victim.respawnAt = now + 1050;", "victim.respawnAt = now + 460;", "fast human life restart");
  source = replaceAllRequired(source, "respawnInMs: 1050", "respawnInMs: 460", "fast human restart message");
  source = replaceAllRequired(source, "victim.respawnAt = now + 2200;", "victim.respawnAt = now + 760;", "fast AI reboot");
  source = replaceAllRequired(source, "this.assignQuestion(victim, 280);", "this.assignQuestion(victim, 180);", "three-strike question transition");
  source = replaceAllRequired(source, "player.respawnAt = now + 700;", "player.respawnAt = now + 360;", "fast correct-answer restart");
  source = replaceAllRequired(source, "respawnInMs: 700", "respawnInMs: 360", "fast correct-answer message");
  source = replaceAllRequired(source, "this.assignQuestion(player, 500);", "this.assignQuestion(player, 260);", "fast retry after wrong answer");
  source = replaceAllRequired(source, "player.invulnerableUntil = Date.now() + 1600;", "player.invulnerableUntil = Date.now() + 520;", "short respawn protection");
  source = replaceAllRequired(source, "invulnerableUntil: Date.now() + 2500", "invulnerableUntil: Date.now() + 1300", "short opening protection");

  source = replaceRequired(
    source,
    "      groupScoreFormula: GROUP_SCORE_FORMULA,\n      players:",
    `      groupScoreFormula: GROUP_SCORE_FORMULA,
      combatRule: "one-hit-one-life-three-strikes-geometry-check",
      fastRestartMs: 460,
      players:`,
    "live one-hit combat metadata"
  );
  source = replaceRequired(
    source,
    `    report.winnerRule = "territory-then-eliminations-then-correct-answers-then-fewer-wrong-answers";
    report.metadata = buildMatchMetadata(report);`,
    `    report.winnerRule = "territory-then-eliminations-then-correct-answers-then-fewer-wrong-answers";
    report.combatRule = "one-hit-one-life-three-strikes-geometry-check";
    report.fastRestartMs = 460;
    report.metadata = buildMatchMetadata(report);`,
    "report one-hit combat metadata"
  );

  source = source.replaceAll("20260725-fair-question-rotation27", "20260726-neon-tactical29");
  source = source.replaceAll("20260725-desktop-local27", "20260726-neon-tactical29");
  source = source.replaceAll("fair-question-rotation-local-results-v27", "desktop-neon-one-hit-v29");
  source = source.replaceAll("desktop-local-authoritative-v27", "desktop-neon-one-hit-v29");
  return source;
}

const currentNodeOptions = String(process.env.NODE_OPTIONS || "");
if (!currentNodeOptions.includes("runtime-local.js")) process.env.NODE_OPTIONS = `${currentNodeOptions} --require=${__filename}`.trim();

const inheritedLoader = Module._extensions[".js"];
Module._extensions[".js"] = function triadDesktopLocalLoader(moduleToLoad, filename) {
  const basename = path.basename(filename);
  if (basename === "server-v3.js") {
    moduleToLoad._compile(patchServerSource(fs.readFileSync(filename, "utf8")), filename);
    return;
  }
  if (basename === "secure-gateway.js") {
    moduleToLoad._compile(patchGatewaySource(fs.readFileSync(filename, "utf8")), filename);
    return;
  }
  inheritedLoader(moduleToLoad, filename);
};

module.exports = { patchGatewaySource, patchServerSource };