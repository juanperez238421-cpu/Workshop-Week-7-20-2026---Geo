"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const blockPath = path.join(__dirname, "v60-factorization-question-block.txt");
let source = fs.readFileSync(blockPath, "utf8");
source += '\n;globalThis.__audit={FACTORIZATION_TYPES,generateQuestionCandidate};';
const sandbox = { console, Math, state: { questionKeys: [] }, QUESTION_MEMORY_LIMIT: 100 };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const bank = sandbox.__audit;
function normalize(text) { return String(text).replaceAll("−", "-").replace(/\s+/g, ""); }
function trim(poly) { const result = [...poly]; while (result.length > 1 && result[0] === 0) result.shift(); return result; }
function multiply(left, right) {
  const result = Array(left.length + right.length - 1).fill(0);
  for (let i = 0; i < left.length; i++) for (let j = 0; j < right.length; j++) result[i + j] += left[i] * right[j];
  return trim(result);
}
function signature(poly) { return trim(poly).join("|"); }
function parseInner(body) {
  body = normalize(body);
  let match = body.match(/^([+-]?)(\d*)x([+-]\d+)?$/);
  if (match) {
    const a = (match[2] ? Number(match[2]) : 1) * (match[1] === "-" ? -1 : 1);
    const b = match[3] ? Number(match[3]) : 0;
    return [a, b];
  }
  match = body.match(/^([+-]?)(\d*)x²([+-]\d+)?$/);
  if (match) {
    const a = (match[2] ? Number(match[2]) : 1) * (match[1] === "-" ? -1 : 1);
    const b = match[3] ? Number(match[3]) : 0;
    return [a, 0, b];
  }
  throw new Error(`Cannot parse factor ${body}`);
}
function parsePrefix(prefix) {
  prefix = normalize(prefix);
  if (!prefix) return [1];
  let match = prefix.match(/^(\d+)?x$/);
  if (match) return [match[1] ? Number(match[1]) : 1, 0];
  match = prefix.match(/^(\d+)?x²$/);
  if (match) return [match[1] ? Number(match[1]) : 1, 0, 0];
  if (/^\d+$/.test(prefix)) return [Number(prefix)];
  throw new Error(`Cannot parse prefix ${prefix}`);
}
function parseFactoredExpression(text) {
  const value = normalize(text);
  const first = value.indexOf("(");
  let result = parsePrefix(first < 0 ? value : value.slice(0, first));
  if (first < 0) return result;
  let index = first;
  while (index < value.length) {
    if (value[index] !== "(") throw new Error(`Expected factor at ${value.slice(index)}`);
    let depth = 1, end = index + 1;
    while (end < value.length && depth) {
      if (value[end] === "(") depth++;
      else if (value[end] === ")") depth--;
      end++;
    }
    if (depth) throw new Error(`Unclosed factor in ${text}`);
    const inner = parseInner(value.slice(index + 1, end - 1));
    let factor = inner;
    if (value[end] === "²") { factor = multiply(inner, inner); end++; }
    result = multiply(result, factor);
    index = end;
  }
  return trim(result);
}
function parseDisplay(text) {
  let value = normalize(text);
  if (value[0] !== "+" && value[0] !== "-") value = `+${value}`;
  const terms = value.match(/[+-][^+-]+/g) || [];
  const parsed = [];
  let maxPower = 0;
  for (const term of terms) {
    const sign = term[0] === "-" ? -1 : 1;
    const body = term.slice(1);
    let power = 0, coef = 0, match;
    if ((match = body.match(/^(\d*)x⁴$/))) { power = 4; coef = match[1] ? Number(match[1]) : 1; }
    else if ((match = body.match(/^(\d*)x³$/))) { power = 3; coef = match[1] ? Number(match[1]) : 1; }
    else if ((match = body.match(/^(\d*)x²$/))) { power = 2; coef = match[1] ? Number(match[1]) : 1; }
    else if ((match = body.match(/^(\d*)x$/))) { power = 1; coef = match[1] ? Number(match[1]) : 1; }
    else if (/^\d+$/.test(body)) { power = 0; coef = Number(body); }
    else throw new Error(`Cannot parse displayed term ${body}`);
    parsed.push([power, sign * coef]);
    maxPower = Math.max(maxPower, power);
  }
  const coefficients = Array(maxPower + 1).fill(0);
  for (const [power, coef] of parsed) coefficients[maxPower - power] += coef;
  return trim(coefficients);
}
function assert(ok, message) { if (!ok) throw new Error(message); }
const expectedTypes = ["common-difference-squares","common-perfect-square","common-general-trinomial","grouping-difference-squares","common-grouping"];
assert(JSON.stringify([...bank.FACTORIZATION_TYPES]) === JSON.stringify(expectedTypes), "V60.8 must use only the five combined-case families.");
const counts = {};
for (const type of bank.FACTORIZATION_TYPES) {
  for (let iteration = 0; iteration < 10000; iteration++) {
    const question = bank.generateQuestionCandidate(type);
    counts[type] = (counts[type] || 0) + 1;
    const expected = signature(question.coefficients);
    assert(signature(parseDisplay(question.display)) === expected, `${type}: displayed polynomial does not match source coefficients: ${question.display}`);
    assert(question.options.length === 4, `${type}: must render exactly four choices.`);
    assert(new Set(question.options.map((option) => option.id)).size === 4, `${type}: duplicate option IDs.`);
    assert(new Set(question.options.map((option) => normalize(option.text))).size === 4, `${type}: duplicate visible option text.`);
    assert(new Set(question.options.map((option) => option.signature)).size === 4, `${type}: algebraically equivalent duplicate choices.`);
    assert(question.options.filter((option) => option.isCorrect).length === 1, `${type}: must contain exactly one marked correct choice.`);
    const correct = question.options.find((option) => option.isCorrect);
    assert(correct.id === question.correctOptionId, `${type}: correct option ID pointer mismatch.`);
    assert(correct.text === question.correct, `${type}: legacy correct text pointer mismatch.`);
    for (const option of question.options) {
      const parsed = signature(parseFactoredExpression(option.text));
      assert(parsed === option.signature, `${type}: rendered option text disagrees with its algebraic signature: ${option.text}`);
      assert(option.isCorrect ? parsed === expected : parsed !== expected, `${type}: wrong correctness flag for ${option.text}`);
    }
  }
}
console.log(`V60.8 senior mathematical audit passed: 50,000 multi-case questions independently expanded and verified. Exactly four unique visible choices, four unique IDs, four algebraically distinct signatures, and exactly one correct answer in every question. ${JSON.stringify(counts)}`);
