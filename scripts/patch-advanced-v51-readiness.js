"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const mainPath = path.join(root, "school-game", "v51", "main.js");
const gamePath = path.join(root, "school-game", "v51", "game.js");
const marker = "ADVANCED_COOP_V51_READINESS_PATCH";

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`Unable to apply ${label}: expected source block was not found.`);
  }
  return source.replace(search, replacement);
}

let main = fs.readFileSync(mainPath, "utf8");
if (!main.includes(marker)) {
  main = replaceOnce(
    main,
    "let mainWindow = null;",
    `let mainWindow = null;\n\nconst ${marker} = true;\n\nfunction startupLog(message) {\n  try {\n    const target = process.env.V51_STARTUP_LOG || path.join(app.getPath(\"userData\"), \"startup.log\");\n    ensureDir(path.dirname(target));\n    fs.appendFileSync(target, \`[\${new Date().toISOString()}] \${message}\\r\\n\`);\n  } catch {}\n}\n\nfunction writeReady(payload = {}) {\n  const ready = {\n    version: VERSION,\n    edition: EDITION,\n    product: PRODUCT,\n    timestamp: new Date().toISOString(),\n    renderer: {\n      fixedSimulationHz: 120,\n      levels: 2,\n      weapons: 6,\n      controlRoles: 3,\n      ...payload\n    }\n  };\n  const targets = [\n    process.env.V51_READY_FILE,\n    path.join(app.getPath(\"userData\"), \"ready.json\")\n  ].filter(Boolean);\n  for (const target of [...new Set(targets)]) {\n    ensureDir(path.dirname(target));\n    writeAtomic(target, JSON.stringify(ready, null, 2));\n  }\n  startupLog(\`ready phase=\${ready.renderer.phase || \"renderer\"} targets=\${targets.join(\" | \")}\`);\n  return ready;\n}`,
    "main-process readiness helper"
  );

  main = replaceOnce(
    main,
    `  ipcMain.handle("v51:ready", (_event, payload) => {\n    const readyPath = path.join(app.getPath("userData"), "ready.json");\n    const ready = {\n      version: VERSION,\n      edition: EDITION,\n      product: PRODUCT,\n      timestamp: new Date().toISOString(),\n      renderer: payload || {}\n    };\n    fs.writeFileSync(readyPath, JSON.stringify(ready, null, 2));\n    return ready;\n  });`,
    `  ipcMain.handle("v51:ready", (_event, payload) => writeReady(payload || {}));`,
    "renderer-ready IPC handler"
  );

  main = replaceOnce(
    main,
    `  mainWindow.loadFile(path.join(__dirname, "index.html"));\n  mainWindow.once("ready-to-show", () => {`,
    `  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {\n    startupLog(\`renderer console level=\${level} \${sourceId}:\${line} \${message}\`);\n  });\n  mainWindow.webContents.on("render-process-gone", (_event, details) => {\n    startupLog(\`render-process-gone reason=\${details.reason} exitCode=\${details.exitCode}\`);\n  });\n  mainWindow.webContents.once("did-finish-load", async () => {\n    startupLog("did-finish-load");\n    try {\n      const probe = await mainWindow.webContents.executeJavaScript(\`({\n        phase: \"did-finish-load\",\n        documentReadyState: document.readyState,\n        hasCanvas: Boolean(document.getElementById(\"gameCanvas\")),\n        hasSchoolAPI: Boolean(window.schoolAPI)\n      })\`, true);\n      writeReady(probe);\n    } catch (error) {\n      startupLog(\`DOM readiness probe failed: \${error && error.stack ? error.stack : error}\`);\n      writeReady({ phase: "did-finish-load-probe-failed", probeError: String(error) });\n    }\n  });\n  mainWindow.loadFile(path.join(__dirname, "index.html"));\n  mainWindow.once("ready-to-show", () => {`,
    "packaged DOM readiness probe"
  );

  fs.writeFileSync(mainPath, main);
  console.log("Patched Advanced Coop V51 deterministic readiness and startup diagnostics.");
} else {
  console.log("Advanced Coop V51 readiness patch already applied.");
}

let game = fs.readFileSync(gamePath, "utf8");
if (!game.includes('phase: "renderer-bootstrap"')) {
  game = replaceOnce(
    game,
    `        controlRoles: 3\n      });`,
    `        controlRoles: 3,\n        phase: "renderer-bootstrap",\n        documentReadyState: document.readyState,\n        hasCanvas: Boolean(canvas),\n        hasSchoolAPI: Boolean(window.schoolAPI)\n      });`,
    "renderer bootstrap readiness payload"
  );
  fs.writeFileSync(gamePath, game);
  console.log("Patched Advanced Coop V51 renderer readiness payload.");
}
