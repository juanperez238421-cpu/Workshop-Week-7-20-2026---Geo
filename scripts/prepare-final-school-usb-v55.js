"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "school-game", "v54");
const target = path.join(root, "school-game", "v55");
const partsDir = path.join(__dirname, "v55-delta");

if (!fs.existsSync(source)) {
  throw new Error("V54 generated source is missing. Run the V54 preparation chain first.");
}

fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });

const encoded = fs.readdirSync(partsDir)
  .filter((name) => /^part-\d+\.txt$/.test(name))
  .sort()
  .map((name) => fs.readFileSync(path.join(partsDir, name), "utf8").trim())
  .join("");
const payload = JSON.parse(zlib.gunzipSync(Buffer.from(encoded, "base64")).toString("utf8"));

const patchPath = path.join(root, ".v55-final-school.patch");
fs.writeFileSync(patchPath, payload.patch, "utf8");
const applied = spawnSync("git", ["apply", "--whitespace=nowarn", patchPath], {
  cwd: root,
  encoding: "utf8"
});
fs.rmSync(patchPath, { force: true });
if (applied.status !== 0) {
  throw new Error(`Unable to apply V55 source patch.\n${applied.stdout || ""}\n${applied.stderr || ""}`);
}

for (const [relative, content] of Object.entries(payload)) {
  if (relative === "patch") continue;
  const destination = path.join(root, "school-game", relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content, "utf8");
  console.log(`Prepared school-game/${relative}`);
}

console.log("Prepared Final School USB V55 source and four-room assets.");
