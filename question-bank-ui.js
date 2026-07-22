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
      if (eyebrow) eyebrow.textContent = "SIN AND COS · SIDE RELATIONSHIPS";
    } else if (type === "pythagoras") {
      title.textContent = "Determine the unknown side";
      if (eyebrow) eyebrow.textContent = "RIGHT TRIANGLE · PYTHAGOREAN THEOREM";
    } else if (type === "thales_height") {
      title.textContent = "Determine the unknown height";
      if (eyebrow) eyebrow.textContent = "THALES' THEOREM · SIMILAR TRIANGLES";
    }
  }

  function drawAngleMark(ctx, x, y) {
    ctx.save();
    ctx.strokeStyle = "#1f5fbf";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 34, -0.42, 0, false);
    ctx.stroke();
    ctx.fillStyle = "#1f5fbf";
    ctx.font = "700 18px system-ui";
    ctx.fillText("θ", x + 38, y - 10);
    ctx.restore();
  }

  function drawRightTriangleDiagram(diagram, type) {
    const target = prepareCanvas();
    if (!target) return;
    const { canvas, ctx } = target;
    const left = { x: 82, y: 205 };
    const right = { x: 442, y: 205 };
    const top = { x: 442, y: 42 };

    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
    ctx.lineTo(top.x, top.y);
    ctx.closePath();
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.strokeRect(right.x - 25, right.y - 25, 25, 25);
    drawAngleMark(ctx, left.x, left.y);

    const ratioMode = type === "ratio_sin" || type === "ratio_cos";
    ctx.font = "700 17px system-ui";
    ctx.textAlign = "center";
    ctx.fillStyle = "#111827";
    const adjacent = String(diagram.adjacent ?? "?");
    const opposite = String(diagram.opposite ?? "?");
    const hypotenuse = String(diagram.hypotenuse ?? "?");

    ctx.fillText((ratioMode ? "adjacent = " : "") + adjacent, (left.x + right.x) / 2, right.y + 32);
    ctx.save();
    ctx.translate(right.x + 48, (right.y + top.y) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText((ratioMode ? "opposite = " : "") + opposite, 0, 0);
    ctx.restore();

    ctx.save();
    ctx.translate((left.x + top.x) / 2 - 18, (left.y + top.y) / 2 - 8);
    ctx.rotate(-0.43);
    ctx.fillText((ratioMode ? "hypotenuse = " : "") + hypotenuse, 0, 0);
    ctx.restore();

    ctx.font = "600 14px system-ui";
    ctx.fillStyle = "#667085";
    ctx.textAlign = "left";
    ctx.fillText(ratioMode ? "Choose the fraction only; do not convert it to a decimal." : "Use a² + b² = c².", 18, 22);
    canvas.setAttribute("aria-label", ratioMode ? "Right triangle with all sides labeled for sine or cosine ratio identification" : "Right triangle with two known sides and one unknown side");
  }

  function drawThalesDiagram(diagram) {
    const target = prepareCanvas();
    if (!target) return;
    const { canvas, ctx } = target;
    const groundY = 207;
    const referenceX = 74;
    const referenceTopY = 118;
    const referenceShadowX = 218;
    const targetX = 326;
    const targetTopY = 45;
    const targetShadowX = 538;

    ctx.strokeStyle = "#475467";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(28, groundY);
    ctx.lineTo(545, groundY);
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

    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;
    ctx.strokeRect(referenceX, groundY - 18, 18, 18);
    ctx.strokeRect(targetX, groundY - 20, 20, 20);

    ctx.fillStyle = "#111827";
    ctx.font = "700 15px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(String(diagram.referenceHeight) + " m", referenceX - 28, (groundY + referenceTopY) / 2);
    ctx.fillText(String(diagram.referenceShadow) + " m", (referenceX + referenceShadowX) / 2, groundY + 27);
    ctx.fillText("h = ?", targetX - 34, (groundY + targetTopY) / 2);
    ctx.fillText(String(diagram.targetShadow) + " m", (targetX + targetShadowX) / 2, groundY + 27);

    ctx.font = "700 14px system-ui";
    ctx.fillStyle = "#1f5fbf";
    ctx.fillText("reference", referenceX, referenceTopY - 14);
    ctx.fillText(String(diagram.targetName || "object"), targetX, targetTopY - 14);

    ctx.font = "600 14px system-ui";
    ctx.fillStyle = "#667085";
    ctx.textAlign = "left";
    ctx.fillText("Parallel sunlight creates two similar right triangles.", 18, 22);
    canvas.setAttribute("aria-label", "Two similar right triangles showing a reference height and shadow and an unknown target height");
  }

  function renderQuestion(message) {
    if (!message || message.type !== "question") return;
    setQuestionHeading(message.questionType);
    const diagram = message.diagram || {};
    if (diagram.type === "thales_height") drawThalesDiagram(diagram);
    else if (diagram.type === "ratio" || diagram.type === "pythagoras") drawRightTriangleDiagram(diagram, message.questionType);
  }

  WebSocket.prototype.addEventListener = function geometryQuestionAddEventListener(type, listener, options) {
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

  window.__triadGeometryQuestionRenderer = Object.freeze({ renderQuestion, drawRightTriangleDiagram, drawThalesDiagram });
})();
