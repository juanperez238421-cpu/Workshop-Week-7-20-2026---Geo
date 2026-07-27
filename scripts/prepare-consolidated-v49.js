"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "school-game", "game.js");
const targetPath = path.join(root, "school-game", "game-v49.js");
let source = fs.readFileSync(sourcePath, "utf8");

function replaceRegex(pattern, replacement, label) {
  const before = source;
  source = source.replace(pattern, replacement);
  if (source === before) throw new Error(`V49 runtime transformation failed: ${label}`);
}

replaceRegex(
  /  const armorFallback = \[[\s\S]*?\n  \];\n\n  const MAPS = \[/,
  `  const armorFallback = [
    { id: "operative", name: "Robledo Operative", row: 0, passive: "One shared character for the three-student team", speedMultiplier: 1, startingShield: 0, magazine: 4, reloadSeconds: 0.9, dashCooldownSeconds: 1.0 }
  ];

  const MAPS = [`,
  "single shared operative"
);

replaceRegex(
  /  const MAPS = \[[\s\S]*?\n  \];\n\n  const ENEMY_TYPES/,
  `  const MAPS = [
    {
      name: "Level 1 · Robledo Learning Lab",
      theme: 0,
      spawn: [118, 870],
      obstacles: [
        [0,0,1600,38],[0,962,1600,38],[0,0,38,1000],[1562,0,38,1000],
        [150,110,350,62],[575,110,450,62],[1100,110,350,62],
        [150,330,235,62],[455,330,300,62],[845,330,300,62],[1215,330,235,62],
        [265,545,300,68],[650,500,300,68],[1035,545,300,68],
        [205,760,220,62],[520,760,240,62],[850,760,240,62],[1180,760,220,62],
        [560,205,58,78],[982,205,58,78],[610,620,58,82],[932,620,58,82]
      ],
      decor: [
        [95,90,0],[530,90,3],[1060,90,2],[1510,90,6],
        [105,255,4],[420,255,1],[800,255,5],[1180,255,1],[1495,255,4],
        [125,470,7],[470,470,3],[800,445,6],[1130,470,3],[1470,470,7],
        [110,690,2],[470,680,5],[800,685,0],[1130,680,5],[1490,690,2],
        [470,900,4],[800,900,6],[1130,900,4]
      ],
      enemies: [
        [470,245,"watcher"],[800,235,"sentinel"],[1130,245,"watcher"],
        [380,475,"runner"],[800,640,"warden"],[1220,475,"runner"],
        [520,885,"sentinel"],[1080,885,"sentinel"]
      ],
      powers: [[800,600,"shield"],[1465,865,"ammo"]]
    },
    {
      name: "Level 2 · Library Research Grid",
      theme: 1,
      spawn: [105, 500],
      obstacles: [
        [0,0,1600,38],[0,962,1600,38],[0,0,38,1000],[1562,0,38,1000],
        [205,92,105,310],[205,510,105,398],
        [470,92,105,200],[470,390,105,265],[470,750,105,158],
        [740,190,112,620],
        [1018,92,105,200],[1018,390,105,265],[1018,750,105,158],
        [1290,92,105,310],[1290,510,105,398],
        [350,455,72,90],[1175,455,72,90]
      ],
      decor: [
        [105,110,1],[105,320,1],[105,690,1],[105,880,1],
        [375,130,2],[375,340,5],[375,700,2],[375,875,5],
        [650,115,6],[650,340,3],[650,690,6],[650,880,3],
        [930,115,6],[930,340,3],[930,690,6],[930,880,3],
        [1205,130,2],[1205,340,5],[1205,700,2],[1205,875,5],
        [1490,110,1],[1490,320,1],[1490,690,1],[1490,880,1]
      ],
      enemies: [
        [390,220,"watcher"],[650,500,"sentinel"],[930,225,"runner"],
        [1205,500,"warden"],[1470,250,"watcher"],[1470,750,"sentinel"],
        [930,850,"runner"],[390,790,"sentinel"]
      ],
      powers: [[655,865,"focus"],[1480,500,"ammo"]]
    }
  ];

  const ENEMY_TYPES`,
  "two consolidated level rooms"
);

replaceRegex(
  /      if \(Array\.isArray\(catalog\.armors\) && catalog\.armors\.length\) armorCatalog = catalog\.armors;/,
  `      // V49 intentionally uses one shared operative; external armor rows are ignored.`,
  "disable class catalog"
);

replaceRegex(
  /  function renderStudentRows\(\) \{[\s\S]*?\n  \}\n\n  function syncHud/,
  `  function renderStudentRows() {
    const roles = ["MOVE · WASD", "AIM/FIRE · MOUSE", "DASH/RELOAD · SHIFT/R"];
    ui.studentRows.innerHTML = state.studentStats.map((student, index) => {
      const accuracy = student.attempts ? Math.round(student.correct / student.attempts * 100) : 0;
      return \`<div class="student-row\${state.questionActive && index === state.currentStudentIndex ? " active" : ""}"><i>\${index+1}</i><strong>\${escapeHtml(student.studentName)}</strong><em>\${roles[index]}</em><small>\${student.correct}/\${student.attempts} · \${accuracy}%</small></div>\`;
    }).join("");
  }

  function syncHud`,
  "three-person role display"
);

replaceRegex(
  /  function makeEnemy\(\[x, y, type\], serial\) \{[\s\S]*?\n  \}\n\n  function spawnMap/,
  `  function makeEnemy([x, y, type], serial) {
    const def = ENEMY_TYPES[type];
    return {
      id: \`\${type}-\${state.wave}-\${serial}\`, x, y, anchorX: x, anchorY: y, type,
      radius: def.radius, alive: true, defeatAge: 0, angle: 0, vx: 0, vy: 0,
      fireCooldown: 0.35 + Math.random() * 0.8, alert: 0, lastSeenX: x, lastSeenY: y,
      dodgeCooldown: 0, dodgeTime: 0, dodgeX: 0, dodgeY: 0,
      strafe: serial % 2 ? -1 : 1, animation: Math.random() * 3,
      actionFlash: 0, tacticalOffset: (serial % 3 - 1) * 95
    };
  }

  function spawnMap`,
  "enemy tactical state"
);

replaceRegex(
  /    ui\.armorHud\.textContent = `\$\{state\.armor\.name\} armor · Pulse Pistol`;/,
  `    ui.armorHud.textContent = "Shared Robledo Operative · Pulse Pistol · 3-player controls";`,
  "shared player HUD"
);

replaceRegex(
  /  function updateEnemy\(enemy, dt\) \{[\s\S]*?\n  \}\n\n  function playerTagged/,
  `  function updateEnemy(enemy, dt) {
    if (!enemy.alive || !state.player?.alive) return;
    const def = ENEMY_TYPES[enemy.type];
    enemy.fireCooldown -= dt;
    enemy.dodgeCooldown -= dt;
    enemy.actionFlash = Math.max(0, enemy.actionFlash - dt);
    enemy.animation += dt * 7;

    const playerDx = state.player.x - enemy.x;
    const playerDy = state.player.y - enemy.y;
    const playerDistance = Math.hypot(playerDx, playerDy);
    const visible = hasLineOfSight(enemy, state.player);
    if (visible && playerDistance < def.detection) {
      enemy.alert = 3.2;
      enemy.lastSeenX = state.player.x;
      enemy.lastSeenY = state.player.y;
    } else {
      enemy.alert = Math.max(0, enemy.alert - dt);
    }

    const targetX = visible ? state.player.x : enemy.lastSeenX;
    const targetY = visible ? state.player.y : enemy.lastSeenY;
    const dir = normalize(targetX - enemy.x, targetY - enemy.y);
    const threat = incomingThreat(enemy);
    if (threat && enemy.dodgeCooldown <= 0) {
      const v = normalize(threat.vx, threat.vy);
      enemy.dodgeX = -v.y * enemy.strafe;
      enemy.dodgeY = v.x * enemy.strafe;
      enemy.dodgeTime = 0.34;
      enemy.dodgeCooldown = 0.95 + Math.random() * 0.35;
      enemy.strafe *= -1;
    }

    let mx = 0;
    let my = 0;
    if (enemy.dodgeTime > 0) {
      enemy.dodgeTime -= dt;
      mx = enemy.dodgeX * def.speed * 2.15;
      my = enemy.dodgeY * def.speed * 2.15;
    } else if (enemy.alert > 0) {
      if (enemy.type === "runner") {
        mx = dir.x * def.speed;
        my = dir.y * def.speed;
        if (visible && playerDistance < 48 && state.player.invulnerable <= 0) playerTagged("contact");
      } else {
        const side = enemy.strafe;
        if (!visible || playerDistance > def.preferred + 115) {
          mx = dir.x * def.speed;
          my = dir.y * def.speed;
        } else if (playerDistance < def.preferred - 95) {
          mx = -dir.x * def.speed * 0.82;
          my = -dir.y * def.speed * 0.82;
        } else {
          mx = -dir.y * def.speed * 0.72 * side;
          my = dir.x * def.speed * 0.72 * side;
        }

        if (enemy.type === "sentinel" && visible) {
          mx += -dir.y * enemy.tacticalOffset * 0.7;
          my += dir.x * enemy.tacticalOffset * 0.7;
        }
        if (visible && playerDistance < 740 && enemy.fireCooldown <= 0) {
          const travelTime = playerDistance / Math.max(1, def.projectileSpeed);
          const leadFactor = enemy.type === "watcher" ? 0.82 : enemy.type === "sentinel" ? 0.72 : 0.58;
          enemyFire(enemy, state.player.x + state.player.vx * travelTime * leadFactor, state.player.y + state.player.vy * travelTime * leadFactor);
          enemy.fireCooldown = def.fireEvery * (0.9 + Math.random() * 0.22);
        }
      }
    } else {
      const phase = performance.now() / 1700 + enemy.id.length;
      const patrol = normalize(enemy.anchorX + Math.cos(phase) * 82 - enemy.x, enemy.anchorY + Math.sin(phase * 0.83) * 82 - enemy.y);
      mx = patrol.x * def.speed * 0.34;
      my = patrol.y * def.speed * 0.34;
    }

    for (const other of state.enemies) {
      if (other === enemy || !other.alive) continue;
      const sx = enemy.x - other.x;
      const sy = enemy.y - other.y;
      const separation = Math.hypot(sx, sy);
      if (separation > 0 && separation < 72) {
        mx += sx / separation * (72 - separation) * 7;
        my += sy / separation * (72 - separation) * 7;
      }
    }

    const lookX = enemy.x + mx * 0.16;
    const lookY = enemy.y + my * 0.16;
    if (collides(lookX, lookY, enemy.radius + 4)) {
      const turn = enemy.strafe;
      const oldMx = mx;
      mx = -my * turn;
      my = oldMx * turn;
    }

    enemy.vx = lerp(enemy.vx, mx, 1 - Math.exp(-9 * dt));
    enemy.vy = lerp(enemy.vy, my, 1 - Math.exp(-9 * dt));
    enemy.angle = Math.atan2(state.player.y - enemy.y, state.player.x - enemy.x);
    moveEntity(enemy, enemy.vx, enemy.vy, dt);
  }

  function playerTagged`,
  "advanced two-room AI"
);

replaceRegex(
  /  function playerTagged\(source\) \{[\s\S]*?\n  \}\n\n  function tagEnemy/,
  `  function playerTagged(source) {
    const player = state.player;
    if (!player?.alive || player.invulnerable > 0 || state.questionActive) return;
    if (player.shield > 0) {
      player.shield -= 1;
      player.invulnerable = 0.65;
      effect("shield", player.x, player.y, "#1677ff", 0.5);
      showBanner("Shield absorbed the training tag", 700);
      return;
    }

    player.alive = false;
    player.defeatAge = 0;
    state.strikes += 1;
    state.screenShake = 7;
    state.bullets = [];
    effect("tag", player.x, player.y, source === "contact" ? "#1f9d64" : "#e5484d", 0.72);
    saveProgress("strike");
    syncHud();

    if (state.strikes >= 3) {
      showBanner("Three strikes · trigonometry checkpoint", 1000);
      setTimeout(beginQuestionCheckpoint, 900);
    } else {
      showBanner(\`Strike \${state.strikes}/3 · resetting the complete level\`, 950);
      setTimeout(() => {
        if (state.ended || state.questionActive) return;
        spawnMap(state.mapIndex);
      }, 950);
    }
  }

  function tagEnemy`,
  "complete level reset on player defeat"
);

replaceRegex(
  /  function tagEnemy\(enemy\) \{[\s\S]*?\n  \}\n\n  function collectPower/,
  `  function tagEnemy(enemy) {
    if (!enemy.alive) return;
    enemy.alive = false;
    enemy.defeatAge = 0;
    enemy.vx = 0;
    enemy.vy = 0;
    state.tags += 1;
    state.hits += 1;
    state.screenShake = Math.max(state.screenShake, 3.5);
    effect("tag", enemy.x, enemy.y, ENEMY_TYPES[enemy.type].color, 0.78);
    if (state.enemies.every((candidate) => !candidate.alive)) {
      state.mapsCleared += 1;
      state.roomTransition = 1.25;
      showBanner("Level cleared · preparing the next room", 1100);
    }
  }

  function collectPower`,
  "enemy defeat sequence"
);

replaceRegex(
  /    if \(!player\.alive\) return;/,
  `    if (!player.alive) {
      player.defeatAge = Math.min(1.2, (player.defeatAge || 0) + dt);
      return;
    }`,
  "player defeat timer"
);

replaceRegex(
  /    state\.enemies\.forEach\(\(enemy\) => updateEnemy\(enemy, dt\)\);/,
  `    state.enemies.forEach((enemy) => {
      if (!enemy.alive) enemy.defeatAge = Math.min(1.2, (enemy.defeatAge || 0) + dt);
      updateEnemy(enemy, dt);
    });`,
  "enemy defeat timers"
);

replaceRegex(
  /  function drawMap\(\) \{[\s\S]*?\n  \}\n\n  function drawPowers/,
  `  function drawMap() {
    const theme = state.map.theme;
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    ctx.strokeStyle = theme === 0 ? "rgba(31,95,191,.08)" : "rgba(126,76,170,.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= WORLD.width; x += 64) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.height); ctx.stroke();
    }
    for (let y = 0; y <= WORLD.height; y += 64) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.width, y); ctx.stroke();
    }

    for (let y = 32; y < WORLD.height; y += 96) {
      for (let x = 32; x < WORLD.width; x += 96) drawIcon(assets.tiles, 4, 2, theme % 4, Math.floor(theme / 4), x, y, 64, 0.12);
    }

    for (const rect of state.map.obstacles) {
      ctx.fillStyle = theme === 0 ? "#dce8f6" : "#e8e1f2";
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = theme === 0 ? "#245b92" : "#68408f";
      ctx.lineWidth = 3;
      ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
      ctx.fillStyle = "rgba(255,255,255,.72)";
      ctx.fillRect(rect.x + 6, rect.y + 6, Math.max(0, rect.w - 12), 7);
      ctx.fillStyle = "rgba(23,32,51,.08)";
      ctx.fillRect(rect.x + 8, rect.y + rect.h - 11, Math.max(0, rect.w - 16), 5);
    }

    for (const [x, y, index] of state.map.decor) {
      ctx.fillStyle = "rgba(255,255,255,.86)";
      ctx.fillRect(x - 27, y - 27, 54, 54);
      ctx.strokeStyle = "rgba(23,32,51,.14)";
      ctx.strokeRect(x - 27.5, y - 27.5, 55, 55);
      drawIcon(assets.decor, 4, 2, index % 4, Math.floor(index / 4), x, y, 48, 0.96);
    }
  }

  function drawPowers`,
  "white detailed level rendering"
);

replaceRegex(
  /  function drawPlayer\(\) \{[\s\S]*?\n  \}\n\n  function drawEnemies/,
  `  function drawPlayer() {
    const player = state.player;
    if (!player) return;
    let frame = 0;
    let alpha = player.invulnerable > 0 && Math.floor(performance.now() / 70) % 2 ? 0.58 : 1;
    let size = 74;
    let rotation = player.angle;

    if (!player.alive) {
      const progress = clamp((player.defeatAge || 0) / 0.9, 0, 1);
      frame = 3;
      alpha = 1 - progress * 0.72;
      size = 74 - progress * 12;
      rotation += progress * 1.35;
      for (let i = 0; i < 8; i += 1) {
        const angle = i * Math.PI / 4 + progress;
        const radius = 18 + progress * 45;
        ctx.fillStyle = i % 2 ? "#1f5fbf" : "#e88b2b";
        ctx.fillRect(Math.round(player.x + Math.cos(angle) * radius - 3), Math.round(player.y + Math.sin(angle) * radius - 3), 6, 6);
      }
    } else if (player.shotFlash > 0) frame = 3;
    else if (Math.hypot(player.vx, player.vy) > 35) frame = 1 + (Math.floor(player.animation) % 2);

    drawSprite(assets.characters, 4, 6, frame, 0, player.x, player.y, size, rotation, alpha);
    if (player.shield > 0) {
      ctx.strokeStyle = "#1677ff";
      ctx.lineWidth = 3;
      ctx.strokeRect(player.x - 31, player.y - 31, 62, 62);
    }
  }

  function drawEnemies`,
  "detailed player defeat rendering"
);

replaceRegex(
  /  function drawEnemies\(\) \{[\s\S]*?\n  \}\n\n  function drawBullets/,
  `  function drawEnemies() {
    for (const enemy of state.enemies) {
      const def = ENEMY_TYPES[enemy.type];
      if (!enemy.alive) {
        const progress = clamp((enemy.defeatAge || 0) / 0.78, 0, 1);
        if (progress >= 1) continue;
        drawSprite(assets.enemies, 4, 4, 3, def.row, enemy.x, enemy.y, 70 - progress * 16, enemy.angle + progress * 1.7 * enemy.strafe, 1 - progress);
        for (let i = 0; i < 6; i += 1) {
          const angle = i * Math.PI / 3 + enemy.id.length;
          const radius = 12 + progress * 38;
          ctx.fillStyle = i % 2 ? def.color : "#ffffff";
          ctx.fillRect(Math.round(enemy.x + Math.cos(angle) * radius - 2), Math.round(enemy.y + Math.sin(angle) * radius - 2), 5, 5);
        }
        continue;
      }
      const frame = enemy.actionFlash > 0 ? 3 : Math.hypot(enemy.vx, enemy.vy) > 25 ? 1 + (Math.floor(enemy.animation) % 2) : 0;
      drawSprite(assets.enemies, 4, 4, frame, def.row, enemy.x, enemy.y, 70, enemy.angle, 1);
      if (enemy.alert > 0) {
        ctx.fillStyle = def.color;
        ctx.font = "900 14px Consolas";
        ctx.textAlign = "center";
        ctx.fillText("!", enemy.x, enemy.y - 40);
      }
    }
  }

  function drawBullets`,
  "detailed enemy defeat rendering"
);

replaceRegex(
  /      setTimeout\(\(\)=>\{ state\.questionActive=false; state\.currentQuestion=null; ui\.question\.classList\.remove\("visible"\); const spawn=MAPS\[state\.mapIndex\]\.spawn; state\.player=makePlayer\(spawn\[0\],spawn\[1\]\); effect\("respawn",state\.player\.x,state\.player\.y,"#49e7ff",\.5\); showBanner\("Checkpoint cleared · match resumed",850\); \},650\);/,
  `      setTimeout(()=>{ state.questionActive=false; state.currentQuestion=null; ui.question.classList.remove("visible"); spawnMap(state.mapIndex); effect("respawn",state.player.x,state.player.y,"#1677ff",.55); showBanner("Checkpoint cleared · complete level restarted",950); },700);`,
  "checkpoint restarts full level"
);

replaceRegex(
  /    return \{schema:"neon-geometry-pixel-local-v31",version:"48\.0\.0",/,
  `    return {schema:"neon-geometry-consolidated-two-room-v49",version:"49.0.0",`,
  "result schema version"
);

replaceRegex(
  /loadout:\{armorId:state\.armor\?\.id,armorName:state\.armor\?\.name,weapon:"Pulse Pistol"/,
  `loadout:{armorId:"operative",armorName:"Shared Robledo Operative",weapon:"Pulse Pistol"`,
  "fixed operative result"
);

replaceRegex(
  /ui\.registrationFeedback\.textContent="Pixel assets ready\. Choose armor and register three students\.";/,
  `ui.registrationFeedback.textContent="Consolidated two-room assets ready. Register the three control roles.";`,
  "registration readiness message"
);

source = `/* GENERATED CONSOLIDATED RUNTIME · V49.0.0 · TWO LEVEL ROOMS */\n${source}`;
fs.writeFileSync(targetPath, source, "utf8");
console.log(`Prepared ${path.relative(root, targetPath)} (${source.length} characters)`);
