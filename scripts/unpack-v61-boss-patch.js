"use strict";
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const payload = path.join(__dirname, "v61-boss-patch.js.gz");
const output = path.join(__dirname, "patch-v60-boss-v61.js");
fs.writeFileSync(output, zlib.gunzipSync(fs.readFileSync(payload)));
console.log("Prepared V60.3 boss patch source.");
