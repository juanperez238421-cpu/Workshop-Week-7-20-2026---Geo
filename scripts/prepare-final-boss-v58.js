"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const partsDir = path.join(__dirname, "v58-source");
const encoded = fs.readdirSync(partsDir)
  .filter((name) => /^part-\d+\.txt$/.test(name))
  .sort()
  .map((name) => fs.readFileSync(path.join(partsDir, name), "utf8").trim())
  .join("");
const files = JSON.parse(zlib.gunzipSync(Buffer.from(encoded, "base64")).toString("utf8"));
const target = path.join(__dirname, "..", "school-game", "v58");
fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
for (const [name, content] of Object.entries(files)) {
  if (!/^[a-z0-9._-]+$/i.test(name)) throw new Error(`Unsafe V58 filename: ${name}`);
  fs.writeFileSync(path.join(target, name), content, "utf8");
}
console.log(`Prepared Geometry Tactical V58 source (${Object.keys(files).length} files).`);
