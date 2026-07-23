"use strict";

const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const baseRuntime = require("./runtime-v20.js");

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Triad v21 patch could not find: ${label}`);
  return source.replace(search, replacement);
}

function patchGatewaySource(input) {
  return baseRuntime.patchGatewaySource(input);
}

function patchServerSource(input) {
  let source = baseRuntime.patchServerSource(input);
  if (source.includes("  updateAmmoRegeneration(now) {")) return source;

  const tick = '  tick() { const now = Date.now(); if (this.phase === "playing") { if (now >= this.endsAt) { this.endMatch(); return; } this.updateBots(now); this.updatePlayers(now); this.updateAmmoRegeneration(now); this.updatePickups(now); this.updateProjectiles(now); this.updateQuestionsAndRespawns(now); } if (now - this.lastStateAt >= 1000 / STATE_RATE) { this.lastStateAt = now; if (this.phase !== "lobby" || this.controller?.connected) this.broadcastState(now); } if (!this.controller?.connected && this.players.size === 0 && this.pending.size === 0 && now - this.updatedAt > ROOM_IDLE_TTL_MS) this.destroy(); }';
  const method = `  updateAmmoRegeneration(now) {
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
      if (!player.isBot) safeSend(player.ws, {
        type: "ammo_regenerated",
        ammo: player.ammo,
        maxAmmo: MAX_AMMO,
        nextInMs: player.ammo >= MAX_AMMO ? 0 : Math.max(0, player.nextAmmoRegenAt - now)
      });
    }
  }
${tick}`;

  source = replaceRequired(source, tick, method, "authoritative ammo-regeneration method");
  return source;
}

const currentNodeOptions = String(process.env.NODE_OPTIONS || "");
if (!currentNodeOptions.includes("runtime-v21.js")) process.env.NODE_OPTIONS = `${currentNodeOptions} --require=${__filename}`.trim();

const inheritedLoader = Module._extensions[".js"];
Module._extensions[".js"] = function triadV21Loader(moduleToLoad, filename) {
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
