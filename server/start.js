"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const SERVER_FILE = path.join(__dirname, "server-v3.js");
const ORIGINAL_FILTER = 'function containsBannedLanguage(value) { const compact = canonicalText(value); return BANNED_WORDS.some((word) => compact.includes(canonicalText(word))); }';
const FIXED_FILTER = 'function containsBannedLanguage(value) { return require("./moderation.js").containsBannedLanguage(value, BANNED_WORDS); }';

function patchServerSource(source) {
  const occurrences = source.split(ORIGINAL_FILTER).length - 1;
  if (occurrences !== 1) {
    throw new Error(`Expected exactly one legacy profanity filter, found ${occurrences}. Update server/start.js before deployment.`);
  }
  return source.replace(ORIGINAL_FILTER, FIXED_FILTER);
}

function startServer() {
  const source = fs.readFileSync(SERVER_FILE, "utf8");
  const patchedSource = patchServerSource(source);
  const runtimeModule = new Module(SERVER_FILE, module);
  runtimeModule.filename = SERVER_FILE;
  runtimeModule.paths = Module._nodeModulePaths(__dirname);
  runtimeModule._compile(patchedSource, SERVER_FILE);
}

if (require.main === module) startServer();

module.exports = { patchServerSource, startServer };
