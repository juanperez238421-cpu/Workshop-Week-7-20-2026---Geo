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
    "const ARENA = Object.freeze({ width: 1600, height: 1000, gridWidth: 40, gridHeight: 25 });",
    "const ARENA = Object.freeze({ width: 6400, height: 4000, gridWidth: 40, gridHeight: 25 });",
    "large arena dimensions"
  );

  source = replaceRequired(source, "const PLAYER_SPEED = 230;", "const PLAYER_SPEED = 270;", "player speed");
  source = replaceRequired(source, "const DASH_SPEED = 610;", "const DASH_SPEED = 760;", "dash speed");
  source = replaceRequired(source, "const SHOT_COOLDOWN_MS = 380;", "const SHOT_COOLDOWN_MS = 460;", "shot cooldown");
  source = replaceRequired(source, "const PROJECTILE_SPEED = 760;", "const PROJECTILE_SPEED = 1020;", "projectile speed");
  source = replaceRequired(
    source,
    "const PROJECTILE_LIFETIME_MS = 1400;",
    "const PROJECTILE_LIFETIME_MS = 2200;\nconst COHESION_RADIUS = 520;\nconst VOLLEY_SPREAD_RADIANS = 0.085;",
    "cohesion constants"
  );

  source = replaceRequired(
    source,
    "function teamSpawn(team, slot = 0) { const bases = [{ x: 180, y: 180 }, { x: ARENA.width - 180, y: 180 }, { x: ARENA.width / 2, y: ARENA.height - 170 }]; const angle = (Math.PI * 2 * slot) / 3 + Math.random() * 0.35; return { x: clamp(bases[team].x + Math.cos(angle) * 70, 50, ARENA.width - 50), y: clamp(bases[team].y + Math.sin(angle) * 70, 50, ARENA.height - 50) }; }",
    `function teamSpawn(team, slot = 0) {
  const bases = [{ x: 900, y: 800 }, { x: ARENA.width - 900, y: 800 }, { x: ARENA.width / 2, y: ARENA.height - 750 }];
  const formations = [
    [{ x: -520, y: 240 }, { x: 520, y: 240 }, { x: 0, y: -520 }],
    [{ x: 520, y: 240 }, { x: -520, y: 240 }, { x: 0, y: -520 }],
    [{ x: -520, y: -180 }, { x: 520, y: -180 }, { x: 0, y: 520 }]
  ];
  const offset = formations[team][slot % PLAYERS_PER_TEAM];
  const jitterX = crypto.randomInt(-70, 71);
  const jitterY = crypto.randomInt(-70, 71);
  return {
    x: clamp(bases[team].x + offset.x + jitterX, 80, ARENA.width - 80),
    y: clamp(bases[team].y + offset.y + jitterY, 80, ARENA.height - 80)
  };
}`,
    "dispersed team spawn"
  );

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
    'updateBots(now) { if (this.phase !== "playing") return; const enemiesByTeam = [0, 1, 2].map((team) => [...this.players.values()].filter((p) => p.team !== team && p.alive)); for (const bot of this.players.values()) { if (!bot.isBot || !bot.alive) continue; const enemies = enemiesByTeam[bot.team]; const target = enemies.sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y))[0]; const goal = target || { x: ARENA.width / 2, y: ARENA.height / 2 }; const angle = Math.atan2(goal.y - bot.y, goal.x - bot.x); const strafe = Math.sin(now / 700 + bot.id.length) * 0.32; bot.input = { dx: Math.cos(angle) - Math.sin(angle) * strafe, dy: Math.sin(angle) + Math.cos(angle) * strafe, angle, shoot: Boolean(target && Math.hypot(target.x - bot.x, target.y - bot.y) < 650), dash: now >= bot.ai.nextDashAt }; if (bot.input.dash) bot.ai.nextDashAt = now + 2800 + crypto.randomInt(2200); } }',
    `updateBots(now) {
    if (this.phase !== "playing") return;
    for (const bot of this.players.values()) {
      if (!bot.isBot || !bot.alive) continue;
      const teammates = [...this.players.values()].filter((candidate) => candidate.id !== bot.id && candidate.team === bot.team && candidate.alive && (candidate.isBot || candidate.connected));
      const enemies = [...this.players.values()].filter((candidate) => candidate.team !== bot.team && candidate.alive && (candidate.isBot || candidate.connected));
      const nearestTeammate = teammates.sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y))[0];
      const target = enemies.sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y))[0];
      const regroup = this.volleySize(bot) < 2 && nearestTeammate;
      const goal = regroup ? nearestTeammate : target || { x: ARENA.width / 2, y: ARENA.height / 2 };
      const angle = Math.atan2(goal.y - bot.y, goal.x - bot.x);
      const strafe = regroup ? 0 : Math.sin(now / 700 + bot.id.length) * 0.3;
      bot.input = {
        dx: Math.cos(angle) - Math.sin(angle) * strafe,
        dy: Math.sin(angle) + Math.cos(angle) * strafe,
        angle: target ? Math.atan2(target.y - bot.y, target.x - bot.x) : angle,
        shoot: Boolean(target && !regroup && Math.hypot(target.x - bot.x, target.y - bot.y) < 1800),
        dash: now >= bot.ai.nextDashAt
      };
      if (bot.input.dash) bot.ai.nextDashAt = now + 3000 + crypto.randomInt(2200);
    }
  }`,
    "cohesion-aware bot behavior"
  );

  source = replaceRequired(
    source,
    'eliminate(victim, killer) { if (!victim.alive || Date.now() < victim.invulnerableUntil) return; victim.alive = false; victim.deaths += 1; victim.respawnAt = victim.isBot ? Date.now() + 1500 : 0; victim.input = { dx: 0, dy: 0, angle: victim.angle, shoot: false, dash: false }; if (killer && killer.id !== victim.id) killer.kills += 1; this.broadcastEvent(`${victim.pcLabel} was eliminated${killer ? ` by ${killer.pcLabel}` : ""}.${victim.isBot ? " AI rebooting." : " Trigonometry is required to respawn."}`); if (!victim.isBot) this.assignQuestion(victim, 350); }',
    `volleySize(player) {
    if (!player?.alive) return 1;
    const nearby = [...this.players.values()].filter((candidate) => candidate.team === player.team && candidate.alive && (candidate.isBot || candidate.connected) && Math.hypot(candidate.x - player.x, candidate.y - player.y) <= COHESION_RADIUS);
    return clamp(nearby.length, 1, PLAYERS_PER_TEAM);
  }
  fireVolley(player, now) {
    const size = this.volleySize(player);
    const offsets = size === 1 ? [0] : size === 2 ? [-VOLLEY_SPREAD_RADIANS * 0.55, VOLLEY_SPREAD_RADIANS * 0.55] : [-VOLLEY_SPREAD_RADIANS, 0, VOLLEY_SPREAD_RADIANS];
    player.nextShotAt = now + SHOT_COOLDOWN_MS;
    for (const offset of offsets) {
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
        expiresAt: now + PROJECTILE_LIFETIME_MS,
        volleySize: size
      });
    }
  }
  combatIdentity(player) {
    if (!player) return "Arena";
    const teamName = this.teamNames[player.team] || ("Team " + (player.team + 1));
    if (player.isBot) return player.pcLabel + " (AI · " + teamName + ")";
    return player.pcLabel + " [" + player.students.join(" · ") + "] (" + teamName + ")";
  }
  eliminate(victim, killer) {
    if (!victim.alive || Date.now() < victim.invulnerableUntil) return;
    victim.alive = false;
    victim.deaths += 1;
    victim.respawnAt = victim.isBot ? Date.now() + 1500 : 0;
    victim.input = { dx: 0, dy: 0, angle: victim.angle, shoot: false, dash: false };
    if (killer && killer.id !== victim.id) killer.kills += 1;
    const killerText = this.combatIdentity(killer);
    const victimText = this.combatIdentity(victim);
    const text = killer ? (killerText + " eliminated " + victimText + ".") : (victimText + " was eliminated.");
    this.broadcast({
      type: "event",
      kind: "elimination",
      text: text + (victim.isBot ? " AI rebooting." : " Trigonometry is required to respawn."),
      at: Date.now(),
      killer: killer ? { id: killer.id, pcLabel: killer.pcLabel, students: killer.isBot ? [] : killer.students, team: killer.team, teamName: this.teamNames[killer.team], isBot: killer.isBot } : null,
      victim: { id: victim.id, pcLabel: victim.pcLabel, students: victim.isBot ? [] : victim.students, team: victim.team, teamName: this.teamNames[victim.team], isBot: victim.isBot }
    });
    if (!victim.isBot) this.assignQuestion(victim, 350);
  }`,
    "detailed elimination announcement and volley helpers"
  );

  source = replaceRequired(
    source,
    'updatePlayers(now) { for (const player of this.players.values()) { if ((!player.isBot && !player.connected) || !player.alive || player.currentQuestion) continue; let { dx, dy } = player.input; const magnitude = Math.hypot(dx, dy); if (magnitude > 1) { dx /= magnitude; dy /= magnitude; } if (player.input.dash && now >= player.nextDashAt && magnitude > 0.05) { player.dashUntil = now + DASH_DURATION_MS; player.nextDashAt = now + DASH_COOLDOWN_MS; } const speed = now < player.dashUntil ? DASH_SPEED : PLAYER_SPEED; player.x = clamp(player.x + dx * speed * DT, PLAYER_RADIUS, ARENA.width - PLAYER_RADIUS); player.y = clamp(player.y + dy * speed * DT, PLAYER_RADIUS, ARENA.height - PLAYER_RADIUS); player.angle = player.input.angle; this.paintTerritory(player.x, player.y, player.team, now < player.dashUntil ? 2 : 1); if (player.input.shoot && now >= player.nextShotAt) { player.nextShotAt = now + SHOT_COOLDOWN_MS; const projectileId = id("shot"); this.projectiles.set(projectileId, { id: projectileId, ownerId: player.id, team: player.team, x: player.x + Math.cos(player.angle) * (PLAYER_RADIUS + 6), y: player.y + Math.sin(player.angle) * (PLAYER_RADIUS + 6), vx: Math.cos(player.angle) * PROJECTILE_SPEED, vy: Math.sin(player.angle) * PROJECTILE_SPEED, expiresAt: now + PROJECTILE_LIFETIME_MS }); } } }',
    `updatePlayers(now) {
    for (const player of this.players.values()) {
      if ((!player.isBot && !player.connected) || !player.alive || player.currentQuestion) continue;
      let { dx, dy } = player.input;
      const magnitude = Math.hypot(dx, dy);
      if (magnitude > 1) { dx /= magnitude; dy /= magnitude; }
      if (player.input.dash && now >= player.nextDashAt && magnitude > 0.05) {
        player.dashUntil = now + DASH_DURATION_MS;
        player.nextDashAt = now + DASH_COOLDOWN_MS;
      }
      const speed = now < player.dashUntil ? DASH_SPEED : PLAYER_SPEED;
      player.x = clamp(player.x + dx * speed * DT, PLAYER_RADIUS, ARENA.width - PLAYER_RADIUS);
      player.y = clamp(player.y + dy * speed * DT, PLAYER_RADIUS, ARENA.height - PLAYER_RADIUS);
      player.angle = player.input.angle;
      this.paintTerritory(player.x, player.y, player.team, now < player.dashUntil ? 2 : 1);
      if (player.input.shoot && now >= player.nextShotAt) this.fireVolley(player, now);
    }
  }`,
    "cohesion volley firing"
  );

  source = replaceRequired(
    source,
    "arena: ARENA, teamNames:",
    "arena: ARENA, cohesionRadius: COHESION_RADIUS, teamNames:",
    "state cohesion radius"
  );

  source = replaceRequired(
    source,
    "dashReadyAt: player.nextDashAt })), projectiles:",
    "dashReadyAt: player.nextDashAt, volleySize: this.volleySize(player) })), projectiles:",
    "player volley state"
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
