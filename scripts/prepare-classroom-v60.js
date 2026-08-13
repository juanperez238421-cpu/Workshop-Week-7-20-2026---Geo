"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const repoRoot = path.join(__dirname, "..");
const partsDir = path.join(__dirname, "v60-source");
const target = path.join(repoRoot, "school-game", "v60");
const requiredFiles = ["game.js", "index.html", "styles.css", "main.js", "preload.js"];

if (!fs.existsSync(partsDir)) throw new Error("V60 source payload directory is missing.");

const prefixNames = fs.readdirSync(partsDir)
  .filter((name) => /^verified-\d{3}\.txt$/.test(name))
  .sort();
const suffixNames = fs.readdirSync(partsDir)
  .filter((name) => /^part-00[1-4]\.txt$/.test(name))
  .sort();
const partNames = [...prefixNames, ...suffixNames];

if (prefixNames.length !== 18) {
  throw new Error(`Expected 18 verified V60 prefix chunks, found ${prefixNames.length}.`);
}
if (suffixNames.length !== 4) {
  throw new Error(`Expected 4 V60 suffix payload parts, found ${suffixNames.length}.`);
}

const encoded = partNames
  .map((name) => fs.readFileSync(path.join(partsDir, name), "utf8").trim())
  .join("");
if (!encoded) throw new Error("V60 source payload is empty.");

let manifest;
try {
  const decoded = zlib.gunzipSync(Buffer.from(encoded, "base64")).toString("utf8");
  manifest = JSON.parse(decoded);
} catch (error) {
  throw new Error(`V60 source payload could not be decoded: ${error.message}`);
}

for (const fileName of requiredFiles) {
  if (typeof manifest[fileName] !== "string" || manifest[fileName].length < 20) {
    throw new Error(`V60 source file is invalid or missing: ${fileName}`);
  }
}

function injectNormalEnemyDurabilityTuning(source) {
  const closingMarker = "\n})();";
  const closingIndex = source.lastIndexOf(closingMarker);
  if (closingIndex < 0) throw new Error("V60 game closure marker is missing; enemy durability tuning was not applied.");

  const tuning = `

  // Classroom combat tuning: normal enemies stay fast and readable.
  // The final boss is deliberately excluded so its dedicated room-weapon shield remains intact.
  const NORMAL_ENEMY_TWO_HIT_TYPES = new Set(["heavy", "enforcer", "warden", "breacher"]);
  const NORMAL_ENEMY_DURABILITY_KEYS = ["hp", "health", "hitPoints", "durability", "life", "hitsToKill", "requiredHits", "hitBudget"];
  const NORMAL_ENEMY_MAX_DURABILITY_KEYS = ["maxHp", "maxHP", "maxHealth", "healthMax", "maxHitPoints", "maxDurability", "maxLife"];
  const NORMAL_ENEMY_SHIELD_KEYS = ["shield", "shieldHp", "shieldHP", "barrier", "barrierHp", "barrierHP", "armor", "armorHp", "armorHP", "armorHits"];

  function tuneNormalEnemyDurability(enemy) {
    if (!enemy) return;
    const enemyType = String(enemy.typeId || enemy.type || enemy.role || "").toLowerCase();
    if (enemyType === "boss") return;

    const hitBudget = NORMAL_ENEMY_TWO_HIT_TYPES.has(enemyType) ? 2 : 1;

    for (const key of NORMAL_ENEMY_SHIELD_KEYS) {
      if (!(key in enemy)) continue;
      if (typeof enemy[key] === "number") enemy[key] = 0;
      else if (typeof enemy[key] === "boolean") enemy[key] = false;
    }
    if ("shieldActive" in enemy) enemy.shieldActive = false;
    if ("armorActive" in enemy) enemy.armorActive = false;
    if ("barrierActive" in enemy) enemy.barrierActive = false;

    for (const key of NORMAL_ENEMY_DURABILITY_KEYS) {
      if (typeof enemy[key] === "number" && Number.isFinite(enemy[key]) && enemy[key] > hitBudget) {
        enemy[key] = hitBudget;
      }
    }
    for (const key of NORMAL_ENEMY_MAX_DURABILITY_KEYS) {
      if (typeof enemy[key] === "number" && Number.isFinite(enemy[key]) && enemy[key] > hitBudget) {
        enemy[key] = hitBudget;
      }
    }
  }

  // Keep the invariant active after every spawn/reset without touching the boss encounter.
  setInterval(() => {
    if (!state || !Array.isArray(state.enemies)) return;
    for (const enemy of state.enemies) tuneNormalEnemyDurability(enemy);
  }, 16);
`;

  return source.slice(0, closingIndex) + tuning + source.slice(closingIndex);
}

manifest["game.js"] = injectNormalEnemyDurabilityTuning(manifest["game.js"]);

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
for (const fileName of requiredFiles) {
  fs.writeFileSync(path.join(target, fileName), manifest[fileName], "utf8");
}

console.log(`Prepared Geometry Tactical Classroom V60 from ${partNames.length} verified source payload chunks with normal-enemy fast-kill tuning.`);
