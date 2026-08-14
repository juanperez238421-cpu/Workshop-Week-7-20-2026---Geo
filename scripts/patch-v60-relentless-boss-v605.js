"use strict";

const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const gamePath = path.join(root, "school-game", "v60", "game.js");
const htmlPath = path.join(root, "school-game", "v60", "index.html");
const mainPath = path.join(root, "school-game", "v60", "main.js");

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`V60.5 relentless boss patch could not find ${label}.`);
  return source.replace(before, after);
}
function replaceAllRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`V60.5 relentless boss patch could not find ${label}.`);
  return source.split(before).join(after);
}

let game = fs.readFileSync(gamePath, "utf8");
game = replaceRequired(game, 'const VERSION = "60.4.0";', 'const VERSION = "60.5.0";', "renderer version");
game = replaceRequired(game, 'const EDITION = "math-factorization-teacher-v604";', 'const EDITION = "math-factorization-relentless-boss-v605";', "renderer edition");

game = replaceRequired(game,
`  const BOSS_SHIELD_HITS_BY_PHASE = Object.freeze([4, 5, 6]);
  const BOSS_DASH_COOLDOWN_BY_PHASE = Object.freeze([3.4, 2.55, 1.85]);
  const BOSS_DASH_SPEED_BY_PHASE = Object.freeze([650, 760, 890]);
  const BOSS_PREDICTION_SECONDS_BY_PHASE = Object.freeze([0.14, 0.28, 0.42]);
  const BOSS_ROOM_PICKUP_RADIUS = 118;`,
`  const BOSS_SHIELD_HITS_BY_PHASE = Object.freeze([4, 5, 6]);
  const BOSS_DASHES_BY_PHASE = Object.freeze([3, 5, 7]);
  const BOSS_DASH_SPEED_BY_PHASE = Object.freeze([760, 940, 1120]);
  const BOSS_DASH_TELEGRAPH_BY_PHASE = Object.freeze([0.34, 0.24, 0.16]);
  const BOSS_DASH_DURATION_BY_PHASE = Object.freeze([0.27, 0.30, 0.33]);
  const BOSS_DASH_CHAIN_GAP_BY_PHASE = Object.freeze([0.16, 0.11, 0.07]);
  const BOSS_FATIGUE_SECONDS_BY_PHASE = Object.freeze([2.25, 1.55, 0.95]);
  const BOSS_PREDICTION_SECONDS_BY_PHASE = Object.freeze([0.24, 0.42, 0.62]);
  const BOSS_DASH_STEER_BY_PHASE = Object.freeze([0.0, 0.58, 1.15]);
  const BOSS_ROOM_PICKUP_RADIUS = 118;`,
"relentless boss phase constants");

game = replaceRequired(game,
`      bossDashCooldown: typeId === "boss" ? 2.6 : 0,
      bossDashTelegraph: 0, bossDashTimer: 0,
      bossDashVX: 0, bossDashVY: 0,
      bossDashTargetX: x, bossDashTargetY: y,
      bossDashHitRegistered: false,
      bossPatternIndex: 0`,
`      bossDashCooldown: 0,
      bossDashTelegraph: 0, bossDashTimer: 0,
      bossDashVX: 0, bossDashVY: 0,
      bossDashTargetX: x, bossDashTargetY: y,
      bossDashHitRegistered: false,
      bossDashChainRemaining: typeId === "boss" ? BOSS_DASHES_BY_PHASE[0] : 0,
      bossDashChainTotal: typeId === "boss" ? BOSS_DASHES_BY_PHASE[0] : 0,
      bossRushActive: typeId === "boss",
      bossFatigueTimer: 0,
      bossObservedPlayerVX: 0,
      bossObservedPlayerVY: 0,
      bossLastPlayerX: 0,
      bossLastPlayerY: 0,
      bossPatternIndex: 0`,
"boss runtime fields");

game = replaceRequired(game,
`    state.deploymentGrace = state.levelIndex === 0 ? 6 : 3;
    state.player.invulnerable = Math.max(state.player.invulnerable, state.deploymentGrace);`,
`    state.deploymentGrace = MAPS[state.levelIndex].bossRoom ? 0 : (state.levelIndex === 0 ? 6 : 3);
    state.player.invulnerable = MAPS[state.levelIndex].bossRoom ? 0.22 : Math.max(state.player.invulnerable, state.deploymentGrace);`,
"boss-room immediate deployment");

