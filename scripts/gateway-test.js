"use strict";

const assert = require("node:assert/strict");
process.env.TEACHER_PASSWORD = "9109";
const {
  isTeacherPasswordValid,
  isProtectedTeacherMessage,
  originAllowed,
  parseAllowedOrigins
} = require("../server/secure-gateway");

assert.equal(isTeacherPasswordValid("9109"), true);
assert.equal(isTeacherPasswordValid("9108"), false);
assert.equal(isTeacherPasswordValid("09109"), false);
assert.equal(isProtectedTeacherMessage("create_control_room"), true);
assert.equal(isProtectedTeacherMessage("start_match"), true);
assert.equal(isProtectedTeacherMessage("register_student"), false);
assert.equal(originAllowed("https://juanperez238421-cpu.github.io", parseAllowedOrigins("https://juanperez238421-cpu.github.io")), true);
assert.equal(originAllowed("https://example.com", parseAllowedOrigins("https://juanperez238421-cpu.github.io")), false);
console.log("Gateway test passed: teacher PIN, protected controls and origin checks work.");
