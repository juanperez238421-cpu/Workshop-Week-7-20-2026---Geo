(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  const questionCanvas = document.getElementById("questionCanvas");
  const qctx = questionCanvas.getContext("2d");
  const WORLD = Object.freeze({ width: 1600, height: 1000 });
  const PLAYER_RADIUS = 24;
  const BULLET_SPEED = 980;
  const MAX_ENERGY = 12;
  const AUTOSAVE_MS = 15000;

  const ui = {
    registration: document.getElementById("registrationOverlay"),
    question: document.getElementById("questionOverlay"),
    pause: document.getElementById("pauseOverlay"),
    end: document.getElementById("endOverlay"),
    start: document.getElementById("startButton"),
    restart: document.getElementById("restartButton"),
    openResults: document.getElementById("openResultsButton"),
    registrationFeedback: document.getElementById("registrationFeedback"),
    duration: document.getElementById("durationSelect"),
    hud: document.getElementById("hud"),
    studentPanel: document.getElementById("studentPanel"),
    controlPanel: document.getElementById("controlPanel"),
    students: [document.getElementById("student1"), document.getElementById("student2"), document.getElementById("student3")],
    studentRows: document.getElementById("studentRows"),
    time: document.getElementById("timeValue"),
    room: document.getElementById("roomValue"),
    tags: document.getElementById("tagValue"),
    accuracy: document.getElementById("accuracyValue"),
    strikePips: [...document.querySelectorAll("#strikePips i")],
    energyBar: document.getElementById("energyBar"),
    energyValue: document.getElementById("energyValue"),
    banner: document.getElementById("messageBanner"),
    questionStudent: document.getElementById("questionStudent"),
    questionTimer: document.getElementById("questionTimer"),
    questionPrompt: document.getElementById("questionPrompt"),
    questionOptions: document.getElementById("questionOptions"),
    questionFeedback: document.getElementById("questionFeedback"),
    finalSummary: document.getElementById("finalSummary"),
    resultPath: document.getElementById("resultPath")
  };

  const ASSET_PATHS = Object.freeze({
    player: "assets/player.webp",
    enemies: "assets/enemies.webp",
    effects: "assets/effects.webp",
    pickups: "assets/pickups.webp",
    tiles: "assets/tiles.webp",
    ui: "assets/ui.webp",
    trajectory: "assets/trajectory.webp"
  });

  const assets = {};
  const keys = new Set();
  const pointer = { x: WORLD.width * 0.7, y: WORLD.height * 0.5, down: false };
  let renderScale = 1;
  let renderOffsetX = 0;
  let renderOffsetY = 0;
  let autosaveTimer = null;
  let bannerTimer = null;
  let questionInterval = null;

  const roomDefinitions = [
    {
      name: "Neon Study Hall",
      spawn: [150, 830],
      obstacles: [
        [0, 0, 1600, 45], [0, 955, 1600, 45], [0, 0, 45, 1000], [1555, 0, 45, 1000],
        [310, 180, 370, 70], [850, 140, 390, 72], [560, 440, 470, 82], [250, 700, 310, 70], [1120, 700, 250, 70]
      ],
      enemies: [
        [410, 330, "detective"], [1020, 285, "guard"], [760, 700, "enforcer"], [1280, 455, "rusher"], [1280, 825, "guard"], [445, 835, "rusher"]
      ],
      pickups: [[750, 330, "shield"], [1430, 150, "energy"]]
    },
    {
      name: "Triangle Records Office",
      spawn: [120, 500],
      obstacles: [
        [0, 0, 1600, 45], [0, 955, 1600, 45], [0, 0, 45, 1000], [1555, 0, 45, 1000],
        [290, 80, 85, 380], [290, 620, 85, 300], [620, 270, 340, 80], [620, 650, 340, 80], [1190, 80, 80, 360], [1190, 590, 80, 330]
      ],
      enemies: [
        [520, 140, "detective"], [1040, 150, "guard"], [800, 500, "enforcer"], [1420, 240, "rusher"], [1400, 760, "guard"], [520, 840, "rusher"]
      ],
      pickups: [[820, 160, "triangle"], [820, 840, "energy"]]
    },
    {
      name: "Cyan Library Grid",
      spawn: [800, 890],
      obstacles: [
        [0, 0, 1600, 45], [0, 955, 1600, 45], [0, 0, 45, 1000], [1555, 0, 45, 1000],
        [180, 160, 250, 74], [585, 160, 430, 74], [1170, 160, 250, 74],
        [180, 440, 250, 74], [585, 440, 430, 74], [1170, 440, 250, 74],
        [180, 720, 250, 74], [1170, 720, 250, 74]
      ],
      enemies: [
        [300, 320, "detective"], [800, 310, "guard"], [1300, 320, "enforcer"], [300, 620, "rusher"], [800, 620, "guard"], [1300, 620, "rusher"]
      ],
      pickups: [[800, 820, "shield"], [800, 70, "energy"]]
    },
    {
      name: "Final Geometry Lab",
      spawn: [125, 850],
      obstacles: [
        [0, 0, 1600, 45], [0, 955, 1600, 45], [0, 0, 45, 1000], [1555, 0, 45, 1000],
        [300, 180, 260, 80], [1040, 180, 260, 80], [650, 320, 300, 80], [300, 600, 260, 80], [1040, 600, 260, 80], [650, 760, 300, 80]
      ],
      enemies: [
        [480, 380, "detective"], [1120, 380, "guard"], [800, 520, "enforcer"], [1410, 180, "rusher"], [1410, 820, "guard"], [470, 820, "rusher"], [820, 145, "detective"]
      ],
      pickups: [[800, 670, "triangle"], [1370, 500, "shield"]]
    }
  ];

  const enemyArchetypes = Object.freeze({
    detective: { speed: 125, preferred: 440, fireEvery: 1.02, detection: 780, atlasRow: 0, color: "#49e7ff", radius: 25, projectileSpeed: 600 },
    enforcer: { speed: 88, preferred: 340, fireEvery: 1.28, detection: 820, atlasRow: 2, color: "#ff708e", radius: 30, projectileSpeed: 540 },
    guard: { speed: 150, preferred: 390, fireEvery: 0.72, detection: 860, atlasRow: 4, color: "#ffe45b", radius: 24, projectileSpeed: 650 },
    rusher: { speed: 210, preferred: 38, fireEvery: 0.72, detection: 920, atlasRow: 6, color: "#58f0a5", radius: 24, projectileSpeed: 0 }
  });

  const state = {
    running: false,
    paused: false,
    questionActive: false,
    ended: false,
    matchSeconds: 300,
    remaining: 300,
    startedAt: 0,
    resultId: "",
    roomIndex: 0,
    wave: 1,
    roomsCleared: 0,
    tags: 0,
    strikes: 0,
    shots: 0,
    hits: 0,
    energy: MAX_ENERGY,
    energyRegen: 0,
    checkpointCount: 0,
    students: [],
    studentStats: [],
    player: null,
    enemies: [],
    bullets: [],
    effects: [],
    pickups: [],
    room: null,
    lastFrame: 0,
    currentQuestion: null,
    currentStudentIndex: 0,
    questionStartedAt: 0,
    questionRemaining: 25,
    screenShake: 0,
    roomTransition: 0,
    savedPath: ""
  };

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Unable to load ${src}`));
      image.src = src;
    });
  }

  async function loadAssets() {
    const entries = await Promise.all(Object.entries(ASSET_PATHS).map(async ([key, src]) => [key, await loadImage(src)]));
    for (const [key, image] of entries) assets[key] = image;
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function normalize(x, y) { const length = Math.hypot(x, y) || 1; return { x: x / length, y: y / length, length }; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function nowSeconds() { return performance.now() / 1000; }
  function safeName(value) { return String(value || "").replace(/[<>\r\n\t]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60); }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    const scale = Math.min(innerWidth / WORLD.width, innerHeight / WORLD.height);
    renderScale = scale;
    renderOffsetX = (innerWidth - WORLD.width * scale) / 2;
    renderOffsetY = (innerHeight - WORLD.height * scale) / 2;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * renderOffsetX, dpr * renderOffsetY);
  }

  function eventToWorld(event) {
    return {
      x: clamp((event.clientX - renderOffsetX) / renderScale, 0, WORLD.width),
      y: clamp((event.clientY - renderOffsetY) / renderScale, 0, WORLD.height)
    };
  }

  function rectCircleCollision(x, y, radius, rect) {
    const px = clamp(x, rect.x, rect.x + rect.w);
    const py = clamp(y, rect.y, rect.y + rect.h);
    return Math.hypot(x - px, y - py) < radius;
  }

  function collides(x, y, radius) {
    return state.room.obstacles.some((rect) => rectCircleCollision(x, y, radius, rect));
  }

  function moveEntity(entity, vx, vy, dt) {
    const nextX = entity.x + vx * dt;
    const nextY = entity.y + vy * dt;
    if (!collides(nextX, entity.y, entity.radius)) entity.x = nextX;
    if (!collides(entity.x, nextY, entity.radius)) entity.y = nextY;
    entity.x = clamp(entity.x, entity.radius, WORLD.width - entity.radius);
    entity.y = clamp(entity.y, entity.radius, WORLD.height - entity.radius);
  }

  function segmentHitsRect(x1, y1, x2, y2, rect, padding = 0) {
    const left = rect.x - padding;
    const right = rect.x + rect.w + padding;
    const top = rect.y - padding;
    const bottom = rect.y + rect.h + padding;
    const dx = x2 - x1;
    const dy = y2 - y1;
    let t0 = 0;
    let t1 = 1;
    const checks = [[-dx, x1 - left], [dx, right - x1], [-dy, y1 - top], [dy, bottom - y1]];
    for (const [p, q] of checks) {
      if (p === 0 && q < 0) return false;
      if (p !== 0) {
        const r = q / p;
        if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
        else { if (r < t0) return false; if (r < t1) t1 = r; }
      }
    }
    return true;
  }

  function hasLineOfSight(a, b) {
    return !state.room.obstacles.some((rect) => segmentHitsRect(a.x, a.y, b.x, b.y, rect, 6));
  }

  function rayDistance(x, y, angle, maxDistance = 1050) {
    const step = 18;
    for (let distanceValue = step; distanceValue <= maxDistance; distanceValue += step) {
      const px = x + Math.cos(angle) * distanceValue;
      const py = y + Math.sin(angle) * distanceValue;
      if (px < 0 || px > WORLD.width || py < 0 || py > WORLD.height || collides(px, py, 3)) return distanceValue - step;
    }
    return maxDistance;
  }

  function drawSheetCell(image, columns, rows, column, row, x, y, width, height, angle = 0, alpha = 1) {
    if (!image?.complete) return;
    const sourceW = image.naturalWidth / columns;
    const sourceH = image.naturalHeight / rows;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(angle + Math.PI / 2);
    ctx.drawImage(image, column * sourceW, row * sourceH, sourceW, sourceH, -width / 2, -height / 2, width, height);
    ctx.restore();
  }

  function drawAtlasCrop(image, source, destination, alpha = 1) {
    if (!image?.complete) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(image, source.x, source.y, source.w, source.h, destination.x, destination.y, destination.w, destination.h);
    ctx.restore();
  }

  function createStudentStats(names) {
    return names.map((studentName, studentIndex) => ({
      studentIndex,
      studentName,
      checkpointsAssigned: 0,
      attempts: 0,
      correct: 0,
      wrong: 0,
      timeouts: 0,
      totalResponseMs: 0,
      answers: []
    }));
  }

  function makePlayer(x, y) {
    return {
      x, y,
      radius: PLAYER_RADIUS,
      speed: 320,
      vx: 0,
      vy: 0,
      angle: 0,
      alive: true,
      invulnerable: 0.85,
      fireCooldown: 0,
      dashCooldown: 0,
      dashTime: 0,
      shotFlash: 0,
      stunned: 0,
      shield: 0
    };
  }

  function makeEnemy([x, y, type], serial) {
    const archetype = enemyArchetypes[type];
    return {
      id: `${type}-${serial}-${state.wave}`,
      x, y,
      anchorX: x,
      anchorY: y,
      radius: archetype.radius,
      type,
      alive: true,
      angle: 0,
      vx: 0,
      vy: 0,
      fireCooldown: 0.25 + Math.random() * 0.9,
      dodgeCooldown: 0,
      dodgeTime: 0,
      dodgeX: 0,
      dodgeY: 0,
      alert: 0,
      attackFlash: 0,
      stun: 0,
      strafeDirection: Math.random() < 0.5 ? -1 : 1,
      aimBias: ((serial * 17) % 11 - 5) * 0.0035
    };
  }

  function spawnRoom(index) {
    const definition = roomDefinitions[index];
    state.roomIndex = index;
    state.room = {
      name: definition.name,
      obstacles: definition.obstacles.map(([x, y, w, h]) => ({ x, y, w, h }))
    };
    state.enemies = definition.enemies.map((entry, serial) => makeEnemy(entry, serial));
    if (state.wave > 1) {
      const extras = Math.min(3, state.wave - 1);
      for (let indexExtra = 0; indexExtra < extras; indexExtra += 1) {
        const base = definition.enemies[indexExtra % definition.enemies.length];
        const offsetX = 55 + indexExtra * 30;
        const offsetY = 45 + indexExtra * 35;
        state.enemies.push(makeEnemy([clamp(base[0] + offsetX, 80, 1520), clamp(base[1] + offsetY, 80, 920), indexExtra % 2 ? "guard" : "rusher"], 100 + indexExtra));
      }
    }
    state.pickups = definition.pickups.map(([x, y, type], serial) => ({ id: `${type}-${serial}`, x, y, type, active: true, pulse: Math.random() * Math.PI * 2 }));
    state.bullets = [];
    state.effects = [];
    state.player = makePlayer(definition.spawn[0], definition.spawn[1]);
    ui.room.textContent = `${state.roomIndex + 1} · W${state.wave}`;
    showBanner(definition.name, 1500);
  }

  function resetGame() {
    const names = ui.students.map((input) => safeName(input.value));
    if (names.some((name) => name.length < 2)) {
      ui.registrationFeedback.textContent = "Enter three complete student names.";
      return;
    }
    if (new Set(names.map((name) => name.toLowerCase())).size !== 3) {
      ui.registrationFeedback.textContent = "The three student names must be different.";
      return;
    }

    clearInterval(questionInterval);
    clearInterval(autosaveTimer);
    state.running = true;
    state.paused = false;
    state.questionActive = false;
    state.ended = false;
    state.matchSeconds = Number(ui.duration.value) || 300;
    state.remaining = state.matchSeconds;
    state.startedAt = Date.now();
    state.resultId = `neon-geometry-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    state.roomIndex = 0;
    state.wave = 1;
    state.roomsCleared = 0;
    state.tags = 0;
    state.strikes = 0;
    state.shots = 0;
    state.hits = 0;
    state.energy = MAX_ENERGY;
    state.energyRegen = 0;
    state.checkpointCount = 0;
    state.students = names;
    state.studentStats = createStudentStats(names);
    state.currentQuestion = null;
    state.screenShake = 0;
    state.roomTransition = 0;
    state.savedPath = "";
    state.lastFrame = performance.now();

    ui.registration.classList.remove("visible");
    ui.question.classList.remove("visible");
    ui.pause.classList.remove("visible");
    ui.end.classList.remove("visible");
    ui.hud.classList.remove("hidden");
    ui.studentPanel.classList.remove("hidden");
    ui.controlPanel.classList.remove("hidden");
    renderStudentRows();
    spawnRoom(0);
    syncHud();
    saveProgress("started");
    autosaveTimer = setInterval(() => saveProgress("in_progress"), AUTOSAVE_MS);
  }

  function renderStudentRows() {
    ui.studentRows.innerHTML = state.studentStats.map((student, index) => {
      const accuracy = student.attempts ? Math.round((student.correct / student.attempts) * 100) : 0;
      const active = state.questionActive && index === state.currentStudentIndex;
      return `<div class="student-row${active ? " active" : ""}"><i>${index + 1}</i><strong>${escapeHtml(student.studentName)}</strong><small>${student.correct}/${student.attempts} · ${accuracy}%</small></div>`;
    }).join("");
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  }

  function syncHud() {
    const seconds = Math.max(0, Math.ceil(state.remaining));
    ui.time.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    ui.tags.textContent = String(state.tags);
    ui.accuracy.textContent = state.shots ? `${Math.round((state.hits / (state.shots * 3)) * 100)}%` : "—";
    ui.strikePips.forEach((pip, index) => pip.classList.toggle("used", index < state.strikes));
    ui.energyBar.value = state.energy;
    ui.energyValue.textContent = String(state.energy);
    renderStudentRows();
  }

  function showBanner(text, duration = 900) {
    ui.banner.textContent = text;
    ui.banner.classList.remove("hidden");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => ui.banner.classList.add("hidden"), duration);
  }

  function spawnEffect(type, x, y, color = "#49e7ff", duration = 0.55, angle = 0) {
    state.effects.push({ type, x, y, color, age: 0, duration, angle });
    if (state.effects.length > 180) state.effects.shift();
  }

  function fireTriVolley() {
    const player = state.player;
    if (!state.running || state.paused || state.questionActive || !player?.alive || player.fireCooldown > 0 || state.energy <= 0) return;
    state.energy -= 1;
    state.shots += 1;
    player.fireCooldown = 0.22;
    player.shotFlash = 0.12;
    const spread = 0.055;
    for (const offset of [-spread, 0, spread]) {
      const angle = player.angle + offset;
      state.bullets.push({
        id: `p-${performance.now()}-${offset}`,
        owner: "player",
        x: player.x + Math.cos(angle) * 34,
        y: player.y + Math.sin(angle) * 34,
        vx: Math.cos(angle) * BULLET_SPEED,
        vy: Math.sin(angle) * BULLET_SPEED,
        angle,
        radius: 6,
        life: 1.35,
        color: offset === 0 ? "#ffe45b" : offset < 0 ? "#49e7ff" : "#ff4ca8"
      });
    }
    spawnEffect("muzzle", player.x + Math.cos(player.angle) * 32, player.y + Math.sin(player.angle) * 32, "#ffe45b", 0.16, player.angle);
  }

  function enemyFire(enemy, targetX, targetY) {
    const archetype = enemyArchetypes[enemy.type];
    const angle = Math.atan2(targetY - enemy.y, targetX - enemy.x) + enemy.aimBias;
    const count = enemy.type === "enforcer" ? 3 : 1;
    for (let index = 0; index < count; index += 1) {
      const offset = count === 1 ? 0 : (index - 1) * 0.045;
      const shotAngle = angle + offset;
      state.bullets.push({
        id: `e-${enemy.id}-${performance.now()}-${index}`,
        owner: "enemy",
        x: enemy.x + Math.cos(shotAngle) * 34,
        y: enemy.y + Math.sin(shotAngle) * 34,
        vx: Math.cos(shotAngle) * archetype.projectileSpeed,
        vy: Math.sin(shotAngle) * archetype.projectileSpeed,
        angle: shotAngle,
        radius: 6,
        life: 1.7,
        color: archetype.color
      });
    }
    enemy.attackFlash = 0.16;
    spawnEffect("muzzle", enemy.x + Math.cos(angle) * 30, enemy.y + Math.sin(angle) * 30, archetype.color, 0.16, angle);
  }

  function incomingThreat(enemy) {
    let best = null;
    let bestDistance = Infinity;
    for (const bullet of state.bullets) {
      if (bullet.owner !== "player") continue;
      const dx = enemy.x - bullet.x;
      const dy = enemy.y - bullet.y;
      const distanceValue = Math.hypot(dx, dy);
      if (distanceValue > 300 || distanceValue >= bestDistance) continue;
      const velocity = normalize(bullet.vx, bullet.vy);
      const toward = (dx * velocity.x + dy * velocity.y) / Math.max(1, distanceValue);
      const cross = Math.abs(dx * velocity.y - dy * velocity.x);
      if (toward > 0.62 && cross < 65) {
        best = bullet;
        bestDistance = distanceValue;
      }
    }
    return best;
  }

  function updateEnemy(enemy, dt) {
    if (!enemy.alive) return;
    const archetype = enemyArchetypes[enemy.type];
    const player = state.player;
    enemy.fireCooldown -= dt;
    enemy.dodgeCooldown -= dt;
    enemy.attackFlash = Math.max(0, enemy.attackFlash - dt);
    enemy.stun = Math.max(0, enemy.stun - dt);
    if (!player?.alive || enemy.stun > 0) return;

    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const direction = normalize(dx, dy);
    const playerDistance = direction.length;
    const visible = hasLineOfSight(enemy, player);
    if (visible && playerDistance < archetype.detection) enemy.alert = 3.5;
    else enemy.alert = Math.max(0, enemy.alert - dt);

    const threat = incomingThreat(enemy);
    if (threat && enemy.dodgeCooldown <= 0) {
      const bulletDirection = normalize(threat.vx, threat.vy);
      enemy.dodgeX = -bulletDirection.y * enemy.strafeDirection;
      enemy.dodgeY = bulletDirection.x * enemy.strafeDirection;
      enemy.dodgeTime = 0.34;
      enemy.dodgeCooldown = 1.25;
      enemy.strafeDirection *= -1;
    }

    let moveX = 0;
    let moveY = 0;
    if (enemy.dodgeTime > 0) {
      enemy.dodgeTime -= dt;
      moveX = enemy.dodgeX * archetype.speed * 2.1;
      moveY = enemy.dodgeY * archetype.speed * 2.1;
    } else if (enemy.alert > 0) {
      if (enemy.type === "rusher") {
        moveX = direction.x * archetype.speed;
        moveY = direction.y * archetype.speed;
        if (playerDistance < 52 && player.invulnerable <= 0) playerTagged("melee");
      } else {
        if (!visible || playerDistance > archetype.preferred + 90) {
          moveX = direction.x * archetype.speed;
          moveY = direction.y * archetype.speed;
        } else if (playerDistance < archetype.preferred - 110) {
          moveX = -direction.x * archetype.speed * 0.8;
          moveY = -direction.y * archetype.speed * 0.8;
        } else {
          moveX = -direction.y * archetype.speed * 0.72 * enemy.strafeDirection;
          moveY = direction.x * archetype.speed * 0.72 * enemy.strafeDirection;
        }
        if (visible && playerDistance < 760 && enemy.fireCooldown <= 0) {
          const travelTime = playerDistance / Math.max(1, archetype.projectileSpeed);
          const lead = clamp(travelTime * 0.72, 0.05, 0.72);
          const targetX = player.x + player.vx * lead;
          const targetY = player.y + player.vy * lead;
          enemyFire(enemy, targetX, targetY);
          enemy.fireCooldown = archetype.fireEvery * (0.86 + Math.random() * 0.3);
        }
      }
    } else {
      const patrolAngle = nowSeconds() * 0.42 + enemy.id.length * 0.8;
      const targetX = enemy.anchorX + Math.cos(patrolAngle) * 80;
      const targetY = enemy.anchorY + Math.sin(patrolAngle) * 80;
      const patrol = normalize(targetX - enemy.x, targetY - enemy.y);
      moveX = patrol.x * archetype.speed * 0.35;
      moveY = patrol.y * archetype.speed * 0.35;
    }

    enemy.vx = lerp(enemy.vx, moveX, 1 - Math.exp(-9 * dt));
    enemy.vy = lerp(enemy.vy, moveY, 1 - Math.exp(-9 * dt));
    enemy.angle = Math.atan2(dy, dx);
    moveEntity(enemy, enemy.vx, enemy.vy, dt);
  }

  function playerTagged(source) {
    const player = state.player;
    if (!player?.alive || player.invulnerable > 0 || state.questionActive) return;
    if (player.shield > 0) {
      player.shield = 0;
      player.invulnerable = 0.8;
      spawnEffect("shield", player.x, player.y, "#49e7ff", 0.75);
      showBanner("Shield absorbed the training tag", 900);
      return;
    }

    player.alive = false;
    player.stunned = 0.75;
    state.strikes += 1;
    state.screenShake = 13;
    spawnEffect("tag", player.x, player.y, source === "melee" ? "#58f0a5" : "#ff4ca8", 0.78);
    syncHud();

    if (state.strikes >= 3) {
      showBanner("Three strikes · trigonometry checkpoint", 1000);
      setTimeout(beginQuestionCheckpoint, 500);
    } else {
      showBanner(`Strike ${state.strikes}/3 · rapid reset`, 900);
      setTimeout(() => {
        if (state.ended || state.questionActive) return;
        const spawn = roomDefinitions[state.roomIndex].spawn;
        state.player = makePlayer(spawn[0], spawn[1]);
        spawnEffect("respawn", state.player.x, state.player.y, "#49e7ff", 0.75);
      }, 720);
    }
  }

  function tagEnemy(enemy) {
    if (!enemy.alive) return;
    enemy.alive = false;
    state.tags += 1;
    state.hits += 1;
    state.screenShake = Math.max(state.screenShake, 5);
    spawnEffect("defeat", enemy.x, enemy.y, enemyArchetypes[enemy.type].color, 0.72);
    syncHud();
    if (state.enemies.every((candidate) => !candidate.alive)) {
      state.roomsCleared += 1;
      state.roomTransition = 1.25;
      showBanner("Room secured · moving to the next geometry zone", 1200);
    }
  }

  function collectPickup(pickup) {
    if (!pickup.active) return;
    pickup.active = false;
    if (pickup.type === "shield") {
      state.player.shield = 1;
      showBanner("Shield token collected", 800);
    } else if (pickup.type === "energy") {
      state.energy = MAX_ENERGY;
      showBanner("Training energy restored", 800);
    } else if (pickup.type === "triangle") {
      state.energy = Math.min(MAX_ENERGY, state.energy + 5);
      state.player.dashCooldown = 0;
      showBanner("Triangle token · energy and dash restored", 900);
    }
    spawnEffect("pickup", pickup.x, pickup.y, pickup.type === "shield" ? "#49e7ff" : pickup.type === "triangle" ? "#ffe45b" : "#ff4ca8", 0.62);
  }

  function updatePlayer(dt) {
    const player = state.player;
    if (!player) return;
    player.fireCooldown = Math.max(0, player.fireCooldown - dt);
    player.dashCooldown = Math.max(0, player.dashCooldown - dt);
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    player.shotFlash = Math.max(0, player.shotFlash - dt);
    player.stunned = Math.max(0, player.stunned - dt);

    if (!player.alive) return;
    let dx = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
    let dy = (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) - (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0);
    const movement = normalize(dx, dy);
    const moving = Math.hypot(dx, dy) > 0;
    const targetSpeed = moving ? player.speed : 0;
    player.vx = lerp(player.vx, movement.x * targetSpeed, 1 - Math.exp(-14 * dt));
    player.vy = lerp(player.vy, movement.y * targetSpeed, 1 - Math.exp(-14 * dt));
    player.angle = Math.atan2(pointer.y - player.y, pointer.x - player.x);

    if ((keys.has("ShiftLeft") || keys.has("ShiftRight")) && player.dashCooldown <= 0 && moving) {
      player.dashCooldown = 1.15;
      player.dashTime = 0.16;
      player.invulnerable = Math.max(player.invulnerable, 0.22);
      spawnEffect("dash", player.x, player.y, "#49e7ff", 0.28, Math.atan2(player.vy, player.vx));
    }
    if (player.dashTime > 0) {
      player.dashTime -= dt;
      player.vx = movement.x * 930;
      player.vy = movement.y * 930;
    }
    moveEntity(player, player.vx, player.vy, dt);

    if (pointer.down || keys.has("Space")) fireTriVolley();

    for (const pickup of state.pickups) {
      if (pickup.active && Math.hypot(player.x - pickup.x, player.y - pickup.y) < 55) collectPickup(pickup);
    }
  }

  function updateBullets(dt) {
    for (let index = state.bullets.length - 1; index >= 0; index -= 1) {
      const bullet = state.bullets[index];
      const previousX = bullet.x;
      const previousY = bullet.y;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      const wallHit = bullet.life <= 0 || bullet.x < 0 || bullet.x > WORLD.width || bullet.y < 0 || bullet.y > WORLD.height || state.room.obstacles.some((rect) => segmentHitsRect(previousX, previousY, bullet.x, bullet.y, rect, bullet.radius));
      if (wallHit) {
        spawnEffect("impact", bullet.x, bullet.y, bullet.color, 0.28, bullet.angle);
        state.bullets.splice(index, 1);
        continue;
      }
      if (bullet.owner === "player") {
        const enemy = state.enemies.find((candidate) => candidate.alive && Math.hypot(bullet.x - candidate.x, bullet.y - candidate.y) < bullet.radius + candidate.radius);
        if (enemy) {
          tagEnemy(enemy);
          state.bullets.splice(index, 1);
        }
      } else if (state.player?.alive && Math.hypot(bullet.x - state.player.x, bullet.y - state.player.y) < bullet.radius + state.player.radius) {
        state.bullets.splice(index, 1);
        playerTagged("projectile");
      }
    }
  }

  function updateEffects(dt) {
    for (let index = state.effects.length - 1; index >= 0; index -= 1) {
      state.effects[index].age += dt;
      if (state.effects[index].age >= state.effects[index].duration) state.effects.splice(index, 1);
    }
  }

  function updateGame(dt) {
    if (!state.running || state.paused || state.questionActive || state.ended) return;
    state.remaining -= dt;
    if (state.remaining <= 0) {
      state.remaining = 0;
      endMatch();
      return;
    }
    state.energyRegen += dt;
    if (state.energy < MAX_ENERGY && state.energyRegen >= 1.3) {
      state.energy += 1;
      state.energyRegen = 0;
    }
    updatePlayer(dt);
    state.enemies.forEach((enemy) => updateEnemy(enemy, dt));
    updateBullets(dt);
    updateEffects(dt);

    if (state.roomTransition > 0) {
      state.roomTransition -= dt;
      if (state.roomTransition <= 0) {
        let nextRoom = state.roomIndex + 1;
        if (nextRoom >= roomDefinitions.length) {
          nextRoom = 0;
          state.wave += 1;
        }
        spawnRoom(nextRoom);
      }
    }
    state.screenShake *= Math.pow(0.02, dt);
    syncHud();
  }

  function drawFloor() {
    const gradient = ctx.createLinearGradient(0, 0, WORLD.width, WORLD.height);
    gradient.addColorStop(0, "#07101c");
    gradient.addColorStop(0.5, "#090a17");
    gradient.addColorStop(1, "#071520");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    ctx.save();
    ctx.globalAlpha = 0.13;
    for (let x = 0; x < WORLD.width; x += 80) {
      for (let y = 0; y < WORLD.height; y += 80) {
        const sourceX = ((x / 80 + y / 80) % 4) * 64;
        drawAtlasCrop(assets.tiles, { x: sourceX, y: 0, w: 63, h: 54 }, { x, y, w: 80, h: 80 }, 0.36);
      }
    }
    ctx.restore();

    ctx.strokeStyle = "rgba(73,231,255,.07)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= WORLD.width; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.height); ctx.stroke(); }
    for (let y = 0; y <= WORLD.height; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.width, y); ctx.stroke(); }
  }

  function drawRoom() {
    drawFloor();
    for (let index = 0; index < state.room.obstacles.length; index += 1) {
      const rect = state.room.obstacles[index];
      const color = index % 3 === 0 ? "#49e7ff" : index % 3 === 1 ? "#ff4ca8" : "#ffe45b";
      ctx.fillStyle = "rgba(5,8,18,.96)";
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 3;
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      if (rect.w > rect.h) ctx.fillRect(rect.x + 12, rect.y + 10, Math.max(20, rect.w - 24), 4);
      else ctx.fillRect(rect.x + 10, rect.y + 12, 4, Math.max(20, rect.h - 24));

      if (rect.w > 230 && rect.h < 100 && index > 3) {
        const source = index % 2 ? { x: 346, y: 119, w: 157, h: 54 } : { x: 10, y: 190, w: 147, h: 57 };
        drawAtlasCrop(assets.tiles, source, { x: rect.x + 14, y: rect.y + 8, w: rect.w - 28, h: rect.h - 16 }, 0.55);
      }
    }

    drawAtlasCrop(assets.ui, { x: 390, y: 15, w: 107, h: 103 }, { x: 1380, y: 70, w: 150, h: 150 }, 0.18);
  }

  function drawPickup(pickup) {
    if (!pickup.active) return;
    const pulse = 1 + Math.sin(performance.now() / 260 + pickup.pulse) * 0.08;
    const mapping = { shield: [3, 0], energy: [4, 0], triangle: [1, 2] };
    const [column, row] = mapping[pickup.type] || [1, 1];
    drawSheetCell(assets.pickups, 5, 4, column, row, pickup.x, pickup.y, 76 * pulse, 76 * pulse, -Math.PI / 2, 0.98);
    ctx.strokeStyle = pickup.type === "shield" ? "#49e7ff" : pickup.type === "triangle" ? "#ffe45b" : "#ff4ca8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pickup.x, pickup.y, 40 * pulse, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawPlayer() {
    const player = state.player;
    if (!player) return;
    const speed = Math.hypot(player.vx, player.vy);
    let row = 0;
    let column = 0;
    if (!player.alive) { row = 4; column = 7; }
    else if (player.stunned > 0) { row = 4; column = Math.floor(performance.now() / 120) % 4; }
    else if (player.dashTime > 0) { row = 3; column = Math.floor(performance.now() / 50) % 8; }
    else if (player.shotFlash > 0) { row = 2; column = 4 + (Math.floor(performance.now() / 70) % 4); }
    else if (speed > 70) { row = 1; column = Math.floor(performance.now() / 115) % 4; }
    drawSheetCell(assets.player, 8, 5, column, row, player.x, player.y, 100, 116, player.angle, player.invulnerable > 0 && Math.floor(performance.now() / 70) % 2 ? 0.65 : 1);

    if (player.shield > 0) {
      ctx.strokeStyle = "rgba(73,231,255,.85)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 42 + Math.sin(performance.now() / 100) * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawEnemy(enemy) {
    if (!enemy.alive) return;
    const archetype = enemyArchetypes[enemy.type];
    const moving = Math.hypot(enemy.vx, enemy.vy) > 25;
    const row = archetype.atlasRow;
    let column = moving ? 1 + (Math.floor(performance.now() / 130 + enemy.id.length) % 5) : 0;
    if (enemy.attackFlash > 0) column = 9 + (Math.floor(performance.now() / 65) % 4);
    if (enemy.stun > 0) column = 13;
    drawSheetCell(assets.enemies, 14, 7, column, row, enemy.x, enemy.y, enemy.type === "enforcer" ? 104 : 90, enemy.type === "enforcer" ? 116 : 104, enemy.angle, 1);

    if (enemy.alert > 0) {
      ctx.fillStyle = archetype.color;
      ctx.font = "900 16px Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText("!", enemy.x, enemy.y - 48);
    }
  }

  function drawBullets() {
    for (const bullet of state.bullets) {
      ctx.strokeStyle = bullet.color;
      ctx.lineWidth = bullet.owner === "player" ? 3 : 2.4;
      ctx.shadowColor = bullet.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(bullet.x - bullet.vx * 0.045, bullet.y - bullet.vy * 0.045);
      ctx.lineTo(bullet.x, bullet.y);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawAimOverlay() {
    const player = state.player;
    if (!player?.alive || state.questionActive) return;
    const spread = 0.055;
    const endpoints = [];
    const colors = ["#49e7ff", "#ffe45b", "#ff4ca8"];
    [-spread, 0, spread].forEach((offset, index) => {
      const angle = player.angle + offset;
      const length = rayDistance(player.x, player.y, angle, 1050);
      const end = { x: player.x + Math.cos(angle) * length, y: player.y + Math.sin(angle) * length };
      endpoints.push(end);
      const gradient = ctx.createLinearGradient(player.x, player.y, end.x, end.y);
      gradient.addColorStop(0, `${colors[index]}dd`);
      gradient.addColorStop(1, `${colors[index]}18`);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = index === 1 ? 2.7 : 1.8;
      ctx.setLineDash(index === 1 ? [13, 9] : [7, 8]);
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.setLineDash([]);
    });
    ctx.strokeStyle = "rgba(255,228,91,.62)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(endpoints[0].x, endpoints[0].y);
    ctx.lineTo(endpoints[1].x, endpoints[1].y);
    ctx.lineTo(endpoints[2].x, endpoints[2].y);
    ctx.closePath();
    ctx.stroke();

    const target = endpoints[1];
    drawAtlasCrop(assets.trajectory, { x: 353, y: 173, w: 147, h: 113 }, { x: target.x - 34, y: target.y - 34, w: 68, h: 68 }, 0.75);
  }

  function drawEffects() {
    for (const effect of state.effects) {
      const progress = clamp(effect.age / effect.duration, 0, 1);
      const alpha = 1 - progress;
      const scale = 0.65 + progress * 0.75;
      const mapping = {
        muzzle: [0, 0], impact: [1, 1], dash: [0, 2], shield: [4, 3], respawn: [5, 3], tag: [6, 4], defeat: [7, 4], pickup: [3, 3]
      };
      const [column, row] = mapping[effect.type] || [0, 0];
      drawSheetCell(assets.effects, 8, 5, column, row, effect.x, effect.y, 110 * scale, 95 * scale, effect.angle - Math.PI / 2, alpha);
      if (["tag", "defeat", "respawn", "shield"].includes(effect.type)) {
        ctx.strokeStyle = effect.color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 4 * alpha + 1;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, 18 + progress * 72, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  function renderGame() {
    if (!state.room) {
      ctx.fillStyle = "#050711";
      ctx.fillRect(0, 0, WORLD.width, WORLD.height);
      return;
    }
    ctx.save();
    const shakeX = state.screenShake > 0.2 ? (Math.random() - 0.5) * state.screenShake : 0;
    const shakeY = state.screenShake > 0.2 ? (Math.random() - 0.5) * state.screenShake : 0;
    ctx.translate(shakeX, shakeY);
    drawRoom();
    state.pickups.forEach(drawPickup);
    drawAimOverlay();
    state.enemies.forEach(drawEnemy);
    drawPlayer();
    drawBullets();
    drawEffects();
    ctx.restore();
  }

  function makeNumericOptions(correct, spread = 3) {
    const rounded = Number(correct.toFixed(1));
    const values = new Set([rounded]);
    const offsets = [-2.4, -1.2, 1.2, 2.4, 3.6, -3.6];
    let cursor = Math.floor(Math.random() * offsets.length);
    while (values.size < 4) {
      const value = Math.max(0.1, rounded + offsets[cursor % offsets.length] * spread / 3);
      values.add(Number(value.toFixed(1)));
      cursor += 1;
    }
    const options = [...values].sort(() => Math.random() - 0.5);
    return { options: options.map((value) => `${value}`), answerIndex: options.indexOf(rounded) };
  }

  function createTrigQuestion() {
    const type = ["sin-side", "cos-side", "tan-side", "ratio", "angle"][Math.floor(Math.random() * 5)];
    const angle = [30, 35, 40, 45, 50, 55, 60][Math.floor(Math.random() * 7)];
    const radians = angle * Math.PI / 180;
    let prompt = "";
    let correct = 0;
    let diagram = { angle, adjacent: "?", opposite: "?", hypotenuse: "?", type };
    let options;
    let answerIndex;

    if (type === "sin-side") {
      const hypotenuse = [10, 12, 15, 18, 20][Math.floor(Math.random() * 5)];
      correct = hypotenuse * Math.sin(radians);
      prompt = `θ = ${angle}° and the hypotenuse is ${hypotenuse}. Find the opposite side using sin(θ). Round to one decimal.`;
      diagram = { type, angle, adjacent: "", opposite: "?", hypotenuse };
      ({ options, answerIndex } = makeNumericOptions(correct, Math.max(2, correct * 0.18)));
      options = options.map((value) => `${value} units`);
    } else if (type === "cos-side") {
      const hypotenuse = [10, 12, 15, 18, 20][Math.floor(Math.random() * 5)];
      correct = hypotenuse * Math.cos(radians);
      prompt = `θ = ${angle}° and the hypotenuse is ${hypotenuse}. Find the adjacent side using cos(θ). Round to one decimal.`;
      diagram = { type, angle, adjacent: "?", opposite: "", hypotenuse };
      ({ options, answerIndex } = makeNumericOptions(correct, Math.max(2, correct * 0.18)));
      options = options.map((value) => `${value} units`);
    } else if (type === "tan-side") {
      const adjacent = [6, 8, 10, 12, 15][Math.floor(Math.random() * 5)];
      correct = adjacent * Math.tan(radians);
      prompt = `θ = ${angle}° and the adjacent side is ${adjacent}. Find the opposite side using tan(θ). Round to one decimal.`;
      diagram = { type, angle, adjacent, opposite: "?", hypotenuse: "" };
      ({ options, answerIndex } = makeNumericOptions(correct, Math.max(2, correct * 0.18)));
      options = options.map((value) => `${value} units`);
    } else if (type === "ratio") {
      const ratios = [
        { prompt: "sin(θ)", answer: "opposite / hypotenuse" },
        { prompt: "cos(θ)", answer: "adjacent / hypotenuse" },
        { prompt: "tan(θ)", answer: "opposite / adjacent" }
      ];
      const selected = ratios[Math.floor(Math.random() * ratios.length)];
      prompt = `Which side ratio correctly defines ${selected.prompt} in a right triangle?`;
      options = [selected.answer, "adjacent / opposite", "hypotenuse / opposite", "hypotenuse / adjacent"].sort(() => Math.random() - 0.5);
      answerIndex = options.indexOf(selected.answer);
      diagram = { type, angle: 38, adjacent: "adjacent", opposite: "opposite", hypotenuse: "hypotenuse" };
    } else {
      const triples = [
        { opposite: 5, hypotenuse: 10, angle: 30 },
        { opposite: 7.1, hypotenuse: 10, angle: 45 },
        { opposite: 8.7, hypotenuse: 10, angle: 60 }
      ];
      const selected = triples[Math.floor(Math.random() * triples.length)];
      prompt = `A right triangle has opposite side ${selected.opposite} and hypotenuse ${selected.hypotenuse}. Which angle is closest to θ using sin⁻¹(opposite/hypotenuse)?`;
      options = [selected.angle, 25, 40, 70].filter((value, index, array) => array.indexOf(value) === index).sort(() => Math.random() - 0.5).map((value) => `${value}°`);
      answerIndex = options.indexOf(`${selected.angle}°`);
      diagram = { type, angle: "?", adjacent: "", opposite: selected.opposite, hypotenuse: selected.hypotenuse };
    }

    return { id: `q-${Date.now()}-${Math.random().toString(16).slice(2)}`, type, prompt, options, answerIndex, diagram };
  }

  function drawQuestionDiagram(diagram) {
    const width = questionCanvas.width;
    const height = questionCanvas.height;
    qctx.clearRect(0, 0, width, height);
    const gradient = qctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#07101c");
    gradient.addColorStop(1, "#0c0a1b");
    qctx.fillStyle = gradient;
    qctx.fillRect(0, 0, width, height);

    const ax = 115;
    const ay = 215;
    const bx = 500;
    const by = 215;
    const cx = 500;
    const cy = 58;
    qctx.strokeStyle = "#49e7ff";
    qctx.lineWidth = 5;
    qctx.beginPath();
    qctx.moveTo(ax, ay);
    qctx.lineTo(bx, by);
    qctx.lineTo(cx, cy);
    qctx.closePath();
    qctx.stroke();
    qctx.strokeStyle = "#ffe45b";
    qctx.lineWidth = 3;
    qctx.strokeRect(bx - 25, by - 25, 25, 25);

    qctx.fillStyle = "#eefcff";
    qctx.font = "700 18px Segoe UI";
    qctx.fillText(String(diagram.adjacent || "adjacent"), 280, 245);
    qctx.fillText(String(diagram.opposite || "opposite"), 510, 145);
    qctx.save();
    qctx.translate(300, 115);
    qctx.rotate(-0.39);
    qctx.fillText(String(diagram.hypotenuse || "hypotenuse"), 0, 0);
    qctx.restore();

    qctx.strokeStyle = "#ff4ca8";
    qctx.lineWidth = 3;
    qctx.beginPath();
    qctx.arc(ax, ay, 50, -0.39, 0);
    qctx.stroke();
    qctx.fillStyle = "#ff4ca8";
    qctx.font = "900 20px Consolas";
    qctx.fillText(`${diagram.angle ?? "?"}°`, 155, 195);
  }

  function beginQuestionCheckpoint() {
    if (state.questionActive || state.ended) return;
    state.questionActive = true;
    state.currentStudentIndex = state.checkpointCount % 3;
    state.checkpointCount += 1;
    state.studentStats[state.currentStudentIndex].checkpointsAssigned += 1;
    ui.question.classList.add("visible");
    renderStudentRows();
    prepareQuestion();
  }

  function prepareQuestion() {
    clearInterval(questionInterval);
    state.currentQuestion = createTrigQuestion();
    state.questionStartedAt = performance.now();
    state.questionRemaining = 25;
    const student = state.studentStats[state.currentStudentIndex];
    ui.questionStudent.textContent = `${student.studentName} answers`;
    ui.questionPrompt.textContent = state.currentQuestion.prompt;
    ui.questionFeedback.textContent = "";
    ui.questionOptions.innerHTML = "";
    state.currentQuestion.options.forEach((option, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${String.fromCharCode(65 + index)}. ${option}`;
      button.addEventListener("click", () => answerQuestion(index, false));
      ui.questionOptions.appendChild(button);
    });
    drawQuestionDiagram(state.currentQuestion.diagram);
    ui.questionTimer.textContent = "25";
    questionInterval = setInterval(() => {
      state.questionRemaining -= 1;
      ui.questionTimer.textContent = String(Math.max(0, state.questionRemaining));
      if (state.questionRemaining <= 0) answerQuestion(-1, true);
    }, 1000);
  }

  function answerQuestion(selectedIndex, timedOut) {
    if (!state.questionActive || !state.currentQuestion) return;
    clearInterval(questionInterval);
    const question = state.currentQuestion;
    const student = state.studentStats[state.currentStudentIndex];
    const correct = !timedOut && selectedIndex === question.answerIndex;
    const responseMs = Math.max(0, Math.round(performance.now() - state.questionStartedAt));
    student.attempts += 1;
    student.totalResponseMs += responseMs;
    if (correct) student.correct += 1;
    else if (timedOut) student.timeouts += 1;
    else student.wrong += 1;
    student.answers.push({
      questionId: question.id,
      type: question.type,
      prompt: question.prompt,
      options: question.options,
      selectedIndex,
      selectedAnswer: selectedIndex >= 0 ? question.options[selectedIndex] : "TIMEOUT",
      correctIndex: question.answerIndex,
      correctAnswer: question.options[question.answerIndex],
      correct,
      timedOut,
      responseMs,
      at: new Date().toISOString(),
      room: state.roomIndex + 1,
      wave: state.wave
    });
    saveProgress("checkpoint");
    renderStudentRows();

    if (correct) {
      ui.questionFeedback.textContent = "Correct. Three strikes cleared; returning to the room.";
      state.strikes = 0;
      syncHud();
      setTimeout(() => {
        state.questionActive = false;
        state.currentQuestion = null;
        ui.question.classList.remove("visible");
        const spawn = roomDefinitions[state.roomIndex].spawn;
        state.player = makePlayer(spawn[0], spawn[1]);
        spawnEffect("respawn", state.player.x, state.player.y, "#49e7ff", 0.8);
        showBanner("Checkpoint cleared · tactical run resumed", 1100);
        renderStudentRows();
      }, 700);
    } else {
      ui.questionFeedback.textContent = timedOut ? "Time expired. A new trigonometry question is loading." : "Not correct. A new trigonometry question is loading.";
      setTimeout(prepareQuestion, 850);
    }
  }

  function buildResult(status) {
    const endedAt = new Date().toISOString();
    const studentStats = state.studentStats.map((student) => ({
      ...student,
      averageResponseMs: student.attempts ? Math.round(student.totalResponseMs / student.attempts) : 0,
      accuracy: student.attempts ? Number(((student.correct / student.attempts) * 100).toFixed(1)) : 0
    }));
    return {
      schema: "neon-geometry-tactical-local-v30",
      version: "47.1.0",
      id: state.resultId,
      status,
      createdAt: new Date(state.startedAt || Date.now()).toISOString(),
      updatedAt: endedAt,
      matchDurationSeconds: state.matchSeconds,
      remainingSeconds: Math.max(0, Math.round(state.remaining)),
      elapsedSeconds: Math.max(0, Math.round(state.matchSeconds - state.remaining)),
      room: state.roomIndex + 1,
      wave: state.wave,
      roomsCleared: state.roomsCleared,
      combat: {
        tags: state.tags,
        strikes: state.strikes,
        volleysFired: state.shots,
        projectileHits: state.hits,
        accuracyPercent: state.shots ? Number(((state.hits / (state.shots * 3)) * 100).toFixed(1)) : 0
      },
      assessment: {
        checkpoints: state.checkpointCount,
        totalAttempts: studentStats.reduce((sum, student) => sum + student.attempts, 0),
        totalCorrect: studentStats.reduce((sum, student) => sum + student.correct, 0),
        totalWrong: studentStats.reduce((sum, student) => sum + student.wrong, 0),
        totalTimeouts: studentStats.reduce((sum, student) => sum + student.timeouts, 0),
        students: studentStats
      }
    };
  }

  function resultToCsv(result) {
    const escape = (value) => {
      const text = String(value ?? "");
      const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const lines = [];
    lines.push(["result_id", "status", "created_at", "updated_at", "match_duration_seconds", "elapsed_seconds", "room", "wave", "rooms_cleared", "tags", "strikes", "volleys_fired", "projectile_hits", "combat_accuracy_percent"].map(escape).join(","));
    lines.push([result.id, result.status, result.createdAt, result.updatedAt, result.matchDurationSeconds, result.elapsedSeconds, result.room, result.wave, result.roomsCleared, result.combat.tags, result.combat.strikes, result.combat.volleysFired, result.combat.projectileHits, result.combat.accuracyPercent].map(escape).join(","));
    lines.push("");
    lines.push(["student_index", "student_name", "checkpoints_assigned", "attempts", "correct", "wrong", "timeouts", "accuracy_percent", "average_response_ms"].map(escape).join(","));
    result.assessment.students.forEach((student) => lines.push([student.studentIndex + 1, student.studentName, student.checkpointsAssigned, student.attempts, student.correct, student.wrong, student.timeouts, student.accuracy, student.averageResponseMs].map(escape).join(",")));
    lines.push("");
    lines.push(["student_index", "student_name", "question_type", "prompt", "selected_answer", "correct_answer", "correct", "timeout", "response_ms", "room", "wave", "timestamp"].map(escape).join(","));
    result.assessment.students.forEach((student) => student.answers.forEach((answer) => lines.push([student.studentIndex + 1, student.studentName, answer.type, answer.prompt, answer.selectedAnswer, answer.correctAnswer, answer.correct, answer.timedOut, answer.responseMs, answer.room, answer.wave, answer.at].map(escape).join(","))));
    return lines.join("\r\n");
  }

  async function saveProgress(status) {
    if (!state.resultId || !window.schoolGame?.saveResult) return null;
    const result = buildResult(status);
    try {
      const saved = await window.schoolGame.saveResult({ id: state.resultId, json: JSON.stringify(result, null, 2), csv: resultToCsv(result) });
      state.savedPath = saved.directory || state.savedPath;
      return saved;
    } catch (error) {
      console.error("Result save failed", error);
      return null;
    }
  }

  async function endMatch() {
    if (state.ended) return;
    state.ended = true;
    state.running = false;
    clearInterval(autosaveTimer);
    clearInterval(questionInterval);
    const saved = await saveProgress("completed");
    const result = buildResult("completed");
    ui.finalSummary.innerHTML = [
      ["TAGS", result.combat.tags],
      ["ROOMS", result.roomsCleared],
      ["QUESTIONS", result.assessment.totalAttempts],
      ["CORRECT", result.assessment.totalCorrect],
      ["ACCURACY", `${result.combat.accuracyPercent}%`],
      ["WAVE", result.wave],
      ["STRIKES", result.combat.strikes],
      ["TIME", `${result.elapsedSeconds}s`]
    ].map(([label, value]) => `<article><span>${label}</span><b>${value}</b></article>`).join("");
    ui.resultPath.textContent = `Saved locally: ${saved?.directory || state.savedPath || "Documents\\Neon Geometry Tactical Results\\results"}`;
    ui.end.classList.add("visible");
  }

  function togglePause() {
    if (!state.running || state.questionActive || state.ended) return;
    state.paused = !state.paused;
    ui.pause.classList.toggle("visible", state.paused);
  }

  function frame(timestamp) {
    const dt = Math.min(0.033, Math.max(0, (timestamp - (state.lastFrame || timestamp)) / 1000));
    state.lastFrame = timestamp;
    updateGame(dt);
    renderGame();
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("keydown", (event) => {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) event.preventDefault();
    keys.add(event.code);
    if (event.code === "KeyP") togglePause();
    if (event.code === "KeyR" && state.running && !state.questionActive && !state.ended) {
      spawnRoom(state.roomIndex);
      showBanner("Current room restarted", 800);
    }
  });
  window.addEventListener("keyup", (event) => keys.delete(event.code));
  canvas.addEventListener("mousemove", (event) => Object.assign(pointer, eventToWorld(event)));
  canvas.addEventListener("mousedown", (event) => { if (event.button === 0) pointer.down = true; });
  window.addEventListener("mouseup", (event) => { if (event.button === 0) pointer.down = false; });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  ui.start.addEventListener("click", resetGame);
  ui.restart.addEventListener("click", () => window.schoolGame?.restart());
  ui.openResults.addEventListener("click", async () => {
    try { ui.resultPath.textContent = `Saved locally: ${await window.schoolGame.openResults()}`; }
    catch (error) { ui.resultPath.textContent = `Unable to open results: ${error.message}`; }
  });

  async function initialize() {
    resizeCanvas();
    try {
      await loadAssets();
      state.room = { name: "Loading Room", obstacles: roomDefinitions[0].obstacles.map(([x, y, w, h]) => ({ x, y, w, h })) };
      state.player = makePlayer(150, 830);
      renderGame();
      ui.registrationFeedback.textContent = "Assets ready. Register three students to begin.";
      try { state.savedPath = await window.schoolGame?.getResultsPath(); } catch {}
      window.schoolGame?.ready();
    } catch (error) {
      ui.registrationFeedback.textContent = `Asset loading failed: ${error.message}`;
      console.error(error);
    }
    requestAnimationFrame(frame);
  }

  initialize();
})();
