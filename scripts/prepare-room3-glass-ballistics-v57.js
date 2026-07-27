"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const partsDir = path.join(__dirname, "v57-payload");
const encoded = fs.readdirSync(partsDir)
  .filter((name) => /^part-\d+\.txt$/.test(name))
  .sort()
  .map((name) => fs.readFileSync(path.join(partsDir, name), "utf8").trim())
  .join("");
const source = zlib.gunzipSync(Buffer.from(encoded, "base64")).toString("utf8");
const generated = path.join(__dirname, ".v57-generated-patch.js");
try {
  fs.writeFileSync(generated, source, "utf8");
  require(generated);
} finally {
  fs.rmSync(generated, { force: true });
}
