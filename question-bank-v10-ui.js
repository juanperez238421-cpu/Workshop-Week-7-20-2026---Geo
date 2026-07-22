(() => {
  "use strict";

  const observedSockets = new WeakSet();
  const nativeAddEventListener = WebSocket.prototype.addEventListener;

  function canvasContext() {
    const canvas = document.getElementById("questionCanvas");
    if (!canvas) return null;
    return { canvas, ctx: canvas.getContext("2d") };
  }

  function prepareCanvas() {
    const target = canvasContext();
    if (!target) return null;
    const { canvas, ctx } = target;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fbfcfe";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#111827";
    ctx.fillStyle = "#111827";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    return target;
  }

  function setQuestionHeading(type) {
    const title = document.getElementById("questionTitle");
    const eyebrow = document.querySelector("#questionOverlay .eyebrow");
    if (!title) return;
    if (type === "ratio_sin" || type === "ratio_cos") {
      title.textContent = "Identify the correct trigonometric ratio";
      if (eyebrow) eyebrow.textContent = "SIN AND COS · DIFFERENT ANGLES AND ORIENTATIONS";
    } else if (type === "pythagoras") {
      title.textContent = "Determine the unknown side";
      if (eyebrow) eyebrow.textContent = "RIGHT TRIANGLE · PYTHAGOREAN THEOREM";
    } else if (type === "thales_height") {
      title.textContent = "Determine the unknown height";
      if (eyebrow) eyebrow.textContent = "THALES' THEOREM · SIMILAR TRIANGLES";
    }
  }

  function normalizeDelta(value) {
    let result = value;
    while (result <= -Math.PI) result += Math.PI * 2;
    while (result > Math.PI) result -= Math.PI * 2;
    return result;
  }

  function drawAngle(ctx, vertex, first, second, label, degrees, primary = true) {
    const start = Math.atan2(first.y - vertex.y, first.x - vertex.x);
    const finish = Math.atan2(second.y - vertex.y, second.x - vertex.x);
    const delta = normalizeDelta(finish - start);
    const radius = primary ? 31 : 24;
    ctx.save();
    ctx.strokeStyle = primary ? "#1f5fbf" : "#667085";
    ctx.fillStyle = primary ? "#1f5fbf" : "#475467";
    ctx.lineWidth = primary ? 3 : 2;
    ctx.beginPath();
    ctx.arc(vertex.x, vertex.y, radius, start, start + delta, delta < 0);
    ctx.stroke();
    const middle = start + delta / 2;
    const labelRadius = radius + (primary ? 25 : 19);
    const x = vertex.x + Math.cos(middle) * labelRadius;
    const y = vertex.y + Math.sin(middle) * labelRadius;
    ctx.font = primary ? "800 16px system-ui" : "700 13px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(primary ? `${label} = ${degrees}°` : `${degrees}°`, x, y);
    ctx.restore();
  }

  function drawRightAngle(ctx, right, first, second) {
    const length = 21;
    const firstLength = Math.hypot(first.x - right.x, first.y - right.y) || 1;
    const secondLength = Math.hypot(second.x - right.x, second.y - right.y) || 1;
    const u = { x: (first.x - right.x) / firstLength, y: (first.y - right.y) / firstLength };
    const v = { x: (second.x - right.x) / secondLength, y: (second.y - right.y) / secondLength };
    const p1 = { x: right.x + u.x * length, y: right.y + u.y * length };
    const p2 = { x: p1.x + v.x * length, y: p1.y + v.y * length };
    const p3 = { x: right.x + v.x * length, y: right.y + v.y * length };
    ctx.save();
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawSideLabel(ctx, first, second, text, centroid, color = "#111827") {
    const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    const length = Math.hypot(dx, dy) || 1;
    const normal = { x: -dy / length, y: dx / length };
    const candidateA = { x: midpoint.x + normal.x * 25, y: midpoint.y + normal.y * 25 };
    const candidateB = { x: midpoint.x - normal.x * 25, y: midpoint.y - normal.y * 25 };
    const distanceA = Math.hypot(candidateA.x - centroid.x, candidateA.y - centroid.y);
    const distanceB = Math.hypot(candidateB.x - centroid.x, candidateB.y - centroid.y);
    const point = distanceA >= distanceB ? candidateA : candidateB;
    const angle = Math.atan2(dy, dx);
    const readableAngle = angle > Math.PI / 2 || angle < -Math.PI / 2 ? angle + Math.PI : angle;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(readableAngle);
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.font = "800 15px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const width = ctx.measureText(text).width + 12;
    ctx.fillRect(-width / 2, -11, width, 22);
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function trianglePoints(diagram) {
    const rawA = Math.max(1, Number(diagram.shapeLegA ?? diagram.legA ?? diagram.adjacent) || 4);
    const rawB = Math.max(1, Number(diagram.shapeLegB ?? diagram.legB ?? diagram.opposite) || 3);
    const scale = Math.min(335 / rawA, 145 / rawB);
    const legA = Math.max(105, rawA * scale);
    const legB = Math.max(82, rawB * scale);
    const orientation = diagram.orientation || "right-bottom";
    if (orientation === "right-top") {
      const R = { x: 460, y: 48 };
      return { A: { x: R.x - legA, y: R.y }, R, B: { x: R.x, y: R.y + legB } };
    }
    if (orientation === "left-bottom") {
      const R = { x: 100, y: 204 };
      return { A: { x: R.x + legA, y: R.y }, R, B: { x: R.x, y: R.y - legB } };
    }
    if (orientation === "left-top") {
      const R = { x: 100, y: 48 };
      return { A: { x: R.x + legA, y: R.y }, R, B: { x: R.x, y: R.y + legB } };
    }
    const R = { x: 460, y: 204 };
    return { A: { x: R.x - legA, y: R.y }, R, B: { x: R.x, y: R.y - legB } };
  }

  function drawRightTriangleDiagram(diagram, type) {
    const target = prepareCanvas();
    if (!target) return;
    const { canvas, ctx } = target;
    const { A, R, B } = trianglePoints(diagram);
    const centroid = { x: (A.x + R.x + B.x) / 3, y: (A.y + R.y + B.y) / 3 };

    ctx.lineWidth = 4;
    ctx.strokeStyle = "#111827";
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(R.x, R.y);
    ctx.lineTo(B.x, B.y);
    ctx.closePath();
    ctx.stroke();
    drawRightAngle(ctx, R, A, B);

    const primaryVertex = diagram.angleVertex === "B" ? B : A;
    const otherVertex = diagram.angleVertex === "B" ? A : B;
    const primaryOther = diagram.angleVertex === "B" ? A : B;
    const degrees = Math.max(1, Math.min(89, Number(diagram.angleDegrees) || 45));
    const complement = 90 - degrees;
    drawAngle(ctx, primaryVertex, R, primaryOther, diagram.angleLabel || "θ", degrees, true);
    drawAngle(ctx, otherVertex, R, primaryVertex, "", complement, false);

    const ratioMode = type === "ratio_sin" || type === "ratio_cos";
    const angleAtA = diagram.angleVertex !== "B";
    const legALabel = ratioMode
      ? `${angleAtA ? "adjacent" : "opposite"} = ${diagram.legA}`
      : String(diagram.legA ?? "?");
    const legBLabel = ratioMode
      ? `${angleAtA ? "opposite" : "adjacent"} = ${diagram.legB}`
      : String(diagram.legB ?? "?");
    const hypotenuseLabel = ratioMode
      ? `hypotenuse = ${diagram.hypotenuse}`
      : String(diagram.hypotenuse ?? "?");

    drawSideLabel(ctx, A, R, legALabel, centroid);
    drawSideLabel(ctx, R, B, legBLabel, centroid);
    drawSideLabel(ctx, A, B, hypotenuseLabel, centroid, "#1f5fbf");

    ctx.font = "600 14px system-ui";
    ctx.fillStyle = "#667085";
    ctx.textAlign = "left";
    ctx.fillText(
      ratioMode
        ? "The highlighted acute angle changes position between questions."
        : "The diagram may be reflected; the right-angle relationship stays the same.",
      18,
      22
    );
    canvas.setAttribute(
      "aria-label",
      ratioMode
        ? `Right triangle oriented ${diagram.orientation || "right-bottom"}, with ${diagram.angleLabel || "theta"} equal to ${degrees} degrees and all sides labeled`
        : `Right triangle oriented ${diagram.orientation || "right-bottom"}, with two known sides and one unknown side`
    );
  }

  function drawThalesDiagram(diagram) {
    const target = prepareCanvas();
    if (!target) return;
    const { canvas, ctx } = target;
    const mirror = Boolean(diagram.mirror);
    const mapX = (x) => mirror ? canvas.width - x : x;
    const groundY = 207;
    const referenceX = mapX(74);
    const referenceTopY = 118;
    const referenceShadowX = mapX(218);
    const targetX = mapX(326);
    const targetTopY = 45;
    const targetShadowX = mapX(538);

    ctx.strokeStyle = "#475467";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(20, groundY);
    ctx.lineTo(canvas.width - 20, groundY);
    ctx.stroke();

    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(referenceX, groundY);
    ctx.lineTo(referenceX, referenceTopY);
    ctx.moveTo(targetX, groundY);
    ctx.lineTo(targetX, targetTopY);
    ctx.stroke();

    ctx.strokeStyle = "#e88b2b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(referenceX, referenceTopY);
    ctx.lineTo(referenceShadowX, groundY);
    ctx.moveTo(targetX, targetTopY);
    ctx.lineTo(targetShadowX, groundY);
    ctx.stroke();

    ctx.fillStyle = "#111827";
    ctx.font = "700 15px system-ui";
    ctx.textAlign = "center";
    const referenceDirection = mirror ? 30 : -30;
    const targetDirection = mirror ? 36 : -36;
    ctx.fillText(`${diagram.referenceHeight} m`, referenceX + referenceDirection, (groundY + referenceTopY) / 2);
    ctx.fillText(`${diagram.referenceShadow} m`, (referenceX + referenceShadowX) / 2, groundY + 27);
    ctx.fillText("h = ?", targetX + targetDirection, (groundY + targetTopY) / 2);
    ctx.fillText(`${diagram.targetShadow} m`, (targetX + targetShadowX) / 2, groundY + 27);

    ctx.font = "700 14px system-ui";
    ctx.fillStyle = "#1f5fbf";
    ctx.fillText("reference", referenceX, referenceTopY - 14);
    ctx.fillText(String(diagram.targetName || "object"), targetX, targetTopY - 14);

    ctx.font = "600 14px system-ui";
    ctx.fillStyle = "#667085";
    ctx.textAlign = "left";
    ctx.fillText(mirror ? "Sunlight direction is reflected; corresponding ratios stay equal." : "Parallel sunlight creates two similar right triangles.", 18, 22);
    canvas.setAttribute("aria-label", "Two similar right triangles with a randomized sunlight direction, a reference height and an unknown target height");
  }

  function renderQuestion(message) {
    if (!message || message.type !== "question") return;
    setQuestionHeading(message.questionType);
    const diagram = message.diagram || {};
    if (diagram.type === "thales_height") drawThalesDiagram(diagram);
    else if (diagram.type === "ratio" || diagram.type === "pythagoras") drawRightTriangleDiagram(diagram, message.questionType);
  }

  WebSocket.prototype.addEventListener = function geometryQuestionV10AddEventListener(type, listener, options) {
    const result = nativeAddEventListener.call(this, type, listener, options);
    if (type === "message" && !observedSockets.has(this)) {
      observedSockets.add(this);
      nativeAddEventListener.call(this, "message", (event) => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === "question") setTimeout(() => renderQuestion(message), 0);
      });
    }
    return result;
  };

  window.__triadGeometryQuestionRenderer = Object.freeze({
    version: 10,
    renderQuestion,
    drawRightTriangleDiagram,
    drawThalesDiagram
  });
})();
