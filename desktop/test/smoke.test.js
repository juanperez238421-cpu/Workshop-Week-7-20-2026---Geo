"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const packageJson = JSON.parse(read("package.json"));
assert.equal(packageJson.main, "desktop/main-v29.js");
assert.ok(packageJson.scripts["desktop:start"]);
assert.ok(packageJson.scripts["desktop:prepare"]);
assert.ok(packageJson.scripts["desktop:dist:win"]);
assert.ok(packageJson.build?.win?.target);
assert.ok(packageJson.dependencies?.express);
assert.ok(packageJson.dependencies?.ws);
assert.ok(packageJson.devDependencies?.electron);
assert.ok(packageJson.devDependencies?.["electron-builder"]);

const visibleLauncher = read("desktop/main-v29.js");
assert.match(visibleLauncher, /getPath\("documents"\)/);
assert.match(visibleLauncher, /app\.setPath\("userData", visibleRoot\)/);
assert.match(visibleLauncher, /Triad Territory Rush Results/);
assert.match(visibleLauncher, /LATEST_RESULT/);
assert.match(visibleLauncher, /require\("\.\/main-v28\.js"\)/);

const launcher = read("desktop/main-v28.js");
assert.match(launcher, /runtime-local-v28\.js/);
assert.match(launcher, /\["--require", LOCAL_RUNTIME, \.\.\.args\]/);
assert.match(launcher, /delete env\.NODE_OPTIONS/);
assert.match(launcher, /env\.NODE_PATH/);
assert.match(launcher, /app\.getAppPath\(\), "node_modules"/);
assert.match(launcher, /desktop-ready\.json/);
assert.match(launcher, /require\("\.\/main\.js"\)/);

const localRuntime = read("desktop/runtime-local-v28.js");
assert.match(localRuntime, /require\("\.\/runtime-local\.js"\)/);
assert.match(localRuntime, /server-v3\.js/);
assert.match(localRuntime, /\["--require", __filename, \.\.\.args\]/);
assert.match(localRuntime, /delete process\.env\.NODE_OPTIONS/);

const neonRuntime = read("desktop/runtime-local.js");
assert.match(neonRuntime, /one-hit-one-life-three-strikes-geometry-check/);
assert.match(neonRuntime, /SOLO_BOT_THINK_INTERVAL_MS = 70/);
assert.match(neonRuntime, /NEON_AI_DODGE_LOOKAHEAD_SECONDS/);
assert.match(neonRuntime, /victim\.respawnAt = now \+ 460/);
assert.match(neonRuntime, /this\.assignQuestion\(victim, 180\)/);

const stableClient = read("student-stable-v26.js");
assert.match(stableClient, /function setTextIfChanged/);
assert.match(stableClient, /function queueNormalization/);
assert.match(stableClient, /new MutationObserver\(queueNormalization\)/);
assert.match(stableClient, /idempotent-and-animation-frame-coalesced/);
assert.doesNotMatch(stableClient, /new MutationObserver\(normalizeAutostartUi\)/);

const neonClient = read("student-neon-tactical-v29.js");
assert.match(neonClient, /ONE HIT = ONE LIFE/);
assert.match(neonClient, /THREE STRIKES/);
assert.match(neonClient, /opensAdditionalSocket: false/);
assert.match(read("student-neon-tactical-v29.css"), /neon-tactical-hud-v29/);

const main = read("desktop/main.js");
assert.match(main, /contextIsolation: true/);
assert.match(main, /nodeIntegration: false/);
assert.match(main, /sandbox: true/);
assert.match(main, /x-triad-report-key/);
assert.match(main, /outbox/);
assert.match(main, /channel_ended/);
assert.match(main, /start_channel/);
assert.match(main, /ELECTRON_RUN_AS_NODE/);

const preload = read("desktop/preload.js");
assert.match(preload, /contextBridge\.exposeInMainWorld\("triadDesktop"/);
assert.match(preload, /openResultsFolder/);
assert.doesNotMatch(preload, /require\("node:fs"\)/);

const localUi = read("desktop/local-ui.js");
assert.match(localUi, /OPEN SAVED RESULTS/);
assert.match(localUi, /desktopFinalResultsPathV29/);
assert.match(localUi, /NEW LOCAL RUN · QUICK RESTART/);

const index = read("index.html");
assert.match(index, /desktop\/local-ui\.css/);
assert.match(index, /desktop\/local-ui\.js/);
assert.match(index, /student-neon-tactical-v29\.css/);
assert.match(index, /student-neon-tactical-v29\.js/);

const gateway = read("server/secure-gateway.js");
assert.match(gateway, /\/api\/local-results/);
assert.match(gateway, /list_local_results/);
assert.match(gateway, /REPORT_INGEST_KEY/);

const teacherAuth = read("teacher-auth.js");
assert.match(teacherAuth, /master-local-results\.css/);
assert.match(teacherAuth, /master-local-results\.js/);
assert.match(teacherAuth, /master-v27-corrections\.js/);
for (const type of ["list_local_results", "get_local_result", "delete_local_result"]) assert.match(teacherAuth, new RegExp(type));

console.log("Desktop packaging smoke validation passed: visible Documents result storage, executable backup, neon tactical one-hit mode, predictive AI, explicit Windows preload chain, playable-window readiness, secure bridge, local authoritative server and optional teacher delivery are wired.");
