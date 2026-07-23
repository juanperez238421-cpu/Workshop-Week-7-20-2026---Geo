"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const runtime = require("../server/runtime-v14.js");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "server", "server-v3.js"), "utf8");
const gatewaySource = fs.readFileSync(path.join(root, "server", "secure-gateway.js"), "utf8");
const patchedServer = runtime.patchServerSource(serverSource);
const patchedGateway = runtime.patchGatewaySource(gatewaySource);
new vm.Script(patchedServer, { filename: "server-v3.geometry-v19.js" });
new vm.Script(patchedGateway, { filename: "secure-gateway.geometry-v19.js" });

for (const required of [
  '"ratio_sin"',
  '"ratio_cos"',
  '"pythagoras"',
  '"thales_height"',
  "opposite / hypotenuse",
  "adjacent / hypotenuse",
  "Do not calculate a decimal value",
  "knownSides: 2",
  "a² + b² = c²",
  "reference height / reference shadow = h / target shadow"
]) assert.ok(patchedServer.includes(required), `missing focused geometry marker: ${required}`);

assert.doesNotMatch(patchedServer, /Find the opposite side using tan/);
assert.doesNotMatch(patchedServer, /inverse[- ]angle/i);

const fakeServer = { on(){}, listen(){}, close(callback){ if (callback) callback(); } };
const fakeApp = { disable(){}, use(){}, get(){} };
function fakeExpress(){ return fakeApp; }
fakeExpress.json = () => () => {};
class FakeWss { constructor(){ this.clients = []; } on(){} handleUpgrade(){} }
class FakeWebSocket {}
FakeWebSocket.OPEN = 1;

const context = {
  require(name) {
    if (name === "node:crypto") return crypto;
    if (name === "node:fs") return fs;
    if (name === "node:path") return path;
    if (name === "node:http") return { createServer: () => fakeServer };
    if (name === "express") return fakeExpress;
    if (name === "ws") return { WebSocketServer: FakeWss, WebSocket: FakeWebSocket };
    throw new Error(`Unexpected require: ${name}`);
  },
  __dirname: path.join(root, "server"),
  console,
  process: { env: { GLOBAL_SCORE_FILE: path.join(root, "server", ".test-global-score-v19.json") }, uptime: () => 1, on(){}, exit(){} },
  setInterval: () => 1,
  clearInterval(){},
  setTimeout: () => 1,
  Map, Set, WeakMap, Date, Math, JSON, String, Number, Boolean, Array, Object, Int8Array, Uint8ClampedArray, parseInt
};
context.globalThis = context;
vm.runInNewContext(`${patchedServer}\nglobalThis.__createQuestion = createQuestion;`, context, { filename: "server-v3.geometry-v19-runtime.js" });

const seen = new Set();
for (let index = 0; index < 800; index += 1) {
  const question = context.__createQuestion();
  seen.add(question.type);
  assert.ok(["ratio_sin", "ratio_cos", "pythagoras", "thales_height"].includes(question.type));
  assert.equal(question.options.length, 4);
  assert.ok(question.answerIndex >= 0 && question.answerIndex < question.options.length);
  assert.ok(question.expiresAt > question.createdAt);

  if (question.type === "ratio_sin" || question.type === "ratio_cos") {
    assert.equal(question.diagram.type, "ratio");
    assert.equal(question.diagram.showAllSides, true);
    assert.ok(Number.isFinite(question.diagram.legA));
    assert.ok(Number.isFinite(question.diagram.legB));
    assert.ok(Number.isFinite(question.diagram.hypotenuse));
    assert.match(question.prompt, /All three side lengths are shown/);
    assert.match(question.prompt, /Do not calculate a decimal value/);
    const correct = question.options[question.answerIndex];
    if (question.type === "ratio_sin") assert.match(correct, /sin\(.+\) = opposite \/ hypotenuse = \d+\/\d+/);
    else assert.match(correct, /cos\(.+\) = adjacent \/ hypotenuse = \d+\/\d+/);
  } else if (question.type === "pythagoras") {
    assert.equal(question.diagram.type, "pythagoras");
    assert.equal(question.diagram.knownSides, 2);
    assert.equal([question.diagram.legA, question.diagram.legB, question.diagram.hypotenuse].filter((value) => value === "?").length, 1);
    assert.match(question.prompt, /Pythagorean theorem/);
    assert.match(question.options[question.answerIndex], / units$/);
  } else {
    assert.equal(question.diagram.type, "thales_height");
    assert.equal(question.diagram.targetHeight, "?");
    assert.ok(Number(question.diagram.referenceHeight) > 0);
    assert.ok(Number(question.diagram.referenceShadow) > 0);
    assert.ok(Number(question.diagram.targetShadow) > 0);
    assert.match(question.prompt, /Thales' theorem and similar triangles/);
    assert.match(question.prompt, /unknown height h/);
    assert.match(question.options[question.answerIndex], / m$/);
  }
}

assert.deepEqual([...seen].sort(), ["pythagoras", "ratio_cos", "ratio_sin", "thales_height"]);

const ui = fs.readFileSync(path.join(root, "question-ui-v19.js"), "utf8");
new vm.Script(ui, { filename: "question-ui-v19.js" });
assert.match(ui, /ALL THREE SIDES GIVEN · NO DECIMAL CALCULATION/);
assert.match(ui, /TWO SIDES GIVEN · PYTHAGOREAN THEOREM/);
assert.match(ui, /THALES' THEOREM · SIMILAR TRIANGLES/);
assert.match(ui, /sin = opposite \/ hypotenuse/);
assert.match(ui, /cos = adjacent \/ hypotenuse/);
assert.match(ui, /reference height \/ reference shadow = h \/ target shadow/);

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.match(html, /GEOMETRY BANK V19/i);
assert.match(html, /question-ui-v19\.js/);
assert.ok(html.indexOf("question-ui-v19.js") < html.indexOf("student-app-v16.js"));

const serverPackage = JSON.parse(fs.readFileSync(path.join(root, "server", "package.json"), "utf8"));
assert.equal(serverPackage.scripts.start, "node --require ./runtime-v15.js secure-gateway.js");

console.log("Focused Geometry v19 test passed beneath runtime v15: the question bank remains limited to sine/cosine ratios, exact Pythagorean unknown sides and Thales heights.");
