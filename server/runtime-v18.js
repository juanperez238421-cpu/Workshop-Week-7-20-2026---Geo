"use strict";

const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");

function repairRuntimeV17(source) {
  const replacements = [
    ['`${duplicate} is already registered in this classroom room.`', 'duplicate + " is already registered in this classroom room."'],
    ['`PC Team ${queueNumber}`', '"PC Team " + queueNumber'],
    ['`${player.pcLabel} restored channel ${channelNumber}.`', 'player.pcLabel + " restored channel " + channelNumber + "."'],
    ['`${this.code}-C${String(channelNumber).padStart(2, "0")}`', 'this.code + "-C" + String(channelNumber).padStart(2, "0")'],
    ['`${registration.pcLabel} Squad`', 'registration.pcLabel + " Squad"'],
    ['`${botNames[team]} ${SOLO_CHANNEL_LABELS[channelNumber - 1]}`', 'botNames[team] + " " + SOLO_CHANNEL_LABELS[channelNumber - 1]'],
    ['`PC Team ${channelNumber}`', '"PC Team " + channelNumber'],
    ['`Channel ${channelNumber} is not waiting in the lobby.`', '"Channel " + channelNumber + " is not waiting in the lobby."'],
    ['`Channel ${channelNumber} real player is offline.`', '"Channel " + channelNumber + " real player is offline."'],
    ['`Channel ${channelNumber} real player is not ready.`', '"Channel " + channelNumber + " real player is not ready."'],
    ['`${ready.length} isolated human-vs-bots channel(s) started.`', 'ready.length + " isolated human-vs-bots channel(s) started."'],
    ['`solo_${this.code}_${Date.now()}`', '"solo_" + this.code + "_" + Date.now()'],
    ['\'  "reset_room"\\n]);\'', '\'"reset_room"\''],
    ['\'  "reset_room",\\n  "start_channel",\\n  "end_channel",\\n  "reset_channel"\\n]);\'', '\'"reset_room",\\n  "start_channel",\\n  "end_channel",\\n  "reset_channel"\'']
  ];

  let repaired = source;
  for (const [search, replacement] of replacements) {
    if (!repaired.includes(search)) throw new Error(`Triad v18 repair could not find runtime-v17 fragment: ${search}`);
    repaired = repaired.replaceAll(search, replacement);
  }

  const loaderStart = repaired.indexOf("const currentNodeOptions = String(process.env.NODE_OPTIONS || \"\");");
  if (loaderStart < 0) throw new Error("Triad v18 repair could not isolate the runtime-v17 loader block.");
  repaired = repaired.slice(0, loaderStart) + "\nmodule.exports = { patchGatewaySource, patchServerSource };\n";
  return repaired;
}

function loadRepairedRuntime() {
  const sourcePath = path.join(__dirname, "runtime-v17.js");
  const repairedSource = repairRuntimeV17(fs.readFileSync(sourcePath, "utf8"));
  const generatedFilename = path.join(__dirname, "runtime-v17-repaired-v18.js");
  const generated = new Module(generatedFilename, module);
  generated.filename = generatedFilename;
  generated.paths = Module._nodeModulePaths(__dirname);
  generated._compile(repairedSource, generatedFilename);
  return generated.exports;
}

const repairedRuntime = loadRepairedRuntime();
const { patchGatewaySource, patchServerSource } = repairedRuntime;

const currentNodeOptions = String(process.env.NODE_OPTIONS || "");
if (!currentNodeOptions.includes("runtime-v18.js")) process.env.NODE_OPTIONS = `${currentNodeOptions} --require=${__filename}`.trim();

const inheritedLoader = Module._extensions[".js"];
Module._extensions[".js"] = function triadV18Loader(moduleToLoad, filename) {
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

module.exports = { patchGatewaySource, patchServerSource, repairRuntimeV17 };
