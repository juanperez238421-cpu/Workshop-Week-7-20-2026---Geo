"use strict";
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const payload = path.join(__dirname, "v606-fair-dodge-patch.js.gz");
const output = path.join(__dirname, "patch-v60-fair-dodge-boss-v606.js");
fs.writeFileSync(output, zlib.gunzipSync(fs.readFileSync(payload)));
console.log("Prepared V60.6 fair-dodge boss patch source.");
