"use strict";

const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const baseRuntime = require("../server/runtime-v22.js");

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Triad local runtime could not find: ${label}`);
  return source.replace(search, replacement);
}

function patchGatewaySource(input) {
  let source = baseRuntime.patchGatewaySource(input);
  source = source.replaceAll("fair-question-rotation-local-results-v27", "desktop-local-authoritative-v27");
  return source;
}

function patchServerSource(input) {
  let source = baseRuntime.patchServerSource(input);
  source = replaceRequired(
    source,
    "const MATCH_DURATION_MS = 10 * 60 * 1000;",
    "const MATCH_DURATION_MS = Math.max(1, Math.min(30, Number(process.env.TRIAD_MATCH_MINUTES || 10))) * 60 * 1000;",
    "configurable local match duration"
  );
  source = replaceRequired(
    source,
    "const STATE_RATE = 10;",
    "const STATE_RATE = Math.max(10, Math.min(30, Number(process.env.TRIAD_LOCAL_STATE_RATE || 20)));",
    "low-latency local snapshot rate"
  );
  source = replaceRequired(
    source,
    "const FULL_TERRITORY_EVERY = 40;",
    "const FULL_TERRITORY_EVERY = Math.max(40, STATE_RATE * 4);",
    "four-second local full-territory recovery"
  );
  source = replaceRequired(
    source,
    "const STATIC_META_EVERY = 80;",
    "const STATIC_META_EVERY = Math.max(80, STATE_RATE * 8);",
    "eight-second local metadata refresh"
  );
  source = source.replaceAll("20260725-fair-question-rotation27", "20260725-desktop-local27");
  source = source.replaceAll("fair-question-rotation-local-results-v27", "desktop-local-authoritative-v27");
  return source;
}

const currentNodeOptions = String(process.env.NODE_OPTIONS || "");
if (!currentNodeOptions.includes("runtime-local.js")) process.env.NODE_OPTIONS = `${currentNodeOptions} --require=${__filename}`.trim();

const inheritedLoader = Module._extensions[".js"];
Module._extensions[".js"] = function triadDesktopLocalLoader(moduleToLoad, filename) {
  const basename = path.basename(filename);
  if (basename === "server-v3.js") {
    moduleToLoad._compile(patchServerSource(fs.readFileSync(filename, "utf8")), filename);
    return;
  }
  if (basename === "secure-gateway.js") {
    moduleToLoad._compile(patchGatewaySource(fs.readFileSync(filename, "utf8")), filename);
    return;
  }
  inheritedLoader(moduleToLoad, filename);
};

module.exports = { patchGatewaySource, patchServerSource };
