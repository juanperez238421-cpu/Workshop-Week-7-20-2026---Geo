"use strict";

const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const baseRuntime = require("./runtime-v13.js");

function replacePattern(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`Triad v14 patch could not find: ${label}`);
  return source.replace(pattern, replacement);
}

function patchGatewaySource(input) {
  return baseRuntime.patchGatewaySource(input);
}

function patchServerSource(input) {
  let source = baseRuntime.patchServerSource(input);

  source = replacePattern(
    source,
    /function createQuestion\(\) \{[\s\S]*?\n\}/,
    `function createQuestion() {
  const modes = [
    "ratio_sin", "ratio_cos", "ratio_sin", "ratio_cos",
    "pythagoras", "pythagoras",
    "thales_height", "thales_height"
  ];
  const type = modes[crypto.randomInt(modes.length)];
  const triples = [
    [3, 4, 5], [5, 12, 13], [6, 8, 10], [7, 24, 25],
    [8, 15, 17], [9, 12, 15], [9, 40, 41], [12, 35, 37], [20, 21, 29]
  ];
  const orientations = ["right-bottom", "right-top", "left-bottom", "left-top"];
  const angleLabels = ["θ", "α", "β"];
  let prompt = "";
  let options = [];
  let answerIndex = 0;
  let diagram = {};

  if (type === "ratio_sin" || type === "ratio_cos") {
    const [legA, legB, hypotenuse] = triples[crypto.randomInt(triples.length)];
    const angleVertex = crypto.randomInt(2) === 0 ? "A" : "B";
    const angleLabel = angleLabels[crypto.randomInt(angleLabels.length)];
    const adjacent = angleVertex === "A" ? legA : legB;
    const opposite = angleVertex === "A" ? legB : legA;
    const angleDegrees = Math.round(Math.atan2(opposite, adjacent) * 180 / Math.PI);
    const ratioName = type === "ratio_sin" ? "sin" : "cos";
    const choices = ratioName === "sin" ? [
      { text: "sin(" + angleLabel + ") = opposite / hypotenuse = " + opposite + "/" + hypotenuse, correct: true },
      { text: "sin(" + angleLabel + ") = adjacent / hypotenuse = " + adjacent + "/" + hypotenuse, correct: false },
      { text: "sin(" + angleLabel + ") = opposite / adjacent = " + opposite + "/" + adjacent, correct: false },
      { text: "sin(" + angleLabel + ") = hypotenuse / opposite = " + hypotenuse + "/" + opposite, correct: false }
    ] : [
      { text: "cos(" + angleLabel + ") = adjacent / hypotenuse = " + adjacent + "/" + hypotenuse, correct: true },
      { text: "cos(" + angleLabel + ") = opposite / hypotenuse = " + opposite + "/" + hypotenuse, correct: false },
      { text: "cos(" + angleLabel + ") = opposite / adjacent = " + opposite + "/" + adjacent, correct: false },
      { text: "cos(" + angleLabel + ") = hypotenuse / adjacent = " + hypotenuse + "/" + adjacent, correct: false }
    ];
    const ordered = shuffled(choices);
    options = ordered.map((choice) => choice.text);
    answerIndex = ordered.findIndex((choice) => choice.correct);
    prompt = "All three side lengths are shown. For the highlighted angle " + angleLabel + " = " + angleDegrees + "°, identify the correct " + ratioName + " ratio. Do not calculate a decimal value.";
    diagram = {
      type: "ratio",
      ratioName,
      angleLabel,
      angleDegrees,
      angleVertex,
      orientation: orientations[crypto.randomInt(orientations.length)],
      legA,
      legB,
      adjacent,
      opposite,
      hypotenuse,
      showAllSides: true,
      formula: ratioName === "sin" ? "opposite / hypotenuse" : "adjacent / hypotenuse"
    };
  } else if (type === "pythagoras") {
    const [legA, legB, hypotenuse] = triples[crypto.randomInt(triples.length)];
    const unknown = crypto.randomInt(3);
    const angleVertex = crypto.randomInt(2) === 0 ? "A" : "B";
    const angleLabel = angleLabels[crypto.randomInt(angleLabels.length)];
    const angleDegrees = Math.round(Math.atan2(angleVertex === "A" ? legB : legA, angleVertex === "A" ? legA : legB) * 180 / Math.PI);
    let correct;
    let shownLegA = legA;
    let shownLegB = legB;
    let shownHypotenuse = hypotenuse;
    let unknownSide;

    if (unknown === 0) {
      correct = hypotenuse;
      unknownSide = "hypotenuse";
      shownHypotenuse = "?";
      prompt = "A right triangle has legs " + legA + " and " + legB + " units. Use the Pythagorean theorem to determine the unknown hypotenuse.";
    } else if (unknown === 1) {
      correct = legB;
      unknownSide = "leg";
      shownLegB = "?";
      prompt = "A right triangle has hypotenuse " + hypotenuse + " units and one leg " + legA + " units. Use the Pythagorean theorem to determine the unknown leg.";
    } else {
      correct = legA;
      unknownSide = "leg";
      shownLegA = "?";
      prompt = "A right triangle has hypotenuse " + hypotenuse + " units and one leg " + legB + " units. Use the Pythagorean theorem to determine the unknown leg.";
    }

    const numeric = numericOptions(correct, Math.max(2, correct * 0.22), 0);
    options = numeric.options.map((value) => value + " units");
    answerIndex = numeric.answerIndex;
    diagram = {
      type: "pythagoras",
      angleLabel,
      angleDegrees,
      angleVertex,
      orientation: orientations[crypto.randomInt(orientations.length)],
      legA: shownLegA,
      legB: shownLegB,
      hypotenuse: shownHypotenuse,
      shapeLegA: legA,
      shapeLegB: legB,
      unknownSide,
      knownSides: 2,
      formula: "a² + b² = c²"
    };
  } else {
    const situations = [
      { referenceHeight: 1.5, referenceShadow: 2, targetShadow: 8, targetHeight: 6, targetName: "tree" },
      { referenceHeight: 2, referenceShadow: 3, targetShadow: 9, targetHeight: 6, targetName: "flagpole" },
      { referenceHeight: 1.2, referenceShadow: 1.5, targetShadow: 7.5, targetHeight: 6, targetName: "building" },
      { referenceHeight: 1.8, referenceShadow: 2.4, targetShadow: 8, targetHeight: 6, targetName: "tower" },
      { referenceHeight: 2.5, referenceShadow: 4, targetShadow: 12, targetHeight: 7.5, targetName: "light pole" },
      { referenceHeight: 3, referenceShadow: 2, targetShadow: 10, targetHeight: 15, targetName: "monument" },
      { referenceHeight: 1.6, referenceShadow: 2, targetShadow: 15, targetHeight: 12, targetName: "school wall" },
      { referenceHeight: 2.4, referenceShadow: 3.2, targetShadow: 14, targetHeight: 10.5, targetName: "observation post" }
    ];
    const selected = situations[crypto.randomInt(situations.length)];
    prompt = "At the same time of day, a reference object " + selected.referenceHeight + " m tall casts a " + selected.referenceShadow + " m shadow. A " + selected.targetName + " casts a " + selected.targetShadow + " m shadow. Use Thales' theorem and similar triangles to determine the unknown height h.";
    const decimals = Number.isInteger(selected.targetHeight) ? 0 : 1;
    const numeric = numericOptions(selected.targetHeight, Math.max(2, selected.targetHeight * 0.24), decimals);
    options = numeric.options.map((value) => value + " m");
    answerIndex = numeric.answerIndex;
    diagram = {
      type: "thales_height",
      referenceHeight: selected.referenceHeight,
      referenceShadow: selected.referenceShadow,
      targetShadow: selected.targetShadow,
      targetHeight: "?",
      targetName: selected.targetName,
      mirror: crypto.randomInt(2) === 1,
      proportion: "reference height / reference shadow = h / target shadow"
    };
  }

  const now = Date.now();
  return {
    id: id("q"),
    type,
    prompt,
    options,
    answerIndex,
    diagram,
    createdAt: now,
    expiresAt: now + QUESTION_DURATION_MS
  };
}`,
    "focused sine-cosine, Pythagoras and Thales question bank"
  );

  return source;
}

const currentNodeOptions = String(process.env.NODE_OPTIONS || "");
if (!currentNodeOptions.includes("runtime-v14.js")) process.env.NODE_OPTIONS = `${currentNodeOptions} --require=${__filename}`.trim();

const inheritedLoader = Module._extensions[".js"];
Module._extensions[".js"] = function triadV14Loader(module, filename) {
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
