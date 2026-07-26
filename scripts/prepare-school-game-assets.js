"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const assets = path.join(root, "school-game", "assets");
const legacyNames = ["player.webp", "enemies.webp", "effects.webp", "pickups.webp", "tiles.webp", "ui.webp", "trajectory.webp"];
const pixelNames = ["characters.png", "enemies.png", "powers.png", "weapons.png", "tiles.png", "effects.png", "decor.png"];

function decode(encodedPath, targetPath, minimumBytes) {
  if (!fs.existsSync(encodedPath)) throw new Error(`Missing encoded school asset: ${encodedPath}`);
  const encoded = fs.readFileSync(encodedPath, "utf8").replace(/\s+/g, "");
  const buffer = Buffer.from(encoded, "base64");
  if (buffer.length < minimumBytes) throw new Error(`Decoded asset is unexpectedly small: ${targetPath}`);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, buffer);
  console.log(`Prepared ${path.relative(root, targetPath)} (${buffer.length} bytes)`);
}

for (const name of legacyNames) {
  decode(path.join(assets, `${name}.base64`), path.join(assets, name), 2000);
}

const pixelDirectory = path.join(assets, "pixel");
for (const name of pixelNames) {
  decode(path.join(pixelDirectory, `${name}.base64`), path.join(pixelDirectory, name), 250);
}
