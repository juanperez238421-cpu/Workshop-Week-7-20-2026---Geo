"use strict";

const fs = require("node:fs");
const path = require("node:path");
const target = path.join(__dirname, "patch-v60-relentless-boss-v605.js");
let source = fs.readFileSync(target, "utf8");
source = source.replaceAll(
  'banner(\\`${MAPS[state.levelIndex].subtitle} · safe deployment for ${Math.ceil(state.deploymentGrace)} seconds\\`, 2200);',
  'banner(\\`\\${MAPS[state.levelIndex].subtitle} · safe deployment for \\${Math.ceil(state.deploymentGrace)} seconds\\`, 2200);'
);
fs.writeFileSync(target, source, "utf8");
require(target);
