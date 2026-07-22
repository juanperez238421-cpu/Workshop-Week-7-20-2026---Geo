"use strict";

const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const geometryRuntime = require("./runtime-v7.js");

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Triad v8 patch could not find: ${label}`);
  return source.replace(search, replacement);
}

function replacePattern(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`Triad v8 patch could not find: ${label}`);
  return source.replace(pattern, replacement);
}

function patchGatewaySource(input) {
  return geometryRuntime.patchGatewaySource(input);
}

function patchServerSource(input) {
  let source = geometryRuntime.patchServerSource(input);

  source = replacePattern(
    source,
    /  setReady\(playerId, ready\) \{[^\n]+\}/,
    `  selectTeam(playerId, value) {
    if (this.phase !== "lobby") throw new Error("Team selection is available only in the lobby.");
    const player = this.players.get(String(playerId || ""));
    if (!player || player.isBot || !player.connected) throw new Error("The real player session is not available.");
    if (player.ready) throw new Error("Cancel Ready before changing teams.");
    const team = validTeam(value);
    if (team === player.team) {
      safeSend(player.ws, { type: "team_selected", team, teamName: this.teamNames[team], unchanged: true });
      return;
    }

    const oldTeam = player.team;
    const targetMembers = [...this.players.values()].filter((candidate) => candidate.id !== player.id && candidate.team === team);
    if (targetMembers.length >= PLAYERS_PER_TEAM) {
      const swapBot = targetMembers.find((candidate) => candidate.isBot);
      if (!swapBot) throw new Error(this.teamNames[team] + " already has three real players.");
      swapBot.team = oldTeam;
      const botSlot = [...this.players.values()].filter((candidate) => candidate.id !== swapBot.id && candidate.team === oldTeam).length;
      const botSpawn = teamSpawn(oldTeam, botSlot);
      swapBot.x = botSpawn.x; swapBot.y = botSpawn.y; swapBot.angle = 0;
    }

    player.team = team;
    player.ready = false;
    const slot = [...this.players.values()].filter((candidate) => candidate.id !== player.id && candidate.team === team).length;
    const spawn = teamSpawn(team, slot);
    player.x = spawn.x; player.y = spawn.y; player.angle = 0;
    safeSend(player.ws, { type: "team_selected", team, teamName: this.teamNames[team] });
    this.sendLobby();
    this.broadcastEvent(player.pcLabel + " selected " + this.teamNames[team] + ".");
  }
  setReady(playerId, ready) { if (this.phase !== "lobby") return; const player = this.players.get(playerId); if (!player || !player.connected || player.isBot) return; player.ready = Boolean(ready); this.sendLobby(); }`,
    "player team selector"
  );

  source = replaceRequired(
    source,
    'case "set_ready": rooms.get(ws.roomCode)?.setReady(ws.playerId, message.ready); break;',
    'case "select_team": rooms.get(ws.roomCode)?.selectTeam(ws.playerId, message.team); break;\n  case "set_ready": rooms.get(ws.roomCode)?.setReady(ws.playerId, message.ready); break;',
    "select-team message handler"
  );

  source = replacePattern(
    source,
    /  eliminate\(victim, killer\) \{[\s\S]*?\n  \}\n  respawn\(player\)/,
    `  eliminate(victim, killer) {
    const now = Date.now();
    if (!victim.alive || now < victim.invulnerableUntil) return;
    victim.alive = false;
    victim.deaths += 1;
    victim.lives = Math.max(0, victim.lives - 1);
    victim.input = { dx: 0, dy: 0, angle: victim.angle, shoot: false, dash: false };
    victim.speedUntil = 0; victim.rapidUntil = 0; victim.paintUntil = 0; victim.shieldUntil = 0; victim.activePower = "";
    if (killer && killer.id !== victim.id) killer.kills += 1;

    const humanVersusHuman = Boolean(killer && killer.id !== victim.id && !killer.isBot && !victim.isBot);
    if (humanVersusHuman) {
      const text = this.combatIdentity(killer) + " eliminated " + this.combatIdentity(victim) + ".";
      this.broadcast({
        type: "event",
        kind: "elimination",
        text: text + " " + victim.lives + " life" + (victim.lives === 1 ? "" : "s") + " remaining.",
        at: now,
        killer: { id: killer.id, pcLabel: killer.pcLabel, students: killer.students, team: killer.team, teamName: this.teamNames[killer.team], isBot: false },
        victim: { id: victim.id, pcLabel: victim.pcLabel, students: victim.students, team: victim.team, teamName: this.teamNames[victim.team], isBot: false, lives: victim.lives }
      });
    }

    if (victim.lives > 0) {
      victim.respawnAt = now + 1050;
      safeSend(victim.ws, { type: "life_lost", lives: victim.lives, respawnInMs: 1050 });
      return;
    }
    if (victim.isBot) {
      victim.lives = MAX_LIVES;
      victim.ammo = MAX_AMMO;
      victim.respawnAt = now + 2200;
      return;
    }
    victim.respawnAt = 0;
    this.assignQuestion(victim, 280);
  }
  respawn(player)`,
    "human-only elimination announcements"
  );

  return source;
}

const currentNodeOptions = String(process.env.NODE_OPTIONS || "");
if (!currentNodeOptions.includes("runtime-v8.js")) process.env.NODE_OPTIONS = `${currentNodeOptions} --require=${__filename}`.trim();

const inheritedLoader = Module._extensions[".js"];
Module._extensions[".js"] = function triadV8Loader(module, filename) {
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
