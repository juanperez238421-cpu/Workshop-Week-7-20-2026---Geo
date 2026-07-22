"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const realCrypto = require("node:crypto");
const { patchServerSource } = require(path.join(process.cwd(), "server", "runtime-v7.js"));

const source = fs.readFileSync(path.join(process.cwd(), "server", "server-v3.js"), "utf8");
const patched = patchServerSource(source);
new vm.Script(patched, { filename: "server-v3.geometry-question-bank-v7.js" });

assert.match(patched, /ratio_sin/);
assert.match(patched, /ratio_cos/);
assert.match(patched, /opposite \/ hypotenuse/);
assert.match(patched, /adjacent \/ hypotenuse/);
assert.match(patched, /Do not calculate a decimal value/);
assert.match(patched, /type: "thales_height"/);
assert.match(patched, /Thales' theorem and similar triangles/);
assert.match(patched, /Determine the unknown hypotenuse/);
assert.match(patched, /Determine the unknown opposite leg/);
assert.match(patched, /Determine the unknown adjacent leg/);
assert.doesNotMatch(patched, /Find the opposite side using tan/);

const fakeServer = { on(){}, listen(){}, close(callback){ if (callback) callback(); } };
const fakeApp = { disable(){}, use(){}, get(){} };
function fakeExpress(){ return fakeApp; }
fakeExpress.json = () => () => {};
class FakeWss { constructor(){ this.clients = []; } on(){} handleUpgrade(){} }
class FakeWebSocket {}
FakeWebSocket.OPEN = 1;

const context = {
  require(name) {
    if (name === "node:crypto") return realCrypto;
    if (name === "node:http") return { createServer: () => fakeServer };
    if (name === "express") return fakeExpress;
    if (name === "ws") return { WebSocketServer: FakeWss, WebSocket: FakeWebSocket };
    throw new Error(`Unexpected require: ${name}`);
  },
  console,
  process: { env: {}, uptime: () => 1, on(){}, exit(){} },
  setInterval: () => 1,
  clearInterval(){},
  setTimeout: () => 1,
  Map, Set, Date, Math, JSON, String, Number, Boolean, Array, Object, Int8Array, parseInt
};
context.globalThis = context;
vm.runInNewContext(`${patched}\nglobalThis.__createQuestion = createQuestion;`, context, { filename: "server-v3.geometry-question-bank-v7.runtime.js" });

const seen = new Set();
for (let index = 0; index < 600; index += 1) {
  const question = context.__createQuestion();
  seen.add(question.type);
  assert.equal(question.options.length, 4);
  assert.ok(question.answerIndex >= 0 && question.answerIndex < 4);
  assert.ok(question.expiresAt > question.createdAt);

  if (question.type === "ratio_sin") {
    assert.equal(question.diagram.type, "ratio");
    assert.match(question.options[question.answerIndex], /sin\(θ\) = opposite \/ hypotenuse/);
    assert.match(question.prompt, /Do not calculate a decimal value/);
  } else if (question.type === "ratio_cos") {
    assert.equal(question.diagram.type, "ratio");
    assert.match(question.options[question.answerIndex], /cos\(θ\) = adjacent \/ hypotenuse/);
    assert.match(question.prompt, /Do not calculate a decimal value/);
  } else if (question.type === "pythagoras") {
    assert.equal(question.diagram.type, "pythagoras");
    const unknowns = [question.diagram.adjacent, question.diagram.opposite, question.diagram.hypotenuse].filter((value) => value === "?");
    assert.equal(unknowns.length, 1);
    assert.match(question.options[question.answerIndex], /units$/);
  } else if (question.type === "thales_height") {
    assert.equal(question.diagram.type, "thales_height");
    assert.equal(question.diagram.targetHeight, "?");
    assert.match(question.prompt, /determine its height h/i);
    assert.match(question.options[question.answerIndex], /m$/);
  } else {
    assert.fail(`Unexpected question type: ${question.type}`);
  }
}

assert.deepEqual([...seen].sort(), ["pythagoras", "ratio_cos", "ratio_sin", "thales_height"]);

const ui = fs.readFileSync(path.join(process.cwd(), "question-bank-ui.js"), "utf8");
new vm.Script(ui, { filename: "question-bank-ui.js" });
assert.match(ui, /drawRightTriangleDiagram/);
assert.match(ui, /drawThalesDiagram/);
assert.match(ui, /SIN AND COS · SIDE RELATIONSHIPS/);
assert.match(ui, /THALES' THEOREM · SIMILAR TRIANGLES/);

const html = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf8");
assert.match(html, /question-bank-ui\.js/);
assert.match(html, /identify a sine or cosine ratio/);
assert.match(html, /find a height using Thales' theorem/);

console.log("Question bank v7 test passed: ratio recognition, unknown right-triangle sides and Thales height problems compile and generate valid four-option questions.");
