"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const repoRoot = path.join(__dirname, "..");
const source = path.join(repoRoot, "school-game", "v57");
const target = path.join(repoRoot, "school-game", "v58");
const partsDir = path.join(__dirname, "v58-patch");
const tempPatch = path.join(__dirname, ".v58-release.patch");

if (!fs.existsSync(source)) throw new Error("Prepared V57 source is missing.");

const encoded = fs.readdirSync(partsDir)
  .filter((name) => /^part-\d+\.txt$/.test(name))
  .sort()
  .map((name) => fs.readFileSync(path.join(partsDir, name), "utf8").trim())
  .join("");
const patch = zlib.gunzipSync(Buffer.from(encoded, "base64"));

fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
fs.writeFileSync(tempPatch, patch);

try {
  const result = spawnSync(
    "git",
    [
      "apply",
      "--no-index",
      "--unsafe-paths",
      "--directory=school-game/v58",
      path.relative(repoRoot, tempPatch).replace(/\\/g, "/")
    ],
    { cwd: repoRoot, stdio: "inherit" }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git apply failed with status ${result.status}.`);
} finally {
  fs.rmSync(tempPatch, { force: true });
}

console.log("Prepared Geometry Tactical V58 from the validated V57 baseline.");
