(() => {
  "use strict";

  const definitions = Object.freeze({
    ammo: { letter: "A", src: "assets/pickups/ammo.svg", label: "Ammunition" },
    shield: { letter: "S", src: "assets/pickups/shield.svg", label: "Shield" },
    speed: { letter: "V", src: "assets/pickups/speed.svg", label: "Speed" },
    rapid: { letter: "R", src: "assets/pickups/rapid.svg", label: "Rapid fire" },
    paint: { letter: "P", src: "assets/pickups/paint.svg", label: "Paint boost" }
  });

  const byLetter = new Map();
  const images = {};
  for (const [type, definition] of Object.entries(definitions)) {
    const image = new Image();
    image.decoding = "async";
    image.src = `${definition.src}?v=20260722-mapassets1`;
    images[type] = image;
    byLetter.set(definition.letter, { type, definition, image });
  }

  const nativeFillText = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function triadPickupAssetFillText(text, x, y, maxWidth) {
    const canvasId = String(this.canvas?.id || "");
    const match = byLetter.get(String(text));
    const isArenaPickup = (canvasId === "gameplayV9Canvas" || canvasId === "masterRealtimeCanvas") && match;
    if (!isArenaPickup || !match.image.complete || !match.image.naturalWidth) {
      return maxWidth == null
        ? nativeFillText.call(this, text, x, y)
        : nativeFillText.call(this, text, x, y, maxWidth);
    }
    const parsedSize = Number.parseFloat(String(this.font).match(/([0-9.]+)px/)?.[1] || "15");
    const size = Math.max(19, Math.min(32, parsedSize * 1.85));
    this.drawImage(match.image, x - size / 2, y - size / 2, size, size);
    return undefined;
  };

  function decorateLegend() {
    for (const [type, definition] of Object.entries(definitions)) {
      const target = document.querySelector(`.pickup-legend [data-type="${type}"]`);
      if (!target || target.dataset.assetReady === "true") continue;
      target.dataset.assetReady = "true";
      target.textContent = "";
      const image = document.createElement("img");
      image.src = `${definition.src}?v=20260722-mapassets1`;
      image.alt = definition.label;
      image.width = 30;
      image.height = 30;
      target.appendChild(image);
    }
  }

  const observer = new MutationObserver(decorateLegend);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", decorateLegend, { once: true });
  else decorateLegend();

  window.__triadPickupAssets = Object.freeze({ version: 10, definitions, images });
})();
