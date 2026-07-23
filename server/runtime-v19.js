"use strict";

const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const baseRuntime = require("./runtime-v18.js");

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Triad v19 patch could not find: ${label}`);
  return source.replace(search, replacement);
}

function replacePattern(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`Triad v19 patch could not find: ${label}`);
  return source.replace(pattern, replacement);
}

function patchGatewaySource(input) {
  let source = baseRuntime.patchGatewaySource(input);
  source = source.replaceAll(
    "one-master-code-nine-isolated-human-vs-bots-channels-v24",
    "fluid-clean-nine-isolated-channels-v25"
  );
  return source;
}

function patchServerSource(input) {
  let source = baseRuntime.patchServerSource(input);

  source = replaceRequired(source, "const TICK_RATE = 40;", "const TICK_RATE = 30;", "balanced 30 Hz physics");
  source = replaceRequired(source, "const FULL_TERRITORY_EVERY = 20;", "const FULL_TERRITORY_EVERY = 40;", "four-second full territory recovery");
  source = replaceRequired(source, "const STATIC_META_EVERY = 50;", "const STATIC_META_EVERY = 80;", "eight-second static metadata refresh");
  source = replaceRequired(source, "const MAX_PROJECTILES = 120;", "const MAX_PROJECTILES = 78;", "bounded projectile population for nine channels");

  source = replaceRequired(
    source,
    "const SOLO_CHANNEL_LABELS = Object.freeze([\"A\", \"B\", \"C\", \"D\", \"E\", \"F\", \"G\", \"H\", \"I\"]);",
    `const SOLO_CHANNEL_LABELS = Object.freeze(["A", "B", "C", "D", "E", "F", "G", "H", "I"]);
const SOLO_BOT_THINK_INTERVAL_MS = 140;
const SOLO_BOT_SHOOT_RANGE_SQ = 3100 * 3100;
const SOLO_PROJECTILE_STREAM_RADIUS_SQ = 5200 * 5200;
const SOLO_TICK_STAGGER_STEP_MS = Math.max(1, Math.floor((1000 / TICK_RATE) / SOLO_CHANNEL_CAPACITY));`,
    "fluid solo-channel constants"
  );

  source = replacePattern(
    source,
    /  updateBots\(now\) \{[\s\S]*?\n  \}\n  tick\(\)/,
    `  updateBots(now) {
    if (this.phase !== "playing" || now < (this._nextBotThinkAt || 0)) return;
    this._nextBotThinkAt = now + SOLO_BOT_THINK_INTERVAL_MS;
    const alivePlayers = [...this.players.values()].filter((player) => player.alive);
    for (const bot of alivePlayers) {
      if (!bot.isBot) continue;
      let target = null;
      let nearestDistanceSq = Number.POSITIVE_INFINITY;
      for (const candidate of alivePlayers) {
        if (candidate.team === bot.team || candidate.id === bot.id) continue;
        const dx = candidate.x - bot.x;
        const dy = candidate.y - bot.y;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq < nearestDistanceSq) {
          nearestDistanceSq = distanceSq;
          target = candidate;
        }
      }
      const goalX = target ? target.x : ARENA.width / 2;
      const goalY = target ? target.y : ARENA.height / 2;
      const angle = Math.atan2(goalY - bot.y, goalX - bot.x);
      const strafe = Math.sin(now / 760 + bot.id.length * 0.37) * 0.3;
      const dash = now >= bot.ai.nextDashAt;
      bot.input = {
        dx: Math.cos(angle) - Math.sin(angle) * strafe,
        dy: Math.sin(angle) + Math.cos(angle) * strafe,
        angle,
        shoot: Boolean(target && nearestDistanceSq <= SOLO_BOT_SHOOT_RANGE_SQ),
        dash
      };
      if (dash) bot.ai.nextDashAt = now + 3000 + crypto.randomInt(2400);
    }
  }
  tick()`,
    "throttled nearest-target bot decisions"
  );

  source = replaceRequired(
    source,
    "  statePayload(now) {\n    const territoryCounts = this.territoryCounts();",
    `  statePayload(now) {
    const soloFocusPlayer = [...this.players.values()].find((player) => !player.isBot && player.connected)
      || [...this.players.values()].find((player) => !player.isBot)
      || null;
    const territoryCounts = this.territoryCounts();`,
    "student-centered state focus"
  );

  if (!source.includes("        students: player.students,")) throw new Error("Triad v19 patch could not find: repeated player student aliases");
  source = source.replaceAll(
    "        students: player.students,",
    "        students: player.isBot ? undefined : player.students,"
  );

  source = replaceRequired(
    source,
    "      projectiles: [...this.projectiles.values()].map((projectile) => ({",
    `      projectiles: [...this.projectiles.values()]
        .filter((projectile) => !soloFocusPlayer || ((projectile.x - soloFocusPlayer.x) ** 2 + (projectile.y - soloFocusPlayer.y) ** 2) <= SOLO_PROJECTILE_STREAM_RADIUS_SQ)
        .map((projectile) => ({`,
    "nearby projectile stream"
  );

  source = replaceRequired(
    source,
    "    const room = new Room(internalCode);",
    `    const room = new Room(internalCode);
    clearInterval(room.tickHandle);
    room.tickHandle = null;
    room._soloTickStartTimer = setTimeout(() => {
      room.tickHandle = setInterval(() => room.tick(), 1000 / TICK_RATE);
    }, Math.max(0, (channelNumber - 1) * SOLO_TICK_STAGGER_STEP_MS));
    const originalRoomDestroy = room.destroy.bind(room);
    room.destroy = () => {
      clearTimeout(room._soloTickStartTimer);
      originalRoomDestroy();
    };`,
    "staggered channel simulation timers"
  );

  source = source.replaceAll("20260723-solo-nine-channels24", "20260723-fluid-clean25");
  source = source.replaceAll("one-master-code-nine-independent-channels", "fluid-clean-nine-independent-channels-v25");
  source = source.replaceAll("one-master-code-nine-isolated-human-vs-bots-channels-v24", "fluid-clean-nine-isolated-channels-v25");

  return source;
}

const currentNodeOptions = String(process.env.NODE_OPTIONS || "");
if (!currentNodeOptions.includes("runtime-v19.js")) process.env.NODE_OPTIONS = `${currentNodeOptions} --require=${__filename}`.trim();

const inheritedLoader = Module._extensions[".js"];
Module._extensions[".js"] = function triadV19Loader(moduleToLoad, filename) {
  if (path.dirname(filename) === __dirname && path.basename(filename) === "server-v3.js") {
    moduleToLoad._compile(patchServerSource(fs.readFileSync(filename, "utf8")), filename);
    return;
  }
  if (path.dirname(filename) === __dirname && path.basename(filename) === "secure-gateway.js") {
    moduleToLoad._compile(patchGatewaySource(fs.readFileSync(filename, "utf8")), filename);
    return;
  }
  inheritedLoader(moduleToLoad, filename);
};

module.exports = { patchGatewaySource, patchServerSource };
