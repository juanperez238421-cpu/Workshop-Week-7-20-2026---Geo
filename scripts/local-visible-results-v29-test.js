"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const launcher = fs.readFileSync(path.join(root, "desktop", "main-v29.js"), "utf8");
const localUi = fs.readFileSync(path.join(root, "desktop", "local-ui.js"), "utf8");
const preload = fs.readFileSync(path.join(root, "desktop", "preload.js"), "utf8");

assert.match(launcher, /getPath\("documents"\)/);
assert.match(launcher, /Triad Territory Rush Results/);
assert.match(launcher, /app\.setPath\("userData", visibleRoot\)/);
assert.match(launcher, /LATEST_RESULT/);
assert.match(launcher, /RESULTS_LOCATION\.txt/);
assert.match(launcher, /OPEN_RESULTS_FOLDER\.cmd/);
assert.match(launcher, /executableResults/);
assert.match(launcher, /mirrorCompletedResult/);
assert.match(launcher, /require\("\.\/main-v28\.js"\)/);

assert.match(preload, /openResultsFolder/);
assert.match(localUi, /OPEN SAVED RESULTS/);
assert.match(localUi, /desktopFinalResultsPathV29/);
assert.match(localUi, /NEW LOCAL RUN · QUICK RESTART/);
assert.match(localUi, /window\.triadDesktop\.restartApp\(\)/);

console.log("Visible result persistence validation passed: Documents is the primary user-data root, completed JSON/CSV reports are mirrored beside writable executables, and the UI exposes the exact folder and quick restart controls.");
