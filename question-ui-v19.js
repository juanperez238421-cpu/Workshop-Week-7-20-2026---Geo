(() => {
  "use strict";

  if (typeof WebSocket === "undefined") return;

  const observed = new WeakSet();
  const nativeAddEventListener = WebSocket.prototype.addEventListener;

  function canvasTarget() {
    const canvas = document.getElementById("questionCanvas");
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    return ctx ? { canvas, ctx } : null;
  }

  function prepare() {
    const target = canvasTarget();
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

  function heading(type) {
    const title = document.getElementById("questionTitle");
    const eyebrow = document.querySelector("#questionOverlay .eyebrow");
    if (type === "ratio_sin" || type === "ratio_cos") {
      if (title) title.textContent = "Identify the sine or cosine ratio";
      if (eyebrow) eyebrow.textContent = "ALL THREE SIDES GIVEN · NO DECIMAL CALCULATION";
      return;
    }
    if (type === "pythagoras") {
      if (title) title.textContent = "Determine the unknown right-triangle side";
      if (eyebrow) eyebrow.textContent = "TWO SIDES GIVEN · PYTHAGOREAN THEOREM";
      return;
    }
    if (type === "thales_height") {
      if (title) title.textContent = "Determine the unknown height";
      if (eyebrow) eyebrow.textContent = "THALES' THEOREM · SIMILAR TRIANGLES";
    }
  }

  function trianglePoints(diagram) {
    const rawA = Math.max(1, Number(diagram.shapeLegA ?? diagram.legA ?? diagram.adjacent) || 4);
    const rawB = Math.max(1, Number(diagram.shapeLegB ?? diagram.legB ?? diagram.opposite) || 3);
    const scale = Math.min(330 / rawA, 140 / rawB);
    const legA = Math.max(110, rawA * scale);
    const legB = Math.max(82, rawB * scale);
    const orientation = diagram.orientation || "right-bottom";
    if (orientation === "right-top") {
      const R = { x: 455, y: 52 };
      return { A: { x: R.x - legA, y: R.y }, R, B: { x: R.x, y: R.y + legB } };
    }
    if (orientation === "left-bottom") {
      const R = { x: 105, y: 202 };
      return { A: { x: R.x + legA, y: R.y }, R, B: { x: R.x, y: R.y - legB } };
    }
    if (orientation === "left-top") {
      const R = { x: 105, y: 52 };
      return { A: { x: R.x + legA, y: R.y }, R, B: { x: R.x, y: R.y + legB } };
    }
    const R = { x: 455, y: 202 };
    return { A: { x: R.x - legA, y: R.y }, R, B: { x: R.x, y: R.y - legB } };
  }

  function sideLabel(ctx, first, second, text, centroid, color = "#111827") {
    const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    const length = Math.hypot(dx, dy) || 1;
    const normal = { x: -dy / length, y: dx / length };
    const a = { x: midpoint.x + normal.x * 25, y: midpoint.y + normal.y * 25 };
    const b = { x: midpoint.x - normal.x * 25, y: midpoint.y - normal.y * 25 };
    const point = Math.hypot(a.x - centroid.x, a.y - centroid.y) >= Math.hypot(b.x - centroid.x, b.y - centroid.y) ? a : b;
    const angle = Math.atan2(dy, dx);
    const readable = angle > Math.PI / 2 || angle < -Math.PI / 2 ? angle + Math.PI : angle;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(readable);
    ctx.font = "800 14px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const width = ctx.measureText(text).width + 14;
    ctx.fillStyle = "rgba(255,255,255,.94)";
    ctx.fillRect(-width / 2, -11, width, 22);
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function drawRightAngle(ctx, R, A, B) {
    const length = 20;
    const aLength = Math.hypot(A.x - R.x, A.y - R.y) || 1;
    const bLength = Math.hypot(B.x - R.x, B.y - R.y) || 1;
    const u = { x: (A.x - R.x) / aLength, y: (A.y - R.y) / aLength };
    const v = { x: (B.x - R.x) / bLength, y: (B.y - R.y) / bLength };
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(R.x + u.x * length, R.y + u.y * length);
    ctx.lineTo(R.x + u.x * length + v.x * length, R.y + u.y * length + v.y * length);
    ctx.lineTo(R.x + v.x * length, R.y + v.y * length);
    ctx.stroke();
  }

  function drawAngle(ctx, vertex, first, second, label, degrees) {
    const start = Math.atan2(first.y - vertex.y, first.x - vertex.x);
    let delta = Math.atan2(second.y - vertex.y, second.x - vertex.x) - start;
    while (delta <= -Math.PI) delta += Math.PI * 2;
    while (delta > Math.PI) delta -= Math.PI * 2;
    const radius = 30;
    ctx.save();
    ctx.strokeStyle = "#1f5fbf";
    ctx.fillStyle = "#1f5fbf";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(vertex.x, vertex.y, radius, start, start + delta, delta < 0);
    ctx.stroke();
    const middle = start + delta / 2;
    ctx.font = "800 15px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${label} = ${degrees}°`, vertex.x + Math.cos(middle) * 58, vertex.y + Math.sin(middle) * 58);
    ctx.restore();
  }

  function drawTriangle(diagram, type) {
    const target = prepare();
    if (!target) return;
    const { canvas, ctx } = target;
    const { A, R, B } = trianglePoints(diagram);
    const centroid = { x: (A.x + R.x + B.x) / 3, y: (A.y + R.y + B.y) / 3 };

    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(R.x, R.y);
    ctx.lineTo(B.x, B.y);
    ctx.closePath();
    ctx.stroke();
    drawRightAngle(ctx, R, A, B);

    const primary = diagram.angleVertex === "B" ? B : A;
    const other = diagram.angleVertex === "B" ? A : B;
    drawAngle(ctx, primary, R, other, diagram.angleLabel || "θ", Number(diagram.angleDegrees) || 45);

    const ratioMode = type === "ratio_sin" || type === "ratio_cos";
    const angleAtA = diagram.angleVertex !== "B";
    const legALabel = ratioMode ? `${angleAtA ? "adjacent" : "opposite"} = ${diagram.legA}` : String(diagram.legA ?? "?");
    const legBLabel = ratioMode ? `${angleAtA ? "opposite" : "adjacent"} = ${diagram.legB}` : String(diagram.legB ?? "?");
    const hypLabel = ratioMode ? `hypotenuse = ${diagram.hypotenuse}` : String(diagram.hypotenuse ?? "?");
    sideLabel(ctx, A, R, legALabel, centroid);
    sideLabel(ctx, R, B, legBLabel, centroid);
    sideLabel(ctx, A, B, hypLabel, centroid, "#1f5fbf");

    ctx.font = "700 13px system-ui";
    ctx.fillStyle = "#667085";
    ctx.textAlign = "left";
    ctx.fillText(ratioMode ? `${diagram.ratioName === "sin" ? "sin = opposite / hypotenuse" : "cos = adjacent / hypotenuse"} · choose the ratio, not a decimal` : "Use a² + b² = c² with exactly two known sides.", 16, 20);
    canvas.setAttribute("aria-label", ratioMode ? "Right triangle with all three side lengths and side roles shown" : "Right triangle with two known sides and one unknown side");
  }

  function drawThales(diagram) {
    const target = prepare();
    if (!target) return;
    const { canvas, ctx } = target;
    const mirror = Boolean(diagram.mirror);
    const mapX = (x) => mirror ? canvas.width - x : x;
    const ground = 205;
    const referenceX = mapX(78);
    const referenceTop = 120;
    const referenceShadow = mapX(220);
    const targetX = mapX(334);
    const targetTop = 48;
    const targetShadow = mapX(536);

    ctx.strokeStyle = "#475467";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(20, ground); ctx.lineTo(canvas.width - 20, ground); ctx.stroke();
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(referenceX, ground); ctx.lineTo(referenceX, referenceTop); ctx.moveTo(targetX, ground); ctx.lineTo(targetX, targetTop); ctx.stroke();
    ctx.strokeStyle = "#e88b2b";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(referenceX, referenceTop); ctx.lineTo(referenceShadow, ground); ctx.moveTo(targetX, targetTop); ctx.lineTo(targetShadow, ground); ctx.stroke();

    ctx.fillStyle = "#111827";
    ctx.font = "800 15px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(`${diagram.referenceHeight} m`, referenceX + (mirror ? 30 : -30), (ground + referenceTop) / 2);
    ctx.fillText(`${diagram.referenceShadow} m`, (referenceX + referenceShadow) / 2, ground + 27);
    ctx.fillText("h = ?", targetX + (mirror ? 35 : -35), (ground + targetTop) / 2);
    ctx.fillText(`${diagram.targetShadow} m`, (targetX + targetShadow) / 2, ground + 27);
    ctx.fillStyle = "#1f5fbf";
    ctx.fillText(String(diagram.targetName || "object"), targetX, targetTop - 14);
    ctx.fillStyle = "#667085";
    ctx.font = "700 13px system-ui";
    ctx.textAlign = "left";
    ctx.fillText("reference height / reference shadow = h / target shadow", 16, 20);
    canvas.setAttribute("aria-label", "Two similar right triangles with a known reference height and an unknown target height");
  }

  function render(message) {
    if (!message || message.type !== "question") return;
    const type = message.questionType || message.type || message.diagram?.type;
    heading(type);
    const diagram = message.diagram || {};
    requestAnimationFrame(() => {
      if (type === "thales_height" || diagram.type === "thales_height") drawThales(diagram);
      else drawTriangle(diagram, type);
    });
  }

  WebSocket.prototype.addEventListener = function geometryUiV19AddEventListener(type, listener, options) {
    const result = nativeAddEventListener.call(this, type, listener, options);
    if (!observed.has(this)) {
      observed.add(this);
      nativeAddEventListener.call(this, "message", (event) => {
        if (typeof event.data !== "string") return;
        try { render(JSON.parse(event.data)); } catch {}
      });
    }
    return result;
  };

  window.__triadQuestionUiV19 = Object.freeze({
    version: 19,
    categories: ["ratio_sin", "ratio_cos", "pythagoras", "thales_height"],
    noDecimalRatios: true,
    exactPythagoreanSides: true,
    thalesHeightOnly: true
  });
})();
