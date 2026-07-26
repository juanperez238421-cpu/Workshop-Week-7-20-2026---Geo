"use strict";

const path = require("node:path");
const childProcess = require("node:child_process");

const originalSpawn = childProcess.spawn;
const runtime = require("./runtime-local.js");

// The previous desktop runtime propagated a NODE_OPTIONS string containing an
// absolute Windows path. On installed builds that path contains spaces, which
// can make the embedded Electron-as-Node process terminate before the engine
// starts. v28 uses explicit argv entries instead of NODE_OPTIONS.
delete process.env.NODE_OPTIONS;

function isAuthoritativeEngineLaunch(args, options) {
  return Boolean(
    Array.isArray(args) &&
    args.length >= 1 &&
    path.basename(String(args[0] || "")).toLowerCase() === "server-v3.js" &&
    String(options?.env?.ELECTRON_RUN_AS_NODE || process.env.ELECTRON_RUN_AS_NODE || "") === "1"
  );
}

childProcess.spawn = function triadLocalEngineSpawn(command, args = [], options = {}) {
  if (!isAuthoritativeEngineLaunch(args, options)) return originalSpawn.call(this, command, args, options);

  const env = { ...(options.env || process.env) };
  delete env.NODE_OPTIONS;
  env.TRIAD_LOCAL_RUNTIME_PATH = __filename;

  return originalSpawn.call(
    this,
    command,
    ["--require", __filename, ...args],
    { ...options, env }
  );
};

module.exports = runtime;
