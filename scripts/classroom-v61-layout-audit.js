"use strict";

const layouts = [
  [{ x: 82, y: 516 }, { x: 720, y: 516 }, { x: 720, y: 86 }],
  [{ x: 720, y: 516 }, { x: 82, y: 516 }, { x: 82, y: 86 }],
  [{ x: 82, y: 92 }, { x: 720, y: 92 }, { x: 720, y: 522 }],
  [{ x: 720, y: 92 }, { x: 82, y: 92 }, { x: 82, y: 522 }]
];
const factors = [0.35, 0.4, 0.5, 0.6, 0.625, 0.7, 0.75];
const missingKeys = ["AD", "AB", "AE", "AC"];
const values = Object.freeze({ AD: 42.75, AB: 72, AE: 90, AC: 120 });
const safeRect = Object.freeze({ left: 34, top: 26, right: 756, bottom: 594 });

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const normalize = (x, y) => {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length, length };
};
const labelMetrics = (text, fontSize = 18) => ({
  width: Math.min(310, String(text).length * fontSize * 0.62 + 30),
  height: 44
});
const boxAt = (x, y, metrics) => ({
  left: x - metrics.width / 2,
  right: x + metrics.width / 2,
  top: y - metrics.height / 2,
  bottom: y + metrics.height / 2
});
const boxesOverlap = (a, b, padding = 8) => !(
  a.right + padding < b.left || a.left - padding > b.right ||
  a.bottom + padding < b.top || a.top - padding > b.bottom
);
const clampLabel = (x, y, metrics) => ({
  x: clamp(x, safeRect.left + metrics.width / 2, safeRect.right - metrics.width / 2),
  y: clamp(y, safeRect.top + metrics.height / 2, safeRect.bottom - metrics.height / 2)
});

function auditCase(layout, factor, missing) {
  const [A, B, C] = layout;
  const D = { x: A.x + (B.x - A.x) * factor, y: A.y + (B.y - A.y) * factor };
  const E = { x: A.x + (C.x - A.x) * factor, y: A.y + (C.y - A.y) * factor };
  const outerCentroid = { x: (A.x + B.x + C.x) / 3, y: (A.y + B.y + C.y) / 3 };
  const innerCentroid = { x: (A.x + D.x + E.x) / 3, y: (A.y + D.y + E.y) / 3 };
  const placedBoxes = [];
  const labels = [];

  const reserveLabel = (text, preferred, tangent, fontSize = 18) => {
    const metrics = labelMetrics(text, fontSize);
    const normalSteps = [0, 34, 68, 102];
    const tangentSteps = [0, 54, -54, 104, -104, 154, -154];
    let selected = clampLabel(preferred.x, preferred.y, metrics);
    let placed = false;
    outer: for (const normalStep of normalSteps) {
      for (const tangentStep of tangentSteps) {
        const candidate = clampLabel(
          preferred.x + tangent.x * tangentStep + preferred.nx * normalStep,
          preferred.y + tangent.y * tangentStep + preferred.ny * normalStep,
          metrics
        );
        const box = boxAt(candidate.x, candidate.y, metrics);
        if (!placedBoxes.some((existing) => boxesOverlap(box, existing))) {
          selected = candidate;
          placedBoxes.push(box);
          placed = true;
          break outer;
        }
      }
    }
    if (!placed) throw new Error(`No collision-free label position for ${text}.`);
    labels.push({ text, ...selected, box: boxAt(selected.x, selected.y, metrics) });
    return selected;
  };

  const outwardFrame = (first, second, interiorPoint) => {
    const direction = normalize(second.x - first.x, second.y - first.y);
    const tangent = { x: direction.x, y: direction.y };
    let normal = { x: -tangent.y, y: tangent.x };
    const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    if ((interiorPoint.x - midpoint.x) * normal.x + (interiorPoint.y - midpoint.y) * normal.y > 0) {
      normal = { x: -normal.x, y: -normal.y };
    }
    const outwardDot = (interiorPoint.x - midpoint.x) * normal.x + (interiorPoint.y - midpoint.y) * normal.y;
    if (outwardDot > 1e-9) throw new Error("Leader normal points into the triangle.");
    return { tangent, normal, length: direction.length };
  };

  const addVertexLabel = (point, text, centroid, distance) => {
    const direction = normalize(point.x - centroid.x, point.y - centroid.y);
    reserveLabel(text, {
      x: point.x + direction.x * distance,
      y: point.y + direction.y * distance,
      nx: direction.x,
      ny: direction.y
    }, { x: -direction.y, y: direction.x });
  };

  const addSegmentLabel = (key, first, second, outwardDistance, alongRatio) => {
    const frame = outwardFrame(first, second, outerCentroid);
    const anchor = {
      x: (first.x + second.x) / 2 + frame.tangent.x * frame.length * alongRatio,
      y: (first.y + second.y) / 2 + frame.tangent.y * frame.length * alongRatio
    };
    const value = missing === key ? "x" : `${values[key]} cm`;
    reserveLabel(`${key}: ${value}`, {
      x: anchor.x + frame.normal.x * outwardDistance,
      y: anchor.y + frame.normal.y * outwardDistance,
      nx: frame.normal.x,
      ny: frame.normal.y
    }, frame.tangent);
  };

  addVertexLabel(A, "A", outerCentroid, 42);
  addVertexLabel(B, "B", outerCentroid, 42);
  addVertexLabel(C, "C", outerCentroid, 42);
  addVertexLabel(D, "D", innerCentroid, 82);
  addVertexLabel(E, "E", innerCentroid, 82);
  addSegmentLabel("AD", A, D, 68, -0.14);
  addSegmentLabel("AB", A, B, 94, 0.30);
  addSegmentLabel("AE", A, E, 68, -0.14);
  addSegmentLabel("AC", A, C, 94, 0.30);

  const parallelFrame = outwardFrame(D, E, innerCentroid);
  reserveLabel("DE ∥ BC", {
    x: (D.x + E.x) / 2 + parallelFrame.normal.x * 64,
    y: (D.y + E.y) / 2 + parallelFrame.normal.y * 64,
    nx: parallelFrame.normal.x,
    ny: parallelFrame.normal.y
  }, parallelFrame.tangent, 19);

  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      if (boxesOverlap(labels[i].box, labels[j].box, 2)) {
        throw new Error(`Label overlap: ${labels[i].text} / ${labels[j].text}.`);
      }
    }
  }
  for (const label of labels) {
    if (label.box.left < safeRect.left - 0.01 || label.box.right > safeRect.right + 0.01 || label.box.top < safeRect.top - 0.01 || label.box.bottom > safeRect.bottom + 0.01) {
      throw new Error(`Label escaped safe figure area: ${label.text}.`);
    }
  }
  return labels.length;
}

let audited = 0;
for (const layout of layouts) {
  for (const factor of factors) {
    for (const missing of missingKeys) {
      const count = auditCase(layout, factor, missing);
      if (count !== 10) throw new Error(`Expected 10 labels, found ${count}.`);
      audited++;
    }
  }
}
console.log(`V61 Thales layout audit passed: ${audited} mirrored/factor/missing cases, zero label collisions, all leaders routed outward.`);
