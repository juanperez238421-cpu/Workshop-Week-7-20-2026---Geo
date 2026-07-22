"use strict";

const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const baseRuntime = require("./runtime-v9.js");

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Triad v10 patch could not find: ${label}`);
  return source.replace(search, replacement);
}

function replacePattern(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`Triad v10 patch could not find: ${label}`);
  return source.replace(pattern, replacement);
}

function patchGatewaySource(input) {
  return baseRuntime.patchGatewaySource(input);
}

function patchServerSource(input) {
  let source = baseRuntime.patchServerSource(input);

  source = replaceRequired(
    source,
    "const ARENA = Object.freeze({ width: 9600, height: 6000, gridWidth: 40, gridHeight: 25 });",
    "const ARENA = Object.freeze({ width: 12800, height: 8000, gridWidth: 40, gridHeight: 25 });",
    "12800 by 8000 arena"
  );

  source = replacePattern(
    source,
    /function teamSpawn\(team, slot = 0\) \{[\s\S]*?\n\}/,
    `function teamSpawn(team, slot = 0) {
  const bases = [
    { x: 2200, y: 1750 },
    { x: ARENA.width - 2200, y: 1750 },
    { x: ARENA.width / 2, y: ARENA.height - 1500 }
  ];
  const formations = [
    [{ x: -1100, y: 460 }, { x: 1100, y: 460 }, { x: 0, y: -980 }],
    [{ x: 1100, y: 460 }, { x: -1100, y: 460 }, { x: 0, y: -980 }],
    [{ x: -1100, y: -360 }, { x: 1100, y: -360 }, { x: 0, y: 980 }]
  ];
  const offset = formations[team][slot % PLAYERS_PER_TEAM];
  const jitterX = crypto.randomInt(-220, 221);
  const jitterY = crypto.randomInt(-220, 221);
  return {
    x: clamp(bases[team].x + offset.x + jitterX, 180, ARENA.width - 180),
    y: clamp(bases[team].y + offset.y + jitterY, 180, ARENA.height - 180)
  };
}`,
    "larger-map dispersed spawns"
  );

  source = replacePattern(
    source,
    /function createQuestion\(\) \{[\s\S]*?\n\}/,
    `function createQuestion() {
  const modes = ["ratio_sin", "ratio_cos", "ratio_sin", "ratio_cos", "pythagoras", "pythagoras", "thales_height", "thales_height"];
  const type = modes[crypto.randomInt(modes.length)];
  const triples = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [9, 40, 41], [12, 35, 37], [20, 21, 29]];
  const orientations = ["right-bottom", "right-top", "left-bottom", "left-top"];
  const angleLabels = ["θ", "α", "β"];
  let prompt = "";
  let options = [];
  let answerIndex = 0;
  let diagram = {};

  if (type === "ratio_sin" || type === "ratio_cos") {
    const selected = triples[crypto.randomInt(triples.length)];
    const legA = selected[0];
    const legB = selected[1];
    const hypotenuse = selected[2];
    const angleVertex = crypto.randomInt(2) === 0 ? "A" : "B";
    const adjacent = angleVertex === "A" ? legA : legB;
    const opposite = angleVertex === "A" ? legB : legA;
    const angleDegrees = Math.round(Math.atan2(opposite, adjacent) * 180 / Math.PI);
    const angleLabel = angleLabels[crypto.randomInt(angleLabels.length)];
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
    prompt = "All three side lengths are shown. For " + angleLabel + " = " + angleDegrees + "°, choose the correct " + ratioName + " ratio. Do not calculate a decimal value.";
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
      hypotenuse
    };
  } else if (type === "pythagoras") {
    const selected = triples[crypto.randomInt(triples.length)];
    const legA = selected[0];
    const legB = selected[1];
    const hypotenuse = selected[2];
    const unknown = crypto.randomInt(3);
    const angleVertex = crypto.randomInt(2) === 0 ? "A" : "B";
    const adjacent = angleVertex === "A" ? legA : legB;
    const opposite = angleVertex === "A" ? legB : legA;
    const angleDegrees = Math.round(Math.atan2(opposite, adjacent) * 180 / Math.PI);
    const angleLabel = angleLabels[crypto.randomInt(angleLabels.length)];
    let correct = hypotenuse;
    let shownLegA = legA;
    let shownLegB = legB;
    let shownHypotenuse = hypotenuse;
    if (unknown === 0) {
      prompt = "A right triangle has legs " + legA + " and " + legB + " units. Determine the unknown hypotenuse.";
      shownHypotenuse = "?";
    } else if (unknown === 1) {
      correct = legB;
      prompt = "A right triangle has hypotenuse " + hypotenuse + " units and one leg " + legA + " units. Determine the unknown second leg.";
      shownLegB = "?";
    } else {
      correct = legA;
      prompt = "A right triangle has hypotenuse " + hypotenuse + " units and one leg " + legB + " units. Determine the unknown second leg.";
      shownLegA = "?";
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
      shapeLegB: legB
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
    prompt = "At the same time of day, a reference object " + selected.referenceHeight + " m tall casts a " + selected.referenceShadow + " m shadow. A " + selected.targetName + " casts a " + selected.targetShadow + " m shadow. Using Thales' theorem and similar triangles, determine its height h.";
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
      mirror: crypto.randomInt(2) === 1
    };
  }

  const now = Date.now();
  return { id: id("q"), type, prompt, options, answerIndex, diagram, createdAt: now, expiresAt: now + QUESTION_DURATION_MS };
}`,
    "varied right-triangle and Thales questions"
  );

  return source;
}

const currentNodeOptions = String(process.env.NODE_OPTIONS || "");
if (!currentNodeOptions.includes("runtime-v10.js")) process.env.NODE_OPTIONS = `${currentNodeOptions} --require=${__filename}`.trim();

const inheritedLoader = Module._extensions[".js"];
Module._extensions[".js"] = function triadV10Loader(module, filename) {
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
