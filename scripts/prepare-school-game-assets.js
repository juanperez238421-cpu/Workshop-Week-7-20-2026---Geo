"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const assets = path.join(root, "school-game", "assets");
const names = ["player.webp", "enemies.webp", "effects.webp", "pickups.webp", "tiles.webp", "ui.webp", "trajectory.webp"];

for (const name of names) {
  const encodedPath = path.join(assets, `${name}.base64`);
  if (!fs.existsSync(encodedPath)) throw new Error(`Missing encoded school asset: ${encodedPath}`);
  const encoded = fs.readFileSync(encodedPath, "utf8").replace(/\s+/g, "");
  const buffer = Buffer.from(encoded, "base64");
  if (buffer.length < 10000) throw new Error(`Decoded asset is unexpectedly small: ${name}`);
  const target = path.join(assets, name);
  fs.writeFileSync(target, buffer);
  console.log(`Prepared ${path.relative(root, target)} (${buffer.length} bytes)`);
}
