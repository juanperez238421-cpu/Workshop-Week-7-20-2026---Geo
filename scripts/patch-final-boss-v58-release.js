"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "school-game", "v58");
const gamePath = path.join(root, "game.js");
const mainPath = path.join(root, "main.js");

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`V58 release patch could not find ${label}.`);
  return source.replace(before, after);
}

let main = fs.readFileSync(mainPath, "utf8");
main = replaceRequired(
  main,
  '// Preserve the existing V54 Windows vault location during the V55 upgrade.\napp.setName("Geometry Tactical Final Boss Local");',
  '// Preserve the existing V54–V57 Windows vault location during the V58 upgrade.\napp.setName("Geometry Tactical Clean Vision Local");',
  "persistent vault application name"
);
fs.writeFileSync(mainPath, main, "utf8");

let game = fs.readFileSync(gamePath, "utf8");
game = replaceRequired(game,
  '      burstRemaining: 0,\n      burstTimer: 0\n',
  '      burstRemaining: 0,\n      burstTimer: 0,\n      roomWeapon: false\n',
  "weapon room provenance"
);
game = replaceRequired(game,
  '  function throwEquippedWeapon(player) {\n    if (!player || player.defeated || player.weapon.id === "pistol") {\n      banner("Pick up an enemy weapon first · the Pulse Pistol remains the emergency sidearm", 1300);\n      return false;\n    }\n',
  '  function throwEquippedWeapon(player) {\n    if (!player || player.defeated || !player.weapon) return false;\n',
  "own-weapon E throw"
);
game = replaceRequired(game,
  '      angle, spin: 0, life: 0.72, weaponId: thrown.id, ammo: thrown.ammo, reserve: thrown.reserve,\n      landed: false, hitEnemyId: ""\n',
  '      angle, spin: 0, life: 0.72, weaponId: thrown.id, ammo: thrown.ammo, reserve: thrown.reserve,\n      roomWeapon: Boolean(thrown.roomWeapon), landed: false, hitEnemyId: ""\n',
  "thrown weapon provenance"
);
game = replaceRequired(game,
  '    banner(`${WEAPONS[thrown.id].name} thrown · emergency pistol active`, 1250);\n',
  '    banner(`${WEAPONS[thrown.id].name} thrown · emergency pistol active`, 1050);\n',
  "clean throw message"
);
game = replaceRequired(game,
  '      weaponId: item.weaponId, ammo: item.ammo, reserve: item.reserve, age: 0, spin: item.angle,\n      ignoredUntil: performance.now() + 350\n',
  '      weaponId: item.weaponId, ammo: item.ammo, reserve: item.reserve, age: 0, spin: item.angle,\n      roomWeapon: Boolean(item.roomWeapon), ignoredUntil: performance.now() + 350\n',
  "landed weapon provenance"
);
game = replaceRequired(game,
  '          if (enemy.typeId === "boss") {\n            if (enemy.bossShieldActive) {\n              enemy.bossShieldActive = false;\n',
  '          if (enemy.typeId === "boss") {\n            if (enemy.bossShieldActive && !item.roomWeapon) {\n              banner("THE SHIELD REJECTED IT · THROW A ROOM WEAPON", 1500);\n              tone(180, 0.11, 0.025, "square");\n            } else if (enemy.bossShieldActive) {\n              enemy.bossShieldActive = false;\n',
  "boss room-weapon shield gate"
);
game = replaceRequired(game,
  '        reserve: old.reserve,\n        age: 0,\n',
  '        reserve: old.reserve,\n        roomWeapon: Boolean(old.roomWeapon),\n        age: 0,\n',
  "dropped equipped weapon provenance"
);
game = replaceRequired(game,
  '      player.weapon = {\n        ...createWeaponState(nearest.weaponId, nearest.ammo),\n        reserve: nearest.reserve\n      };\n',
  '      player.weapon = {\n        ...createWeaponState(nearest.weaponId, nearest.ammo),\n        reserve: nearest.reserve,\n        roomWeapon: Boolean(nearest.roomWeapon)\n      };\n',
  "picked-up room weapon provenance"
);
fs.writeFileSync(gamePath, game, "utf8");
console.log("Applied V58 final release hardening: persistent vault, own-weapon E throws and room-weapon boss gate.");