game = replaceRequired(game,
`    if (MAPS[state.levelIndex].bossRoom) {
      state.bossHintsShown++;
      banner("FINAL BOSS · floor weapons are permanent · E picks up · every hit lowers shield · throws deal bonus shield damage", 4800);
    } else if (announce) banner(\`${MAPS[state.levelIndex].subtitle} · safe deployment for ${Math.ceil(state.deploymentGrace)} seconds\`, 2200);`,
`    if (MAPS[state.levelIndex].bossRoom) {
      state.bossHintsShown++;
      const boss = state.enemies.find((enemy) => enemy.typeId === "boss");
      if (boss && state.player) {
        boss.bossRushActive = true;
        boss.bossDashChainTotal = BOSS_DASHES_BY_PHASE[0];
        boss.bossDashChainRemaining = BOSS_DASHES_BY_PHASE[0];
        boss.bossDashCooldown = 0;
        beginBossDash(boss, state.player, true);
      }
      banner("FINAL BOSS · HUNT STARTS NOW · RUN THE DASH CHAIN · COUNTER WHEN WARDEN TIRES", 4200);
    } else if (announce) banner(\`${MAPS[state.levelIndex].subtitle} · safe deployment for ${Math.ceil(state.deploymentGrace)} seconds\`, 2200);`,
"immediate room-5 engagement");

