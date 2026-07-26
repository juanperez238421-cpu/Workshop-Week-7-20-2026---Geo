(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  const questionCanvas = document.getElementById("questionCanvas");
  const qctx = questionCanvas.getContext("2d");
  const WORLD = Object.freeze({ width: 1600, height: 1000 });
  const PLAYER_RADIUS = 22;
  const MAX_PLAYER_BULLETS = 2;
  const MAX_ENEMY_BULLETS = 4;
  const AUTOSAVE_MS = 15000;
  const PIXEL_CELL = 24;

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
    mapSelect: document.getElementById("mapSelect"),
    armorCatalog: document.getElementById("armorCatalog"),
    armorHud: document.getElementById("armorHudLabel"),
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
    ammoBar: document.getElementById("ammoBar"),
    ammoValue: document.getElementById("ammoValue"),
    reloadBar: document.getElementById("reloadBar"),
    reloadValue: document.getElementById("reloadValue"),
    powerBar: document.getElementById("powerBar"),
    powerValue: document.getElementById("powerValue"),
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
    characters: "assets/pixel/characters.png",
    enemies: "assets/pixel/enemies.png",
    powers: "assets/pixel/powers.png",
    weapons: "assets/pixel/weapons.png",
    tiles: "assets/pixel/tiles.png",
    effects: "assets/pixel/effects.png",
    decor: "assets/pixel/decor.png"
  });

  const armorFallback = [
    { id: "cadet", name: "Cadet", row: 0, passive: "Balanced starter armor", speedMultiplier: 1, startingShield: 0, magazine: 4, reloadSeconds: 1.05, dashCooldownSeconds: 1.15 },
    { id: "scout", name: "Scout", row: 1, passive: "+12% movement speed", speedMultiplier: 1.12, startingShield: 0, magazine: 4, reloadSeconds: 1.05, dashCooldownSeconds: 1.15 },
    { id: "guardian", name: "Guardian", row: 2, passive: "Starts each room with one shield", speedMultiplier: 0.93, startingShield: 1, magazine: 4, reloadSeconds: 1.05, dashCooldownSeconds: 1.15 },
    { id: "vector", name: "Vector", row: 3, passive: "Dash cooldown reduced", speedMultiplier: 1.02, startingShield: 0, magazine: 4, reloadSeconds: 1.05, dashCooldownSeconds: 0.8 },
    { id: "solar", name: "Solar", row: 4, passive: "Magazine increased to 5", speedMultiplier: 0.98, startingShield: 0, magazine: 5, reloadSeconds: 1.05, dashCooldownSeconds: 1.15 },
    { id: "graphite", name: "Graphite", row: 5, passive: "Shorter reload time", speedMultiplier: 1, startingShield: 0, magazine: 4, reloadSeconds: 0.82, dashCooldownSeconds: 1.15 }
  ];

  const MAPS = [
    {
      name: "Classroom Crossroads",
      theme: 0,
      spawn: [135, 850],
      obstacles: [
        [0,0,1600,42],[0,958,1600,42],[0,0,42,1000],[1558,0,42,1000],
        [280,110,70,320],[280,570,70,310],[610,220,380,70],[610,710,380,70],
        [1250,110,70,320],[1250,570,70,310],[520,455,170,90],[910,455,170,90]
      ],
      decor: [[170,150,0],[480,130,5],[760,120,3],[1100,130,2],[1420,150,6],[160,700,1],[470,830,4],[800,860,0],[1130,830,4],[1430,720,1]],
      enemies: [[470,330,"watcher"],[820,360,"sentinel"],[1110,330,"watcher"],[460,690,"runner"],[820,620,"warden"],[1130,690,"sentinel"]],
      powers: [[790,505,"shield"],[1450,500,"ammo"]]
    },
    {
      name: "Library Lanes",
      theme: 1,
      spawn: [110,500],
      obstacles: [
        [0,0,1600,42],[0,958,1600,42],[0,0,42,1000],[1558,0,42,1000],
        [250,90,95,340],[250,570,95,340],[540,90,95,250],[540,750,95,160],
        [835,250,95,500],[1130,90,95,250],[1130,750,95,160],[1420,90,70,820]
      ],
      decor: [[390,160,1],[390,340,1],[390,650,1],[390,830,1],[680,170,2],[680,820,2],[980,170,5],[980,820,5],[1280,170,1],[1280,820,1]],
      enemies: [[430,500,"watcher"],[720,180,"sentinel"],[720,820,"runner"],[1010,500,"warden"],[1320,260,"watcher"],[1320,740,"sentinel"]],
      powers: [[770,500,"focus"],[1510,500,"ammo"]]
    },
    {
      name: "Robotics Workshop",
      theme: 2,
      spawn: [800,875],
      obstacles: [
        [0,0,1600,42],[0,958,1600,42],[0,0,42,1000],[1558,0,42,1000],
        [150,150,310,80],[570,150,460,80],[1140,150,310,80],
        [150,435,310,80],[570,435,460,80],[1140,435,310,80],
        [150,720,310,80],[1140,720,310,80],[690,720,220,80]
      ],
      decor: [[220,290,3],[390,290,4],[660,300,3],[940,300,4],[1210,300,3],[1380,300,4],[220,600,6],[390,600,7],[660,600,6],[940,600,7],[1210,600,6],[1380,600,7]],
      enemies: [[300,335,"runner"],[800,330,"watcher"],[1300,335,"sentinel"],[300,630,"sentinel"],[800,620,"warden"],[1300,630,"runner"]],
      powers: [[520,860,"shield"],[1080,860,"ammo"]]
    },
    {
      name: "Geometry Vault",
      theme: 3,
      spawn: [135,850],
      obstacles: [
        [0,0,1600,42],[0,958,1600,42],[0,0,42,1000],[1558,0,42,1000],
        [250,150,240,75],[1110,150,240,75],[680,140,240,75],
        [250,420,240,75],[1110,420,240,75],[680,420,240,75],
        [250,690,240,75],[1110,690,240,75],[680,690,240,75],
        [520,295,75,105],[1005,295,75,105],[520,565,75,105],[1005,565,75,105]
      ],
      decor: [[145,150,5],[550,150,7],[1030,150,7],[1450,150,5],[145,500,2],[1450,500,2],[145,820,6],[550,820,4],[1030,820,4],[1450,820,6]],
      enemies: [[390,315,"watcher"],[800,300,"sentinel"],[1210,315,"watcher"],[390,585,"runner"],[800,570,"warden"],[1210,585,"sentinel"],[800,850,"runner"]],
      powers: [[800,510,"shield"],[1450,850,"ammo"]]
    }
  ];

  const ENEMY_TYPES = Object.freeze({
    watcher: { row: 0, speed: 110, preferred: 450, fireEvery: 1.2, detection: 760, projectileSpeed: 560, color: "#49e7ff", radius: 21 },
    sentinel: { row: 1, speed: 125, preferred: 390, fireEvery: 0.95, detection: 820, projectileSpeed: 610, color: "#ffe45b", radius: 22 },
    warden: { row: 2, speed: 82, preferred: 330, fireEvery: 1.45, detection: 760, projectileSpeed: 510, color: "#ff4ca8", radius: 26 },
    runner: { row: 3, speed: 195, preferred: 40, fireEvery: 0, detection: 900, projectileSpeed: 0, color: "#58f0a5", radius: 21 }
  });

  const assets = {};
  const keys = new Set();
  const pointer = { x: 1100, y: 500, down: false };
  let armorCatalog = [...armorFallback];
  let selectedArmorId = "cadet";
  let renderScale = 1;
  let renderOffsetX = 0;
  let renderOffsetY = 0;
  let autosaveTimer = null;
  let bannerTimer = null;
  let questionInterval = null;

  const state = {
    running: false,
    paused: false,
    questionActive: false,
    ended: false,
    matchSeconds: 300,
    remaining: 300,
    startedAt: 0,
    resultId: "",
    mapIndex: 0,
    wave: 1,
    mapsCleared: 0,
    tags: 0,
    strikes: 0,
    shots: 0,
    hits: 0,
    checkpointCount: 0,
    students: [],
    studentStats: [],
    armor: armorFallback[0],
    player: null,
    enemies: [],
    bullets: [],
    effects: [],
    powers: [],
    roomTransition: 0,
    currentQuestion: null,
    currentStudentIndex: 0,
    questionStartedAt: 0,
    questionRemaining: 25,
    lastFrame: 0,
    screenShake: 0,
    savedPath: ""
  };

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function normalize(x, y) { const length = Math.hypot(x, y) || 1; return { x: x / length, y: y / length, length }; }
  function safeName(value) { return String(value || "").replace(/[<>\r\n\t]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60); }
  function escapeHtml(value) { return String(value || "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c])); }

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
    try {
      const response = await fetch("assets/pixel/armor-catalog.json", { cache: "no-store" });
      const catalog = await response.json();
      if (Array.isArray(catalog.armors) && catalog.armors.length) armorCatalog = catalog.armors;
    } catch {}
  }

  function renderArmorCatalog() {
    ui.armorCatalog.innerHTML = "";
    for (const armor of armorCatalog) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `armor-card${armor.id === selectedArmorId ? " selected" : ""}`;
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", armor.id === selectedArmorId ? "true" : "false");
      button.innerHTML = `<span class="armor-preview" data-row="${armor.row}"></span><strong>${escapeHtml(armor.name)}</strong><small>${escapeHtml(armor.passive)}</small>`;
      const preview = button.querySelector(".armor-preview");
      preview.style.backgroundImage = "url('assets/pixel/characters.png')";
      preview.style.backgroundSize = `${PIXEL_CELL * 4 * 3}px ${PIXEL_CELL * armorCatalog.length * 3}px`;
      preview.style.backgroundPosition = `0px -${armor.row * PIXEL_CELL * 3}px`;
      preview.style.width = `${PIXEL_CELL * 3}px`;
      preview.style.height = `${PIXEL_CELL * 3}px`;
      button.addEventListener("click", () => {
        selectedArmorId = armor.id;
        renderArmorCatalog();
      });
      ui.armorCatalog.appendChild(button);
    }
  }

  function resizeCanvas() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.round(innerWidth * dpr));
    canvas.height = Math.max(1, Math.round(innerHeight * dpr));
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    renderScale = Math.min(innerWidth / WORLD.width, innerHeight / WORLD.height);
    renderOffsetX = (innerWidth - WORLD.width * renderScale) / 2;
    renderOffsetY = (innerHeight - WORLD.height * renderScale) / 2;
    ctx.setTransform(dpr * renderScale, 0, 0, dpr * renderScale, dpr * renderOffsetX, dpr * renderOffsetY);
    ctx.imageSmoothingEnabled = false;
  }

  function eventToWorld(event) {
    return { x: clamp((event.clientX - renderOffsetX) / renderScale, 0, WORLD.width), y: clamp((event.clientY - renderOffsetY) / renderScale, 0, WORLD.height) };
  }

  function rectCircleCollision(x, y, radius, rect) {
    const px = clamp(x, rect.x, rect.x + rect.w);
    const py = clamp(y, rect.y, rect.y + rect.h);
    return Math.hypot(x - px, y - py) < radius;
  }

  function collides(x, y, radius) { return state.map.obstacles.some((rect) => rectCircleCollision(x, y, radius, rect)); }

  function moveEntity(entity, vx, vy, dt) {
    const nx = entity.x + vx * dt;
    const ny = entity.y + vy * dt;
    if (!collides(nx, entity.y, entity.radius)) entity.x = nx;
    if (!collides(entity.x, ny, entity.radius)) entity.y = ny;
    entity.x = clamp(entity.x, entity.radius, WORLD.width - entity.radius);
    entity.y = clamp(entity.y, entity.radius, WORLD.height - entity.radius);
  }

  function segmentHitsRect(x1, y1, x2, y2, rect, padding = 0) {
    const left = rect.x - padding, right = rect.x + rect.w + padding, top = rect.y - padding, bottom = rect.y + rect.h + padding;
    const dx = x2 - x1, dy = y2 - y1;
    let t0 = 0, t1 = 1;
    for (const [p, q] of [[-dx, x1-left],[dx,right-x1],[-dy,y1-top],[dy,bottom-y1]]) {
      if (p === 0 && q < 0) return false;
      if (p !== 0) {
        const r = q / p;
        if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
        else { if (r < t0) return false; if (r < t1) t1 = r; }
      }
    }
    return true;
  }

  function hasLineOfSight(a, b) { return !state.map.obstacles.some((rect) => segmentHitsRect(a.x, a.y, b.x, b.y, rect, 5)); }

  function rayDistance(x, y, angle, maxDistance = 820) {
    for (let distance = 16; distance <= maxDistance; distance += 16) {
      const px = x + Math.cos(angle) * distance;
      const py = y + Math.sin(angle) * distance;
      if (px < 0 || px > WORLD.width || py < 0 || py > WORLD.height || collides(px, py, 2)) return distance - 16;
    }
    return maxDistance;
  }

  function drawSprite(image, columns, rows, column, row, x, y, size, angle = 0, alpha = 1) {
    if (!image?.complete) return;
    const sw = image.naturalWidth / columns;
    const sh = image.naturalHeight / rows;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(angle + Math.PI / 2);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, column * sw, row * sh, sw, sh, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  function drawIcon(image, columns, rows, column, row, x, y, size, alpha = 1) {
    if (!image?.complete) return;
    const sw = image.naturalWidth / columns;
    const sh = image.naturalHeight / rows;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, column * sw, row * sh, sw, sh, Math.round(x-size/2), Math.round(y-size/2), size, size);
    ctx.restore();
  }

  function createStudentStats(names) {
    return names.map((studentName, studentIndex) => ({ studentIndex, studentName, checkpointsAssigned: 0, attempts: 0, correct: 0, wrong: 0, timeouts: 0, totalResponseMs: 0, answers: [] }));
  }

  function makePlayer(x, y) {
    return {
      x, y, radius: PLAYER_RADIUS, angle: 0, vx: 0, vy: 0, alive: true,
      speed: 300 * Number(state.armor.speedMultiplier || 1),
      shield: Number(state.armor.startingShield || 0),
      ammo: Number(state.armor.magazine || 4),
      magazine: Number(state.armor.magazine || 4),
      reloadSeconds: Number(state.armor.reloadSeconds || 1.05),
      reloadRemaining: 0,
      fireCooldown: 0,
      dashCooldown: 0,
      dashCooldownSeconds: Number(state.armor.dashCooldownSeconds || 1.15),
      dashTime: 0,
      invulnerable: 0.8,
      animation: 0,
      shotFlash: 0,
      power: "none",
      focusRemaining: 0
    };
  }

  function makeEnemy([x, y, type], serial) {
    const def = ENEMY_TYPES[type];
    return { id: `${type}-${state.wave}-${serial}`, x, y, anchorX: x, anchorY: y, type, radius: def.radius, alive: true, angle: 0, vx: 0, vy: 0, fireCooldown: 0.4 + Math.random(), alert: 0, dodgeCooldown: 0, dodgeTime: 0, dodgeX: 0, dodgeY: 0, strafe: serial % 2 ? -1 : 1, animation: Math.random() * 3, actionFlash: 0 };
  }

  function spawnMap(index) {
    const definition = MAPS[index];
    state.mapIndex = index;
    state.map = { ...definition, obstacles: definition.obstacles.map(([x,y,w,h]) => ({ x,y,w,h })) };
    state.player = makePlayer(definition.spawn[0], definition.spawn[1]);
    state.enemies = definition.enemies.map((entry, serial) => makeEnemy(entry, serial));
    if (state.wave > 1) {
      for (let i = 0; i < Math.min(2, state.wave - 1); i += 1) {
        const base = definition.enemies[i];
        state.enemies.push(makeEnemy([clamp(base[0]+90,70,1530), clamp(base[1]+70,70,930), i ? "sentinel" : "runner"], 50+i));
      }
    }
    state.powers = definition.powers.map(([x,y,type], i) => ({ id: `${type}-${i}`, x, y, type, active: true, pulse: Math.random()*6.28 }));
    state.bullets = [];
    state.effects = [];
    state.roomTransition = 0;
    ui.room.textContent = `${index + 1} · W${state.wave}`;
    ui.armorHud.textContent = `${state.armor.name} armor · Pulse Pistol`;
    showBanner(definition.name, 1300);
  }

  function renderStudentRows() {
    ui.studentRows.innerHTML = state.studentStats.map((student, index) => {
      const accuracy = student.attempts ? Math.round(student.correct / student.attempts * 100) : 0;
      return `<div class="student-row${state.questionActive && index === state.currentStudentIndex ? " active" : ""}"><i>${index+1}</i><strong>${escapeHtml(student.studentName)}</strong><small>${student.correct}/${student.attempts} · ${accuracy}%</small></div>`;
    }).join("");
  }

  function syncHud() {
    const seconds = Math.max(0, Math.ceil(state.remaining));
    ui.time.textContent = `${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;
    ui.tags.textContent = String(state.tags);
    ui.accuracy.textContent = state.shots ? `${Math.round(state.hits / state.shots * 100)}%` : "—";
    ui.strikePips.forEach((pip, index) => pip.classList.toggle("used", index < state.strikes));
    const player = state.player;
    if (player) {
      ui.ammoBar.max = player.magazine;
      ui.ammoBar.value = player.ammo;
      ui.ammoValue.textContent = `${player.ammo}/${player.magazine}`;
      const reloadProgress = player.reloadRemaining > 0 ? 1 - player.reloadRemaining / player.reloadSeconds : 1;
      ui.reloadBar.value = clamp(reloadProgress, 0, 1);
      ui.reloadValue.textContent = player.reloadRemaining > 0 ? `${player.reloadRemaining.toFixed(1)}s` : "READY";
      ui.powerBar.value = player.power === "none" ? 0 : 1;
      ui.powerValue.textContent = player.power.toUpperCase();
    }
    renderStudentRows();
  }

  function showBanner(text, duration = 900) {
    ui.banner.textContent = text;
    ui.banner.classList.remove("hidden");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => ui.banner.classList.add("hidden"), duration);
  }

  function effect(type, x, y, color = "#49e7ff", duration = 0.35) {
    state.effects.push({ type, x, y, color, age: 0, duration });
    if (state.effects.length > 70) state.effects.shift();
  }

  function reloadPlayer() {
    const player = state.player;
    if (!player?.alive || player.reloadRemaining > 0 || player.ammo >= player.magazine) return;
    player.reloadRemaining = player.reloadSeconds;
    showBanner("Reloading Pulse Pistol", 500);
  }

  function firePlayer() {
    const player = state.player;
    const active = state.bullets.filter((bullet) => bullet.owner === "player").length;
    if (!state.running || state.paused || state.questionActive || !player?.alive || player.fireCooldown > 0 || player.reloadRemaining > 0 || active >= MAX_PLAYER_BULLETS) return;
    if (player.ammo <= 0) { reloadPlayer(); return; }
    player.ammo -= 1;
    state.shots += 1;
    player.fireCooldown = 0.24;
    player.shotFlash = 0.13;
    const angle = player.angle;
    state.bullets.push({ owner: "player", x: player.x + Math.cos(angle)*30, y: player.y + Math.sin(angle)*30, vx: Math.cos(angle)*850, vy: Math.sin(angle)*850, angle, radius: 5, life: 1.2, color: "#ffe45b" });
    effect("muzzle", player.x + Math.cos(angle)*28, player.y + Math.sin(angle)*28, "#ffe45b", 0.14);
  }

  function enemyFire(enemy, targetX, targetY) {
    if (state.bullets.filter((bullet) => bullet.owner === "enemy").length >= MAX_ENEMY_BULLETS) return;
    const def = ENEMY_TYPES[enemy.type];
    const angle = Math.atan2(targetY-enemy.y, targetX-enemy.x);
    state.bullets.push({ owner: "enemy", x: enemy.x + Math.cos(angle)*28, y: enemy.y + Math.sin(angle)*28, vx: Math.cos(angle)*def.projectileSpeed, vy: Math.sin(angle)*def.projectileSpeed, angle, radius: 5, life: 1.55, color: def.color });
    enemy.actionFlash = 0.12;
    effect("muzzle", enemy.x + Math.cos(angle)*26, enemy.y + Math.sin(angle)*26, def.color, 0.14);
  }

  function incomingThreat(enemy) {
    for (const bullet of state.bullets) {
      if (bullet.owner !== "player") continue;
      const dx = enemy.x - bullet.x, dy = enemy.y - bullet.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 250) continue;
      const direction = normalize(bullet.vx, bullet.vy);
      const toward = (dx*direction.x + dy*direction.y) / Math.max(1, distance);
      const cross = Math.abs(dx*direction.y - dy*direction.x);
      if (toward > 0.65 && cross < 52) return bullet;
    }
    return null;
  }

  function updateEnemy(enemy, dt) {
    if (!enemy.alive || !state.player?.alive) return;
    const def = ENEMY_TYPES[enemy.type];
    enemy.fireCooldown -= dt;
    enemy.dodgeCooldown -= dt;
    enemy.actionFlash = Math.max(0, enemy.actionFlash-dt);
    enemy.animation += dt * 7;
    const dx = state.player.x-enemy.x, dy = state.player.y-enemy.y;
    const dir = normalize(dx,dy);
    const visible = hasLineOfSight(enemy, state.player);
    if (visible && dir.length < def.detection) enemy.alert = 2.8;
    else enemy.alert = Math.max(0, enemy.alert-dt);

    const threat = incomingThreat(enemy);
    if (threat && enemy.dodgeCooldown <= 0) {
      const v = normalize(threat.vx, threat.vy);
      enemy.dodgeX = -v.y * enemy.strafe;
      enemy.dodgeY = v.x * enemy.strafe;
      enemy.dodgeTime = 0.28;
      enemy.dodgeCooldown = 1.15;
      enemy.strafe *= -1;
    }

    let mx = 0, my = 0;
    if (enemy.dodgeTime > 0) {
      enemy.dodgeTime -= dt;
      mx = enemy.dodgeX * def.speed * 2;
      my = enemy.dodgeY * def.speed * 2;
    } else if (enemy.alert > 0) {
      if (enemy.type === "runner") {
        mx = dir.x * def.speed; my = dir.y * def.speed;
        if (dir.length < 48 && state.player.invulnerable <= 0) playerTagged("contact");
      } else {
        if (!visible || dir.length > def.preferred + 100) { mx = dir.x*def.speed; my = dir.y*def.speed; }
        else if (dir.length < def.preferred - 100) { mx = -dir.x*def.speed*.75; my = -dir.y*def.speed*.75; }
        else { mx = -dir.y*def.speed*.65*enemy.strafe; my = dir.x*def.speed*.65*enemy.strafe; }
        if (visible && dir.length < 720 && enemy.fireCooldown <= 0) {
          const travel = dir.length / Math.max(1, def.projectileSpeed);
          enemyFire(enemy, state.player.x + state.player.vx*travel*.65, state.player.y + state.player.vy*travel*.65);
          enemy.fireCooldown = def.fireEvery * (.9 + Math.random()*.25);
        }
      }
    } else {
      const angle = performance.now()/1900 + enemy.id.length;
      const patrol = normalize(enemy.anchorX + Math.cos(angle)*65 - enemy.x, enemy.anchorY + Math.sin(angle)*65 - enemy.y);
      mx = patrol.x * def.speed * .3; my = patrol.y * def.speed * .3;
    }
    enemy.vx = lerp(enemy.vx, mx, 1-Math.exp(-8*dt));
    enemy.vy = lerp(enemy.vy, my, 1-Math.exp(-8*dt));
    enemy.angle = Math.atan2(dy,dx);
    moveEntity(enemy, enemy.vx, enemy.vy, dt);
  }

  function playerTagged(source) {
    const player = state.player;
    if (!player?.alive || player.invulnerable > 0 || state.questionActive) return;
    if (player.shield > 0) {
      player.shield -= 1;
      player.invulnerable = .65;
      effect("shield", player.x, player.y, "#49e7ff", .5);
      showBanner("Armor shield absorbed the tag", 700);
      return;
    }
    player.alive = false;
    state.strikes += 1;
    state.screenShake = 9;
    effect("tag", player.x, player.y, source === "contact" ? "#58f0a5" : "#ff4ca8", .55);
    syncHud();
    if (state.strikes >= 3) {
      showBanner("Three strikes · trigonometry checkpoint", 900);
      setTimeout(beginQuestionCheckpoint, 450);
    } else {
      showBanner(`Strike ${state.strikes}/3 · rapid reset`, 750);
      setTimeout(() => {
        if (state.ended || state.questionActive) return;
        const spawn = MAPS[state.mapIndex].spawn;
        state.player = makePlayer(spawn[0], spawn[1]);
        effect("respawn", state.player.x, state.player.y, "#49e7ff", .5);
      }, 650);
    }
  }

  function tagEnemy(enemy) {
    if (!enemy.alive) return;
    enemy.alive = false;
    state.tags += 1;
    state.hits += 1;
    state.screenShake = Math.max(state.screenShake, 4);
    effect("tag", enemy.x, enemy.y, ENEMY_TYPES[enemy.type].color, .45);
    if (state.enemies.every((candidate) => !candidate.alive)) {
      state.mapsCleared += 1;
      state.roomTransition = 1.1;
      showBanner("Map cleared · loading next tactical layout", 1000);
    }
  }

  function collectPower(power) {
    if (!power.active) return;
    power.active = false;
    if (power.type === "shield") {
      state.player.shield = 1;
      state.player.power = "shield";
    } else if (power.type === "ammo") {
      state.player.ammo = state.player.magazine;
      state.player.reloadRemaining = 0;
      state.player.power = "ammo";
    } else if (power.type === "focus") {
      state.player.focusRemaining = 8;
      state.player.power = "focus";
    }
    effect("pickup", power.x, power.y, "#ffe45b", .45);
    showBanner(`${power.type.toUpperCase()} power collected`, 700);
  }

  function updatePlayer(dt) {
    const player = state.player;
    if (!player) return;
    player.fireCooldown = Math.max(0, player.fireCooldown-dt);
    player.dashCooldown = Math.max(0, player.dashCooldown-dt);
    player.invulnerable = Math.max(0, player.invulnerable-dt);
    player.shotFlash = Math.max(0, player.shotFlash-dt);
    player.focusRemaining = Math.max(0, player.focusRemaining-dt);
    if (player.focusRemaining <= 0 && player.power === "focus") player.power = "none";
    if (player.reloadRemaining > 0) {
      player.reloadRemaining -= dt;
      if (player.reloadRemaining <= 0) { player.reloadRemaining = 0; player.ammo = player.magazine; showBanner("Pulse Pistol ready", 450); }
    }
    if (!player.alive) return;

    let dx = (keys.has("KeyD")||keys.has("ArrowRight")?1:0) - (keys.has("KeyA")||keys.has("ArrowLeft")?1:0);
    let dy = (keys.has("KeyS")||keys.has("ArrowDown")?1:0) - (keys.has("KeyW")||keys.has("ArrowUp")?1:0);
    const movement = normalize(dx,dy);
    const moving = Math.hypot(dx,dy) > 0;
    player.vx = lerp(player.vx, moving ? movement.x*player.speed : 0, 1-Math.exp(-14*dt));
    player.vy = lerp(player.vy, moving ? movement.y*player.speed : 0, 1-Math.exp(-14*dt));
    player.angle = Math.atan2(pointer.y-player.y, pointer.x-player.x);
    player.animation += dt * (moving ? 8 : 2);

    if ((keys.has("ShiftLeft")||keys.has("ShiftRight")) && moving && player.dashCooldown <= 0) {
      player.dashCooldown = player.dashCooldownSeconds;
      player.dashTime = .14;
      player.invulnerable = Math.max(player.invulnerable, .18);
      effect("dash", player.x, player.y, "#49e7ff", .25);
    }
    if (player.dashTime > 0) {
      player.dashTime -= dt;
      player.vx = movement.x*820; player.vy = movement.y*820;
    }
    moveEntity(player, player.vx, player.vy, dt);
    if (pointer.down || keys.has("Space")) firePlayer();
    for (const power of state.powers) if (power.active && Math.hypot(player.x-power.x, player.y-power.y) < 42) collectPower(power);
  }

  function updateBullets(dt) {
    for (let index = state.bullets.length-1; index >= 0; index -= 1) {
      const bullet = state.bullets[index];
      const px = bullet.x, py = bullet.y;
      bullet.x += bullet.vx*dt; bullet.y += bullet.vy*dt; bullet.life -= dt;
      const wall = bullet.life <= 0 || bullet.x<0 || bullet.x>WORLD.width || bullet.y<0 || bullet.y>WORLD.height || state.map.obstacles.some((rect) => segmentHitsRect(px,py,bullet.x,bullet.y,rect,bullet.radius));
      if (wall) { effect("impact", bullet.x, bullet.y, bullet.color, .22); state.bullets.splice(index,1); continue; }
      if (bullet.owner === "player") {
        const enemy = state.enemies.find((candidate) => candidate.alive && Math.hypot(bullet.x-candidate.x, bullet.y-candidate.y) < bullet.radius+candidate.radius);
        if (enemy) { tagEnemy(enemy); state.bullets.splice(index,1); }
      } else if (state.player?.alive && Math.hypot(bullet.x-state.player.x, bullet.y-state.player.y) < bullet.radius+state.player.radius) {
        state.bullets.splice(index,1); playerTagged("projectile");
      }
    }
  }

  function updateEffects(dt) {
    for (let i = state.effects.length-1; i >= 0; i -= 1) {
      state.effects[i].age += dt;
      if (state.effects[i].age >= state.effects[i].duration) state.effects.splice(i,1);
    }
  }

  function updateGame(dt) {
    if (!state.running || state.paused || state.questionActive || state.ended) return;
    state.remaining -= dt;
    if (state.remaining <= 0) { state.remaining = 0; endMatch(); return; }
    updatePlayer(dt);
    state.enemies.forEach((enemy) => updateEnemy(enemy, dt));
    updateBullets(dt);
    updateEffects(dt);
    state.screenShake *= Math.pow(.02,dt);
    if (state.roomTransition > 0) {
      state.roomTransition -= dt;
      if (state.roomTransition <= 0) {
        let next = state.mapIndex + 1;
        if (next >= MAPS.length) { next = 0; state.wave += 1; }
        spawnMap(next);
      }
    }
    syncHud();
  }

  function drawMap() {
    const theme = state.map.theme;
    for (let y=0; y<WORLD.height; y+=64) {
      for (let x=0; x<WORLD.width; x+=64) drawIcon(assets.tiles,4,2,theme%4,Math.floor(theme/4),x+32,y+32,64,.45);
    }
    ctx.fillStyle = "rgba(2,5,12,.46)"; ctx.fillRect(0,0,WORLD.width,WORLD.height);
    for (const rect of state.map.obstacles) {
      ctx.fillStyle = "#080d18"; ctx.fillRect(rect.x,rect.y,rect.w,rect.h);
      ctx.strokeStyle = ["#49e7ff","#ff4ca8","#ffe45b","#58f0a5"][theme]; ctx.lineWidth = 3; ctx.strokeRect(rect.x+.5,rect.y+.5,rect.w-1,rect.h-1);
      ctx.fillStyle = "rgba(255,255,255,.06)"; ctx.fillRect(rect.x+7,rect.y+7,Math.max(0,rect.w-14),5);
    }
    for (const [x,y,index] of state.map.decor) drawIcon(assets.decor,4,2,index%4,Math.floor(index/4),x,y,48,.8);
  }

  function drawPowers() {
    const map = { shield:[0,0], ammo:[1,0], focus:[3,0] };
    for (const power of state.powers) {
      if (!power.active) continue;
      const [column,row] = map[power.type] || [0,1];
      const pulse = 34 + Math.sin(performance.now()/180 + power.pulse)*3;
      drawIcon(assets.powers,4,2,column,row,power.x,power.y,pulse,1);
      ctx.strokeStyle = power.type === "shield" ? "#5e93ff" : power.type === "focus" ? "#ff4ca8" : "#ffe45b";
      ctx.lineWidth = 2; ctx.strokeRect(Math.round(power.x-pulse/2-3),Math.round(power.y-pulse/2-3),Math.round(pulse+6),Math.round(pulse+6));
    }
  }

  function drawPlayer() {
    const player = state.player;
    if (!player) return;
    let frame = 0;
    if (!player.alive) frame = 3;
    else if (player.shotFlash > 0) frame = 3;
    else if (Math.hypot(player.vx,player.vy)>35) frame = 1 + (Math.floor(player.animation)%2);
    drawSprite(assets.characters,4,armorCatalog.length,frame,state.armor.row,player.x,player.y,72,player.angle,player.invulnerable>0 && Math.floor(performance.now()/70)%2 ? .58 : 1);
    if (player.shield > 0) { ctx.strokeStyle="#49e7ff"; ctx.lineWidth=3; ctx.strokeRect(player.x-30,player.y-30,60,60); }
  }

  function drawEnemies() {
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      let frame = enemy.actionFlash>0 ? 3 : Math.hypot(enemy.vx,enemy.vy)>25 ? 1+(Math.floor(enemy.animation)%2) : 0;
      drawSprite(assets.enemies,4,4,frame,ENEMY_TYPES[enemy.type].row,enemy.x,enemy.y,68,enemy.angle,1);
      if (enemy.alert>0) { ctx.fillStyle=ENEMY_TYPES[enemy.type].color; ctx.font="900 14px Consolas"; ctx.textAlign="center"; ctx.fillText("!",enemy.x,enemy.y-38); }
    }
  }

  function drawBullets() {
    for (const bullet of state.bullets) {
      ctx.strokeStyle = bullet.color; ctx.lineWidth = 3; ctx.beginPath();
      ctx.moveTo(bullet.x-bullet.vx*.035,bullet.y-bullet.vy*.035); ctx.lineTo(bullet.x,bullet.y); ctx.stroke();
      ctx.fillStyle="#fff"; ctx.fillRect(Math.round(bullet.x-2),Math.round(bullet.y-2),4,4);
    }
  }

  function drawAim() {
    const player = state.player;
    if (!player?.alive || state.questionActive) return;
    const distance = rayDistance(player.x,player.y,player.angle,820);
    const tx = player.x + Math.cos(player.angle)*distance;
    const ty = player.y + Math.sin(player.angle)*distance;
    const gradient = ctx.createLinearGradient(player.x,player.y,tx,ty);
    gradient.addColorStop(0,"rgba(255,228,91,.8)"); gradient.addColorStop(1,"rgba(255,228,91,.05)");
    ctx.strokeStyle=gradient; ctx.lineWidth=2; ctx.setLineDash([10,8]); ctx.beginPath(); ctx.moveTo(player.x,player.y); ctx.lineTo(tx,ty); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle="#ffe45b"; ctx.strokeRect(Math.round(tx-6),Math.round(ty-6),12,12);
  }

  function drawEffects() {
    const rows = { muzzle:0, impact:1, dash:2, shield:3, tag:4, pickup:5, respawn:3 };
    for (const item of state.effects) {
      const progress = clamp(item.age/item.duration,0,1);
      const frame = clamp(Math.floor(progress*4),0,3);
      drawIcon(assets.effects,4,6,frame,rows[item.type] ?? 0,item.x,item.y,58*(.8+progress*.5),1-progress);
    }
  }

  function renderGame() {
    if (!state.map) { ctx.fillStyle="#050711"; ctx.fillRect(0,0,WORLD.width,WORLD.height); return; }
    ctx.save();
    const sx = state.screenShake>.2 ? (Math.random()-.5)*state.screenShake : 0;
    const sy = state.screenShake>.2 ? (Math.random()-.5)*state.screenShake : 0;
    ctx.translate(sx,sy);
    drawMap(); drawPowers(); drawAim(); drawEnemies(); drawPlayer(); drawBullets(); drawEffects();
    ctx.restore();
  }

  function numericOptions(correct, spread) {
    const rounded = Number(correct.toFixed(1));
    const values = new Set([rounded]);
    let step = 1;
    while (values.size<4) { values.add(Number(Math.max(.1,rounded + (step%2?1:-1)*Math.ceil(step/2)*spread).toFixed(1))); step += 1; }
    const options=[...values].sort(()=>Math.random()-.5);
    return { options: options.map(String), answerIndex: options.indexOf(rounded) };
  }

  function createQuestion() {
    const type=["sin","cos","tan","ratio","angle"][Math.floor(Math.random()*5)];
    const angle=[30,35,40,45,50,55,60][Math.floor(Math.random()*7)];
    const radians=angle*Math.PI/180;
    let prompt, options, answerIndex, diagram={angle,adjacent:"adjacent",opposite:"opposite",hypotenuse:"hypotenuse"};
    if (type==="sin") {
      const h=[10,12,15,18,20][Math.floor(Math.random()*5)];
      ({options,answerIndex}=numericOptions(h*Math.sin(radians),Math.max(1.2,h*.08)));
      options=options.map(v=>`${v} units`); prompt=`θ = ${angle}° and the hypotenuse is ${h}. Find the opposite side using sin(θ).`; diagram={angle,adjacent:"",opposite:"?",hypotenuse:h};
    } else if (type==="cos") {
      const h=[10,12,15,18,20][Math.floor(Math.random()*5)];
      ({options,answerIndex}=numericOptions(h*Math.cos(radians),Math.max(1.2,h*.08)));
      options=options.map(v=>`${v} units`); prompt=`θ = ${angle}° and the hypotenuse is ${h}. Find the adjacent side using cos(θ).`; diagram={angle,adjacent:"?",opposite:"",hypotenuse:h};
    } else if (type==="tan") {
      const a=[6,8,10,12,15][Math.floor(Math.random()*5)];
      ({options,answerIndex}=numericOptions(a*Math.tan(radians),Math.max(1.2,a*.1)));
      options=options.map(v=>`${v} units`); prompt=`θ = ${angle}° and the adjacent side is ${a}. Find the opposite side using tan(θ).`; diagram={angle,adjacent:a,opposite:"?",hypotenuse:""};
    } else if (type==="ratio") {
      const ratios=[{label:"sin(θ)",answer:"opposite / hypotenuse"},{label:"cos(θ)",answer:"adjacent / hypotenuse"},{label:"tan(θ)",answer:"opposite / adjacent"}];
      const selected=ratios[Math.floor(Math.random()*ratios.length)];
      options=[selected.answer,"adjacent / opposite","hypotenuse / opposite","hypotenuse / adjacent"].sort(()=>Math.random()-.5);
      answerIndex=options.indexOf(selected.answer); prompt=`Which ratio correctly defines ${selected.label}?`; diagram={angle:38,adjacent:"adjacent",opposite:"opposite",hypotenuse:"hypotenuse"};
    } else {
      const selected=[{o:5,h:10,a:30},{o:7.1,h:10,a:45},{o:8.7,h:10,a:60}][Math.floor(Math.random()*3)];
      options=[selected.a,25,40,70].filter((v,i,a)=>a.indexOf(v)===i).sort(()=>Math.random()-.5).map(v=>`${v}°`);
      answerIndex=options.indexOf(`${selected.a}°`); prompt=`Opposite = ${selected.o} and hypotenuse = ${selected.h}. Which angle is closest using sin⁻¹(opposite/hypotenuse)?`; diagram={angle:"?",adjacent:"",opposite:selected.o,hypotenuse:selected.h};
    }
    return { id:`q-${Date.now()}-${Math.random().toString(16).slice(2)}`, type, prompt, options, answerIndex, diagram };
  }

  function drawQuestionDiagram(diagram) {
    qctx.imageSmoothingEnabled=false;
    qctx.clearRect(0,0,questionCanvas.width,questionCanvas.height);
    qctx.fillStyle="#07101c"; qctx.fillRect(0,0,questionCanvas.width,questionCanvas.height);
    const ax=110,ay=220,bx=510,by=220,cx=510,cy=55;
    qctx.strokeStyle="#49e7ff"; qctx.lineWidth=5; qctx.beginPath(); qctx.moveTo(ax,ay); qctx.lineTo(bx,by); qctx.lineTo(cx,cy); qctx.closePath(); qctx.stroke();
    qctx.strokeStyle="#ffe45b"; qctx.lineWidth=3; qctx.strokeRect(bx-24,by-24,24,24);
    qctx.fillStyle="#eefcff"; qctx.font="700 18px Segoe UI"; qctx.fillText(String(diagram.adjacent||"adjacent"),280,248); qctx.fillText(String(diagram.opposite||"opposite"),520,145);
    qctx.save(); qctx.translate(305,120); qctx.rotate(-.39); qctx.fillText(String(diagram.hypotenuse||"hypotenuse"),0,0); qctx.restore();
    qctx.strokeStyle="#ff4ca8"; qctx.beginPath(); qctx.arc(ax,ay,50,-.39,0); qctx.stroke(); qctx.fillStyle="#ff4ca8"; qctx.font="900 20px Consolas"; qctx.fillText(`${diagram.angle}°`,155,198);
  }

  function beginQuestionCheckpoint() {
    if (state.questionActive || state.ended) return;
    state.questionActive=true;
    state.currentStudentIndex=state.checkpointCount%3;
    state.checkpointCount+=1;
    state.studentStats[state.currentStudentIndex].checkpointsAssigned+=1;
    ui.question.classList.add("visible");
    prepareQuestion();
  }

  function prepareQuestion() {
    clearInterval(questionInterval);
    state.currentQuestion=createQuestion();
    state.questionStartedAt=performance.now();
    state.questionRemaining=25;
    const student=state.studentStats[state.currentStudentIndex];
    ui.questionStudent.textContent=`${student.studentName} answers`;
    ui.questionPrompt.textContent=state.currentQuestion.prompt;
    ui.questionFeedback.textContent="";
    ui.questionOptions.innerHTML="";
    state.currentQuestion.options.forEach((option,index)=>{
      const button=document.createElement("button"); button.type="button"; button.textContent=`${String.fromCharCode(65+index)}. ${option}`; button.addEventListener("click",()=>answerQuestion(index,false)); ui.questionOptions.appendChild(button);
    });
    drawQuestionDiagram(state.currentQuestion.diagram);
    ui.questionTimer.textContent="25";
    questionInterval=setInterval(()=>{ state.questionRemaining-=1; ui.questionTimer.textContent=String(Math.max(0,state.questionRemaining)); if(state.questionRemaining<=0) answerQuestion(-1,true); },1000);
    renderStudentRows();
  }

  function answerQuestion(selectedIndex,timedOut) {
    if(!state.questionActive||!state.currentQuestion) return;
    clearInterval(questionInterval);
    const q=state.currentQuestion, student=state.studentStats[state.currentStudentIndex];
    const correct=!timedOut&&selectedIndex===q.answerIndex;
    const responseMs=Math.max(0,Math.round(performance.now()-state.questionStartedAt));
    student.attempts+=1; student.totalResponseMs+=responseMs;
    if(correct) student.correct+=1; else if(timedOut) student.timeouts+=1; else student.wrong+=1;
    student.answers.push({questionId:q.id,type:q.type,prompt:q.prompt,options:q.options,selectedIndex,selectedAnswer:selectedIndex>=0?q.options[selectedIndex]:"TIMEOUT",correctIndex:q.answerIndex,correctAnswer:q.options[q.answerIndex],correct,timedOut,responseMs,at:new Date().toISOString(),map:state.mapIndex+1,wave:state.wave});
    saveProgress("checkpoint");
    if(correct) {
      ui.questionFeedback.textContent="Correct. Three strikes cleared.";
      state.strikes=0;
      setTimeout(()=>{ state.questionActive=false; state.currentQuestion=null; ui.question.classList.remove("visible"); const spawn=MAPS[state.mapIndex].spawn; state.player=makePlayer(spawn[0],spawn[1]); effect("respawn",state.player.x,state.player.y,"#49e7ff",.5); showBanner("Checkpoint cleared · match resumed",850); },650);
    } else {
      ui.questionFeedback.textContent=timedOut?"Time expired. Loading another trigonometry question.":"Not correct. Loading another trigonometry question.";
      setTimeout(prepareQuestion,800);
    }
    syncHud();
  }

  function resetGame() {
    const names=ui.students.map((input)=>safeName(input.value));
    if(names.some((name)=>name.length<2)){ui.registrationFeedback.textContent="Enter three complete student names.";return;}
    if(new Set(names.map((name)=>name.toLowerCase())).size!==3){ui.registrationFeedback.textContent="The three student names must be different.";return;}
    const armor=armorCatalog.find((item)=>item.id===selectedArmorId)||armorCatalog[0];
    clearInterval(questionInterval); clearInterval(autosaveTimer);
    Object.assign(state,{running:true,paused:false,questionActive:false,ended:false,matchSeconds:Number(ui.duration.value)||300,remaining:Number(ui.duration.value)||300,startedAt:Date.now(),resultId:`pixel-geometry-${new Date().toISOString().replace(/[:.]/g,"-")}`,mapIndex:Number(ui.mapSelect.value)||0,wave:1,mapsCleared:0,tags:0,strikes:0,shots:0,hits:0,checkpointCount:0,students:names,studentStats:createStudentStats(names),armor,bullets:[],effects:[],powers:[],currentQuestion:null,screenShake:0,savedPath:""});
    ui.registration.classList.remove("visible"); ui.question.classList.remove("visible"); ui.pause.classList.remove("visible"); ui.end.classList.remove("visible");
    ui.hud.classList.remove("hidden"); ui.studentPanel.classList.remove("hidden"); ui.controlPanel.classList.remove("hidden");
    spawnMap(state.mapIndex); syncHud(); saveProgress("started"); autosaveTimer=setInterval(()=>saveProgress("in_progress"),AUTOSAVE_MS);
  }

  function buildResult(status) {
    const students=state.studentStats.map((student)=>({...student,averageResponseMs:student.attempts?Math.round(student.totalResponseMs/student.attempts):0,accuracy:student.attempts?Number((student.correct/student.attempts*100).toFixed(1)):0}));
    return {schema:"neon-geometry-pixel-local-v31",version:"48.0.0",id:state.resultId,status,createdAt:new Date(state.startedAt||Date.now()).toISOString(),updatedAt:new Date().toISOString(),matchDurationSeconds:state.matchSeconds,elapsedSeconds:Math.max(0,Math.round(state.matchSeconds-state.remaining)),map:state.mapIndex+1,mapName:state.map?.name||"",wave:state.wave,mapsCleared:state.mapsCleared,loadout:{armorId:state.armor?.id,armorName:state.armor?.name,weapon:"Pulse Pistol",magazine:state.armor?.magazine,maxPlayerBullets:MAX_PLAYER_BULLETS,maxEnemyBullets:MAX_ENEMY_BULLETS},combat:{tags:state.tags,strikes:state.strikes,shots:state.shots,hits:state.hits,accuracyPercent:state.shots?Number((state.hits/state.shots*100).toFixed(1)):0},assessment:{checkpoints:state.checkpointCount,totalAttempts:students.reduce((s,v)=>s+v.attempts,0),totalCorrect:students.reduce((s,v)=>s+v.correct,0),totalWrong:students.reduce((s,v)=>s+v.wrong,0),totalTimeouts:students.reduce((s,v)=>s+v.timeouts,0),students}};
  }

  function resultToCsv(result) {
    const esc=(value)=>{const text=String(value??"");const safe=/^[=+\-@]/.test(text)?`'${text}`:text;return `"${safe.replace(/"/g,'""')}"`;};
    const lines=[];
    lines.push(["result_id","status","armor","weapon","map","wave","maps_cleared","tags","shots","hits","accuracy_percent"].map(esc).join(","));
    lines.push([result.id,result.status,result.loadout.armorName,result.loadout.weapon,result.mapName,result.wave,result.mapsCleared,result.combat.tags,result.combat.shots,result.combat.hits,result.combat.accuracyPercent].map(esc).join(","));
    lines.push(""); lines.push(["student_index","student_name","checkpoints","attempts","correct","wrong","timeouts","accuracy","average_response_ms"].map(esc).join(","));
    result.assessment.students.forEach((student)=>lines.push([student.studentIndex+1,student.studentName,student.checkpointsAssigned,student.attempts,student.correct,student.wrong,student.timeouts,student.accuracy,student.averageResponseMs].map(esc).join(",")));
    lines.push(""); lines.push(["student_name","question_type","prompt","selected_answer","correct_answer","correct","timeout","response_ms","map","wave","timestamp"].map(esc).join(","));
    result.assessment.students.forEach((student)=>student.answers.forEach((answer)=>lines.push([student.studentName,answer.type,answer.prompt,answer.selectedAnswer,answer.correctAnswer,answer.correct,answer.timedOut,answer.responseMs,answer.map,answer.wave,answer.at].map(esc).join(","))));
    return lines.join("\r\n");
  }

  async function saveProgress(status) {
    if(!state.resultId||!window.schoolGame?.saveResult) return null;
    const result=buildResult(status);
    try { const saved=await window.schoolGame.saveResult({id:state.resultId,json:JSON.stringify(result,null,2),csv:resultToCsv(result)}); state.savedPath=saved.directory||state.savedPath; return saved; }
    catch(error){ console.error("Result save failed",error); return null; }
  }

  async function endMatch() {
    if(state.ended) return;
    state.ended=true; state.running=false; clearInterval(autosaveTimer); clearInterval(questionInterval);
    const saved=await saveProgress("completed"); const result=buildResult("completed");
    ui.finalSummary.innerHTML=[["ARMOR",result.loadout.armorName],["TAGS",result.combat.tags],["MAPS",result.mapsCleared],["QUESTIONS",result.assessment.totalAttempts],["CORRECT",result.assessment.totalCorrect],["ACCURACY",`${result.combat.accuracyPercent}%`],["WAVE",result.wave],["SHOTS",result.combat.shots]].map(([label,value])=>`<article><span>${label}</span><b>${escapeHtml(value)}</b></article>`).join("");
    ui.resultPath.textContent=`Saved locally: ${saved?.directory||state.savedPath||"Documents\\Neon Geometry Tactical Results\\results"}`;
    ui.end.classList.add("visible");
  }

  function togglePause(){ if(!state.running||state.questionActive||state.ended)return; state.paused=!state.paused; ui.pause.classList.toggle("visible",state.paused); }

  function frame(timestamp){ const dt=Math.min(.033,Math.max(0,(timestamp-(state.lastFrame||timestamp))/1000)); state.lastFrame=timestamp; updateGame(dt); renderGame(); requestAnimationFrame(frame); }

  window.addEventListener("resize",resizeCanvas);
  window.addEventListener("keydown",(event)=>{ if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.code))event.preventDefault(); keys.add(event.code); if(event.code==="KeyP")togglePause(); if(event.code==="KeyR")reloadPlayer(); });
  window.addEventListener("keyup",(event)=>keys.delete(event.code));
  canvas.addEventListener("mousemove",(event)=>Object.assign(pointer,eventToWorld(event)));
  canvas.addEventListener("mousedown",(event)=>{if(event.button===0)pointer.down=true;});
  window.addEventListener("mouseup",(event)=>{if(event.button===0)pointer.down=false;});
  canvas.addEventListener("contextmenu",(event)=>event.preventDefault());
  ui.start.addEventListener("click",resetGame);
  ui.restart.addEventListener("click",()=>window.schoolGame?.restart());
  ui.openResults.addEventListener("click",async()=>{try{ui.resultPath.textContent=`Saved locally: ${await window.schoolGame.openResults()}`;}catch(error){ui.resultPath.textContent=`Unable to open results: ${error.message}`;}});

  async function initialize(){
    resizeCanvas();
    try { await loadAssets(); renderArmorCatalog(); state.map={...MAPS[0],obstacles:MAPS[0].obstacles.map(([x,y,w,h])=>({x,y,w,h}))}; state.armor=armorCatalog[0]; state.player=makePlayer(135,850); ui.registrationFeedback.textContent="Pixel assets ready. Choose armor and register three students."; try{state.savedPath=await window.schoolGame?.getResultsPath();}catch{} window.schoolGame?.ready(); }
    catch(error){ui.registrationFeedback.textContent=`Pixel asset loading failed: ${error.message}`;console.error(error);}
    requestAnimationFrame(frame);
  }

  initialize();
})();
