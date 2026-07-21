(() => {
  "use strict";

  async function loadGame() {
    const response = await fetch("game-source.js.gz", { cache: "no-store" });
    if (!response.ok) throw new Error(`Unable to load game source: HTTP ${response.status}`);
    if (!("DecompressionStream" in window)) {
      throw new Error("This browser does not support DecompressionStream. Use a current version of Chrome, Edge, Firefox, or Safari.");
    }
    const decompressed = response.body.pipeThrough(new DecompressionStream("gzip"));
    const source = await new Response(decompressed).text();
    const execute = new Function(`${source}\n//# sourceURL=triad-territory-rush.js`);
    execute();
  }

  loadGame().catch((error) => {
    console.error(error);
    const panel = document.createElement("pre");
    panel.textContent = `The game could not load.\n${error.message}\n\nOpen the published GitHub Pages URL or serve the repository over HTTP.`;
    panel.style.cssText = "position:fixed;inset:24px;z-index:99999;padding:24px;background:white;color:#b42318;border:1px solid #fda29b;border-radius:12px;white-space:pre-wrap;overflow:auto";
    document.body.appendChild(panel);
  });
})();
