"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { containsBannedLanguage } = require("./moderation.js");
const { patchServerSource } = require("./start.js");

const bannedWords = [
  "fuck", "shit", "bitch", "cunt", "asshole", "dick", "pussy",
  "mierda", "puta", "puto", "putas", "putos", "hijueputa", "hpta",
  "gonorrea", "marica", "maricon", "pendejo", "pendeja", "cabron",
  "cabrona", "malparido", "malparida"
];

for (const safeName of [
  "Computadora Team",
  "Laboratorio de Computadoras",
  "Deputados Geometry",
  "Reputation Rangers",
  "Pythagoras Pulse",
  "Triangle Titans"
]) {
  assert.equal(
    containsBannedLanguage(safeName, bannedWords),
    false,
    `Expected safe name to pass: ${safeName}`
  );
}

for (const prohibitedName of [
  "puta",
  "Team mierda",
  "F.U.C.K",
  "f*ck",
  "p-u-t-a",
  "sh1t",
  "hpta"
]) {
  assert.equal(
    containsBannedLanguage(prohibitedName, bannedWords),
    true,
    `Expected prohibited name to be rejected: ${prohibitedName}`
  );
}

const serverSource = fs.readFileSync(path.join(__dirname, "server-v3.js"), "utf8");
const patchedSource = patchServerSource(serverSource);
assert.match(patchedSource, /require\("\.\/moderation\.js"\)\.containsBannedLanguage/);
assert.doesNotMatch(patchedSource, /compact\.includes\(canonicalText\(word\)\)/);

console.log("Moderation tests passed: legitimate words remain valid and direct/obfuscated profanity is blocked.");
