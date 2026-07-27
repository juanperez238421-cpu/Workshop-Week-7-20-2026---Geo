"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const assets = path.join(root, "desktop", "assets");
for (const name of ["icon.png", "icon.ico"]) {
  const encoded = path.join(assets, `${name}.base64`);
  const target = path.join(assets, name);
  if (!fs.existsSync(encoded)) throw new Error(`Missing encoded desktop asset: ${encoded}`);
  const content = fs.readFileSync(encoded, "utf8").replace(/\s+/g, "");
  const buffer = Buffer.from(content, "base64");
  if (buffer.length < 512) throw new Error(`Decoded desktop asset is unexpectedly small: ${name}`);
  fs.writeFileSync(target, buffer);
  console.log(`Prepared ${path.relative(root, target)} (${buffer.length} bytes)`);
}
