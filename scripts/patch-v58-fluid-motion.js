"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const repoRoot = path.join(__dirname, "..");
const target = path.join(repoRoot, "school-game", "v58", "game.js");
const tempPatch = path.join(__dirname, ".v58-fluid-motion.patch");

if (!fs.existsSync(target)) throw new Error("Prepared V58 source is missing.");

const encoded = [
  "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"
].join("");
const patch = zlib.gunzipSync(Buffer.from(encoded, "base64"));
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

console.log("Applied V58 fluid-motion refinement: connected rooms, circular collision, smooth acceleration, safe enemy spawns and dynamic impact glass.");
