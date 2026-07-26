"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, ipcMain, shell } = require("electron");

app.setName("Neon Geometry Tactical Pixel Local");

const APP_VERSION = "48.0.0";
let mainWindow = null;

function safeDirectory(target) {
  fs.mkdirSync(target, { recursive: true });
  return target;
}

function resultRoot() {
  const documents = app.getPath("documents");
  return safeDirectory(path.join(documents, "Neon Geometry Tactical Results"));
}

function resultDirectory() {
  return safeDirectory(path.join(resultRoot(), "results"));
}

function log(message) {
  try {
    const dir = safeDirectory(path.join(app.getPath("userData"), "logs"));
    fs.appendFileSync(path.join(dir, "desktop.log"), `[${new Date().toISOString()}] ${message}\n`, "utf8");
  } catch {}
}

function sanitizeFilePart(value) {
  return String(value || "result")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "result";
}

function writeResult(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Invalid result payload.");
  const id = sanitizeFilePart(payload.id || `match-${Date.now()}`);
  const jsonText = typeof payload.json === "string" ? payload.json : JSON.stringify(payload.json || payload, null, 2);
  const csvText = typeof payload.csv === "string" ? payload.csv : "";
  const dir = resultDirectory();
  const jsonPath = path.join(dir, `${id}.json`);
  const csvPath = path.join(dir, `${id}.csv`);
  fs.writeFileSync(jsonPath, jsonText, "utf8");
  if (csvText) fs.writeFileSync(csvPath, csvText, "utf8");

  fs.writeFileSync(path.join(resultRoot(), "LATEST_RESULT.json"), jsonText, "utf8");
  if (csvText) fs.writeFileSync(path.join(resultRoot(), "LATEST_RESULT.csv"), csvText, "utf8");
  fs.writeFileSync(path.join(resultRoot(), "RESULTS_LOCATION.txt"), `${dir}\n`, "utf8");
  fs.writeFileSync(path.join(resultRoot(), "OPEN_RESULTS_FOLDER.cmd"), `@echo off\r\nexplorer "${dir}"\r\n`, "utf8");
  fs.writeFileSync(path.join(resultRoot(), "LAST_SAVED_RESULT.txt"), `${new Date().toISOString()}\r\n${jsonPath}\r\n${csvPath}\r\n`, "utf8");
  log(`result saved: ${jsonPath}`);
  return { directory: dir, jsonPath, csvPath: csvText ? csvPath : null };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 930,
    minWidth: 1180,
    minHeight: 720,
    show: false,
    backgroundColor: "#050711",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file:")) event.preventDefault();
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => log(`renderer gone: ${JSON.stringify(details)}`));
  mainWindow.webContents.on("did-fail-load", (_event, code, description, url) => log(`load failed ${code} ${description} ${url}`));
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

ipcMain.handle("school-game:save-result", (_event, payload) => writeResult(payload));
ipcMain.handle("school-game:open-results", async () => {
  const dir = resultDirectory();
  const error = await shell.openPath(dir);
  if (error) throw new Error(error);
  return dir;
});
ipcMain.handle("school-game:get-results-path", () => resultDirectory());
ipcMain.handle("school-game:restart", () => {
  app.relaunch();
  app.exit(0);
});
ipcMain.on("school-game:ready", () => {
  try {
    const ready = path.join(app.getPath("userData"), "ready.json");
    fs.writeFileSync(ready, JSON.stringify({ ready: true, version: APP_VERSION, edition: "pixel-art-armor-maps-v31", at: new Date().toISOString() }, null, 2), "utf8");
    log("pixel-art game ready");
  } catch (error) {
    log(`ready marker failed: ${error?.stack || error}`);
  }
});

app.whenReady().then(() => {
  resultDirectory();
  createWindow();
});

app.on("window-all-closed", () => app.quit());
process.on("uncaughtException", (error) => log(`uncaught exception: ${error?.stack || error}`));
process.on("unhandledRejection", (error) => log(`unhandled rejection: ${error?.stack || error}`));
