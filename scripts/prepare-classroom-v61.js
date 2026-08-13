"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");

const root = path.join(__dirname, "..");
const sourceDir = path.join(root, "school-game", "v60");
const targetDir = path.join(root, "school-game", "v61");
const files = ["game.js", "index.html", "styles.css", "main.js", "preload.js"];
const inputHashes = Object.freeze({
  "game.js": "c59c2edd54fe54d867acc30b53e995e9f299c880ba69d49d6e67995cbe600025",
  "index.html": "a6c084f699fb7abb69391c64a69690c2d7acaa1853b90219796152907f1e2aeb",
  "styles.css": "776da6d61e8f4ba51e53d297bb3a22e7d36a3e20bece6d563d604d480b5e993d",
  "main.js": "1aad16703db2b1343dc3fab41bc3d0cbcb9143d430e1fcb948abd8a42f6279a0",
  "preload.js": "8f07b25ce0493bbd973d356085c558feb47a638c9cce895f9e89f43dbaf4cac9"
});
const outputHashes = Object.freeze({
  "game.js": "8be64392a5022b43f969ce3fa7eb37ec69f5bd9a985bd6dafed7c69272ee4ee3",
  "index.html": "f20c2f3513b87249bb1a860a4f44fdbf2b03c844969b7ad475f98265cea0ba5c",
  "styles.css": "9b946a5d13352c93fc4bcfe8eeedbac272c141a28c4184363e2a79ef04c3662c",
  "main.js": "b2e4c4b841243964426f04d5a53f1b9be32045fbb2e8b1debfe7bdcbf0a22a45",
  "preload.js": "8f07b25ce0493bbd973d356085c558feb47a638c9cce895f9e89f43dbaf4cac9"
});
const thalesBlock = zlib.gunzipSync(Buffer.from("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", "base64")).toString("utf8");
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");

function once(source, search, replacement, label) {
  const at = source.indexOf(search);
  if (at < 0) throw new Error(`V61 patch signature missing: ${label}`);
  if (source.indexOf(search, at + search.length) >= 0) throw new Error(`V61 patch signature ambiguous: ${label}`);
  return source.slice(0, at) + replacement + source.slice(at + search.length);
}

require("./prepare-classroom-v60.js");
for (const file of files) {
  const source = fs.readFileSync(path.join(sourceDir, file), "utf8");
  if (sha(source) !== inputHashes[file]) throw new Error(`Unexpected V60 source hash for ${file}.`);
}

let game = fs.readFileSync(path.join(sourceDir, "game.js"), "utf8");
const start = '    if (question.type === "thales") {';
const end = '\n    if (question.type === "pythagoras") {';
const a = game.indexOf(start), b = game.indexOf(end, a);
if (a < 0 || b < 0 || game.indexOf(start, a + start.length) >= 0) throw new Error("V61 Thales block boundaries are invalid.");
game = game.slice(0, a) + thalesBlock + game.slice(b);
game = once(game, 'const VERSION = "60.0.0";', 'const VERSION = "61.0.0";', "renderer version");
game = once(game, 'const EDITION = "classroom-thales-pause-v60";', 'const EDITION = "classroom-triangle-line-separation-v61";', "renderer edition");
game = once(game, '`v60-8${gradeGroup}-${secureId}`', '`v61-8${gradeGroup}-${secureId}`', "result prefix");
game = once(game, 'reportSchema: 60,', 'reportSchema: 61,', "report schema");
game = once(game,
  '        thalesCollisionFreeLabels: true,\n        thalesVertexLabels: true,',
  '        thalesCollisionFreeLabels: true,\n        thalesVertexLabels: true,\n        thalesOutwardLeaderRouting: true,\n        thalesLeaderUnderpaint: true,\n        thalesCoincidentSideHighlight: true,\n        thalesParallelSegmentHalo: true,\n        thalesLineSeparationVersion: 61,',
  "V61 renderer contracts");

