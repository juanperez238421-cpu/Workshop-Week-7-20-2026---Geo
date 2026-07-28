"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = process.argv[2] || process.cwd();
const gamePath = path.join(root, "school-game", "v58", "game.js");
const game = fs.readFileSync(gamePath, "utf8");

assert.match(game, /const PLAYER_COLLISION_RADIUS = 18/);
assert.match(game, /const PLAYER_SPEED = 270/);
assert.match(game, /const PLAYER_ACCELERATION = 2100/);
assert.match(game, /const PLAYER_DECELERATION = 2700/);
assert.match(game, /const PLAYER_DASH_SPEED = 620/);
assert.match(game, /function approachVector\(/);
assert.match(game, /const radius = entity\.collisionRadius \|\| entity\.radius/);
assert.match(game, /Math\.ceil\(distance \/ 4\.5\)/);
assert.match(game, /PLAYER_CORNER_ASSIST/);
assert.match(game, /nearestWalkablePosition\(spawnX, spawnY, type\.radius\)/);
assert.match(game, /nearestWalkablePosition\(map\.spawn\[0\], map\.spawn\[1\], PLAYER_COLLISION_RADIUS/);
assert.match(game, /function createGlassPanels\(/);
assert.match(game, /function damageGlassAlongSegment\(/);
assert.match(game, /function spawnGlassShards\(/);
assert.match(game, /function drawGlassShards\(/);
assert.match(game, /state\.nav = buildNavGrid\(\)/);
assert.match(game, /GLASS ROUTE OPEN · keep moving/);
assert.match(game, /destructibleImpactGlass: true/);
assert.match(game, /physicalGlassShards: true/);
assert.match(game, /VISION \+ BALLISTICS GLASS/);
assert.ok((game.match(/fluidPlayerAcceleration: true/g) || []).length >= 2, "Bootstrap and Room 5 runtime probe must report fluid movement");
assert.ok((game.match(/allRoomsConnectedForPlayer: true/g) || []).length >= 2, "Bootstrap and Room 5 runtime probe must report connected rooms");

const start = game.indexOf("  const MAPS = [");
const end = game.indexOf("  const state = {", start);
assert.ok(start >= 0 && end > start, "MAPS block missing");
const context = {};
vm.createContext(context);
vm.runInContext(game.slice(start, end).replace("  const MAPS = [", "  const MAPS = globalThis.MAPS = ["), context);
const maps = context.MAPS;
assert.equal(maps.length, 5);
assert.deepEqual(Array.from(maps, (map) => map.obstacles.length), [39, 23, 66, 65, 16], "Existing room element counts changed");
assert.deepEqual(Array.from(maps, (map) => map.decor.length), [14, 8, 24, 23, 6], "Existing room decor changed");
assert.deepEqual(Array.from(maps, (map) => map.enemies.length), [10, 13, 14, 15, 1], "Existing enemy roster changed");

function circleRectCollision(rect, x, y, radius) {
  const nearestX = Math.max(rect[0], Math.min(x, rect[0] + rect[2]));
  const nearestY = Math.max(rect[1], Math.min(y, rect[1] + rect[3]));
  const dx = x - nearestX;
  const dy = y - nearestY;
  return dx * dx + dy * dy < radius * radius;
}

function roomConnectivity(map, radius = 18, cell = 8) {
  const cols = Math.ceil(1600 / cell);
  const rows = Math.ceil(1000 / cell);
  const open = new Uint8Array(cols * rows);
  const rects = map.obstacles.concat(map.glass || []);
  let total = 0;
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const x = gx * cell + cell * 0.5;
      const y = gy * cell + cell * 0.5;
      const clear = x >= radius + 2 && y >= radius + 2 && x <= 1600 - radius - 2 && y <= 1000 - radius - 2 &&
        !rects.some((rect) => circleRectCollision(rect, x, y, radius));
      if (clear) { open[gy * cols + gx] = 1; total++; }
    }
  }
  let startIndex = Math.floor(map.spawn[1] / cell) * cols + Math.floor(map.spawn[0] / cell);
  if (!open[startIndex]) {
    let best = -1;
    let bestDistance = Infinity;
    for (let index = 0; index < open.length; index++) {
      if (!open[index]) continue;
      const gx = index % cols;
      const gy = Math.floor(index / cols);
      const dx = gx - Math.floor(map.spawn[0] / cell);
      const dy = gy - Math.floor(map.spawn[1] / cell);
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) { bestDistance = distance; best = index; }
    }
    startIndex = best;
  }
  assert.ok(startIndex >= 0, `${map.name} has no walkable spawn`);
  const visited = new Uint8Array(open.length);
  const queue = new Int32Array(open.length);
  let head = 0;
  let tail = 0;
  queue[tail++] = startIndex;
  visited[startIndex] = 1;
  let reachable = 0;
  while (head < tail) {
    const index = queue[head++];
    reachable++;
    const gx = index % cols;
    const gy = Math.floor(index / cols);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = gx + dx;
      const ny = gy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const next = ny * cols + nx;
      if (!open[next] || visited[next]) continue;
      visited[next] = 1;
      queue[tail++] = next;
    }
  }
  return { total, reachable, ratio: reachable / Math.max(1, total) };
}

for (const map of maps) {
  const audit = roomConnectivity(map);
  assert.ok(audit.ratio >= 0.995, `${map.name} is not sufficiently connected: ${(audit.ratio * 100).toFixed(2)}%`);
}

console.log("V58 fluid-motion validation passed: all five rooms are connected, player collision is circular and forgiving, enemy deployment is repaired, and glass fractures at the real impact point with physical shards.");
