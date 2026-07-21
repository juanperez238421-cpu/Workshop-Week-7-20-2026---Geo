"use strict";

const fs = require("node:fs");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const html = fs.readFileSync("index.html", "utf8");
const client = fs.readFileSync("online-client.js", "utf8");
const server = fs.readFileSync("server/server.js", "utf8");
const config = fs.readFileSync("config.js", "utf8");
const css = fs.readFileSync("online.css", "utf8");

new vm.Script(client, { filename: "online-client.js" });
new vm.Script(server, { filename: "server/server.js" });
new vm.Script(config, { filename: "config.js" });

const htmlIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
const clientIds = new Set([...client.matchAll(/\$\("([^"]+)"\)/g)].map((match) => match[1]));
const missingIds = [...clientIds].filter((id) => !htmlIds.has(id));

assert.deepEqual(missingIds, [], `Missing HTML ids: ${missingIds.join(", ")}`);
assert.match(server, /MATCH_DURATION_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/);
assert.match(server, /MAX_PLAYERS\s*=\s*9/);
assert.match(server, /PLAYERS_PER_TEAM\s*=\s*3/);
assert.match(server, /winnerRule:\s*"largest-territory"/);
assert.match(server, /currentQuestion/);
assert.match(server, /handleAnswer/);
assert.match(server, /WebSocketServer/);
assert.match(server, /sessionToken/);
assert.match(client, /create_room/);
assert.match(client, /join_room/);
assert.match(client, /reportToCsv/);
assert.match(html, /9 COMPUTERS/);
assert.match(html, /DOWNLOAD CSV/);
assert.match(html, /DOWNLOAD JSON/);
assert.match(css, /\.room-panel/);

console.log(`Smoke test passed: ${htmlIds.size} DOM ids, ${clientIds.size} client references, authoritative 9-player server rules present.`);
