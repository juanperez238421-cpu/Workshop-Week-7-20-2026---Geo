(() => {
  "use strict";

  const shell = document.getElementById("masterArenaShell");
  const baseCanvas = document.getElementById("masterGameCanvas");
  if (!shell || !baseCanvas) return;

  const canvas = document.createElement("canvas");
  canvas.id = "masterSupplyCanvas";
  canvas.setAttribute("aria-hidden", "true");
  shell.appendChild(canvas);

  const meta = document.querySelector(".master-live-meta");
  if (meta && !document.getElementById("masterSupplyCount")) {
    const supplies = document.createElement("div");
    supplies.innerHTML = '<span>SUPPLIES</span><strong id="masterSupplyCount">0 BOXES</strong>';
    meta.appendChild(supplies);
    const network = document.createElement("div");
    network.innerHTML = '<span>NETWORK</span><strong id="masterNetworkQuality">WAITING</strong>';
    meta.appendChild(network);
  }

  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  const observedSockets = new WeakSet();
  const previousSend = WebSocket.prototype.send;
  let lastStateAt = 0;
  let averageInterval = 0;
  let lastSequence = 0;
  let dropped = 0;

  const view = {
    arena: { width: 9600, height: 6000, gridWidth: 40, gridHeight: 25 },
    teamColors: ["#1f77b4", "#d62728", "#2ca02c"],
    pickups: [],
    players: []
  };

  const styles = {
    ammo: { color: "#f79009", icon: "A" },
    shield: { color: "#2e90fa", icon: "S" },
    speed: { color: "#12b76a", icon: "V" },
    rapid: { color: "#f04438", icon: "R" },
    paint: { color: "#7f56d9", icon: "P" }
  };

  const CONTROL_TYPES = new Set([
    "create_control_room", "restore_control", "approve_registration", "reject_registration",
    "remove_player", "set_registration_lock", "set_player_ready", "fill_with_bots",
    "remove_bots", "start_match", "end_match", "reset_room"
  ]);

  function observe(socket) {
    if (!socket || observedSockets.has(socket)) return;
    observedSockets.add(socket);
    socket.addEventListener("message", (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === "controller_joined" && message.arena) view.arena = message.arena;
      if (message.type !== "state") return;
      const now = performance.now();
      if (lastStateAt) {
        const interval = now - lastStateAt;
        averageInterval = averageInterval ? averageInterval * 0.82 + interval * 0.18 : interval;
      }
      lastStateAt = now;
      const sequence = Number(message.sequence) || 0;
      if (sequence && lastSequence && sequence > lastSequence + 1) dropped += sequence - lastSequence - 1;
      if (sequence) lastSequence = sequence;
      view.arena = message.arena || view.arena;
      view.teamColors = Array.isArray(message.teamColors) ? message.teamColors : view.teamColors;
      view.pickups = Array.isArray(message.pickups) ? message.pickups : view.pickups;
      view.players = Array.isArray(message.players) ? message.players : view.players;
      updateMeta();
    });
  }

  WebSocket.prototype.send = function masterSupplySend(payload) {
    if (typeof payload === "string") {
      try {
        const message = JSON.parse(payload);
        if (CONTROL_TYPES.has(message.type)) observe(this);
      } catch {}
    }
    return previousSend.call(this, payload);
  };

  function updateMeta() {
    const supplyCount = document.getElementById("masterSupplyCount");
    const network = document.getElementById("masterNetworkQuality");
    if (supplyCount) supplyCount.textContent = `${view.pickups.length} BOX${view.pickups.length === 1 ? "" : "ES"}`;
    if (!network) return;
    if (!averageInterval) network.textContent = "WAITING";
    else {
      const quality = averageInterval <= 92 ? "EXCELLENT" : averageInterval <= 125 ? "GOOD" : averageInterval <= 180 ? "FAIR" : "POOR";
      network.textContent = `${quality} · ${Math.round(averageInterval)} ms · ${dropped} drop`;
    }
  }

  function resize() {
    const rect = shell.getBoundingClientRect();
    const width = Math.max(320, rect.width);
    const height = Math.max(220, rect.height);
    const dpr = Math.min(devicePixelRatio || 1, 1.75);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width, height };
  }

  function draw(frameAt) {
    const { width, height } = resize();
    ctx.clearRect(0, 0, width, height);
    const padding = 18;
    const scale = Math.max(0.05, Math.min((width - padding * 2) / view.arena.width, (height - padding * 2) / view.arena.height));
    const offsetX = (width - view.arena.width * scale) / 2;
    const offsetY = (height - view.arena.height * scale) / 2;

    for (const pickup of view.pickups) {
      const style = styles[pickup.type] || styles.ammo;
      const x = offsetX + pickup.x * scale;
      const y = offsetY + pickup.y * scale;
      const size = Math.max(5, 8 + Math.sin(frameAt / 180 + pickup.x * 0.01) * 1.2);
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = style.color;
      ctx.strokeStyle = "rgba(255,255,255,.95)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(-size, -size, size * 2, size * 2, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 8px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(style.icon, 0, 0.5);
      ctx.restore();
    }

    for (const player of view.players) {
      const x = offsetX + player.x * scale;
      const y = offsetY + player.y * scale;
      ctx.fillStyle = "rgba(16,24,40,.86)";
      ctx.font = "800 8px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`L${player.lives ?? 3} A${player.ammo ?? 5}`, x, y + 18);
    }

    requestAnimationFrame(draw);
  }

  addEventListener("resize", resize);
  updateMeta();
  requestAnimationFrame(draw);
})();