let main = fs.readFileSync(path.join(sourceDir, "main.js"), "utf8");
main = once(main, 'const APP_VERSION = "60.0.0";', 'const APP_VERSION = "61.0.0";', "main version");
main = once(main, 'const EDITION = "classroom-thales-pause-v60";', 'const EDITION = "classroom-triangle-line-separation-v61";', "main edition");
main = once(main, 'process.env.V60_TEACHER_PIN || process.env.V59_TEACHER_PIN', 'process.env.V61_TEACHER_PIN || process.env.V60_TEACHER_PIN || process.env.V59_TEACHER_PIN', "teacher PIN env");
main = main.replaceAll('Geometry Tactical Classroom V60', 'Geometry Tactical Classroom V61');
main = once(main, '"protected-results-v60"', '"protected-results-v61"', "data directory");
main = once(main, '"geometry-tactical-v60.vault.json"', '"geometry-tactical-v61.vault.json"', "vault file");
main = once(main, 'function legacyV59VaultPath() {\n  return path.join(app.getPath("userData"), "protected-results-v59", "geometry-tactical-v59.vault.json");\n}', 'function legacyV60VaultPath() {\n  return path.join(app.getPath("appData"), "Geometry Tactical Classroom V60", "protected-results-v60", "geometry-tactical-v60.vault.json");\n}\n\nfunction legacyV59VaultPath() {\n  return path.join(app.getPath("appData"), "Geometry Tactical Classroom V59", "protected-results-v59", "geometry-tactical-v59.vault.json");\n}', "legacy app-data roots");
main = once(main, 'report.schema = 60;', 'report.schema = 61;', "normalized schema");
main = main.replaceAll('`GeometryTacticalV60|${APP_VERSION}|${EDITION}`', '`GeometryTacticalV61|${APP_VERSION}|${EDITION}`');
main = main.replaceAll('"GT-V60-AES-256-GCM"', '"GT-V61-AES-256-GCM"');
const legacy60 = `function decryptLegacyV60Envelope(envelope, pin) {
  if (!envelope || envelope.format !== "GT-V60-AES-256-GCM") throw new Error("Invalid V60 legacy vault format.");
  const salt = Buffer.from(envelope.salt, "base64");
  const iv = Buffer.from(envelope.iv, "base64");
  const tag = Buffer.from(envelope.tag, "base64");
  const ciphertext = Buffer.from(envelope.ciphertext, "base64");
  const key = deriveKey(pin, salt);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from("GeometryTacticalV60|60.0.0|classroom-thales-pause-v60", "utf8"));
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const decoded = JSON.parse(plaintext.toString("utf8"));
  if (!decoded || !Array.isArray(decoded.reports)) throw new Error("Invalid V60 legacy vault content.");
  return { ...decoded, schema: 61, migratedFrom: 60 };
}

`;
main = once(main, 'function decryptLegacyV59Envelope(envelope, pin) {', legacy60 + 'function decryptLegacyV59Envelope(envelope, pin) {', "V60 legacy decryptor");
main = once(main, 'return { ...decoded, schema: 60, migratedFrom: 59 };', 'return { ...decoded, schema: 61, migratedFrom: 59 };', "V59 schema");
main = once(main, 'return { schema: 60, createdAt: new Date().toISOString(), reports: [] };', 'return { schema: 61, createdAt: new Date().toISOString(), reports: [] };', "empty vault schema");
main = once(main,
  '  const legacy = legacyV59VaultPath();\n  if (fs.existsSync(legacy)) {\n    const envelope = JSON.parse(fs.readFileSync(legacy, "utf8"));\n    return decryptLegacyV59Envelope(envelope, pin);\n  }',
  '  const legacyV60 = legacyV60VaultPath();\n  if (fs.existsSync(legacyV60)) {\n    const envelope = JSON.parse(fs.readFileSync(legacyV60, "utf8"));\n    return decryptLegacyV60Envelope(envelope, pin);\n  }\n  const legacyV59 = legacyV59VaultPath();\n  if (fs.existsSync(legacyV59)) {\n    const envelope = JSON.parse(fs.readFileSync(legacyV59, "utf8"));\n    return decryptLegacyV59Envelope(envelope, pin);\n  }',
  "legacy vault priority");
main = once(main, 'process.env.V60_READY_FILE || process.env.V59_READY_FILE || path.join(dataRoot(), "ready-v60.json")', 'process.env.V61_READY_FILE || process.env.V60_READY_FILE || process.env.V59_READY_FILE || path.join(dataRoot(), "ready-v61.json")', "ready env");
main = main.replaceAll('path.join(dataRoot(), "ready-v60.json")', 'path.join(dataRoot(), "ready-v61.json")');
main = once(main, 'process.env.V60_SELF_TEST_FILE || process.env.V59_SELF_TEST_FILE', 'process.env.V61_SELF_TEST_FILE || process.env.V60_SELF_TEST_FILE || process.env.V59_SELF_TEST_FILE', "self-test env");
main = once(main, '`ci-v60-${marker}`', '`ci-v61-${marker}`', "CI result id");
main = once(main, 'process.env.V60_BOSS_PROBE === "true" ? { "ci-room": "5" } : {}', 'process.env.V61_BOSS_PROBE === "true" || process.env.V60_BOSS_PROBE === "true" ? { "ci-room": "5" } : {}', "boss probe");
main = once(main, 'if (!lock && process.env.V60_ALLOW_SECOND_INSTANCE !== "true") app.quit();', 'if (!lock && process.env.V61_ALLOW_SECOND_INSTANCE !== "true" && process.env.V60_ALLOW_SECOND_INSTANCE !== "true") app.quit();', "single instance");

const outputs = {
  "game.js": game,
  "index.html": fs.readFileSync(path.join(sourceDir, "index.html"), "utf8").replaceAll('Classroom V60', 'Classroom V61').replaceAll('GEOMETRY TACTICAL · V60', 'GEOMETRY TACTICAL · V61'),
  "styles.css": fs.readFileSync(path.join(sourceDir, "styles.css"), "utf8").replace('/* V60 controlled pause */', '/* V61 controlled pause and collision-free Thales geometry */'),
  "main.js": main,
  "preload.js": fs.readFileSync(path.join(sourceDir, "preload.js"), "utf8")
};
for (const [file, content] of Object.entries(outputs)) {
  if (sha(content) !== outputHashes[file]) throw new Error(`V61 output hash mismatch for ${file}.`);
}
fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });
for (const [file, content] of Object.entries(outputs)) fs.writeFileSync(path.join(targetDir, file), content, "utf8");
console.log("Prepared Geometry Tactical Classroom V61 with separated Thales triangle lines and collision-free labels.");
