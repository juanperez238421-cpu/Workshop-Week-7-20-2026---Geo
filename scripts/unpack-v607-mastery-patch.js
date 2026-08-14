"use strict";
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const payload = path.join(__dirname, "v607-mastery-patch.js.gz");
const output = path.join(__dirname, "patch-v60-mastery-boss-v607.js");
fs.writeFileSync(output, zlib.gunzipSync(fs.readFileSync(payload)));
console.log("Prepared V60.7 mastery boss patch source.");
