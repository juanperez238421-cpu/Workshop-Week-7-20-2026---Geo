"use strict";

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");
const { app } = require("electron");

const originalSpawn = childProcess.spawn;
const LOCAL_RUNTIME = path.join(__dirname, "runtime-local-v28.js");

function isGatewayLaunch(args, options) {
  return Boolean(
    Array.isArray(args) &&
    args.length >= 1 &&
    path.basename(String(args[0] || "")).toLowerCase() === "secure-gateway.js" &&
    String(options?.env?.ELECTRON_RUN_AS_NODE || "") === "1"
  );
}

childProcess.spawn = function triadSpawn(command, args = [], options = {}) {
  if (!isGatewayLaunch(args, options)) return originalSpawn.call(this, command, args, options);

  const env = { ...(options.env || process.env) };
  delete env.NODE_OPTIONS;
  env.TRIAD_LOCAL_RUNTIME_PATH = LOCAL_RUNTIME;

  return originalSpawn.call(
    this,
    command,
    ["--require", LOCAL_RUNTIME, ...args],
    { ...options, env }
  );
};

function appendDesktopLog(message) {
  try {
    const logDirectory = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(logDirectory, { recursive: true });
    fs.appendFileSync(
      path.join(logDirectory, "desktop.log"),
      `[${new Date().toISOString()}] ${message}\n`,
      "utf8"
    );
  } catch {}
}

app.on("browser-window-created", (_event, window) => {
  window.webContents.on("did-finish-load", () => {
    const currentUrl = String(window.webContents.getURL() || "");
    if (!currentUrl.startsWith("file:") || !currentUrl.includes("index.html")) return;

    try {
      const marker = path.join(app.getPath("userData"), "desktop-ready.json");
      fs.writeFileSync(marker, JSON.stringify({
        ready: true,
        version: app.getVersion(),
        loadedAt: new Date().toISOString(),
        url: currentUrl
      }, null, 2), "utf8");
    } catch {}

    appendDesktopLog("desktop ready: game window loaded successfully");
  });
});

process.on("uncaughtException", (error) => {
  appendDesktopLog(`uncaught exception: ${error?.stack || error}`);
});

process.on("unhandledRejection", (reason) => {
  appendDesktopLog(`unhandled rejection: ${reason?.stack || reason}`);
});

require("./main.js");
