"use strict";

const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const baseRuntime = require("./runtime-v21.js");

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Triad v22 patch could not find: ${label}`);
  return source.replace(search, replacement);
}

function patchGatewaySource(input) {
  let source = baseRuntime.patchGatewaySource(input);
  source = source.replaceAll("stable-autostart-individual-channels-v26", "fair-question-rotation-local-results-v27");
  return source;
}

function patchServerSource(input) {
  let source = baseRuntime.patchServerSource(input);

  const resetPattern = `    player.studentStats = createIndividualStudentStats(player.students);\n    player.studentDeathTurn = 0;\n    player.currentStudentIndex = null;`;
  const fairReset = `    player.studentStats = createIndividualStudentStats(player.students);\n    player.studentDeathTurn = 0;\n    player.questionStudentTurn = 0;\n    player.currentStudentIndex = null;`;
  if (!source.includes(resetPattern)) throw new Error("Triad v22 patch could not find: student counter initialization");
  source = source.replaceAll(resetPattern, fairReset);

  source = replaceRequired(
    source,
    `      const assignedIndex = Number.isInteger(player.currentStudentIndex) ? player.currentStudentIndex : ((Number(player.studentDeathTurn) || 0) % studentCount);\n      player.currentStudentIndex = assignedIndex;`,
    `      const assignedIndex = (Number(player.questionStudentTurn) || 0) % studentCount;\n      player.questionStudentTurn = assignedIndex + 1;\n      player.currentStudentIndex = assignedIndex;`,
    "independent round-robin question assignment"
  );

  source = source.replaceAll("20260724-stable-autostart26", "20260725-fair-question-rotation27");
  source = source.replaceAll("stable-autostart-individual-channels-v26", "fair-question-rotation-local-results-v27");
  return source;
}

const currentNodeOptions = String(process.env.NODE_OPTIONS || "");
if (!currentNodeOptions.includes("runtime-v22.js")) process.env.NODE_OPTIONS = `${currentNodeOptions} --require=${__filename}`.trim();

const inheritedLoader = Module._extensions[".js"];
Module._extensions[".js"] = function triadV22Loader(moduleToLoad, filename) {
  if (path.dirname(filename) === __dirname && path.basename(filename) === "server-v3.js") {
    moduleToLoad._compile(patchServerSource(fs.readFileSync(filename, "utf8")), filename);
    return;
  }
  if (path.dirname(filename) === __dirname && path.basename(filename) === "secure-gateway.js") {
    moduleToLoad._compile(patchGatewaySource(fs.readFileSync(filename, "utf8")), filename);
    return;
  }
  inheritedLoader(moduleToLoad, filename);
};

module.exports = { patchGatewaySource, patchServerSource };