const bossStart = game.indexOf("  function bossShieldHitsForPhase(enemy) {");
const bossEnd = game.indexOf("  function updateEnemyAI(enemy, dt, nowSeconds) {", bossStart);
if (bossStart < 0 || bossEnd < 0 || bossEnd <= bossStart) throw new Error("Could not isolate V60.4 boss AI block.");
const relentlessBossBlock = `  function bossShieldHitsForPhase(enemy) {
    const phaseIndex = clamp((enemy?.bossPhase || 1) - 1, 0, BOSS_SHIELD_HITS_BY_PHASE.length - 1);
    return BOSS_SHIELD_HITS_BY_PHASE[phaseIndex];
  }

  function bossPhaseIndex(enemy) { return clamp((enemy?.bossPhase || 1) - 1, 0, BOSS_PHASES - 1); }
  function bossDashCountForPhase(enemy) { return BOSS_DASHES_BY_PHASE[bossPhaseIndex(enemy)]; }

  function resetBossShield(enemy, announce = false) {
    if (!enemy || enemy.defeated) return;
    const hits = bossShieldHitsForPhase(enemy);
    enemy.bossShieldMaxHits = hits;
    enemy.bossShieldHits = hits;
    enemy.bossShieldActive = true;
    enemy.bossVulnerableUntil = 0;
    if (announce) banner(\`WARDEN SHIELD RESTORED · \${hits} hits\`, 1600);
  }

  function enterBossFatigue(enemy, reason = "DASH CHAIN EXHAUSTED") {
    if (!enemy || enemy.defeated) return;
    const phaseIndex = bossPhaseIndex(enemy);
    enemy.bossRushActive = false;
    enemy.bossDashTimer = 0;
    enemy.bossDashTelegraph = 0;
    enemy.bossDashVX = 0;
    enemy.bossDashVY = 0;
    enemy.bossFatigueTimer = BOSS_FATIGUE_SECONDS_BY_PHASE[phaseIndex];
    enemy.vx = 0; enemy.vy = 0;
    enemy.action = "idle";
    banner(\`WARDEN TIRED · \${reason} · COUNTER \${enemy.bossFatigueTimer.toFixed(1)} s\`, 1500);
    tone(210, 0.12, 0.028, "triangle");
  }

  function startBossRushCycle(enemy, player, opening = false) {
    if (!enemy || enemy.defeated || !player || player.defeated) return;
    const count = bossDashCountForPhase(enemy);
    enemy.bossRushActive = true;
    enemy.bossFatigueTimer = 0;
    enemy.bossDashChainTotal = count;
    enemy.bossDashChainRemaining = count;
    enemy.bossDashCooldown = 0;
    banner(\`WARDEN HUNT · PHASE \${enemy.bossPhase} · \${count} DASHES\`, opening ? 1500 : 1100);
    beginBossDash(enemy, player, opening);
  }

  function damageBossShield(enemy, amount = 1, sourceLabel = "HIT") {
    if (!enemy || enemy.defeated || !enemy.bossShieldActive) return false;
    const damage = Math.max(1, Math.floor(amount));
    if (!Number.isFinite(enemy.bossShieldHits) || enemy.bossShieldHits <= 0) resetBossShield(enemy, false);
    enemy.bossShieldHits = Math.max(0, enemy.bossShieldHits - damage);
    state.screenShake = Math.max(state.screenShake, damage >= 2 ? 10 : 6);
    for (let i = 0; i < 7 + damage * 3; i++) createParticle(enemy.x, enemy.y, "spark", "#16a4b8");
    if (enemy.bossShieldHits <= 0) {
      enemy.bossShieldActive = false;
      enemy.bossVulnerableUntil = performance.now() / 1000 + BOSS_VULNERABLE_SECONDS;
      enemy.bossHintCooldown = 0;
      enemy.bossRushActive = false;
      enemy.bossDashTimer = 0;
      enemy.bossDashTelegraph = 0;
      enemy.bossFatigueTimer = Math.max(enemy.bossFatigueTimer || 0, 0.72);
      state.bossShieldBreaks++;
      banner(\`SHIELD BROKEN · CORE OPEN \${BOSS_VULNERABLE_SECONDS.toFixed(1)} s · PRESS THE ATTACK\`, 2100);
      tone(840, 0.16, 0.045, "triangle");
    } else {
      banner(\`SHIELD HIT · \${enemy.bossShieldHits}/\${enemy.bossShieldMaxHits} · \${sourceLabel}\`, 800);
      tone(260 + damage * 80, 0.055, 0.022, "square");
    }
    return true;
  }

  function damageBossCore(enemy, sourceLabel = "CORE HIT") {
    if (!enemy || enemy.defeated || enemy.bossShieldActive) return false;
    enemy.health = Math.max(0, enemy.health - 1);
    state.hits++;
    state.bossCoreHits++;
    state.screenShake = Math.max(state.screenShake, 14);
    for (let i = 0; i < 28; i++) createParticle(enemy.x, enemy.y, "pixel", "#d89000");
    if (enemy.health <= 0) {
      enemy.defeated = true;
      enemy.defeatTimer = 0;
      enemy.vx = 0; enemy.vy = 0;
      state.tags++;
      banner("FINAL BOSS DEFEATED · mission complete", 2800);
      tone(960, 0.24, 0.055, "triangle");
      return true;
    }
    enemy.bossPhase = Math.min(BOSS_PHASES, enemy.bossPhase + 1);
    enemy.bossSpecialCooldown = 0.18;
    resetBossShield(enemy, false);
    enemy.bossRushActive = true;
    enemy.bossFatigueTimer = 0;
    enemy.bossDashChainTotal = bossDashCountForPhase(enemy);
    enemy.bossDashChainRemaining = enemy.bossDashChainTotal;
    enemy.bossDashCooldown = 0.18;
    banner(\`\${sourceLabel} · PHASE \${enemy.bossPhase}/\${BOSS_PHASES} · \${enemy.bossDashChainTotal} DASH RUSH · shield \${enemy.bossShieldHits}\`, 2300);
    tone(720 + enemy.bossPhase * 70, 0.14, 0.04, "sawtooth");
    return true;
  }

  function observeBossTarget(enemy, player, dt) {
    if (!enemy || !player || dt <= 0) return;
    if (enemy.bossLastPlayerX || enemy.bossLastPlayerY) {
      const sampleVX = clamp((player.x - enemy.bossLastPlayerX) / dt, -900, 900);
      const sampleVY = clamp((player.y - enemy.bossLastPlayerY) / dt, -900, 900);
      enemy.bossObservedPlayerVX = enemy.bossObservedPlayerVX * 0.72 + sampleVX * 0.28;
      enemy.bossObservedPlayerVY = enemy.bossObservedPlayerVY * 0.72 + sampleVY * 0.28;
    }
    enemy.bossLastPlayerX = player.x;
    enemy.bossLastPlayerY = player.y;
  }

  function bossPredictedPoint(enemy, player, leadScale = 1) {
    const phaseIndex = bossPhaseIndex(enemy);
    const lead = BOSS_PREDICTION_SECONDS_BY_PHASE[phaseIndex] * leadScale;
    const blendedVX = player.vx * 0.58 + enemy.bossObservedPlayerVX * 0.42;
    const blendedVY = player.vy * 0.58 + enemy.bossObservedPlayerVY * 0.42;
    const distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
    const distanceLead = clamp(distance / Math.max(1, BOSS_DASH_SPEED_BY_PHASE[phaseIndex]), 0.05, 0.55);
    const horizon = lead + distanceLead * (0.25 + phaseIndex * 0.14);
    return {
      x: clamp(player.x + blendedVX * horizon, 64, WORLD.width - 64),
      y: clamp(player.y + blendedVY * horizon, 64, WORLD.height - 64)
    };
  }

  function bossPredictiveAngle(enemy, player, leadScale = 1) {
    const target = bossPredictedPoint(enemy, player, leadScale);
    return Math.atan2(target.y - enemy.y, target.x - enemy.x);
  }

  function fireBossDashPressure(enemy, player, stage = "launch") {
    const phase = clamp(enemy.bossPhase, 1, BOSS_PHASES);
    const predicted = bossPredictiveAngle(enemy, player, stage === "launch" ? 1.18 : 0.92);
    if (phase === 1) {
      if (stage === "launch") spawnProjectile("enemy", enemy.x, enemy.y, predicted, "precision", enemy.id);
      return;
    }
    if (phase === 2) {
      const offsets = stage === "launch" ? [-0.07, 0, 0.07] : [-0.14, 0.14];
      for (const offset of offsets) spawnProjectile("enemy", enemy.x, enemy.y, predicted + offset, stage === "launch" ? "precision" : "heavy", enemy.id);
      return;
    }
    if (stage === "launch") {
      for (let i = -3; i <= 3; i++) spawnProjectile("enemy", enemy.x, enemy.y, predicted + i * 0.055, "smg", enemy.id);
    } else {
      for (let i = 0; i < 12; i++) spawnProjectile("enemy", enemy.x, enemy.y, i * Math.PI * 2 / 12 + enemy.bossOrbit, "scatter", enemy.id);
    }
  }

  function beginBossDash(enemy, player, opening = false) {
    const phaseIndex = bossPhaseIndex(enemy);
    const predicted = bossPredictedPoint(enemy, player, 1.0 + phaseIndex * 0.12);
    enemy.bossDashTargetX = predicted.x;
    enemy.bossDashTargetY = predicted.y;
    const baseTelegraph = BOSS_DASH_TELEGRAPH_BY_PHASE[phaseIndex];
    enemy.bossDashTelegraph = opening ? Math.max(0.12, baseTelegraph * 0.55) : baseTelegraph;
    enemy.bossDashCooldown = BOSS_DASH_CHAIN_GAP_BY_PHASE[phaseIndex];
    enemy.bossDashHitRegistered = false;
    enemy.bossRushActive = true;
    enemy.bossDashChainRemaining = Math.max(0, (enemy.bossDashChainRemaining || bossDashCountForPhase(enemy)) - 1);
    enemy.action = "charge";
    enemy.actionTimer = enemy.bossDashTelegraph;
    fireBossDashPressure(enemy, player, "launch");
    banner(\`WARDEN DASH \${enemy.bossDashChainTotal - enemy.bossDashChainRemaining}/\${enemy.bossDashChainTotal} · PHASE \${enemy.bossPhase}\`, 650);
    for (let i = 0; i < 18; i++) createParticle(enemy.x, enemy.y, "spark", "#b6405b");
    tone(140 - phaseIndex * 15, 0.09, 0.035, "sawtooth");
  }

  function updateBossAI(enemy, dt, nowSeconds) {
    const player = state.player;
    if (!player || player.defeated) return;
    enemy.px = enemy.x; enemy.py = enemy.y;
    enemy.actionTimer = Math.max(0, enemy.actionTimer - dt);
    enemy.bossSpecialCooldown = Math.max(0, enemy.bossSpecialCooldown - dt);
    enemy.bossHintCooldown = Math.max(0, enemy.bossHintCooldown - dt);
    enemy.bossDashCooldown = Math.max(0, enemy.bossDashCooldown - dt);
    updateEnemyWeaponTimers(enemy, dt);
    observeBossTarget(enemy, player, dt);

    if (!enemy.bossShieldActive && nowSeconds >= enemy.bossVulnerableUntil) {
      resetBossShield(enemy, true);
      startBossRushCycle(enemy, player, false);
      return;
    }

    if (enemy.bossFatigueTimer > 0) {
      enemy.bossFatigueTimer = Math.max(0, enemy.bossFatigueTimer - dt);
      enemy.vx *= Math.max(0, 1 - dt * 8);
      enemy.vy *= Math.max(0, 1 - dt * 8);
      enemy.action = "idle";
      enemy.facing = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      if (enemy.bossFatigueTimer <= 0 && enemy.bossShieldActive) startBossRushCycle(enemy, player, false);
      return;
    }

    if (enemy.bossDashTimer > 0) {
      enemy.bossDashTimer = Math.max(0, enemy.bossDashTimer - dt);
      enemy.action = "dash";
      const phaseIndex = bossPhaseIndex(enemy);
      const steerStrength = BOSS_DASH_STEER_BY_PHASE[phaseIndex];
      if (steerStrength > 0) {
        const predicted = bossPredictedPoint(enemy, player, 0.42 + phaseIndex * 0.14);
        const desired = normalize(predicted.x - enemy.x, predicted.y - enemy.y);
        const speed = BOSS_DASH_SPEED_BY_PHASE[phaseIndex];
        const blend = clamp(steerStrength * dt, 0, 0.18);
        enemy.bossDashVX = enemy.bossDashVX * (1 - blend) + desired.x * speed * blend;
        enemy.bossDashVY = enemy.bossDashVY * (1 - blend) + desired.y * speed * blend;
      }
      enemy.vx = enemy.bossDashVX;
      enemy.vy = enemy.bossDashVY;
      moveCircle(enemy, enemy.vx * dt, enemy.vy * dt);
      enemy.facing = Math.atan2(enemy.vy, enemy.vx);
      if (!enemy.bossDashHitRegistered && Math.hypot(player.x - enemy.x, player.y - enemy.y) <= enemy.radius + player.radius + 18) {
        enemy.bossDashHitRegistered = true;
        registerPlayerStrike({ color: "#b6405b", weaponId: \`boss-dash-phase-\${enemy.bossPhase}\` });
        banner(\`WARDEN DASH HIT · PHASE \${enemy.bossPhase}\`, 700);
      }
      if (enemy.bossDashTimer <= 0) {
        fireBossDashPressure(enemy, player, "impact");
        if (enemy.bossDashChainRemaining > 0 && enemy.bossShieldActive) {
          enemy.bossDashCooldown = BOSS_DASH_CHAIN_GAP_BY_PHASE[phaseIndex];
        } else if (enemy.bossShieldActive) {
          enterBossFatigue(enemy);
        }
      }
      return;
    }

    if (enemy.bossDashTelegraph > 0) {
      const phaseIndex = bossPhaseIndex(enemy);
      enemy.bossDashTelegraph = Math.max(0, enemy.bossDashTelegraph - dt);
      enemy.vx = 0; enemy.vy = 0;
      if (enemy.bossDashTelegraph > 0.07) {
        const predicted = bossPredictedPoint(enemy, player, 1.0 + phaseIndex * 0.12);
        const track = clamp(dt * (4.5 + phaseIndex * 2.1), 0, 0.34);
        enemy.bossDashTargetX += (predicted.x - enemy.bossDashTargetX) * track;
        enemy.bossDashTargetY += (predicted.y - enemy.bossDashTargetY) * track;
      }
      enemy.facing = Math.atan2(enemy.bossDashTargetY - enemy.y, enemy.bossDashTargetX - enemy.x);
      enemy.action = "charge";
      if (enemy.bossDashTelegraph <= 0) {
        const direction = normalize(enemy.bossDashTargetX - enemy.x, enemy.bossDashTargetY - enemy.y);
        const dashSpeed = BOSS_DASH_SPEED_BY_PHASE[phaseIndex];
        enemy.bossDashVX = direction.x * dashSpeed;
        enemy.bossDashVY = direction.y * dashSpeed;
        enemy.bossDashTimer = BOSS_DASH_DURATION_BY_PHASE[phaseIndex];
        enemy.bossDashHitRegistered = false;
        tone(92 - phaseIndex * 8, 0.075, 0.04, "square");
      }
      return;
    }

    if (enemy.bossRushActive && enemy.bossDashChainRemaining > 0 && enemy.bossDashCooldown <= 0) {
      beginBossDash(enemy, player, false);
      return;
    }
    if (enemy.bossRushActive && enemy.bossDashChainRemaining <= 0) {
      enterBossFatigue(enemy);
      return;
    }
    if (enemy.bossShieldActive && !enemy.bossRushActive) {
      startBossRushCycle(enemy, player, false);
      return;
    }

    enemy.facing = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    enemy.action = "idle";
  }
`;
game = game.slice(0, bossStart) + relentlessBossBlock + game.slice(bossEnd);

