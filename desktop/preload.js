"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const allowedDeliveryListeners = new Set();
ipcRenderer.on("triad:delivery-status", (_event, payload) => {
  for (const listener of allowedDeliveryListeners) {
    try { listener(payload); } catch {}
  }
});

contextBridge.exposeInMainWorld("triadDesktop", Object.freeze({
  isDesktop: true,
  getInfo: () => ipcRenderer.invoke("triad:get-desktop-info"),
  getSettings: () => ipcRenderer.invoke("triad:get-settings"),
  saveSettings: (settings) => ipcRenderer.invoke("triad:save-settings", settings),
  testDelivery: () => ipcRenderer.invoke("triad:test-delivery"),
  retryOutbox: () => ipcRenderer.invoke("triad:retry-outbox"),
  openResultsFolder: () => ipcRenderer.invoke("triad:open-results-folder"),
  restartApp: () => ipcRenderer.invoke("triad:restart-app"),
  onDeliveryStatus(listener) {
    if (typeof listener !== "function") return () => {};
    allowedDeliveryListeners.add(listener);
    return () => allowedDeliveryListeners.delete(listener);
  }
}));
