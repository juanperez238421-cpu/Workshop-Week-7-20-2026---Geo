"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const repoRoot = path.join(__dirname, "..");
const partsDir = path.join(__dirname, "v60-source");
const target = path.join(repoRoot, "school-game", "v60");
const requiredFiles = ["game.js", "index.html", "styles.css", "main.js", "preload.js"];

if (!fs.existsSync(partsDir)) throw new Error("V60 source payload directory is missing.");

const partNames = fs.readdirSync(partsDir)
  .filter((name) => /^part-\d+\.txt$/.test(name))
  .sort();
if (partNames.length < 1) throw new Error("V60 source payload parts are missing.");

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

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
for (const fileName of requiredFiles) {
  fs.writeFileSync(path.join(target, fileName), manifest[fileName], "utf8");
}

console.log(`Prepared Geometry Tactical Classroom V60 from ${partNames.length} validated source payload parts.`);
