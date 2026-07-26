"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const packageJson = JSON.parse(read("package.json"));
assert.equal(packageJson.main, "desktop/main-v28.js");
assert.ok(packageJson.scripts["desktop:start"]);
assert.ok(packageJson.scripts["desktop:prepare"]);
assert.ok(packageJson.scripts["desktop:dist:win"]);
assert.ok(packageJson.build?.win?.target);
assert.ok(packageJson.dependencies?.ws);
assert.ok(packageJson.devDependencies?.electron);
assert.ok(packageJson.devDependencies?.["electron-builder"]);

const launcher = read("desktop/main-v28.js");
assert.match(launcher, /runtime-local-v28\.js/);
assert.match(launcher, /\["--require", LOCAL_RUNTIME, \.\.\.args\]/);
assert.match(launcher, /delete env\.NODE_OPTIONS/);
assert.match(launcher, /desktop-ready\.json/);
assert.match(launcher, /require\("\.\/main\.js"\)/);

const localRuntime = read("desktop/runtime-local-v28.js");
assert.match(localRuntime, /require\("\.\/runtime-local\.js"\)/);
assert.match(localRuntime, /server-v3\.js/);
assert.match(localRuntime, /\["--require", __filename, \.\.\.args\]/);
assert.match(localRuntime, /delete process\.env\.NODE_OPTIONS/);

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
assert.doesNotMatch(preload, /require\("node:fs"\)/);

const index = read("index.html");
assert.match(index, /desktop\/local-ui\.css/);
assert.match(index, /desktop\/local-ui\.js/);

const gateway = read("server/secure-gateway.js");
assert.match(gateway, /\/api\/local-results/);
assert.match(gateway, /list_local_results/);
assert.match(gateway, /REPORT_INGEST_KEY/);

const teacherAuth = read("teacher-auth.js");
assert.match(teacherAuth, /master-local-results\.css/);
assert.match(teacherAuth, /master-local-results\.js/);
assert.match(teacherAuth, /master-v27-corrections\.js/);
for (const type of ["list_local_results", "get_local_result", "delete_local_result"]) assert.match(teacherAuth, new RegExp(type));

console.log("Desktop packaging smoke validation passed: explicit Windows preload chain, playable-window readiness marker, secure Electron bridge, local authoritative server, queued delivery and Master result inbox are wired.");
