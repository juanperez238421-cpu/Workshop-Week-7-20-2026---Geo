"use strict";

const fs = require("node:fs");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const zlib = require("node:zlib");

const html = fs.readFileSync("index.html", "utf8");
const loader = fs.readFileSync("game.js", "utf8");
const css = fs.readFileSync("styles.css", "utf8");
const js = zlib.gunzipSync(fs.readFileSync("game-source.js.gz")).toString("utf8");

new vm.Script(loader, { filename: "game.js" });
new vm.Script(js, { filename: "triad-territory-rush.js" });

const htmlIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
const jsIds = new Set([...js.matchAll(/getElementById\("([^"]+)"\)/g)].map((match) => match[1]));
const missingIds = [...jsIds].filter((id) => !htmlIds.has(id));

assert.deepEqual(missingIds, [], `Missing HTML ids: ${missingIds.join(", ")}`);
assert.match(loader, /DecompressionStream/);
assert.match(js, /matchDurationMs:\s*5\s*\*\s*60\s*\*\s*1000/);
assert.match(js, /players:\s*9/);
assert.match(js, /playersPerTeam:\s*3/);
assert.match(js, /largest-territory/);
assert.match(js, /createRespawnQuestion/);
assert.match(js, /questionStats/);
assert.match(js, /reportToCsv/);
assert.match(js, /application\/json/);
assert.match(html, /DOWNLOAD CSV/);
assert.match(html, /DOWNLOAD JSON/);
assert.match(css, /\.question-modal/);

console.log(`Smoke test passed: compressed game source parses, ${htmlIds.size} DOM ids, ${jsIds.size} JavaScript DOM references.`);