game = replaceAllRequired(game, "bossDynamicPatternCount: 4", "bossDynamicPatternCount: 6", "boss dynamic pattern count");
game = replaceAllRequired(game,
"bossPredictiveAim: true,",
"bossPredictiveAim: true,\n      bossImmediateEngage: true,\n      bossRelentlessRushCycles: true,\n      bossFatigueCounterWindow: true,\n      bossDashChainsByPhase: [...BOSS_DASHES_BY_PHASE],\n      bossDashSpeedsByPhase: [...BOSS_DASH_SPEED_BY_PHASE],\n      bossDashSteeringByPhase: [...BOSS_DASH_STEER_BY_PHASE],",
"boss readiness markers");

game = replaceRequired(game,
"      safeEnemyDeployment: true,\n      destructibleImpactGlass: true,",
"      safeEnemyDeployment: true,\n      bossRoomDeploymentGraceSeconds: 0,\n      bossOpeningDashActive: Boolean(boss?.bossDashTelegraph > 0 || boss?.bossDashTimer > 0 || boss?.bossRushActive),\n      bossFatigueSecondsByPhase: [...BOSS_FATIGUE_SECONDS_BY_PHASE],\n      destructibleImpactGlass: true,",
"boss probe immediate engagement markers");

fs.writeFileSync(gamePath, game, "utf8");

