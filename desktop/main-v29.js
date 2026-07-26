"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const originalWriteFileSync = fs.writeFileSync.bind(fs);
const originalRenameSync = fs.renameSync.bind(fs);
const originalCopyFileSync = fs.copyFileSync.bind(fs);

function safeDirectory(directory) {
  try {
    fs.mkdirSync(directory, { recursive: true });
    return directory;
  } catch {
    return "";
  }
}

function resolveDocumentsDirectory() {
  try {
    const directory = app.getPath("documents");
    if (directory) return directory;
  } catch {}
  return path.join(os.homedir(), "Documents");
}

const visibleRoot = safeDirectory(path.join(resolveDocumentsDirectory(), "Triad Territory Rush Results"));
const visibleResults = safeDirectory(path.join(visibleRoot, "results"));
const executableRoot = path.dirname(process.execPath);
const executableResults = safeDirectory(path.join(executableRoot, "Triad Territory Rush Results"));
const readinessBridge = safeDirectory(path.join(String(process.env.APPDATA || os.tmpdir()), "Triad Territory Rush Local", "readiness"));

if (visibleRoot) {
  app.setName("Triad Territory Rush Local");
  app.setPath("userData", visibleRoot);
}

app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");

function writeLocationGuide(directory) {
  if (!directory || !visibleResults) return;
  const guide = [
    "TRIAD TERRITORY RUSH — LOCAL RESULTS",
    "",
    `Primary results folder: ${visibleResults}`,
    executableResults ? `Executable backup folder: ${executableResults}` : "Executable backup folder: unavailable (read-only installation directory)",
    "",
    "Every completed match creates:",
    "- a complete JSON report",
    "- an Excel-compatible CSV summary",
    "- LATEST_RESULT.json and LATEST_RESULT.csv shortcuts in the Documents folder.",
    "",
    "Use OPEN_RESULTS_FOLDER.cmd to open the primary results folder."
  ].join("\r\n");
  try { originalWriteFileSync(path.join(directory, "RESULTS_LOCATION.txt"), guide, "utf8"); } catch {}
  try {
    originalWriteFileSync(
      path.join(directory, "OPEN_RESULTS_FOLDER.cmd"),
      `@echo off\r\nstart \"\" explorer.exe \"${visibleResults.replace(/"/g, '""')}\"\r\n`,
      "utf8"
    );
  } catch {}
}

writeLocationGuide(visibleRoot);
if (executableRoot !== visibleRoot) writeLocationGuide(executableRoot);

function isCompletedResultFile(target) {
  if (!visibleResults || typeof target !== "string") return false;
  const resolved = path.resolve(target);
  const resultsPrefix = `${path.resolve(visibleResults)}${path.sep}`;
  if (!resolved.startsWith(resultsPrefix)) return false;
  return /\.(json|csv)$/i.test(resolved) && !/\.tmp$/i.test(resolved);
}

function mirrorCompletedResult(target) {
  if (!isCompletedResultFile(target)) return;
  const extension = path.extname(target).toLowerCase();
  const filename = path.basename(target);

  try { originalCopyFileSync(target, path.join(visibleRoot, `LATEST_RESULT${extension}`)); } catch {}
  try {
    originalWriteFileSync(
      path.join(visibleRoot, "LAST_SAVED_RESULT.txt"),
      `Saved: ${new Date().toLocaleString()}\r\nPrimary file: ${target}\r\n`,
      "utf8"
    );
  } catch {}

  if (executableResults && path.resolve(executableResults) !== path.resolve(visibleResults)) {
    try { originalCopyFileSync(target, path.join(executableResults, filename)); } catch {}
    try { originalCopyFileSync(target, path.join(executableResults, `LATEST_RESULT${extension}`)); } catch {}
  }
}

function mirrorReadinessMarker(target, data) {
  if (!readinessBridge || path.basename(String(target || "")).toLowerCase() !== "desktop-ready.json") return;
  try { originalWriteFileSync(path.join(readinessBridge, "desktop-ready.json"), data, "utf8"); } catch {}
}

fs.writeFileSync = function triadVisibleResultWrite(target, data, options) {
  const result = originalWriteFileSync(target, data, options);
  try { mirrorCompletedResult(String(target)); } catch {}
  try { mirrorReadinessMarker(String(target), data); } catch {}
  return result;
};

fs.renameSync = function triadVisibleResultRename(oldPath, newPath) {
  const result = originalRenameSync(oldPath, newPath);
  try { mirrorCompletedResult(String(newPath)); } catch {}
  return result;
};

process.env.TRIAD_VISIBLE_RESULTS_ROOT = visibleRoot;
process.env.TRIAD_VISIBLE_RESULTS_DIR = visibleResults;
process.env.TRIAD_EXECUTABLE_RESULTS_DIR = executableResults;

require("./main-v28.js");
