"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const repoRoot = path.join(__dirname, "..");
const partsDir = path.join(__dirname, "v59-source");
const target = path.join(repoRoot, "school-game", "v59");

const encoded = fs.readdirSync(partsDir)
  .filter((name) => /^part-\d+\.txt$/.test(name))
  .sort()
  .map((name) => fs.readFileSync(path.join(partsDir, name), "utf8").trim())
  .join("");

if (!encoded) throw new Error("V59 source payload is missing.");
const manifest = JSON.parse(zlib.gunzipSync(Buffer.from(encoded, "base64")).toString("utf8"));
const required = ["game.js", "index.html", "styles.css", "main.js", "preload.js"];
for (const name of required) {
  if (typeof manifest[name] !== "string" || manifest[name].length < 20) throw new Error(`V59 source file is invalid: ${name}`);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
for (const [name, content] of Object.entries(manifest)) {
  if (!required.includes(name)) continue;
  fs.writeFileSync(path.join(target, name), content, "utf8");
}
console.log("Prepared Geometry Tactical Classroom V59 from the validated source payload.");
