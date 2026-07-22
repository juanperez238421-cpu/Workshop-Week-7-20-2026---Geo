"use strict";

const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const fluidRuntime = require("./runtime-v6.js");

function replacePattern(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`Triad v7 patch could not find: ${label}`);
  return source.replace(pattern, replacement);
}

function patchGatewaySource(input) {
  return fluidRuntime.patchGatewaySource(input);
}

function patchServerSource(input) {
  let source = fluidRuntime.patchServerSource(input);

  source = replacePattern(
    source,
    /function createQuestion\(\) \{[^\n]+\}/,
    `function createQuestion() {
  const modes = ["ratio_sin", "ratio_cos", "pythagoras", "pythagoras", "thales_height", "thales_height"];
  const type = modes[crypto.randomInt(modes.length)];
  let prompt = "";
  let options = [];
  let answerIndex = 0;
  let diagram = {};

  if (type === "ratio_sin" || type === "ratio_cos") {
    const triples = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [9, 12, 15]];
    const selected = triples[crypto.randomInt(triples.length)];
    const adjacent = selected[0];
    const opposite = selected[1];
    const hypotenuse = selected[2];
    const ratioName = type === "ratio_sin" ? "sin" : "cos";
    const choices = ratioName === "sin" ? [
      { text: "sin(θ) = opposite / hypotenuse = " + opposite + "/" + hypotenuse, correct: true },
      { text: "sin(θ) = adjacent / hypotenuse = " + adjacent + "/" + hypotenuse, correct: false },
      { text: "sin(θ) = opposite / adjacent = " + opposite + "/" + adjacent, correct: false },
      { text: "sin(θ) = hypotenuse / opposite = " + hypotenuse + "/" + opposite, correct: false }
    ] : [
      { text: "cos(θ) = adjacent / hypotenuse = " + adjacent + "/" + hypotenuse, correct: true },
      { text: "cos(θ) = opposite / hypotenuse = " + opposite + "/" + hypotenuse, correct: false },
      { text: "cos(θ) = opposite / adjacent = " + opposite + "/" + adjacent, correct: false },
      { text: "cos(θ) = hypotenuse / adjacent = " + hypotenuse + "/" + adjacent, correct: false }
    ];
    const ordered = shuffled(choices);
    options = ordered.map((choice) => choice.text);
    answerIndex = ordered.findIndex((choice) => choice.correct);
    prompt = "All three side lengths are shown. For angle θ, choose the correct " + ratioName + "(θ) ratio. Do not calculate a decimal value.";
    diagram = { type: "ratio", ratioName, angleLabel: "θ", adjacent, opposite, hypotenuse };
  } else if (type === "pythagoras") {
    const triples = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [9, 12, 15]];
    const selected = triples[crypto.randomInt(triples.length)];
    const adjacent = selected[0];
    const opposite = selected[1];
    const hypotenuse = selected[2];
    const unknown = crypto.randomInt(3);
    let correct = hypotenuse;
    if (unknown === 0) {
      prompt = "A right triangle has legs " + adjacent + " and " + opposite + " units. Determine the unknown hypotenuse.";
      diagram = { type: "pythagoras", angleLabel: "θ", adjacent, opposite, hypotenuse: "?" };
    } else if (unknown === 1) {
      correct = opposite;
      prompt = "A right triangle has hypotenuse " + hypotenuse + " units and one leg " + adjacent + " units. Determine the unknown opposite leg.";
      diagram = { type: "pythagoras", angleLabel: "θ", adjacent, opposite: "?", hypotenuse };
    } else {
      correct = adjacent;
      prompt = "A right triangle has hypotenuse " + hypotenuse + " units and one leg " + opposite + " units. Determine the unknown adjacent leg.";
      diagram = { type: "pythagoras", angleLabel: "θ", adjacent: "?", opposite, hypotenuse };
    }
    const numeric = numericOptions(correct, Math.max(2, correct * 0.22), 0);
    options = numeric.options.map((value) => value + " units");
    answerIndex = numeric.answerIndex;
  } else {
    const situations = [
      { referenceHeight: 1.5, referenceShadow: 2, targetShadow: 8, targetHeight: 6, targetName: "tree" },
      { referenceHeight: 2, referenceShadow: 3, targetShadow: 9, targetHeight: 6, targetName: "flagpole" },
      { referenceHeight: 1.2, referenceShadow: 1.5, targetShadow: 7.5, targetHeight: 6, targetName: "building" },
      { referenceHeight: 1.8, referenceShadow: 2.4, targetShadow: 8, targetHeight: 6, targetName: "tower" },
      { referenceHeight: 2.5, referenceShadow: 4, targetShadow: 12, targetHeight: 7.5, targetName: "light pole" },
      { referenceHeight: 3, referenceShadow: 2, targetShadow: 10, targetHeight: 15, targetName: "monument" }
    ];
    const selected = situations[crypto.randomInt(situations.length)];
    prompt = "At the same time of day, a reference object " + selected.referenceHeight + " m tall casts a " + selected.referenceShadow + " m shadow. A " + selected.targetName + " casts a " + selected.targetShadow + " m shadow. Using Thales' theorem and similar triangles, determine its height h.";
    const decimals = Number.isInteger(selected.targetHeight) ? 0 : 1;
    const numeric = numericOptions(selected.targetHeight, Math.max(2, selected.targetHeight * 0.24), decimals);
    options = numeric.options.map((value) => value + " m");
    answerIndex = numeric.answerIndex;
    diagram = { type: "thales_height", referenceHeight: selected.referenceHeight, referenceShadow: selected.referenceShadow, targetShadow: selected.targetShadow, targetHeight: "?", targetName: selected.targetName };
  }

  const now = Date.now();
  return { id: id("q"), type, prompt, options, answerIndex, diagram, createdAt: now, expiresAt: now + QUESTION_DURATION_MS };
}`,
    "geometry question generator"
  );

  return source;
}

const currentNodeOptions = String(process.env.NODE_OPTIONS || "");
if (!currentNodeOptions.includes("runtime-v7.js")) process.env.NODE_OPTIONS = `${currentNodeOptions} --require=${__filename}`.trim();

const inheritedLoader = Module._extensions[".js"];
Module._extensions[".js"] = function triadV7Loader(module, filename) {
  if (path.dirname(filename) === __dirname && path.basename(filename) === "server-v3.js") {
    module._compile(patchServerSource(fs.readFileSync(filename, "utf8")), filename);
    return;
  }
  if (path.dirname(filename) === __dirname && path.basename(filename) === "secure-gateway.js") {
    module._compile(patchGatewaySource(fs.readFileSync(filename, "utf8")), filename);
    return;
  }
  inheritedLoader(module, filename);
};

module.exports = { patchGatewaySource, patchServerSource };
