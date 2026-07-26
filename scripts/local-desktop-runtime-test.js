"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const runtime = require("../desktop/runtime-local.js");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "server", "server-v3.js"), "utf8");
const gatewaySource = fs.readFileSync(path.join(root, "server", "secure-gateway.js"), "utf8");
const patchedServer = runtime.patchServerSource(serverSource);
const patchedGateway = runtime.patchGatewaySource(gatewaySource);
new vm.Script(patchedServer, { filename: "server-v3.desktop-local.js" });
new vm.Script(patchedGateway, { filename: "secure-gateway.desktop-local.js" });

assert.match(patchedServer, /TRIAD_MATCH_MINUTES \|\| 10/);
assert.match(patchedServer, /TRIAD_LOCAL_STATE_RATE \|\| 20/);
assert.match(patchedServer, /STATE_RATE \* 4/);
assert.match(patchedServer, /STATE_RATE \* 8/);
assert.match(patchedServer, /desktop-local-authoritative-v27/);
assert.match(patchedServer, /questionStudentTurn/);
assert.match(patchedGateway, /desktop-local-authoritative-v27/);

console.log("Desktop local runtime validation passed: configurable duration, 20 Hz loopback snapshots and fair student question rotation are active.");
