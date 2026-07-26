"use strict";

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");
const { app } = require("electron");
const WebSocket = require("ws");

const originalSpawn = childProcess.spawn;
const originalWebSocketEmit = WebSocket.prototype.emit;
const LOCAL_RUNTIME = path.join(__dirname, "runtime-local-v28.js");

let desktopWindow = null;
let observedRoomCode = "";
let observedServerUrl = "";
let fallbackScheduled = false;

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

function isPlayableUrl(value) {
  const currentUrl = String(value || "");
  return currentUrl.startsWith("file:") && currentUrl.includes("index.html");
}

function writeReadyMarker(currentUrl) {
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
}

function scheduleFallbackNavigation() {
  if (fallbackScheduled || !observedRoomCode || !observedServerUrl) return;
  fallbackScheduled = true;
  setTimeout(async () => {
    try {
      if (!desktopWindow || desktopWindow.isDestroyed()) return;
      const currentUrl = String(desktopWindow.webContents.getURL() || "");
      if (isPlayableUrl(currentUrl)) return;
      appendDesktopLog(`fallback navigation: loading room ${observedRoomCode}`);
      await desktopWindow.loadFile(path.join(app.getAppPath(), "index.html"), {
        query: {
          room: observedRoomCode,
          server: observedServerUrl,
          desktop: "1",
          build: "20260726-desktop-local28-fallback"
        }
      });
    } catch (error) {
      appendDesktopLog(`fallback navigation failed: ${error?.stack || error}`);
    }
  }, 3500).unref?.();
}

WebSocket.prototype.emit = function triadObservedWebSocketEmit(eventName, ...args) {
  try {
    if (eventName === "open") {
      observedServerUrl = String(this.url || observedServerUrl);
      appendDesktopLog(`controller websocket open: ${observedServerUrl}`);
    } else if (eventName === "message") {
      let message = null;
      try { message = JSON.parse(args[0]?.toString?.() || ""); } catch {}
      if (message?.type) appendDesktopLog(`controller received: ${message.type}`);
      if (message?.type === "controller_joined") {
        observedRoomCode = String(message.roomCode || "");
        observedServerUrl = String(this.url || observedServerUrl);
        scheduleFallbackNavigation();
      }
    } else if (eventName === "close") {
      appendDesktopLog(`controller websocket close: code=${args[0] ?? ""} reason=${String(args[1] || "")}`);
    } else if (eventName === "error") {
      appendDesktopLog(`controller websocket error: ${args[0]?.message || args[0] || "unknown"}`);
    }
  } catch {}
  return originalWebSocketEmit.call(this, eventName, ...args);
};

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

  const packagedNodeModules = path.join(app.getAppPath(), "node_modules");
  env.NODE_PATH = [packagedNodeModules, env.NODE_PATH].filter(Boolean).join(path.delimiter);

  appendDesktopLog(`launching local gateway with NODE_PATH=${packagedNodeModules}`);
  return originalSpawn.call(
    this,
    command,
    ["--require", LOCAL_RUNTIME, ...args],
    { ...options, env }
  );
};

app.on("browser-window-created", (_event, window) => {
  desktopWindow = window;
  window.webContents.on("did-start-navigation", (_navigationEvent, url) => {
    appendDesktopLog(`navigation started: ${url}`);
  });
  window.webContents.on("did-fail-load", (_loadEvent, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    if (isMainFrame) appendDesktopLog(`navigation failed: code=${errorCode} description=${errorDescription} url=${validatedUrl}`);
  });
  window.webContents.on("did-finish-load", () => {
    const currentUrl = String(window.webContents.getURL() || "");
    appendDesktopLog(`navigation finished: ${currentUrl}`);
    if (isPlayableUrl(currentUrl)) writeReadyMarker(currentUrl);
  });
});

process.on("uncaughtException", (error) => {
  appendDesktopLog(`uncaught exception: ${error?.stack || error}`);
});

process.on("unhandledRejection", (reason) => {
  appendDesktopLog(`unhandled rejection: ${reason?.stack || reason}`);
});

require("./main.js");
