// Exposes a tiny, safe bridge to the game (see js/platform.js).
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("odNative", {
  platform: "electron",
  achievement: id => ipcRenderer.send("achievement", id),
  quit: () => ipcRenderer.send("quit"),
});
