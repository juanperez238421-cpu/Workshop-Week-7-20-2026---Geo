"use strict";

const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");

const MUSIC_TEAM_NAMES = Object.freeze([
  "Paint It Black",
  "Gimme Shelter",
  "Sympathy for the Devil",
  "Start Me Up",
  "Comfortably Numb",
  "Wish You Were Here",
  "Another Brick in the Wall",
  "Time",
  "Feel Good Inc.",
  "Clint Eastwood",
  "DARE",
  "On Melancholy Hill",
  "Seven Nation Army",
  "Come As You Are",
  "Dreams",
  "Heroes",
  "Take On Me",
  "Sweet Child O' Mine"
]);

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`Triad runtime patch could not find: ${label}`);
  }
  return source.replace(search, replacement);
}

function patchServerSource(input) {
  let source = String(input);

  source = replaceRequired(
    source,
    'const DEFAULT_TEAM_NAMES = ["Team 1", "Team 2", "Team 3"];',
    `const DEFAULT_TEAM_NAMES = ["Team 1", "Team 2", "Team 3"];\nconst MUSIC_TEAM_NAMES = ${JSON.stringify([...MUSIC_TEAM_NAMES])};`,
    "default team names"
  );

  source = replaceRequired(
    source,
    "function randomTeamColors() { return shuffled(COLOR_PALETTE).slice(0, 3); }",
    "function randomTeamColors() { return shuffled(COLOR_PALETTE).slice(0, 3); }\nfunction randomMusicTeamNames() { return shuffled(MUSIC_TEAM_NAMES).slice(0, 3); }",
    "random team color helper"
  );

  source = replaceRequired(
    source,
    "this.teamColors = randomTeamColors(); this.teamNames = [...DEFAULT_TEAM_NAMES]; this.teamNamesFinalized = [false, false, false];",
    "this.teamColors = randomTeamColors(); this.teamNames = randomMusicTeamNames(); this.teamNamesFinalized = [true, true, true];",
    "room team initialization"
  );

  source = replaceRequired(
    source,
    "ready: isBot, proposalsSubmitted: false, votesSubmitted: false,",
    "ready: isBot, proposalsSubmitted: true, votesSubmitted: true,",
    "player readiness defaults"
  );

  source = replaceRequired(
    source,
    'const team = player.team; this.players.delete(player.id); closeWithMessage(player.ws, "You were removed from the room by the teacher."); this.resetTeamNaming(team); this.sendLobby();',
    'this.players.delete(player.id); closeWithMessage(player.ws, "You were removed from the room by the teacher."); this.sendLobby();',
    "player removal voting reset"
  );

  source = replaceRequired(
    source,
    "this.players.set(bot.id, bot); this.seedBotProposals(bot); } for (const team of [0, 1, 2]) this.autoVoteBots(team); this.sendLobby();",
    "this.players.set(bot.id, bot); } this.sendLobby();",
    "bot voting setup"
  );

  source = replaceRequired(
    source,
    "for (const team of [0, 1, 2]) this.resetTeamNaming(team); this.sendLobby(); this.broadcastEvent(\"All AI bots were removed.\");",
    "this.sendLobby(); this.broadcastEvent(\"All AI bots were removed.\");",
    "bot removal voting reset"
  );

  source = replaceRequired(
    source,
    'setReady(playerId, ready) { if (this.phase !== "lobby") return; const player = this.players.get(playerId); if (!player || !player.connected || player.isBot) return; const status = this.teamNamingStatus(player.team); if (ready && (!player.proposalsSubmitted || !player.votesSubmitted || !status.finalized)) throw new Error("Complete all three suggestions and votes before marking ready."); player.ready = Boolean(ready); this.sendLobby(); }',
    'setReady(playerId, ready) { if (this.phase !== "lobby") return; const player = this.players.get(playerId); if (!player || !player.connected || player.isBot) return; player.ready = Boolean(ready); this.sendLobby(); }',
    "ready gate"
  );

  source = replaceRequired(
    source,
    'if (!this.teamNamesFinalized.every(Boolean)) blockers.push("team-name voting incomplete"); ',
    "",
    "start voting blocker"
  );

  source = replaceRequired(
    source,
    'this.pending.set(registrationId, registration); ws.role = "pending";',
    'this.pending.set(registrationId, registration); safeSend(this.controller?.ws, { type: "registration_pending", roomCode: this.code, pendingCount: this.pending.size, registrationId, pcLabel, students }); ws.role = "pending";',
    "direct teacher registration notification"
  );

  source = replaceRequired(
    source,
    'assertController(ws) { if (!this.controller || this.controller.ws !== ws || ws.role !== "controller") throw new Error("Teacher controller authorization required."); }',
    'changeRoomCode(controllerWs, newCodeValue) { this.assertController(controllerWs); if (this.phase !== "lobby") throw new Error("The player room PIN can only be changed in the lobby."); if (this.players.size || this.pending.size) throw new Error("Change the player room PIN before any player registers."); const newCode = String(newCodeValue || "").trim().toUpperCase(); if (!/^[A-Z2-9]{6}$/.test(newCode)) throw new Error("Use exactly six characters: A-Z and 2-9."); if (newCode === this.code) return; if (rooms.has(newCode)) throw new Error("That player room PIN is already in use."); const oldCode = this.code; rooms.delete(oldCode); this.code = newCode; rooms.set(newCode, this); if (this.controller?.ws) this.controller.ws.roomCode = newCode; this.updatedAt = Date.now(); this.sendLobby(); this.broadcastEvent(`Player room PIN changed from ${oldCode} to ${newCode}.`); }\n  assertController(ws) { if (!this.controller || this.controller.ws !== ws || ws.role !== "controller") throw new Error("Teacher controller authorization required."); }',
    "room PIN controller method"
  );

  source = replaceRequired(
    source,
    'case "restore_control": roomFromMessage(message).attachController(ws, String(message.masterToken || "")); break;',
    'case "restore_control": roomFromMessage(message).attachController(ws, String(message.masterToken || "")); break;\n  case "change_room_code": rooms.get(ws.roomCode)?.changeRoomCode(ws, message.newRoomCode); break;',
    "room PIN message handler"
  );

  source = replaceRequired(
    source,
    'case "set_registration_lock": rooms.get(ws.roomCode)?.setRegistrationLock(ws, message.locked); break;',
    'case "set_registration_lock": { const room = rooms.get(ws.roomCode); if (message.newRoomCode) room?.changeRoomCode(ws, message.newRoomCode); else room?.setRegistrationLock(ws, message.locked); break; }',
    "authenticated room PIN transport"
  );

  return source;
}

const currentNodeOptions = String(process.env.NODE_OPTIONS || "");
if (!currentNodeOptions.includes("runtime-patch.js")) {
  process.env.NODE_OPTIONS = `${currentNodeOptions} --require=${__filename}`.trim();
}

const originalJsLoader = Module._extensions[".js"];
Module._extensions[".js"] = function triadMusicModeLoader(module, filename) {
  if (path.dirname(filename) === __dirname && path.basename(filename) === "server-v3.js") {
    const patched = patchServerSource(fs.readFileSync(filename, "utf8"));
    module._compile(patched, filename);
    return;
  }
  originalJsLoader(module, filename);
};

module.exports = { MUSIC_TEAM_NAMES, patchServerSource };