let html = fs.readFileSync(htmlPath, "utf8");
html = replaceRequired(html, "MATH TACTICAL · V60.4 · TEACHER EDITION", "MATH TACTICAL · V60.5 · RELENTLESS BOSS", "HUD branding");
html = replaceRequired(html,
"The Archive Warden has three phases. Every successful hit removes shield strength; permanent weapons lie on the floor and can be picked up with <i>E</i>. Throwing a room weapon with <i>E</i> deals bonus shield damage. Watch the dash telegraph, predictive fire and changing attack patterns, then hit the open core before the shield resets.",
"The Archive Warden attacks immediately. Phase 1 chains 3 predictive dashes, Phase 2 chains 5 and Phase 3 chains 7 at higher speed with stronger tracking and projectile pressure. Keep moving until the Warden tires, break the shield during the chase or punish the fatigue window, then hit the open core before the shield resets.",
"boss briefing");
fs.writeFileSync(htmlPath, html, "utf8");

let main = fs.readFileSync(mainPath, "utf8");
main = replaceRequired(main, 'const APP_VERSION = "60.4.0";', 'const APP_VERSION = "60.5.0";', "main version");
main = replaceRequired(main, 'const EDITION = "math-factorization-teacher-v604";', 'const EDITION = "math-factorization-relentless-boss-v605";', "main edition");
main = replaceRequired(main, 'app.setName("Math Tactical Classroom V60.4 Teacher Edition");', 'app.setName("Math Tactical Classroom V60.5 Relentless Boss Edition");', "application name");
main = replaceRequired(main, '"protected-results-v60-factorization-boss-teacher"', '"protected-results-v60-factorization-relentless-boss"', "results directory");
main = replaceRequired(main, '"math-tactical-v60-factorization-boss-teacher.vault.json"', '"math-tactical-v60-factorization-relentless-boss.vault.json"', "vault filename");
fs.writeFileSync(mainPath, main, "utf8");

console.log("Applied Math Tactical V60.5 Relentless Boss patch: immediate engagement, 3/5/7 adaptive dash chains, predictive steering, phase-scaled projectile pressure, fatigue counter windows, V60.4 teacher mode and 45m/90s timers preserved.");
