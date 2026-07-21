(() => {
  "use strict";

  async function loadGame() {
    const sourceUrl = "https://raw.githubusercontent.com/juanperez238421-cpu/Workshop-Week-7-20-2026---Geo/main/game-source.js.gz";
    const response = await fetch(sourceUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Unable to load game source: HTTP ${response.status}`);
    if (!("DecompressionStream" in window)) {
      throw new Error("This browser does not support DecompressionStream. Use a current version of Chrome, Edge, Firefox, or Safari.");
    }
    const decompressed = response.body.pipeThrough(new DecompressionStream("gzip"));
    const source = await new Response(decompressed).text();
    new Function(`${source}\n//# sourceURL=triad-territory-rush.js`)();
  }

  loadGame().catch((error) => {
    console.error(error);
    const panel = document.createElement("pre");
    panel.textContent = `The game could not load.\n${error.message}\n\nReload the GitHub Pages URL in a current browser.`;
    panel.style.cssText = "position:fixed;inset:24px;z-index:99999;padding:24px;background:white;color:#b42318;border:1px solid #fda29b;border-radius:12px;white-space:pre-wrap;overflow:auto";
    document.body.appendChild(panel);
  });
})();
