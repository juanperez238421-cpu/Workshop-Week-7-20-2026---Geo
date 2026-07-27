"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("schoolGame", Object.freeze({
  saveResult: (payload) => ipcRenderer.invoke("school-game:save-result", payload),
  openResults: () => ipcRenderer.invoke("school-game:open-results"),
  getResultsPath: () => ipcRenderer.invoke("school-game:get-results-path"),
  restart: () => ipcRenderer.invoke("school-game:restart"),
  ready: () => ipcRenderer.send("school-game:ready")
}));
