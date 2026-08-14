"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const blockPath = path.join(__dirname, "v60-factorization-question-block.txt");
let source = fs.readFileSync(blockPath, "utf8");
source += '\n;globalThis.__factorAudit={createCommonFactorQuestion,createGroupingQuestion,createDifferenceSquaresQuestion,createPerfectSquareTrinomialQuestion,createGeneralTrinomialQuestion,gcdInt};';
const sandbox = { console, Math, state: { questionKeys: [] }, QUESTION_MEMORY_LIMIT: 100 };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const bank = sandbox.__factorAudit;
function normalize(text) { return String(text).replaceAll("−", "-").replace(/\s+/g, ""); }
function parseLinear(text) {
  let value = normalize(text);
  if (!value.startsWith("(") || !value.endsWith(")")) throw new Error(`Invalid linear factor: ${text}`);
  value = value.slice(1, -1);
  const match = value.match(/^([+-]?)(\d*)x([+-]\d+)?$/);
  if (!match) throw new Error(`Cannot parse linear factor: ${text}`);
  const a = (match[2] === "" ? 1 : Number(match[2])) * (match[1] === "-" ? -1 : 1);
  const b = match[3] ? Number(match[3]) : 0;
  return [a, b];
}
function multiplyLinear(left, right) {
  const [a, b] = left, [c, d] = right;
  return [a * c, a * d + b * c, b * d];
}
function parseFactoredExpression(text) {
  const value = normalize(text);
  let match = value.match(/^(\d+)x(\(.+\))$/);
  if (match) {
    const g = Number(match[1]), [a, b] = parseLinear(match[2]);
    return [g * a, g * b, 0];
  }
  match = value.match(/^(\(.+\))²$/);
  if (match) {
    const linear = parseLinear(match[1]);
    return multiplyLinear(linear, linear);
  }
  if (value.startsWith("(")) {
    let depth = 0, split = -1;
    for (let i = 0; i < value.length; i++) {
      if (value[i] === "(") depth++;
      else if (value[i] === ")") {
        depth--;
        if (depth === 0) { split = i + 1; break; }
      }
    }
    if (split > 0 && split < value.length) return multiplyLinear(parseLinear(value.slice(0, split)), parseLinear(value.slice(split)));
  }
  match = value.match(/^(\d+)(\(.+\))$/);
  if (match) {
    const g = Number(match[1]), [a, b] = parseLinear(match[2]);
    return [0, g * a, g * b];
  }
  throw new Error(`Cannot parse factorized expression: ${text}`);
}
function signature(coefficients) { return coefficients.join("|"); }
function assert(condition, message) { if (!condition) throw new Error(message); }
const creators = [
  bank.createCommonFactorQuestion,
  bank.createGroupingQuestion,
  bank.createDifferenceSquaresQuestion,
  bank.createPerfectSquareTrinomialQuestion,
  bank.createGeneralTrinomialQuestion
];
const counts = {};
for (const create of creators) {
  for (let iteration = 0; iteration < 10000; iteration++) {
    const question = create();
    counts[question.type] = (counts[question.type] || 0) + 1;
    assert(Array.isArray(question.coefficients) && question.coefficients.length === 3, `${question.type}: source coefficients missing.`);
    const expected = signature(question.coefficients);
    const expandedCorrect = signature(parseFactoredExpression(question.correct));
    assert(expandedCorrect === expected, `${question.type}: marked answer is not equivalent. ${question.display} -> ${question.correct}`);
    assert(question.correctSignature === expected, `${question.type}: internal correct signature mismatch.`);
    assert(question.options.length === 4, `${question.type}: must show exactly four options.`);
    assert(question.options.includes(question.correct), `${question.type}: correct answer was omitted from the four visible options.`);
    const optionSignatures = question.options.map((option) => signature(parseFactoredExpression(option)));
    assert(new Set(optionSignatures).size === 4, `${question.type}: two visible options are algebraically equivalent for ${question.display}.`);
    assert(optionSignatures.filter((item) => item === expected).length === 1, `${question.type}: there must be exactly one mathematically correct visible option.`);
    const factorTexts = normalize(question.correct).match(/\([^()]+\)/g) || [];
    for (const factorText of factorTexts) {
      const [a, b] = parseLinear(factorText);
      assert(bank.gcdInt(a, b) === 1, `${question.type}: answer is equivalent but not completely factored: ${question.correct}`);
    }
  }
}
console.log(`Factorization V60.7.1 mathematical audit passed: ${Object.values(counts).reduce((a,b)=>a+b,0)} generated questions verified across all five cases. Correct answer always present, exactly one algebraically correct option, and all returned linear factors are primitive.`);
