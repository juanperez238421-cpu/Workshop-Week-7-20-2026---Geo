"use strict";

const fs = require("node:fs");
const path = require("node:path");

const sourcePath = path.join(__dirname, "patch-v60-teacher-mode-v604.js");
const tempPath = path.join(__dirname, ".patch-v60-teacher-mode-v604.generated.js");
let source = fs.readFileSync(sourcePath, "utf8");

const redundant = `game = replaceAllRequired(game, '        questionSeconds: 60,', '        questionSeconds: QUESTION_SECONDS,', "bootstrap question duration report");\n`;
if (!source.includes(redundant)) throw new Error("V60.4 runner could not locate the redundant questionSeconds replacement.");
source = source.replace(redundant, "// The six-space global replacement above also covers the bootstrap indentation.\n");

try {
  fs.writeFileSync(tempPath, source, "utf8");
  require(tempPath);
} finally {
  fs.rmSync(tempPath, { force: true });
}
